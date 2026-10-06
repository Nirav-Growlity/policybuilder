import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { createRequire } from "node:module";
import type { Pool } from "mysql2/promise";

process.env.DATABASE_URL = "mysql://test:test@127.0.0.1:1/policycraft_test";
const require = createRequire(import.meta.url);

test("an existing active admin can enter the workspace before the organization migration is applied", async () => {
  const cookieMock = mock.method(require("next/headers"), "cookies", async () => ({ toString: () => "fixture=session" }));
  const [{ auth }, { policyCraftPool }, { GET }] = await Promise.all([
    import("./auth"), import("./db"), import("../app/api/policycraft/access/route"),
  ]);
  const sessionMock = mock.method(auth.api, "getSession", async () => ({ user: { id: "7" } }));
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool);
  policyCraftPool.execute = (async (sql: string) => {
    if (sql.includes("FROM users")) return [[{ id: 7, name: "Admin", email: "admin@example.test", org_id: "", active: 1, is_deleted: 0 }], []];
    if (sql.includes("FROM policycraft_user_access")) return [[{ role: "admin", status: "active" }], []];
    if (sql.includes("policycraft_organization_migration_state")) throw Object.assign(new Error("Registry is not installed"), { code: "ER_NO_SUCH_TABLE" });
    throw new Error(`Unexpected SQL: ${sql}`);
  }) as Pool["execute"];
  try {
    const response = await GET();
    const payload = await response.json();
    assert.equal(response.status, 200, `authenticated admin workspace bootstrap failed: ${JSON.stringify(payload)}`);
    assert.equal(payload.actor.role, "admin");
    assert.equal(payload.homeHref, "/admin");
  } finally {
    policyCraftPool.execute = originalExecute;
    sessionMock.mock.restore();
    cookieMock.mock.restore();
  }
});
