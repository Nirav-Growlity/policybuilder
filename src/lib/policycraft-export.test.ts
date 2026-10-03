import assert from "node:assert/strict";
import test from "node:test";
import { initialPolicy } from "./store";
import { prepareAuthorizedPolicyExport, PolicyExportError, type PolicyExportPorts } from "./policycraft-export";

const actor = { user: { id: "7", name: "Current editor", email: "editor@example.com" } };
function ports(overrides: Partial<PolicyExportPorts<typeof actor>> = {}): PolicyExportPorts<typeof actor> {
  return {
    actor: async () => actor,
    organization: async () => ({ organization: { id: 23 } }),
    assets: async (policy) => policy,
    signature: async () => null,
    ...overrides,
  };
}
const denied = (status: number) => (error: unknown) => error instanceof PolicyExportError && error.status === status;

test("anonymous export is rejected before private artwork resolution", async () => {
  let artworkRead = false;
  await assert.rejects(prepareAuthorizedPolicyExport({ policy: initialPolicy() }, ports({
    actor: async () => null,
    assets: async (policy) => { artworkRead = true; return policy; },
  })), denied(401));
  assert.equal(artworkRead, false);
});

test("embedded artwork does not bypass revoked organization access", async () => {
  const policy = initialPolicy();
  policy.company.companyLogo = "data:image/png;base64,AA==";
  await assert.rejects(prepareAuthorizedPolicyExport({ policy, orgId: 23 }, ports({ organization: async () => null })), denied(403));
});

test("exports resolve artwork in the canonical authorized document organization", async () => {
  let selected: unknown;
  let artworkOrg: number | undefined;
  const result = await prepareAuthorizedPolicyExport({ policy: initialPolicy(), orgId: 23, documentId: "draft-1" }, ports({
    organization: async (_actor, options) => { selected = options; return { organization: { id: 23 } }; },
    assets: async (policy, orgId) => { artworkOrg = orgId; return policy; },
  }));
  assert.deepEqual(selected, { organizationId: 23, documentId: "draft-1", operation: "read" });
  assert.equal(artworkOrg, 23);
  assert.equal(result.policy.company.name, initialPolicy().company.name);
  assert.equal(result.cacheScope, "7:23");
});

test("invalid selectors and signature dates fail without falling back to another organization", async () => {
  for (const orgId of ["", -1, 0, 1.5, "other"]) {
    await assert.rejects(prepareAuthorizedPolicyExport({ policy: initialPolicy(), orgId }, ports()), denied(400));
  }
  await assert.rejects(prepareAuthorizedPolicyExport({ policy: initialPolicy(), documentId: "" }, ports()), denied(400));
  await assert.rejects(prepareAuthorizedPolicyExport({ policy: initialPolicy(), includeAuthorSignature: true, authorSignatureDate: "2026-02-30" }, ports()), denied(400));
});

test("signature export uses the current actor rather than the policy creator", async () => {
  let signatureUser: string | undefined;
  const result = await prepareAuthorizedPolicyExport({ policy: initialPolicy(), orgId: 23, includeAuthorSignature: true, authorSignatureDate: "2026-10-01", createdByUserId: "99" }, ports({
    signature: async (id) => { signatureUser = id; return { bytes: Buffer.from("editor-signature") }; },
  }));
  assert.equal(signatureUser, "7");
  assert.equal(result.authorApproval?.displayName, "Current editor");
  assert.equal(result.authorApproval?.signatureDataUrl, `data:image/png;base64,${Buffer.from("editor-signature").toString("base64")}`);
});

test("failed private artwork resolution never falls back to an anonymous export", async () => {
  await assert.rejects(prepareAuthorizedPolicyExport({ policy: initialPolicy(), orgId: 23 }, ports({
    assets: async () => { throw new Error("missing artwork"); },
  })), /missing artwork/);
});
