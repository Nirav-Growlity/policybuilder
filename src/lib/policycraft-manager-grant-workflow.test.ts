import assert from "node:assert/strict";
import test from "node:test";
import {
  grantPolicyCraftManagerAccess,
  ManagerGrantError,
  type ManagerGrantAccess,
  type ManagerGrantAccount,
  type ManagerGrantPort,
  type ManagerGrantTransaction,
} from "./policycraft-manager-grant-workflow";

function fakePort(options: {
  account?: ManagerGrantAccount | null;
  access?: ManagerGrantAccess | null;
  validOrganizations?: boolean;
  failGrant?: boolean;
} = {}) {
  const events: string[] = [];
  const state = {
    pendingInvitation: true,
    access: options.access ?? null,
    assignments: new Set([2]),
    commits: 0,
    rollbacks: 0,
  };
  const port: ManagerGrantPort = {
    async withTransaction<T>(run: (transaction: ManagerGrantTransaction) => Promise<T>) {
      const before = {
        pendingInvitation: state.pendingInvitation,
        access: state.access,
        assignments: new Set(state.assignments),
      };
      try {
        const result = await run({
          async cancelPendingInvitations(email) {
            events.push(`cancel-invitations:${email}`);
            state.pendingInvitation = false;
          },
          async findSharedAccountByEmail(email) {
            events.push(`lock-account:${email}`);
            return options.account === undefined ? { id: 45, active: 1, isDeleted: 0, isSuperAdmin: 0 } : options.account;
          },
          async findPolicyCraftAccess(userId) {
            events.push(`lock-access:${userId}`);
            return state.access;
          },
          async validateOrganizations(ids) {
            events.push(`validate-organizations:${ids.join(",")}`);
            return options.validOrganizations !== false;
          },
          async grantManagerAccess(userId, ids, grantedByUserId) {
            events.push(`grant:${userId}:${ids.join(",")}:${grantedByUserId}`);
            if (options.failGrant) throw new Error("assignment insert failed");
            if (!state.access) state.access = { role: "manager", status: "active" };
            for (const id of ids) state.assignments.add(id);
          },
        });
        state.commits += 1;
        events.push("commit");
        return result;
      } catch (error) {
        state.pendingInvitation = before.pendingInvitation;
        state.access = before.access;
        state.assignments = before.assignments;
        state.rollbacks += 1;
        events.push("rollback");
        throw error;
      }
    },
  };
  return { port, events, state };
}

test("direct grant cancels pending invite first, preserves active manager assignments, and is idempotent", async () => {
  const activeManager = fakePort({ access: { role: "manager", status: "active" } });
  const input = { email: "  EXISTING@example.com ", expectedAccountId: 45, organizationIds: [4, 4, 8], grantedByUserId: 7 };

  assert.deepEqual(await grantPolicyCraftManagerAccess(activeManager.port, input), { status: "granted", userId: 45 });
  assert.deepEqual(await grantPolicyCraftManagerAccess(activeManager.port, input), { status: "granted", userId: 45 });

  assert.deepEqual([...activeManager.state.assignments].sort(), [2, 4, 8]);
  assert.equal(activeManager.state.access?.status, "active");
  assert.equal(activeManager.state.pendingInvitation, false);
  assert.equal(activeManager.state.commits, 2);
  assert.deepEqual(activeManager.events.slice(0, 6), [
    "cancel-invitations:existing@example.com", "lock-account:existing@example.com", "lock-access:45",
    "validate-organizations:4,8", "grant:45:4,8:7", "commit",
  ]);
  assert.equal(activeManager.events.some((event) => event.startsWith("send-email") || event.includes("password") || event.includes("credential")), false);
});

test("direct grant creates active access for a client account without changing the shared account", async () => {
  const client = fakePort({ access: null });
  const result = await grantPolicyCraftManagerAccess(client.port, {
    email: "client@example.com", expectedAccountId: 45, organizationIds: [4], grantedByUserId: 7,
  });
  assert.deepEqual(result, { status: "granted", userId: 45 });
  assert.deepEqual(client.state.access, { role: "manager", status: "active" });
  assert.deepEqual([...client.state.assignments].sort(), [2, 4]);
  assert.equal(client.events.some((event) => event.includes("password") || event.includes("create-user") || event.startsWith("send-email")), false);
});

test("direct grant rejects missing, inactive, administrator, and disabled-manager accounts transactionally", async () => {
  const rejected = [
    { fixture: fakePort({ account: null }), code: "ACCOUNT_NOT_FOUND" },
    { fixture: fakePort({ account: { id: 45, active: 0, isDeleted: 0, isSuperAdmin: 0 } }), code: "ACCOUNT_UNAVAILABLE" },
    { fixture: fakePort({ account: { id: 45, active: 1, isDeleted: 0, isSuperAdmin: 1 } }), code: "ADMIN_ACCOUNT" },
    { fixture: fakePort({ access: { role: "admin", status: "active" } }), code: "ADMIN_ACCOUNT" },
    { fixture: fakePort({ access: { role: "manager", status: "disabled" } }), code: "MANAGER_DISABLED" },
  ] as const;

  for (const { fixture, code } of rejected) {
    await assert.rejects(
      () => grantPolicyCraftManagerAccess(fixture.port, { email: "account@example.com", expectedAccountId: 45, organizationIds: [4], grantedByUserId: 7 }),
      (error: unknown) => error instanceof ManagerGrantError && error.code === code,
    );
    assert.equal(fixture.state.pendingInvitation, true);
    assert.equal(fixture.state.commits, 0);
    assert.equal(fixture.state.rollbacks, 1);
  }
});

test("unavailable organizations and grant failures roll back invitation cancellation and access changes", async () => {
  const unavailable = fakePort({ validOrganizations: false });
  await assert.rejects(
    () => grantPolicyCraftManagerAccess(unavailable.port, { email: "manager@example.com", expectedAccountId: 45, organizationIds: [4], grantedByUserId: 7 }),
    (error: unknown) => error instanceof ManagerGrantError && error.code === "ORGANIZATIONS_UNAVAILABLE",
  );
  assert.equal(unavailable.state.pendingInvitation, true);
  assert.equal(unavailable.state.assignments.has(4), false);

  const assignmentFailure = fakePort({ access: null, failGrant: true });
  await assert.rejects(
    () => grantPolicyCraftManagerAccess(assignmentFailure.port, { email: "manager@example.com", expectedAccountId: 45, organizationIds: [4], grantedByUserId: 7 }),
    /assignment insert failed/,
  );
  assert.equal(assignmentFailure.state.pendingInvitation, true);
  assert.equal(assignmentFailure.state.access, null);
  assert.equal(assignmentFailure.state.assignments.has(4), false);
  assert.equal(assignmentFailure.state.rollbacks, 1);
});

test("direct grant requires at least one valid organization", async () => {
  const empty = fakePort();
  await assert.rejects(
    () => grantPolicyCraftManagerAccess(empty.port, { email: "manager@example.com", expectedAccountId: 45, organizationIds: [], grantedByUserId: 7 }),
    (error: unknown) => error instanceof ManagerGrantError && error.code === "ORGANIZATION_REQUIRED",
  );
  assert.equal(empty.events.length, 0);
});

test("a stale confirmation cannot grant a different account that now matches the email", async () => {
  const changed = fakePort();
  await assert.rejects(
    () => grantPolicyCraftManagerAccess(changed.port, { email: "manager@example.com", expectedAccountId: 91, organizationIds: [4], grantedByUserId: 7 }),
    (error: unknown) => error instanceof ManagerGrantError && error.code === "ACCOUNT_CHANGED",
  );
  assert.equal(changed.state.pendingInvitation, true);
  assert.equal(changed.state.assignments.has(4), false);
  assert.equal(changed.state.rollbacks, 1);
});
