import { normalizePolicyCraftEmail } from "./policycraft-access-policy";
import { hasUsablePolicyCraftPasswordHash } from "./policycraft-password";

export type PolicyCraftAdminRecipientRole = "admin" | "manager" | "user";

export type PolicyCraftAdminRecipient = {
  id: string;
  name: string;
  email: string;
  role: PolicyCraftAdminRecipientRole;
};

export type PolicyCraftAdminAddUser = {
  id: number;
  name: string;
  email: string;
  active: boolean;
  deleted: boolean;
  accessRole: "admin" | "manager" | null;
  accessStatus: "active" | "disabled" | null;
  credentialHash: string | null;
};

export type PolicyCraftAdminAddTransaction = {
  /** Locks grants in primary-key order so concurrent adds revalidate against serialized state. */
  lockAllAccessGrants(): Promise<void>;
  findUserForUpdate(userId: number): Promise<PolicyCraftAdminAddUser | null>;
  findUserByEmailForUpdate(email: string): Promise<PolicyCraftAdminAddUser | null>;
  hasPendingInvitationForUpdate(email: string): Promise<boolean>;
  addAdmin(userId: number, createdByUserId: number): Promise<void>;
};

export type PolicyCraftAdminAddPort = {
  withTransaction<T>(work: (transaction: PolicyCraftAdminAddTransaction) => Promise<T>): Promise<T>;
};

export type PolicyCraftAdminAddErrorCode =
  | "ACTOR_UNAUTHORIZED"
  | "INVALID_RECIPIENT"
  | "RECIPIENT_NOT_FOUND"
  | "RECIPIENT_UNAVAILABLE"
  | "ALREADY_ADMIN"
  | "PENDING_INVITATION"
  | "INVALID_PASSWORD";

export class PolicyCraftAdminAddError extends Error {
  constructor(readonly code: PolicyCraftAdminAddErrorCode) {
    super(addErrors[code]);
    this.name = "PolicyCraftAdminAddError";
  }
}

const addErrors: Record<PolicyCraftAdminAddErrorCode, string> = {
  ACTOR_UNAUTHORIZED: "An active PolicyCraft administrator session is required.",
  INVALID_RECIPIENT: "Choose a different eligible account to add as an administrator.",
  RECIPIENT_NOT_FOUND: "No eligible account matches that email address.",
  RECIPIENT_UNAVAILABLE: "That account is inactive or does not have a usable login.",
  ALREADY_ADMIN: "That account already has active PolicyCraft administrator access.",
  PENDING_INVITATION: "Complete or cancel the pending manager invitation before adding this administrator.",
  INVALID_PASSWORD: "The administrator password could not be verified.",
};

export function normalizeAdminAddEmail(value: string): string {
  return normalizePolicyCraftEmail(value);
}

export function isValidAdminAddEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isActiveAdmin(
  user: PolicyCraftAdminAddUser | null,
): user is PolicyCraftAdminAddUser & { active: true; deleted: false; accessRole: "admin"; accessStatus: "active" } {
  return !!user && user.active && !user.deleted && user.accessRole === "admin" && user.accessStatus === "active";
}

function recipientSummary(user: PolicyCraftAdminAddUser): PolicyCraftAdminRecipient {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.accessRole ?? "user",
  };
}

function isEligibleRecipient(user: PolicyCraftAdminAddUser): boolean {
  return user.active && !user.deleted && user.accessStatus !== "disabled"
    && hasUsablePolicyCraftPasswordHash(user.credentialHash);
}

async function lockAndValidateActor(
  transaction: PolicyCraftAdminAddTransaction,
  actorId: number,
  email: string,
): Promise<PolicyCraftAdminAddUser> {
  // Keep the invitation-before-access lock order used by invitation acceptance.
  const pendingInvitation = await transaction.hasPendingInvitationForUpdate(email);
  await transaction.lockAllAccessGrants();
  const actor = await transaction.findUserForUpdate(actorId);
  if (!isActiveAdmin(actor)) throw new PolicyCraftAdminAddError("ACTOR_UNAUTHORIZED");
  if (pendingInvitation) throw new PolicyCraftAdminAddError("PENDING_INVITATION");
  return actor;
}

export async function lookupPolicyCraftAdminRecipient(
  port: PolicyCraftAdminAddPort,
  actorId: number,
  emailInput: string,
): Promise<PolicyCraftAdminRecipient> {
  const email = normalizeAdminAddEmail(emailInput);
  if (!isValidAdminAddEmail(email)) throw new PolicyCraftAdminAddError("RECIPIENT_NOT_FOUND");

  return port.withTransaction(async (transaction) => {
    await lockAndValidateActor(transaction, actorId, email);
    const recipient = await transaction.findUserByEmailForUpdate(email);
    if (!recipient || normalizeAdminAddEmail(recipient.email) !== email) {
      throw new PolicyCraftAdminAddError("RECIPIENT_NOT_FOUND");
    }
    if (!isEligibleRecipient(recipient)) throw new PolicyCraftAdminAddError("RECIPIENT_UNAVAILABLE");
    if (isActiveAdmin(recipient)) throw new PolicyCraftAdminAddError("ALREADY_ADMIN");
    return recipientSummary(recipient);
  });
}

export async function addPolicyCraftAdministrator(
  port: PolicyCraftAdminAddPort,
  input: { actorId: number; email: string; recipientId: string; confirmed: true; password: string },
  verifyPassword: (hash: string, password: string) => Promise<boolean>,
): Promise<PolicyCraftAdminRecipient> {
  const email = normalizeAdminAddEmail(input.email);
  const recipientId = /^\d+$/.test(input.recipientId) ? Number(input.recipientId) : NaN;
  if (!isValidAdminAddEmail(email) || !Number.isSafeInteger(recipientId) || recipientId <= 0) {
    throw new PolicyCraftAdminAddError("INVALID_RECIPIENT");
  }

  return port.withTransaction(async (transaction) => {
    const actor = await lockAndValidateActor(transaction, input.actorId, email);
    if (!hasUsablePolicyCraftPasswordHash(actor.credentialHash) || !input.password || !(await verifyPassword(actor.credentialHash, input.password))) {
      throw new PolicyCraftAdminAddError("INVALID_PASSWORD");
    }

    const recipient = await transaction.findUserForUpdate(recipientId);
    if (!recipient || normalizeAdminAddEmail(recipient.email) !== email || recipient.id !== recipientId) {
      throw new PolicyCraftAdminAddError("INVALID_RECIPIENT");
    }
    if (recipient.id === actor.id) throw new PolicyCraftAdminAddError("INVALID_RECIPIENT");
    if (!isEligibleRecipient(recipient)) throw new PolicyCraftAdminAddError("RECIPIENT_UNAVAILABLE");
    if (isActiveAdmin(recipient)) throw new PolicyCraftAdminAddError("ALREADY_ADMIN");
    await transaction.addAdmin(recipient.id, actor.id);
    return recipientSummary({ ...recipient, accessRole: "admin", accessStatus: "active" });
  });
}
