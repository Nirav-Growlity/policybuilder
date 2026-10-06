import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";

process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:1/policycraft_test";

type PoolConnection = Awaited<ReturnType<Pool["getConnection"]>>;
type Query = (sql: string, values?: unknown[]) => Promise<[unknown, unknown]>;

async function withConnection(
  execute: Query,
  run: (calls: Array<{ sql: string; values: unknown[] }>, counts: { commit: number; rollback: number }) => Promise<void>,
) {
  const { policyCraftPool } = await import("./db");
  const { updatePolicyCraftManager } = await import("./policycraft-access-repository");
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const counts = { commit: 0, rollback: 0 };
  const connection = {
    async beginTransaction() {},
    async commit() { counts.commit += 1; },
    async rollback() { counts.rollback += 1; },
    release() {},
    async execute(sql: string, values?: unknown[]) {
      calls.push({ sql, values: values || [] });
      return execute(sql, values);
    },
  } as unknown as PoolConnection;
  const descriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "getConnection");
  Object.defineProperty(policyCraftPool, "getConnection", { configurable: true, value: async () => connection });
  try {
    await run(calls, counts);
    return { updatePolicyCraftManager };
  } finally {
    if (descriptor) Object.defineProperty(policyCraftPool, "getConnection", descriptor);
    else Reflect.deleteProperty(policyCraftPool, "getConnection");
  }
}

function result<T>(rows: T): [T, undefined] {
  return [rows, undefined];
}

function availableOrganizationQuery(sql: string) {
  return sql.includes("SELECT pco.id, pco.source") && sql.includes("FROM policycraft_organizations");
}

test("adding one organization preserves existing assignments, including legacy inactive or unavailable rows", async () => {
  await withConnection(async (sql) => {
    if (sql.includes("policycraft_organization_migration_state")) return result([{ marker: "initial_esg_seed_complete" }]);
    if (sql.includes("FROM policycraft_user_access") && sql.includes("FOR UPDATE")) {
      assert.match(sql, /a\.status = 'active'[\s\S]*u\.active = 1 AND u\.is_deleted = 0/);
      return result([{ user_id: 42, status: "active" }]);
    }
    if (availableOrganizationQuery(sql)) {
      assert.match(sql, /FOR UPDATE$/);
      return result([{
        id: 12, source: "esg", org_code: "NEW", company_name: "Available Org", is_deleted: 0,
        expiry_date: null, profile_json: null,
      }]);
    }
    if (sql.includes("INSERT INTO policycraft_manager_organizations")) return result({ affectedRows: 1 });
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls, counts) => {
    const { updatePolicyCraftManager } = await import("./policycraft-access-repository");
    assert.equal(await updatePolicyCraftManager(42, 7, { addOrganizationId: 12 }), true);
    assert.equal(counts.commit, 1);
    assert.equal(counts.rollback, 0);
    assert.equal(calls.filter(({ sql }) => sql.includes("INSERT INTO policycraft_manager_organizations")).length, 1);
    assert.deepEqual(calls.find(({ sql }) => sql.includes("INSERT INTO policycraft_manager_organizations"))?.values, [42, 12, 7]);
    assert.equal(calls.some(({ sql }) => /UPDATE\s+policycraft_manager_organizations\s+SET\s+active\s*=\s*0/i.test(sql)), false);
    assert.equal(calls.some(({ sql }) => sql.includes("assigned_by_user_id = VALUES(assigned_by_user_id)")), false);
  });
});

test("repeating an organization addition uses an idempotent assignment upsert", async () => {
  await withConnection(async (sql) => {
    if (sql.includes("policycraft_organization_migration_state")) return result([{ marker: "initial_esg_seed_complete" }]);
    if (sql.includes("FROM policycraft_user_access") && sql.includes("FOR UPDATE")) return result([{ user_id: 42, status: "active" }]);
    if (availableOrganizationQuery(sql)) return result([{
      id: 12, source: "standalone", org_code: null, company_name: null, is_deleted: null,
      expiry_date: null, profile_json: "{}",
    }]);
    if (sql.includes("INSERT INTO policycraft_manager_organizations")) return result({ affectedRows: 1 });
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls, counts) => {
    const { updatePolicyCraftManager } = await import("./policycraft-access-repository");
    assert.equal(await updatePolicyCraftManager(42, 7, { addOrganizationId: 12 }), true);
    assert.equal(await updatePolicyCraftManager(42, 7, { addOrganizationId: 12 }), true);
    const upserts = calls.filter(({ sql }) => sql.includes("INSERT INTO policycraft_manager_organizations"));
    assert.equal(upserts.length, 2);
    for (const { sql } of upserts) assert.match(sql, /ON DUPLICATE KEY UPDATE active = 1/);
    assert.equal(counts.commit, 2);
    assert.equal(counts.rollback, 0);
  });
});

test("adding an organization requires an active manager and an available nondeleted, unexpired organization", async () => {
  for (const scenario of ["manager-inactive", "user-inactive", "user-deleted", "organization-missing", "organization-deleted", "organization-expired"] as const) {
    await withConnection(async (sql) => {
      if (sql.includes("policycraft_organization_migration_state")) return result([{ marker: "initial_esg_seed_complete" }]);
      if (sql.includes("FROM policycraft_user_access") && sql.includes("FOR UPDATE")) {
        return ["manager-inactive", "user-inactive", "user-deleted"].includes(scenario)
          ? result([])
          : result([{ user_id: 42, status: "active" }]);
      }
      if (availableOrganizationQuery(sql)) {
        assert.match(sql, /FOR UPDATE$/);
        if (scenario === "organization-missing") return result([]);
        return result([{
          id: 12, source: "esg", org_code: "NEW", company_name: "Available Org",
          is_deleted: scenario === "organization-deleted" ? 1 : 0,
          expiry_date: scenario === "organization-expired" ? "2000-01-01T00:00:00.000Z" : null, profile_json: null,
        }]);
      }
      if (sql.includes("INSERT INTO policycraft_manager_organizations")) return result({ affectedRows: 1 });
      throw new Error(`Unexpected query: ${sql}`);
    }, async (calls, counts) => {
      const { updatePolicyCraftManager } = await import("./policycraft-access-repository");
      await assert.rejects(updatePolicyCraftManager(42, 7, { addOrganizationId: 12 }));
      assert.equal(calls.some(({ sql }) => sql.includes("INSERT INTO policycraft_manager_organizations")), false);
      assert.equal(counts.commit, 0);
      assert.equal(counts.rollback, 1);
    });
  }
});

test("organization replacement and manager status updates keep their existing behavior", async () => {
  await withConnection(async (sql) => {
    if (sql.includes("policycraft_organization_migration_state")) return result([{ marker: "initial_esg_seed_complete" }]);
    if (sql.includes("FROM policycraft_user_access") && sql.includes("FOR UPDATE")) return result([{ user_id: 42 }]);
    if (availableOrganizationQuery(sql)) return result([{
      id: 12, source: "standalone", org_code: null, company_name: null, is_deleted: null,
      expiry_date: null, profile_json: "{}",
    }]);
    if (sql.includes("INSERT INTO policycraft_manager_organizations")) return result({ affectedRows: 1 });
    if (sql.includes("UPDATE policycraft_user_access SET status")) return result({ affectedRows: 1 });
    if (sql.includes("UPDATE policycraft_manager_organizations SET active = 0")) return result({ affectedRows: 1 });
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls, counts) => {
    const { updatePolicyCraftManager } = await import("./policycraft-access-repository");
    assert.equal(await updatePolicyCraftManager(42, 7, { organizationIds: [12] }), true);
    assert.equal(await updatePolicyCraftManager(42, 7, { active: false }), true);
    assert.equal(calls.some(({ sql }) => sql.includes("UPDATE policycraft_manager_organizations SET active = 0")), true);
    assert.equal(calls.some(({ sql }) => sql.includes("UPDATE policycraft_user_access SET status")), true);
    assert.equal(counts.commit, 2);
    assert.equal(counts.rollback, 0);
  });
});

test("add operation rejects combinations with replacement or status changes before opening a transaction", async () => {
  const { policyCraftPool } = await import("./db");
  const { updatePolicyCraftManager } = await import("./policycraft-access-repository");
  const descriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "getConnection");
  let called = false;
  Object.defineProperty(policyCraftPool, "getConnection", { configurable: true, value: async () => { called = true; throw new Error("should not open a connection"); } });
  try {
    await assert.rejects(updatePolicyCraftManager(42, 7, { addOrganizationId: 12, organizationIds: [13] }));
    await assert.rejects(updatePolicyCraftManager(42, 7, { addOrganizationId: 12, active: false }));
    await assert.rejects(updatePolicyCraftManager(42, 7, { addOrganizationId: Number.MAX_SAFE_INTEGER + 1 }));
    assert.equal(called, false);
  } finally {
    if (descriptor) Object.defineProperty(policyCraftPool, "getConnection", descriptor);
    else Reflect.deleteProperty(policyCraftPool, "getConnection");
  }
});

test("assignment insertion failures roll the addition transaction back", async () => {
  await withConnection(async (sql) => {
    if (sql.includes("policycraft_organization_migration_state")) return result([{ marker: "initial_esg_seed_complete" }]);
    if (sql.includes("FROM policycraft_user_access") && sql.includes("FOR UPDATE")) return result([{ user_id: 42, status: "active" }]);
    if (availableOrganizationQuery(sql)) return result([{
      id: 12, source: "standalone", org_code: null, company_name: null, is_deleted: null,
      expiry_date: null, profile_json: "{}",
    }]);
    if (sql.includes("INSERT INTO policycraft_manager_organizations")) throw new Error("assignment insert failed");
    throw new Error(`Unexpected query: ${sql}`);
  }, async (_calls, counts) => {
    const { updatePolicyCraftManager } = await import("./policycraft-access-repository");
    await assert.rejects(updatePolicyCraftManager(42, 7, { addOrganizationId: 12 }), /assignment insert failed/);
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });
});
