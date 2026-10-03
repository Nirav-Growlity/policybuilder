import { normalizePolicyCraftEmail } from "./policycraft-access-policy";
import { hasUsablePolicyCraftPasswordHash } from "./policycraft-password";

export type PolicyCraftTransferRole = "admin" | "manager" | "user";

export type PolicyCraftTransferRecipient = {
  id: string;
  name: string;
  email: string;
  role: PolicyCraftTransferRole;
};

export type PolicyCraftTransferUser = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  deleted: boolean;
  accessRole: "admin" | "manager" | null;
  accessStatus: "active" | "disabled" | null;
  credentialHash: string | null;
};

export type PolicyCraftAdminTransferTransaction = {
  /** Locks all current grants in primary-key order, serializing transfers, including grants on different users. */
  lockAllAccessGrants(): Promise<void>;
  findUserForUpdate(userId: number): Promise<PolicyCraftTransferUser | null>;
  findUserByEmailForUpdate(email: string): Promise<PolicyCraftTransferUser | null>;
  hasPendingInvitationForUpdate(email: string): Promise<boolean>;
  promoteToAdmin(userId: number, createdByUserId: number): Promise<void>;
  disableAdmin(userId: number): Promise<void>;
};

export type PolicyCraftAdminTransferPort = {
  withTransaction<T>(work: (transaction: PolicyCraftAdminTransferTransaction) => Promise<T>): Promise<T>;
};

export type PolicyCraftAdminTransferErrorCode =
  | "ACTOR_UNAUTHORIZED"
  | "INVALID_RECIPIENT"
  | "RECIPIENT_NOT_FOUND"
  | "RECIPIENT_UNAVAILABLE"
  | "PENDING_INVITATION"
  | "INVALID_PASSWORD";

export class PolicyCraftAdminTransferError extends Error {
  constructor(readonly code: PolicyCraftAdminTransferErrorCode) {
    super(transferErrors[code]);
    this.name = "PolicyCraftAdminTransferError";
  }
}

const transferErrors: Record<PolicyCraftAdminTransferErrorCode, string> = {
  ACTOR_UNAUTHORIZED: "An active PolicyCraft administrator session is required.",
  INVALID_RECIPIENT: "Choose a different eligible account for the transfer.",
  RECIPIENT_NOT_FOUND: "No eligible account matches that email address.",
  RECIPIENT_UNAVAILABLE: "That account is inactive or does not have a usable login.",
  PENDING_INVITATION: "Complete or cancel the pending manager invitation before transferring administration.",
  INVALID_PASSWORD: "The administrator password could not be verified.",
};

export function normalizeTransferEmail(value: string): string {
  return normalizePolicyCraftEmail(value);
}

export function isValidTransferEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isActiveAdmin(user: PolicyCraftTransferUser | null): user is PolicyCraftTransferUser {
  return !!user && user.active && !user.deleted && user.accessRole === "admin" && user.accessStatus === "active";
}

function recipientSummary(user: PolicyCraftTransferUser): PolicyCraftTransferRecipient {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.accessRole ?? "user",
  };
}

function isEligibleRecipient(user: PolicyCraftTransferUser): boolean {
  return user.active && !user.deleted && user.accessStatus !== "disabled"
    && hasUsablePolicyCraftPasswordHash(user.credentialHash);
}

export async function lookupPolicyCraftAdminTransferRecipient(
  port: PolicyCraftAdminTransferPort,
  actorId: number,
  emailInput: string,
): Promise<PolicyCraftTransferRecipient> {
  const email = normalizeTransferEmail(emailInput);
  if (!isValidTransferEmail(email)) throw new PolicyCraftAdminTransferError("RECIPIENT_NOT_FOUND");

  return port.withTransaction(async (transaction) => {
    const pendingInvitation = await transaction.hasPendingInvitationForUpdate(email);
    await transaction.lockAllAccessGrants();
    const actor = await transaction.findUserForUpdate(actorId);
    if (!isActiveAdmin(actor)) throw new PolicyCraftAdminTransferError("ACTOR_UNAUTHORIZED");
    if (pendingInvitation) throw new PolicyCraftAdminTransferError("PENDING_INVITATION");

    const recipient = await transaction.findUserByEmailForUpdate(email);
    if (!recipient || normalizeTransferEmail(recipient.email) !== email) {
      throw new PolicyCraftAdminTransferError("RECIPIENT_NOT_FOUND");
    }
    if (recipient.id === actor.id) throw new PolicyCraftAdminTransferError("INVALID_RECIPIENT");
    if (!isEligibleRecipient(recipient)) throw new PolicyCraftAdminTransferError("RECIPIENT_UNAVAILABLE");
    return recipientSummary(recipient);
  });
}

export async function transferPolicyCraftAdministrator(
  port: PolicyCraftAdminTransferPort,
  input: { actorId: number; email: string; recipientId: string; confirmed: true; password: string },
  verifyPassword: (hash: string, password: string) => Promise<boolean>,
): Promise<PolicyCraftTransferRecipient> {
  const email = normalizeTransferEmail(input.email);
  const recipientId = /^\d+$/.test(input.recipientId) ? Number(input.recipientId) : NaN;
  if (!isValidTransferEmail(email) || !Number.isSafeInteger(recipientId) || recipientId <= 0) {
    throw new PolicyCraftAdminTransferError("INVALID_RECIPIENT");
  }

  return port.withTransaction(async (transaction) => {
    // Match invitation acceptance's invitation-before-access lock order.
    const pendingInvitation = await transaction.hasPendingInvitationForUpdate(email);
    await transaction.lockAllAccessGrants();
    const actor = await transaction.findUserForUpdate(input.actorId);
    if (!isActiveAdmin(actor)) throw new PolicyCraftAdminTransferError("ACTOR_UNAUTHORIZED");
    if (pendingInvitation) throw new PolicyCraftAdminTransferError("PENDING_INVITATION");
    if (!hasUsablePolicyCraftPasswordHash(actor.credentialHash) || !input.password || !(await verifyPassword(actor.credentialHash, input.password))) {
      throw new PolicyCraftAdminTransferError("INVALID_PASSWORD");
    }

    const recipient = await transaction.findUserForUpdate(recipientId);
    if (!recipient || normalizeTransferEmail(recipient.email) !== email || recipient.id !== recipientId) {
      throw new PolicyCraftAdminTransferError("INVALID_RECIPIENT");
    }
    if (recipient.id === actor.id) throw new PolicyCraftAdminTransferError("INVALID_RECIPIENT");
    if (!isEligibleRecipient(recipient)) throw new PolicyCraftAdminTransferError("RECIPIENT_UNAVAILABLE");
    await transaction.promoteToAdmin(recipient.id, actor.id);
    await transaction.disableAdmin(actor.id);
    return recipientSummary({ ...recipient, accessRole: "admin", accessStatus: "active" });
  });
}
