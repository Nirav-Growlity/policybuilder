import { normalizePolicyCraftEmail } from "./policycraft-access-policy";

export type ManagerGrantAccount = {
  id: number;
  active: number;
  isDeleted: number;
  isSuperAdmin: number;
};

export type ManagerGrantAccess = { role: "admin" | "manager"; status: "active" | "disabled" };

export type ManagerGrantTransaction = {
  /** Locks and cancels unaccepted invitations before any user/access row locks. */
  cancelPendingInvitations(email: string): Promise<void>;
  findSharedAccountByEmail(email: string): Promise<ManagerGrantAccount | null>;
  findPolicyCraftAccess(userId: number): Promise<ManagerGrantAccess | null>;
  validateOrganizations(organizationIds: number[]): Promise<boolean>;
  grantManagerAccess(userId: number, organizationIds: number[], grantedByUserId: number): Promise<void>;
};

export type ManagerGrantPort = {
  withTransaction<T>(run: (transaction: ManagerGrantTransaction) => Promise<T>): Promise<T>;
};

export type ManagerGrantResult = { status: "granted"; userId: number };

export class ManagerGrantError extends Error {
  constructor(readonly code: "ACCOUNT_NOT_FOUND" | "ACCOUNT_CHANGED" | "ACCOUNT_UNAVAILABLE" | "ADMIN_ACCOUNT" | "MANAGER_DISABLED" | "ACCESS_CONFLICT" | "ORGANIZATIONS_UNAVAILABLE" | "ORGANIZATION_REQUIRED", message: string) {
    super(message);
    this.name = "ManagerGrantError";
  }
}

export async function grantPolicyCraftManagerAccess(
  port: ManagerGrantPort,
  input: { email: string; expectedAccountId: number; organizationIds: number[]; grantedByUserId: number },
): Promise<ManagerGrantResult> {
  const email = normalizePolicyCraftEmail(input.email);
  const organizationIds = [...new Set(input.organizationIds)];
  if (!organizationIds.length || organizationIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new ManagerGrantError("ORGANIZATION_REQUIRED", "Assign at least one valid organization.");
  }

  return port.withTransaction(async (transaction) => {
    await transaction.cancelPendingInvitations(email);

    const account = await transaction.findSharedAccountByEmail(email);
    if (!account) throw new ManagerGrantError("ACCOUNT_NOT_FOUND", "No existing account matches this email.");
    if (account.id !== input.expectedAccountId) {
      throw new ManagerGrantError("ACCOUNT_CHANGED", "The confirmed account no longer matches this email. Review the account and try again.");
    }
    if (!account.active || account.isDeleted) {
      throw new ManagerGrantError("ACCOUNT_UNAVAILABLE", "The existing account is disabled and cannot be linked.");
    }
    if (account.isSuperAdmin) {
      throw new ManagerGrantError("ADMIN_ACCOUNT", "An administrator account cannot be linked as a manager.");
    }

    const access = await transaction.findPolicyCraftAccess(account.id);
    if (access?.role === "admin") {
      throw new ManagerGrantError("ADMIN_ACCOUNT", "An administrator account cannot be linked as a manager.");
    }
    if (access?.role === "manager" && access.status !== "active") {
      throw new ManagerGrantError("MANAGER_DISABLED", "Manager access is disabled for this account.");
    }
    if (access && access.role !== "manager") {
      throw new ManagerGrantError("ACCESS_CONFLICT", "This account already has PolicyCraft access.");
    }

    if (!(await transaction.validateOrganizations(organizationIds))) {
      throw new ManagerGrantError("ORGANIZATIONS_UNAVAILABLE", "One or more organizations are unavailable.");
    }

    await transaction.grantManagerAccess(account.id, organizationIds, input.grantedByUserId);
    return { status: "granted", userId: account.id };
  });
}
