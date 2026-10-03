import assert from "node:assert/strict";
import test from "node:test";
import {
  ManagerOnboardingError,
  onboardPolicyCraftManager,
  type ManagerOnboardingPort,
} from "./policycraft-manager-onboarding-workflow";
import type { ExistingAccount } from "./policycraft-access-repository";

const account: ExistingAccount = {
  id: 45, name: "Existing User", email: "existing@example.com", active: 1, isDeleted: 0, isSuperAdmin: 0,
};

function fakePort(options: { account?: ExistingAccount | null; raceAccount?: ExistingAccount | null } = {}) {
  const events: string[] = [];
  const port: ManagerOnboardingPort<{ id: string; status: string }> = {
    async findAccount() {
      events.push("lookup-account");
      return options.account === undefined ? account : options.account;
    },
    async grantExisting(email, confirmedId, organizations, adminId) {
      events.push(`direct-grant:${email}:${confirmedId}:${organizations.join(",")}:${adminId}`);
      return { id: String(confirmedId), status: "active" };
    },
    async inviteNew(draft) {
      events.push("create-invitation");
      if (options.raceAccount) {
        events.push("transaction-recheck-existing-account");
        return {
          invitation: { id: "", email: draft.email, name: draft.name, organizationIds: draft.organizationIds, status: "pending", expiresAt: "", existingAccount: true },
          existingAccount: options.raceAccount,
          sent: false,
        };
      }
      events.push("send-invitation-email");
      return {
        invitation: { id: "invite-1", email: draft.email, name: draft.name, organizationIds: draft.organizationIds, status: "pending", expiresAt: "2030-01-01T00:00:00.000Z", existingAccount: false },
        existingAccount: null,
        sent: true,
      };
    },
  };
  return { port, events };
}

test("existing account first requires confirmation and a matching reviewed ID grants directly without invitation delivery", async () => {
  const firstSubmit = fakePort();
  const confirmation = await onboardPolicyCraftManager(firstSubmit.port, {
    draft: { name: "Typed Name", email: account.email, organizationIds: [4], linkExisting: false }, grantedByUserId: 7,
  });
  assert.deepEqual(confirmation, { mode: "confirmation_required", existingAccount: account });
  assert.deepEqual(firstSubmit.events, ["lookup-account"]);

  const confirmed = fakePort();
  const result = await onboardPolicyCraftManager(confirmed.port, {
    draft: { name: "Typed Name", email: account.email, organizationIds: [4, 8], linkExisting: true, confirmedExistingAccountId: account.id }, grantedByUserId: 7,
  });
  assert.deepEqual(result, { mode: "existing", manager: { id: "45", status: "active" } });
  assert.deepEqual(confirmed.events, ["lookup-account", "direct-grant:existing@example.com:45:4,8:7"]);
  assert.equal(confirmed.events.some((event) => event.startsWith("send-invitation-email") || event.includes("password") || event.includes("credential")), false);
});

test("new account follows invitation delivery and a newly detected account requires review without delivery", async () => {
  const newAccount = fakePort({ account: null });
  const invited = await onboardPolicyCraftManager(newAccount.port, {
    draft: { name: "New User", email: "new@example.com", organizationIds: [4] }, grantedByUserId: 7,
  });
  assert.equal(invited.mode, "new");
  assert.deepEqual(newAccount.events, ["lookup-account", "create-invitation", "send-invitation-email"]);

  const racedAccount = fakePort({ account: null, raceAccount: account });
  const confirmation = await onboardPolicyCraftManager(racedAccount.port, {
    draft: { name: "Existing User", email: account.email, organizationIds: [4] }, grantedByUserId: 7,
  });
  assert.deepEqual(confirmation, { mode: "confirmation_required", existingAccount: account });
  assert.deepEqual(racedAccount.events, ["lookup-account", "create-invitation", "transaction-recheck-existing-account"]);
});

test("stale account IDs, disabled accounts, and missing existing accounts cannot grant or invite", async () => {
  const stale = fakePort();
  await assert.rejects(
    () => onboardPolicyCraftManager(stale.port, { draft: { name: "X", email: account.email, organizationIds: [4], linkExisting: true, confirmedExistingAccountId: 12 }, grantedByUserId: 7 }),
    (error: unknown) => error instanceof ManagerOnboardingError && error.code === "ACCOUNT_CHANGED",
  );
  assert.deepEqual(stale.events, ["lookup-account"]);

  const disabled = fakePort({ account: { ...account, active: 0 } });
  await assert.rejects(
    () => onboardPolicyCraftManager(disabled.port, { draft: { name: "X", email: account.email, organizationIds: [4] }, grantedByUserId: 7 }),
    (error: unknown) => error instanceof ManagerOnboardingError && error.code === "ACCOUNT_UNAVAILABLE",
  );
  assert.deepEqual(disabled.events, ["lookup-account"]);

  const missing = fakePort({ account: null });
  await assert.rejects(
    () => onboardPolicyCraftManager(missing.port, { draft: { name: "X", email: account.email, organizationIds: [4], linkExisting: true, confirmedExistingAccountId: account.id }, grantedByUserId: 7 }),
    (error: unknown) => error instanceof ManagerOnboardingError && error.code === "ACCOUNT_NOT_FOUND",
  );
  assert.deepEqual(missing.events, ["lookup-account"]);
});
