import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptPolicyCraftInvitation,
  type InvitationAcceptancePort,
  type InvitationAcceptanceTransaction,
  type PolicyCraftInvitation,
} from "./policycraft-invitation-workflow";

function fakePort(options: { existingUser?: { id: number }; failActivate?: boolean; eligibleInviter?: boolean; eligibleExisting?: boolean; validOrganizations?: boolean } = {}) {
  const events: string[] = [];
  const invitation: PolicyCraftInvitation = {
    id: "invite-1", email: "new@example.com", name: "New Manager", organizationIds: [4, 8],
    existingUserId: null, invitedByUserId: 1, expiresAt: new Date("2030-01-01T00:00:00Z"), acceptedAt: null, cancelledAt: null,
  };
  const state: { invitation: PolicyCraftInvitation | null; rolledBack: boolean } = {
    invitation,
    rolledBack: false,
  };
  const port: InvitationAcceptancePort = {
    async withTransaction<T>(run: (transaction: InvitationAcceptanceTransaction) => Promise<T>) {
      try {
        const result = await run({
          async findInvitationByTokenHash() { events.push("lock-invitation"); return state.invitation; },
          async findSharedUserByEmail() { events.push("lookup-email"); return options.existingUser || null; },
          async isEligibleInviter() { return options.eligibleInviter !== false; },
          async isEligibleExistingUser() { return options.eligibleExisting !== false; },
          async validateOrganizations() { return options.validOrganizations !== false; },
          async createSharedUser(name, email) { events.push(`create-user:${name}:${email}`); return 12; },
          async setCredentialPassword(userId, passwordHash) { events.push(`set-password:${userId}:${passwordHash}`); },
          async activateManager(userId, organizationIds, invitedByUserId) {
            events.push(`activate:${userId}:${organizationIds.join(",")}:${invitedByUserId}`);
            if (options.failActivate) throw new Error("assignment insert failed");
          },
          async consumeInvitation(id) { events.push(`consume:${id}`); },
        });
        events.push("commit");
        return result;
      } catch (error) {
        state.rolledBack = true;
        events.push("rollback");
        throw error;
      }
    },
  };
  return { port, events, state };
}

test("new invitation acceptance creates credentials and activates assigned manager in one transaction", async () => {
  const { port, events } = fakePort();
  const result = await acceptPolicyCraftInvitation(port, {
    tokenHash: "token-hash", password: "StrongPassword123", now: new Date("2029-01-01T00:00:00Z"),
    hashPassword: async () => "bcrypt-hash",
  });
  assert.deepEqual(result, { status: "accepted", userId: 12, mode: "new" });
  assert.deepEqual(events, [
    "lock-invitation", "lookup-email", "create-user:New Manager:new@example.com",
    "set-password:12:bcrypt-hash", "activate:12:4,8:1", "consume:invite-1", "commit",
  ]);
});

test("existing account acceptance requires the invited account session and never changes its password", async () => {
  const { port, events, state } = fakePort();
  state.invitation!.existingUserId = 55;
  const mismatch = await acceptPolicyCraftInvitation(port, {
    tokenHash: "token-hash", currentUserId: 56, now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused",
  });
  assert.deepEqual(mismatch, { status: "session_mismatch" });
  const accepted = await acceptPolicyCraftInvitation(port, {
    tokenHash: "token-hash", currentUserId: 55, now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused",
  });
  assert.deepEqual(accepted, { status: "accepted", userId: 55, mode: "existing" });
  assert.equal(events.some((event) => event.startsWith("set-password") || event.startsWith("create-user")), false);
});

test("a duplicate account discovered at acceptance conflicts instead of overwriting credentials", async () => {
  const { port, events } = fakePort({ existingUser: { id: 90 } });
  const result = await acceptPolicyCraftInvitation(port, {
    tokenHash: "token-hash", password: "StrongPassword123", now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused",
  });
  assert.deepEqual(result, { status: "account_exists" });
  assert.equal(events.some((event) => event.startsWith("create-user") || event.startsWith("set-password") || event.startsWith("activate")), false);
});

test("a failure while activating access rolls back user and credentials", async () => {
  const { port, state } = fakePort({ failActivate: true });
  await assert.rejects(() => acceptPolicyCraftInvitation(port, {
    tokenHash: "token-hash", password: "StrongPassword123", now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "bcrypt-hash",
  }), /assignment insert failed/);
  assert.equal(state.rolledBack, true);
});

test("unknown, cancelled, expired, and replayed invitations are rejected without creating accounts", async () => {
  const unknown = fakePort();
  unknown.state.invitation = null;
  const unknownResult = await acceptPolicyCraftInvitation(unknown.port, { tokenHash: "x", now: new Date(), hashPassword: async () => "unused" });
  assert.deepEqual(unknownResult, { status: "invalid" });

  const cancelled = fakePort();
  cancelled.state.invitation!.cancelledAt = new Date("2029-01-01T00:00:00Z");
  const cancelledResult = await acceptPolicyCraftInvitation(cancelled.port, { tokenHash: "x", now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused" });
  assert.deepEqual(cancelledResult, { status: "already_used" });

  const expired = fakePort();
  const expiredResult = await acceptPolicyCraftInvitation(expired.port, { tokenHash: "x", now: new Date("2031-01-01T00:00:00Z"), hashPassword: async () => "unused" });
  assert.deepEqual(expiredResult, { status: "expired" });

  const replayed = fakePort();
  replayed.state.invitation!.acceptedAt = new Date("2029-01-01T00:00:00Z");
  const replayResult = await acceptPolicyCraftInvitation(replayed.port, { tokenHash: "x", now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused" });
  assert.deepEqual(replayResult, { status: "already_used" });
  assert.equal(replayed.events.some((event) => event.startsWith("create-user") || event.startsWith("set-password")), false);
});

test("acceptance fails closed when inviter or linked account is no longer eligible", async () => {
  const invalidInviter = fakePort({ eligibleInviter: false });
  assert.deepEqual(await acceptPolicyCraftInvitation(invalidInviter.port, { tokenHash: "x", password: "StrongPassword123", now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused" }), { status: "invalid" });

  const invalidOrganizations = fakePort({ validOrganizations: false });
  assert.deepEqual(await acceptPolicyCraftInvitation(invalidOrganizations.port, { tokenHash: "x", password: "StrongPassword123", now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused" }), { status: "invalid" });

  const linked = fakePort({ eligibleExisting: false });
  linked.state.invitation!.existingUserId = 55;
  assert.deepEqual(await acceptPolicyCraftInvitation(linked.port, { tokenHash: "x", currentUserId: 55, now: new Date("2029-01-01T00:00:00Z"), hashPassword: async () => "unused" }), { status: "invalid" });
  assert.equal(linked.events.some((event) => event.startsWith("activate") || event.startsWith("set-password")), false);
});
