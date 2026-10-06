import assert from "node:assert/strict";
import test from "node:test";
import {
  addPolicyCraftAdministrator,
  lookupPolicyCraftAdminRecipient,
  PolicyCraftAdminAddError,
  type PolicyCraftAdminAddPort,
  type PolicyCraftAdminAddTransaction,
  type PolicyCraftAdminAddUser,
} from "./policycraft-admin-add";

function user(
  id: number,
  email: string,
  accessRole: PolicyCraftAdminAddUser["accessRole"],
  accessStatus: PolicyCraftAdminAddUser["accessStatus"],
  overrides: Partial<PolicyCraftAdminAddUser> = {},
): PolicyCraftAdminAddUser {
  return {
    id, name: `User ${id}`, email, active: true, deleted: false,
    accessRole, accessStatus, credentialHash: id.toString(16).padStart(64, "0"), ...overrides,
  };
}

function makePort(initialUsers: PolicyCraftAdminAddUser[], pendingEmails: string[] = [], failAdd = false) {
  let users = new Map(initialUsers.map((entry) => [entry.id, { ...entry }]));
  const pending = new Set(pendingEmails.map((email) => email.toLowerCase()));
  let tail = Promise.resolve();
  const port: PolicyCraftAdminAddPort = {
    async withTransaction<T>(work: (transaction: PolicyCraftAdminAddTransaction) => Promise<T>): Promise<T> {
      let unlock!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => { unlock = resolve; });
      await previous;
      const draft = new Map([...users].map(([id, entry]) => [id, { ...entry }]));
      const tx: PolicyCraftAdminAddTransaction = {
        async lockAllAccessGrants() {},
        async findUserForUpdate(id) { return draft.get(id) || null; },
        async findUserByEmailForUpdate(email) {
          const matches = [...draft.values()].filter((entry) => entry.email.toLowerCase() === email.toLowerCase());
          return matches.length === 1 ? matches[0] : null;
        },
        async hasPendingInvitationForUpdate(email) { return pending.has(email.toLowerCase()); },
        async addAdmin(id) {
          if (failAdd) throw new Error("simulated write failure");
          const entry = draft.get(id)!;
          draft.set(id, { ...entry, accessRole: "admin", accessStatus: "active" });
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
  assert.deepEqual(await lookupPolicyCraftAdminRecipient(port, 1, " NEW-ADMIN@EXAMPLE.COM "), {
    id: "2", name: "User 2", email: "new-admin@example.com", role: "manager",
  });

  const pending = makePort([admin, recipient], [recipient.email]);
  await assert.rejects(
    lookupPolicyCraftAdminRecipient(pending.port, 1, recipient.email),
    { name: "PolicyCraftAdminAddError", code: "PENDING_INVITATION" },
  );
});

test("lookup identifies an account that already has active administrator access", async () => {
  const existingAdmin = user(2, recipient.email, "admin", "active");
  const { port } = makePort([admin, existingAdmin]);
  await assert.rejects(lookupPolicyCraftAdminRecipient(port, 1, recipient.email), {
    code: "ALREADY_ADMIN",
  });
});

test("adding an admin requires the current actor password and exact reviewed account identity", async () => {
  const wrongPassword = makePort([admin, recipient]);
  await assert.rejects(addPolicyCraftAdministrator(wrongPassword.port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "wrong",
  }, validPassword), { code: "INVALID_PASSWORD" });
  assert.deepEqual([wrongPassword.read(1)?.accessRole, wrongPassword.read(1)?.accessStatus], ["admin", "active"]);
  assert.equal(wrongPassword.read(2)?.accessRole, "manager");

  const changedEmail = makePort([admin, recipient]);
  await assert.rejects(addPolicyCraftAdministrator(changedEmail.port, {
    actorId: 1, email: "other@example.com", recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), { code: "INVALID_RECIPIENT" });
  await assert.rejects(addPolicyCraftAdministrator(changedEmail.port, {
    actorId: 1, email: admin.email, recipientId: "1", confirmed: true, password: "correct",
  }, validPassword), { code: "INVALID_RECIPIENT" });
});

test("adding an admin is refused while an unaccepted, uncancelled manager invitation remains pending", async () => {
  const { port, read } = makePort([admin, recipient], [recipient.email]);
  await assert.rejects(addPolicyCraftAdministrator(port, {
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
    await assert.rejects(lookupPolicyCraftAdminRecipient(port, 1, recipient.email), { code: "RECIPIENT_UNAVAILABLE" });
    await assert.rejects(addPolicyCraftAdministrator(port, {
      actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
    }, validPassword), { code: "RECIPIENT_UNAVAILABLE" });
  }
});

test("adding a manager as admin keeps the actor active and preserves existing grants and credentials", async () => {
  const otherAdmin = user(3, "untouched-admin@example.com", "admin", "active");
  const { port, read } = makePort([admin, recipient, otherAdmin]);
  const result = await addPolicyCraftAdministrator(port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword);
  assert.equal(result.role, "admin");
  assert.deepEqual([read(1)?.accessRole, read(1)?.accessStatus], ["admin", "active"]);
  assert.deepEqual([read(2)?.accessRole, read(2)?.accessStatus], ["admin", "active"]);
  assert.deepEqual([read(3)?.accessRole, read(3)?.accessStatus], ["admin", "active"]);
  assert.equal(read(1)?.credentialHash, admin.credentialHash);
  assert.equal(read(2)?.credentialHash, recipient.credentialHash);
});

test("existing admins receive an informative conflict and concurrent adds serialize", async () => {
  const alreadyAdmin = makePort([admin, user(2, recipient.email, "admin", "active")]);
  await assert.rejects(addPolicyCraftAdministrator(alreadyAdmin.port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), { code: "ALREADY_ADMIN" });

  const otherAdmin = user(4, "other-admin@example.com", "admin", "active");
  const { port, read } = makePort([admin, recipient, user(3, "third@example.com", null, null), otherAdmin]);
  const request = (actorId: number, email: string, recipientId: string) => addPolicyCraftAdministrator(port, {
    actorId, email, recipientId, confirmed: true, password: "correct",
  }, validPassword);
  // Both requests target the same account. The locked access rows serialize them into one grant.
  const concurrent = await Promise.allSettled([
    request(1, "third@example.com", "3"),
    request(1, "third@example.com", "3"),
  ]);
  assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((item) => item.status === "rejected").length, 1);
  assert.deepEqual([read(1)?.accessRole, read(1)?.accessStatus], ["admin", "active"]);
  assert.deepEqual([read(2)?.accessRole, read(2)?.accessStatus], ["manager", "active"]);
  assert.deepEqual([read(3)?.accessRole, read(3)?.accessStatus], ["admin", "active"]);
  assert.deepEqual([read(4)?.accessRole, read(4)?.accessStatus], ["admin", "active"]);
});

test("write failure rolls back the new admin grant", async () => {
  const { port, read } = makePort([admin, recipient], [], true);
  await assert.rejects(addPolicyCraftAdministrator(port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), /simulated write failure/);
  assert.equal(read(1)?.accessStatus, "active");
  assert.equal(read(2)?.accessRole, "manager");
});

test("non-admin or disabled actors cannot perform recipient lookup", async () => {
  const disabled = user(1, admin.email, "admin", "disabled");
  const { port } = makePort([disabled, recipient]);
  await assert.rejects(lookupPolicyCraftAdminRecipient(port, 1, recipient.email), (error: unknown) => {
    assert.ok(error instanceof PolicyCraftAdminAddError);
    assert.equal(error.code, "ACTOR_UNAUTHORIZED");
    return true;
  });
});

test("revoked actors cannot obtain pending-invitation information during either operation", async () => {
  const disabled = user(1, admin.email, "admin", "disabled");
  const { port } = makePort([disabled, recipient], [recipient.email]);
  await assert.rejects(lookupPolicyCraftAdminRecipient(port, 1, recipient.email), { code: "ACTOR_UNAUTHORIZED" });
  await assert.rejects(addPolicyCraftAdministrator(port, {
    actorId: 1, email: recipient.email, recipientId: "2", confirmed: true, password: "correct",
  }, validPassword), { code: "ACTOR_UNAUTHORIZED" });
});
