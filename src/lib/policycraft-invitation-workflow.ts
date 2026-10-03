import { normalizePolicyCraftEmail } from "./policycraft-access-policy";

export type PolicyCraftInvitation = {
  id: string;
  email: string;
  name: string;
  organizationIds: number[];
  existingUserId: number | null;
  invitedByUserId: number;
  expiresAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
};

export type InvitationAcceptanceTransaction = {
  findInvitationByTokenHash(tokenHash: string): Promise<PolicyCraftInvitation | null>;
  findSharedUserByEmail(email: string): Promise<{ id: number } | null>;
  isEligibleInviter(userId: number): Promise<boolean>;
  isEligibleExistingUser(userId: number, expectedEmail: string): Promise<boolean>;
  validateOrganizations(organizationIds: number[]): Promise<boolean>;
  createSharedUser(name: string, email: string): Promise<number>;
  setCredentialPassword(userId: number, passwordHash: string): Promise<void>;
  activateManager(userId: number, organizationIds: number[], invitedByUserId: number): Promise<void>;
  consumeInvitation(invitationId: string, acceptedAt: Date): Promise<void>;
};

export type InvitationAcceptancePort = {
  withTransaction<T>(run: (transaction: InvitationAcceptanceTransaction) => Promise<T>): Promise<T>;
};

export type InvitationAcceptanceInput = {
  tokenHash: string;
  password?: string;
  currentUserId?: number;
  now?: Date;
  hashPassword: (password: string) => Promise<string>;
};

export type InvitationAcceptanceResult =
  | { status: "accepted"; userId: number; mode: "new" | "existing" }
  | { status: "invalid" | "expired" | "already_used" | "session_mismatch" | "account_exists" };

export async function acceptPolicyCraftInvitation(
  port: InvitationAcceptancePort,
  input: InvitationAcceptanceInput,
): Promise<InvitationAcceptanceResult> {
  return port.withTransaction(async (transaction) => {
    const invitation = await transaction.findInvitationByTokenHash(input.tokenHash);
    if (!invitation) return { status: "invalid" };
    if (invitation.acceptedAt || invitation.cancelledAt) return { status: "already_used" };
    const now = input.now || new Date();
    if (invitation.expiresAt.getTime() <= now.getTime()) return { status: "expired" };
    if (!(await transaction.isEligibleInviter(invitation.invitedByUserId))) return { status: "invalid" };
    if (!(await transaction.validateOrganizations(invitation.organizationIds))) return { status: "invalid" };

    let userId: number;
    let mode: "new" | "existing";
    if (invitation.existingUserId !== null) {
      if (input.currentUserId !== invitation.existingUserId) return { status: "session_mismatch" };
      if (!(await transaction.isEligibleExistingUser(invitation.existingUserId, normalizePolicyCraftEmail(invitation.email)))) return { status: "invalid" };
      userId = invitation.existingUserId;
      mode = "existing";
    } else {
      if (!input.password) return { status: "invalid" };
      const existing = await transaction.findSharedUserByEmail(normalizePolicyCraftEmail(invitation.email));
      if (existing) return { status: "account_exists" };
      const passwordHash = await input.hashPassword(input.password);
      try {
        userId = await transaction.createSharedUser(invitation.name, normalizePolicyCraftEmail(invitation.email));
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
          return { status: "account_exists" };
        }
        throw error;
      }
      await transaction.setCredentialPassword(userId, passwordHash);
      mode = "new";
    }

    await transaction.activateManager(userId, invitation.organizationIds, invitation.invitedByUserId);
    await transaction.consumeInvitation(invitation.id, now);
    return { status: "accepted", userId, mode };
  });
}
