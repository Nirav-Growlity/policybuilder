import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";
import type { Policy } from "./types";
import { initialPolicy } from "./initial-policy";

process.env.HOST ||= "127.0.0.1";
process.env.USER_NAME ||= "policycraft-test";
process.env.PASSWORD ||= "policycraft-test";
process.env.DATABASE ||= "policycraft-test";

const modules = Promise.all([
  import("./db"),
  import("./policycraft-repository"),
  import("./policycraft-admin-document-filters"),
]);

type PoolExecute = Pool["execute"];

function adminRow(id: string) {
  return {
    id,
    title: `Policy ${id}`,
    policy_type: "environmental",
    current_step: "review",
    lock_version: 2,
    created_at: "2026-01-02T03:04:05.000Z",
    updated_at: "2026-02-03T04:05:06.000Z",
    archived_at: null,
    created_by_user_id: 7,
    created_by_name: "Admin Creator",
    created_by_email: "creator@example.com",
    organization_id: 21,
    organization_code: "ORG-21",
    organization_name: "Example Organization",
    organization_deleted: 0,
    organization_expiry: null,
  };
}

test("admin listing uses a summary projection and leaves organization scope optional", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  policyCraftPool.execute = (async (query: string, params?: unknown[]) => {
    calls.push({ sql: query, values: params || [] });
    if (/policy_json/i.test(query) && /ORDER BY/i.test(query)) {
      throw Object.assign(new Error("Out of sort memory, consider increasing server sort buffer size"), { code: "ER_OUT_OF_SORTMEMORY" });
    }
    if (!/policy_json/i.test(query)) return [[{ id: "document-1" }], []] as never;
    return [[{
      ...adminRow("document-1"),
      policy_json: {
        policyType: "environmental",
        documentTheme: "classic",
        coverComposition: {
          schemaVersion: 1,
          sourceTemplateId: "custom",
          background: { color: "#FFFFFF", assetId: "/api/policycraft/cover-assets/background-1", fit: "cover", focalPoint: { x: 50, y: 50 } },
          elements: [],
        },
        company: { name: "Example Organization", companyLogo: "logo-1", docNum: "POL-1", effectiveDate: "2026-01-01", revNum: "1", reviewDate: "2027-01-01" },
        sections: [{ id: "private-section", title: "Restricted content", content: "Confidential policy text" }],
        internalNotes: "This must never be returned",
      } as unknown as Policy,
      imported_policy_json: { sections: [{ content: "Imported confidential content" }] },
    }], []] as never;
  }) as unknown as PoolExecute;

  try {
    const documents = await repository.listAllAdminDocuments({});
    assert.equal(calls.length, 2);
    const [ordered, payload] = calls;
    const sql = payload.sql;
    assert.equal(documents.length, 1);
    assert.equal(documents[0].organization?.id, 21);
    assert.equal(documents[0].createdBy?.id, "7");
    assert.deepEqual(documents[0].coverPreview, {
      policyType: "environmental",
      documentTheme: "classic",
      coverComposition: {
        schemaVersion: 1,
        sourceTemplateId: "custom",
        background: { color: "#FFFFFF", assetId: "background-1", fit: "cover", focalPoint: { x: 50, y: 50 } },
        elements: [],
      },
      company: {
        name: "Example Organization",
        companyLogo: "/api/policycraft/cover-assets/logo-1",
        docNum: "POL-1",
        effectiveDate: "2026-01-01",
        revNum: "1",
        reviewDate: "2027-01-01",
        logoPalette: undefined,
      },
      presentationTemplate: undefined,
      documentTemplate: undefined,
      documentThemeOverrides: undefined,
      templateBrandOverrides: undefined,
      brandColorSource: undefined,
      visualStyle: undefined,
      logoPosition: undefined,
      typography: undefined,
      featureImage: undefined,
      aiCoverComposition: undefined,
      activeCoverVariant: undefined,
    });
    assert.doesNotMatch(sql, /d\.imported_policy_json/i);
    assert.match(sql, /d\.policy_json/);
    assert.equal("state" in documents[0], false);
    assert.equal("policy_json" in documents[0], false);
    assert.equal("sections" in documents[0].coverPreview!, false);
    assert.equal("internalNotes" in documents[0].coverPreview!, false);
    assert.equal("importedPolicy" in documents[0], false);
    assert.equal(JSON.stringify(documents[0]).includes("Confidential policy text"), false);
    assert.equal(JSON.stringify(documents[0]).includes("Imported confidential content"), false);
    assert.match(ordered.sql, /SELECT d\.id\s+FROM/);
    assert.match(ordered.sql, /ORDER BY d\.updated_at DESC, d\.id ASC/);
    assert.doesNotMatch(ordered.sql, /policy_json/);
    assert.doesNotMatch(sql, /ORDER BY/i);
    assert.doesNotMatch(sql, /WHERE\s+d\.org_id\s*=/i);
    assert.deepEqual(ordered.values, []);
    assert.deepEqual(payload.values, ["document-1"]);
  } finally {
    policyCraftPool.execute = originalExecute;
  }
});

test("admin listing keeps parameterized organization, creator, type, and archive filters", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  let sql = "";
  let values: unknown[] = [];
  let calls = 0;
  policyCraftPool.execute = (async (query: string, params?: unknown[]) => {
    calls += 1;
    sql = query;
    values = params || [];
    return [[], []] as never;
  }) as unknown as PoolExecute;

  try {
    await repository.listAllAdminDocuments({ organizationId: 21, creatorId: 7, policyType: "environmental", archived: true });
    assert.match(sql, /d\.org_id = \?/);
    assert.match(sql, /d\.created_by_user_id = \?/);
    assert.match(sql, /d\.policy_type = \?/);
    assert.match(sql, /d\.archived_at IS NOT NULL/);
    assert.deepEqual(values, [21, 7, "environmental"]);
    assert.equal(calls, 1, "an empty ID list must not fetch policy payloads");
  } finally {
    policyCraftPool.execute = originalExecute;
  }
});

for (const archived of [false, true, undefined]) {
  test(`admin listing preserves filtered ID order without sorting payloads (archived=${archived})`, async () => {
    const [{ policyCraftPool }, repository] = await modules;
    const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    policyCraftPool.execute = (async (sql: string, params?: unknown[]) => {
      calls.push({ sql, values: params || [] });
      if (/policy_json/i.test(sql) && /ORDER BY/i.test(sql)) {
        throw Object.assign(new Error("Out of sort memory, consider increasing server sort buffer size"), { code: "ER_OUT_OF_SORTMEMORY" });
      }
      if (calls.length === 1) return [[{ id: "b" }, { id: "removed" }, { id: "a" }], []] as never;
      return [["a", "b"].map((id) => ({
        ...adminRow(id),
        archived_at: archived ? "2026-02-04T00:00:00.000Z" : null,
        policy_json: id === "a" ? JSON.stringify(initialPolicy("environmental")) : initialPolicy("environmental"),
      })), []] as never;
    }) as unknown as PoolExecute;

    try {
      const documents = await repository.listAllAdminDocuments({ organizationId: 21, creatorId: 7, policyType: "environmental", archived });
      assert.deepEqual(documents.map((document) => document.id), ["b", "a"]);
      assert.equal(calls.length, 2);
      for (const { sql } of calls) {
        assert.match(sql, /INNER JOIN \(SELECT pco\.id,[\s\S]*pco\.esg_org_id/);
        assert.match(sql, /d\.org_id = \? AND d\.created_by_user_id = \? AND d\.policy_type = \?/);
        if (archived === undefined) assert.doesNotMatch(sql, /d\.archived_at IS/);
        else assert.match(sql, archived ? /d\.archived_at IS NOT NULL/ : /d\.archived_at IS NULL/);
      }
      assert.deepEqual(calls[0].values, [21, 7, "environmental"]);
      assert.deepEqual(calls[1].values, [21, 7, "environmental", "b", "removed", "a"]);
      assert.match(calls[0].sql, /SELECT d\.id\s+FROM/);
      assert.match(calls[0].sql, /ORDER BY d\.updated_at DESC, d\.id ASC/);
      assert.match(calls[1].sql, /AND d\.id IN \(\?, \?, \?\)/);
      assert.doesNotMatch(calls[1].sql, /ORDER BY|imported_policy_json/i);
    } finally {
      policyCraftPool.execute = originalExecute;
    }
  });
}

test("admin API accepts the listing UI's view and orgId query names", () => {
  return modules.then(([, , filters]) => {
    const active = filters.parseAdminDocumentFilters(new URLSearchParams("view=active&orgId=21"));
    assert.deepEqual(active, { organizationId: 21, archived: false });

    const archived = filters.parseAdminDocumentFilters(new URLSearchParams("view=archived&orgId=21"));
    assert.deepEqual(archived, { organizationId: 21, archived: true });

    const legacy = filters.parseAdminDocumentFilters(new URLSearchParams("view=active&orgId=21&organizationId=34&archived=true"));
    assert.deepEqual(legacy, { organizationId: 34, archived: true });

    assert.deepEqual(filters.parseAdminDocumentFilters(new URLSearchParams("view=unknown")), {});
    assert.deepEqual(filters.parseAdminDocumentFilters(new URLSearchParams()), {});
    assert.deepEqual(filters.parseAdminDocumentFilters(new URLSearchParams("orgId=0&creatorId=1.5")), {});
  });
});
