import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";

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
  let sql = "";
  let values: unknown[] = [];
  policyCraftPool.execute = (async (query: string, params?: unknown[]) => {
    sql = query;
    values = params || [];
    return [[adminRow("document-1")], []] as never;
  }) as unknown as PoolExecute;

  try {
    const documents = await repository.listAllAdminDocuments({});
    assert.equal(documents.length, 1);
    assert.equal(documents[0].organization?.id, 21);
    assert.equal(documents[0].createdBy?.id, "7");
    assert.doesNotMatch(sql, /d\.(?:imported_)?policy_json/i);
    assert.match(sql, /ORDER BY d\.updated_at DESC, d\.id ASC/);
    assert.doesNotMatch(sql, /WHERE\s+d\.org_id\s*=/i);
    assert.deepEqual(values, []);
  } finally {
    policyCraftPool.execute = originalExecute;
  }
});

test("admin listing keeps parameterized organization, creator, type, and archive filters", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  let sql = "";
  let values: unknown[] = [];
  policyCraftPool.execute = (async (query: string, params?: unknown[]) => {
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
  } finally {
    policyCraftPool.execute = originalExecute;
  }
});

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
