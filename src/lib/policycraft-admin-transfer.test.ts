import assert from "node:assert/strict";
import test from "node:test";
import {
  lookupPolicyCraftAdminTransferRecipient,
  PolicyCraftAdminTransferError,
  transferPolicyCraftAdministrator,
  type PolicyCraftAdminTransferPort,
  type PolicyCraftAdminTransferTransaction,
  type PolicyCraftTransferUser,
} from "./policycraft-admin-transfer";

function user(
  id: number,
  email: string,
  accessRole: PolicyCraftTransferUser["accessRole"],
  accessStatus: PolicyCraftTransferUser["accessStatus"],
  overrides: Partial<PolicyCraftTransferUser> = {},
): PolicyCraftTransferUser {
  return {
    id, name: `User ${id}`, email, active: true, deleted: false,
    accessRole, accessStatus, credentialHash: id.toString(16).padStart(64, "0"), ...overrides,
  };
}

function makePort(initialUsers: PolicyCraftTransferUser[], pendingEmails: string[] = [], failDisable = false) {
  let users = new Map(initialUsers.map((entry) => [entry.id, { ...entry }]));
  const pending = new Set(pendingEmails.map((email) => email.toLowerCase()));
  let tail = Promise.resolve();
  const port: PolicyCraftAdminTransferPort = {
    async withTransaction<T>(work: (transaction: PolicyCraftAdminTransferTransaction) => Promise<T>): Promise<T> {
      let unlock!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      const draft = new Map([...users].map(([id, entry]) => [id, { ...entry }]));
      const tx: PolicyCraftAdminTransferTransaction = {
        async lockAllAccessGrants() {},
        async findUserForUpdate(id) { return draft.get(id) || null; },
        async findUserByEmailForUpdate(email) {
          const matches = [...draft.values()].filter((entry) => entry.email.toLowerCase() === email.toLowerCase());
          return matches.length === 1 ? matches[0] : null;
        },
        async hasPendingInvitationForUpdate(email) { return pending.has(email.toLowerCase()); },
        async promoteToAdmin(id) {
          const entry = draft.get(id)!;
          draft.set(id, { ...entry, accessRole: "admin", accessStatus: "active" });
        },
        async disableAdmin(id) {
          if (failDisable) throw new Error("simulated write failure");
          const entry = draft.get(id)!;
          draft.set(id, { ...entry, accessStatus: "disabled" });
        },
      };
      try {
        const result = await work(tx);
        users = draft;
        return result;
      } finally {
        unlock();
      }
    },
  };
  return { port, read: (id: number) => users.get(id), pending };
}

const validPassword = async (hash: string, password: string) => /^[a-f0-9]{64}$/.test(hash) && password === "correct";
const admin = user(1, "admin@example.com", "admin", "active");
const recipient = user(2, "new-admin@example.com", "manager", "active");

test("lookup returns one active existing account with a usable credential and blocks pending invites", async () => {
  const { port } = makePort([admin, recipient]);
  assert.deepEqual(await lookupPolicyCraftAdminTransferRecipient(port, 1, " NEW-ADMIN@EXAMPLE.COM "), {
    id: "2", name: "User 2", email: "new-admin@example.com", role: "manager",
  });

  const pending = makePort([admin, recipient], [recipient.email]);
  await assert.rejects(
    lookupPolicyCraftAdminTransferRecipient(pending.port, 1, recipient.email),
    { name: "PolicyCraftAdminTransferError", code: "PENDING_INVITATION" },
  );
});

test("transfer requires the current actor password and exact reviewed account identity", async () => {
  const wrongPassword = makePort([admin, recipient]);
  await assert.rejects(transferPolicyCraftAdministrator(wrongPassword.port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "wrong",
  }, validPassword), { code: "INVALID_PASSWORD" });
  assert.equal(wrongPassword.read(1)?.accessStatus, "active");
  assert.equal(wrongPassword.read(2)?.accessRole, "manager");

  const changedEmail = makePort([admin, recipient]);
  await assert.rejects(transferPolicyCraftAdministrator(changedEmail.port, {
    actorId: 1, email: "other@example.com", recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), { code: "INVALID_RECIPIENT" });
  await assert.rejects(transferPolicyCraftAdministrator(changedEmail.port, {
    actorId: 1, email: admin.email, recipientId: "1", confirmed: true, password: "correct",
  }, validPassword), { code: "INVALID_RECIPIENT" });
});

test("transfer is refused while an unaccepted, uncancelled manager invitation remains pending", async () => {
  const { port, read } = makePort([admin, recipient], [recipient.email]);
  await assert.rejects(transferPolicyCraftAdministrator(port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), { code: "PENDING_INVITATION" });
  assert.equal(read(1)?.accessStatus, "active");
  assert.equal(read(2)?.accessRole, "manager");
});

test("inactive, deleted, or passwordless recipients cannot receive administrator access", async () => {
  for (const unavailable of [
    user(2, recipient.email, "manager", "active", { active: false }),
    user(2, recipient.email, "manager", "active", { deleted: true }),
    user(2, recipient.email, "manager", "disabled"),
    user(2, recipient.email, "manager", "active", { credentialHash: null }),
    user(2, recipient.email, "manager", "active", { credentialHash: "malformed-hash" }),
  ]) {
    const { port } = makePort([admin, unavailable]);
    await assert.rejects(lookupPolicyCraftAdminTransferRecipient(port, 1, recipient.email), { code: "RECIPIENT_UNAVAILABLE" });
    await assert.rejects(transferPolicyCraftAdministrator(port, {
      actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
    }, validPassword), { code: "RECIPIENT_UNAVAILABLE" });
  }
});

test("a successful transfer atomically promotes the recipient and disables the source PolicyCraft grant", async () => {
  const otherAdmin = user(3, "untouched-admin@example.com", "admin", "active");
  const { port, read } = makePort([admin, recipient, otherAdmin]);
  const result = await transferPolicyCraftAdministrator(port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword);
  assert.equal(result.role, "admin");
  assert.deepEqual([read(1)?.accessRole, read(1)?.accessStatus], ["admin", "disabled"]);
  assert.deepEqual([read(2)?.accessRole, read(2)?.accessStatus], ["admin", "active"]);
  assert.deepEqual([read(3)?.accessRole, read(3)?.accessStatus], ["admin", "active"]);
  assert.equal(read(1)?.credentialHash, admin.credentialHash);
  assert.equal(read(2)?.credentialHash, recipient.credentialHash);
});

test("stale actors, replays, and concurrent handovers cannot retain or multiply authority", async () => {
  const { port, read } = makePort([admin, recipient, user(3, "third@example.com", null, null)]);
  const request = (actorId: number, email: string, recipientId: string) => transferPolicyCraftAdministrator(port, {
    actorId, email, recipientId, confirmed: true, password: "correct",
  }, validPassword);
  await request(1, recipient.email, "2");
  await assert.rejects(request(1, recipient.email, "2"), { code: "ACTOR_UNAUTHORIZED" });
  await assert.rejects(request(1, "third@example.com", "3"), { code: "ACTOR_UNAUTHORIZED" });

  // The new admin can start a second transfer; queued transactions recheck the actor under serialization.
  const concurrent = await Promise.allSettled([
    request(2, "third@example.com", "3"),
    request(1, "third@example.com", "3"),
  ]);
  assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(read(3)?.accessStatus, "active");
  assert.equal([1, 2, 3].filter((id) => read(id)?.accessRole === "admin" && read(id)?.accessStatus === "active").length, 1);
});

test("write failure rolls back the recipient promotion", async () => {
  const { port, read } = makePort([admin, recipient], [], true);
  await assert.rejects(transferPolicyCraftAdministrator(port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), /simulated write failure/);
  assert.equal(read(1)?.accessStatus, "active");
  assert.equal(read(2)?.accessRole, "manager");
});

test("non-admin or disabled actors cannot perform recipient lookup", async () => {
  const disabled = user(1, admin.email, "admin", "disabled");
  const { port } = makePort([disabled, recipient]);
  await assert.rejects(lookupPolicyCraftAdminTransferRecipient(port, 1, recipient.email), (error: unknown) => {
    assert.ok(error instanceof PolicyCraftAdminTransferError);
    assert.equal(error.code, "ACTOR_UNAUTHORIZED");
    return true;
  });
});

test("revoked actors cannot obtain pending-invitation information during either operation", async () => {
  const disabled = user(1, admin.email, "admin", "disabled");
  const { port } = makePort([disabled, recipient], [recipient.email]);
  await assert.rejects(lookupPolicyCraftAdminTransferRecipient(port, 1, recipient.email), { code: "ACTOR_UNAUTHORIZED" });
  await assert.rejects(transferPolicyCraftAdministrator(port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), { code: "ACTOR_UNAUTHORIZED" });
});
