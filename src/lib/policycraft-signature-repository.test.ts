import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";

process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:1/policycraft_test";
const repositoryModule = import("./policycraft-signature-repository");

test("normalizes a PNG signature and constrains its dimensions", async () => {
  const { normalizePolicyCraftSignature } = await repositoryModule;
  const source = await sharp({
    create: { width: 2400, height: 600, channels: 4, background: { r: 20, g: 40, b: 80, alpha: 0.6 } },
  }).png().toBuffer();

  const normalized = await normalizePolicyCraftSignature(`data:image/png;base64,${source.toString("base64")}`);
  const metadata = await sharp(normalized).metadata();

  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 400);
  assert.ok(normalized.byteLength <= 512 * 1024);
});

test("rejects non-PNG, malformed, and oversized signature input", async () => {
  const { InvalidSignatureError, normalizePolicyCraftSignature } = await repositoryModule;
  await assert.rejects(
    normalizePolicyCraftSignature("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="),
    InvalidSignatureError,
  );
  await assert.rejects(
    normalizePolicyCraftSignature("data:image/png;base64,not-base64!"),
    InvalidSignatureError,
  );
  await assert.rejects(
    normalizePolicyCraftSignature(`data:image/png;base64,${"A".repeat(1_400_000)}`),
    InvalidSignatureError,
  );
});

test("signature reads include the current user, authorized organization, and exact document", async () => {
  const [{ getPolicyCraftUserSignature }, { policyCraftPool }] = await Promise.all([repositoryModule, import("./db")]);
  const previous = Object.getOwnPropertyDescriptor(policyCraftPool, "execute");
  const reads: Array<{ sql: string; values: unknown[] }> = [];
  const signatures: Array<{ userId: number; orgId: number; documentId: string; bytes: Buffer }> = [
    { userId: 7, orgId: 23, documentId: "policy-a", bytes: Buffer.from("actor-7-policy-a") },
    { userId: 8, orgId: 23, documentId: "policy-a", bytes: Buffer.from("actor-8-policy-a") },
    { userId: 7, orgId: 23, documentId: "policy-b", bytes: Buffer.from("actor-7-policy-b") },
    { userId: 7, orgId: 24, documentId: "policy-c", bytes: Buffer.from("actor-7-policy-c") },
  ];
  const documentOrganizations = new Map([["policy-a", 23], ["policy-b", 23], ["policy-c", 24]]);
  Object.defineProperty(policyCraftPool, "execute", {
    configurable: true,
    value: async (sql: string, values: unknown[] = []) => {
      reads.push({ sql, values });
      const [userId, orgId, documentId] = values as [number, number, string];
      const row = documentOrganizations.get(documentId) === orgId
        ? signatures.find((signature) => signature.userId === userId && signature.orgId === orgId && signature.documentId === documentId)
        : undefined;
      return [row ? [{ content: row.bytes, updated_at: "2026-10-01T00:00:00.000Z" }] : [], []];
    },
  });
  try {
    const first = await getPolicyCraftUserSignature("7", { organizationId: 23, documentId: "policy-a" });
    const otherActor = await getPolicyCraftUserSignature("8", { organizationId: 23, documentId: "policy-a" });
    const otherDocument = await getPolicyCraftUserSignature("7", { organizationId: 23, documentId: "policy-b" });
    const otherOrganization = await getPolicyCraftUserSignature("7", { organizationId: 24, documentId: "policy-c" });
    const noDocumentSignature = await getPolicyCraftUserSignature("7", { organizationId: 23, documentId: "policy-without-signature" });
    assert.equal(first?.bytes.toString(), "actor-7-policy-a");
    assert.equal(otherActor?.bytes.toString(), "actor-8-policy-a");
    assert.equal(otherDocument?.bytes.toString(), "actor-7-policy-b");
    assert.equal(otherOrganization?.bytes.toString(), "actor-7-policy-c");
    assert.equal(noDocumentSignature, null, "a signature saved for another document must not be applied here");
    assert.deepEqual(reads.map(({ values }) => values), [
      [7, 23, "policy-a"],
      [8, 23, "policy-a"],
      [7, 23, "policy-b"],
      [7, 24, "policy-c"],
      [7, 23, "policy-without-signature"],
    ]);
    assert.ok(reads.every(({ sql }) => sql.includes("FROM policycraft_user_signatures signature") && sql.includes("signature.org_id = ?") && sql.includes("signature.document_id = ?")));
  } finally {
    if (previous) Object.defineProperty(policyCraftPool, "execute", previous);
    else Reflect.deleteProperty(policyCraftPool, "execute");
  }
});

test("signature save and delete mutations are limited to one organization and document", async () => {
  const [{ savePolicyCraftUserSignature, deletePolicyCraftUserSignature }, { policyCraftPool }] = await Promise.all([repositoryModule, import("./db")]);
  const previous = Object.getOwnPropertyDescriptor(policyCraftPool, "execute");
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const documentOrganizations = new Map([["policy-a", 23], ["policy-b", 23], ["policy-c", 24]]);
  const signatures: Array<{ userId: number; orgId: number; documentId: string; bytes: Buffer }> = [
    { userId: 8, orgId: 23, documentId: "policy-a", bytes: Buffer.from("other-actor") },
    { userId: 7, orgId: 23, documentId: "policy-b", bytes: Buffer.from("other-document") },
  ];
  Object.defineProperty(policyCraftPool, "execute", {
    configurable: true,
    value: async (sql: string, values: unknown[] = []) => {
      writes.push({ sql, values });
      if (sql.includes("INSERT INTO policycraft_user_signatures")) {
        const [userId, bytes, documentId, orgId] = values as [number, Buffer, string, number];
        if (documentOrganizations.get(documentId) !== orgId) return [{ affectedRows: 0 }, []];
        const existing = signatures.find((signature) => signature.userId === userId && signature.orgId === orgId && signature.documentId === documentId);
        if (existing) existing.bytes = bytes;
        else signatures.push({ userId, orgId, documentId, bytes });
        return [{ affectedRows: 1 }, []];
      }
      const [userId, orgId, documentId] = values as [number, number, string];
      const match = signatures.findIndex((signature) => signature.userId === userId && signature.orgId === orgId && signature.documentId === documentId);
      if (match >= 0) signatures.splice(match, 1);
      return [{ affectedRows: match >= 0 ? 1 : 0 }, []];
    },
  });
  try {
    assert.equal(await savePolicyCraftUserSignature("7", { organizationId: 23, documentId: "policy-a" }, Buffer.from("signature")), true);
    assert.equal(await savePolicyCraftUserSignature("7", { organizationId: 23, documentId: "policy-c" }, Buffer.from("wrong-organization")), false);
    assert.equal(signatures.find((signature) => signature.userId === 7 && signature.orgId === 23 && signature.documentId === "policy-a")?.bytes.toString(), "signature");
    await deletePolicyCraftUserSignature("7", { organizationId: 23, documentId: "policy-a" });
    assert.equal(signatures.some((signature) => signature.userId === 7 && signature.orgId === 23 && signature.documentId === "policy-a"), false);
    assert.equal(signatures.some((signature) => signature.userId === 8 && signature.orgId === 23 && signature.documentId === "policy-a"), true);
    assert.equal(signatures.some((signature) => signature.userId === 7 && signature.orgId === 23 && signature.documentId === "policy-b"), true);
    assert.deepEqual(writes.map(({ values }) => values), [
      [7, Buffer.from("signature"), "policy-a", 23],
      [7, Buffer.from("wrong-organization"), "policy-c", 23],
      [7, 23, "policy-a"],
    ]);
    assert.match(writes[0].sql, /INSERT INTO policycraft_user_signatures \(user_id, org_id, document_id, content\)/);
    assert.match(writes[0].sql, /FROM policycraft_documents document\s+WHERE document\.id = \? AND document\.org_id = \?/);
    assert.match(writes[2].sql, /DELETE FROM policycraft_user_signatures\s+WHERE user_id = \? AND org_id = \? AND document_id = \?/);
  } finally {
    if (previous) Object.defineProperty(policyCraftPool, "execute", previous);
    else Reflect.deleteProperty(policyCraftPool, "execute");
  }
});
