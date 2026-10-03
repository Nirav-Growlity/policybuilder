import type { ExistingAccount, InvitationDraft } from "./policycraft-access-repository";
import type { InvitationSummary } from "./policycraft-access-repository";

export type ManagerOnboardingPort<TManager> = {
  findAccount(email: string): Promise<ExistingAccount | null>;
  grantExisting(email: string, expectedAccountId: number, organizationIds: number[], grantedByUserId: number): Promise<TManager>;
  inviteNew(draft: InvitationDraft, grantedByUserId: number): Promise<{
    invitation: InvitationSummary;
    existingAccount: ExistingAccount | null;
    sent: boolean;
  }>;
};

export type ManagerOnboardingResult<TManager> =
  | { mode: "confirmation_required"; existingAccount: ExistingAccount }
  | { mode: "existing"; manager: TManager }
  | { mode: "new"; invitation: InvitationSummary; sent: boolean };

export class ManagerOnboardingError extends Error {
  constructor(readonly code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_CHANGED" | "ACCOUNT_UNAVAILABLE" | "ACCOUNT_CONFIRMATION_REQUIRED", message: string) {
    super(message);
    this.name = "ManagerOnboardingError";
  }
}

export async function onboardPolicyCraftManager<TManager>(
  port: ManagerOnboardingPort<TManager>,
  input: { draft: InvitationDraft; grantedByUserId: number },
): Promise<ManagerOnboardingResult<TManager>> {
  const { draft, grantedByUserId } = input;
  const account = await port.findAccount(draft.email);
  if (account && (!account.active || account.isDeleted)) {
    throw new ManagerOnboardingError("ACCOUNT_UNAVAILABLE", "The existing account is disabled and cannot be linked.");
  }

  if (account) {
    if (draft.linkExisting !== true) return { mode: "confirmation_required", existingAccount: account };
    if (draft.confirmedExistingAccountId === undefined) {
      throw new ManagerOnboardingError("ACCOUNT_CONFIRMATION_REQUIRED", "Review the existing account before granting manager access.");
    }
    if (draft.confirmedExistingAccountId !== account.id) {
      throw new ManagerOnboardingError("ACCOUNT_CHANGED", "The confirmed account no longer matches this email. Review the account and try again.");
    }
    return {
      mode: "existing",
      manager: await port.grantExisting(draft.email, account.id, draft.organizationIds, grantedByUserId),
    };
  }

  if (draft.linkExisting === true) {
    throw new ManagerOnboardingError("ACCOUNT_NOT_FOUND", "No existing account matches this email.");
  }

  const created = await port.inviteNew(draft, grantedByUserId);
  if (created.existingAccount) {
    if (!created.existingAccount.active || created.existingAccount.isDeleted) {
      throw new ManagerOnboardingError("ACCOUNT_UNAVAILABLE", "The existing account is disabled and cannot be linked.");
    }
    return { mode: "confirmation_required", existingAccount: created.existingAccount };
  }
  return { mode: "new", invitation: created.invitation, sent: created.sent };
}
