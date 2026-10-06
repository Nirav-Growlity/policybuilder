import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import type { PolicyCraftAccess, PolicyCraftRole } from "./policycraft-access-types";
import { canAccessOrganization, canFallbackToLegacyOrganization, canMutateOrganization } from "./policycraft-access-policy";
import { auth, policyCraftTrustedOrigins } from "./auth";
import { policyCraftPool } from "./db";
import { ensurePolicyCraftOrganizationRegistry, getPolicyCraftOrganizationRecord, organizationSummary, PolicyCraftOrganizationsMigrationRequiredError, registerESGOrganization } from "./policycraft-organization-repository";

type ActorRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  org_id: string;
  active: number;
  is_deleted: number;
};
type RoleRow = RowDataPacket & { role: "admin" | "manager"; status: "active" | "disabled" };
type DocumentOrganizationRow = RowDataPacket & { org_id: number };

export type PolicyCraftActor = {
  user: { id: string; name: string; email: string; org_id?: string };
  role: PolicyCraftRole;
  /** Existing PolicyCraft user without an internal access row remains tied to this organization. */
  homeOrganizationId?: number;
};

export type PolicyCraftOrganizationScope = PolicyCraftAccess["organizations"][number] & {
  code: string;
  name: string;
  readOnly: boolean;
  documentId?: string;
};

export type PolicyCraftAuthContext = {
  user: PolicyCraftActor["user"];
  role: PolicyCraftRole;
  organization: PolicyCraftOrganizationScope;
};

export class PolicyCraftAccessUnavailableError extends Error {
  constructor() {
    super("PolicyCraft access tables are not installed. Apply the PolicyCraft access migration first.");
    this.name = "PolicyCraftAccessUnavailableError";
  }
}

type OrganizationRequest = {
  organizationId?: number;
  documentId?: string;
  operation: "read" | "write";
};

export type PolicyCraftOrganizationSelector =
  | { provided: false }
  | { provided: true; valid: false }
  | { provided: true; valid: true; organizationId: number };

export function parsePolicyCraftOrganizationSelector(value: string | null | undefined): PolicyCraftOrganizationSelector {
  if (value === null || value === undefined) return { provided: false };
  if (!/^\d+$/.test(value)) return { provided: true, valid: false };
  const organizationId = Number(value);
  return Number.isSafeInteger(organizationId) && organizationId > 0
    ? { provided: true, valid: true, organizationId }
    : { provided: true, valid: false };
}

function isMissingAccessTable(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ER_NO_SUCH_TABLE";
}

function expired(expiryDate: Date | string | null): boolean {
  return expiryDate !== null && new Date(expiryDate).getTime() < Date.now();
}

export async function getPolicyCraftActor(): Promise<PolicyCraftActor | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  const session = await auth.api.getSession({
    headers: { Cookie: cookieHeader },
    query: { disableCookieCache: true },
  });
  const userId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isInteger(userId) || userId <= 0) return null;

  const [users] = await policyCraftPool.execute<ActorRow[]>(
    `SELECT id, name, email, org_id, active, is_deleted
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [userId],
  );
  const user = users[0];
  if (!user || user.is_deleted || !user.active) return null;

  let access: RoleRow | undefined;
  try {
    const [rows] = await policyCraftPool.execute<RoleRow[]>(
      `SELECT role, status FROM policycraft_user_access WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    access = rows[0];
  } catch (error) {
    if (isMissingAccessTable(error)) throw new PolicyCraftAccessUnavailableError();
    throw error;
  }
  if (access) {
    if (access.status !== "active") return null;
    await ensurePolicyCraftOrganizationRegistry();
    return {
      user: { id: String(user.id), name: user.name, email: user.email, ...(user.org_id ? { org_id: user.org_id } : {}) },
      role: access.role,
    };
  }

  const orgId = Number(user.org_id);
  if (!canFallbackToLegacyOrganization(null, user.org_id) || !Number.isInteger(orgId)) return null;
  // Legacy shared users resolve only through the ESG source key. A colliding standalone ID cannot grant access.
  const organizationId = await registerESGOrganization(orgId);
  if (!organizationId) return null;
  return {
    user: { id: String(user.id), name: user.name, email: user.email, org_id: user.org_id },
    role: "user",
    homeOrganizationId: organizationId,
  };
}

/** Authenticated shared-user identity for invitation capabilities that must verify an existing account before it has PolicyCraft access. */
export async function getActivePolicyCraftSessionUserId(): Promise<number | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  const session = await auth.api.getSession({ headers: { Cookie: cookieHeader }, query: { disableCookieCache: true } });
  const userId = Number(session?.user?.id);
  if (!session?.user?.id || !Number.isInteger(userId) || userId <= 0) return null;
  const [users] = await policyCraftPool.execute<(RowDataPacket & { active: number; is_deleted: number })[]>(
    `SELECT active, is_deleted FROM users WHERE id = ? LIMIT 1`, [userId],
  );
  return users[0] && users[0].active && !users[0].is_deleted ? userId : null;
}

export function isPolicyCraftSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !!origin && policyCraftTrustedOrigins.includes(origin);
}

export function policyCraftMutationFailure(
  request: Request,
  contentType: "json" | "multipart" = "json",
): Response | null {
  if (!isPolicyCraftSameOriginRequest(request)) {
    return Response.json({ error: "A trusted same-origin request is required." }, { status: 403 });
  }
  const requestType = request.headers.get("content-type")?.toLocaleLowerCase("en-US") || "";
  const validType = contentType === "json"
    ? requestType.startsWith("application/json")
    : requestType.startsWith("multipart/form-data;");
  return validType ? null : Response.json({ error: "Unsupported request content type." }, { status: 415 });
}

export function policyCraftAuthFailure(error: unknown): Response | null {
  if (error instanceof PolicyCraftOrganizationsMigrationRequiredError) {
    return Response.json({ code: "POLICYCRAFT_ORGANIZATIONS_MIGRATION_REQUIRED", error: error.message }, { status: 503 });
  }
  if (error instanceof PolicyCraftAccessUnavailableError || isMissingAccessTable(error)) {
    return Response.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "PolicyCraft access tables are not installed. Apply the PolicyCraft access migration first." }, { status: 503 });
  }
  return null;
}

export async function getPolicyCraftActorResult(): Promise<{ actor: PolicyCraftActor | null; response?: Response }> {
  try {
    return { actor: await getPolicyCraftActor() };
  } catch (error) {
    const response = policyCraftAuthFailure(error);
    if (response) return { actor: null, response };
    throw error;
  }
}

export async function resolvePolicyCraftOrganization(
  actor: PolicyCraftActor,
  request: OrganizationRequest,
): Promise<PolicyCraftOrganizationScope | null> {
  let organizationId = request.organizationId;
  if (request.documentId) {
    const [documents] = await policyCraftPool.execute<DocumentOrganizationRow[]>(
      `SELECT org_id FROM policycraft_documents WHERE id = ? LIMIT 1`,
      [request.documentId],
    );
    const documentOrgId = documents[0]?.org_id;
    if (!documentOrgId || (organizationId !== undefined && organizationId !== documentOrgId)) return null;
    organizationId = documentOrgId;
  }
  if (organizationId === undefined) organizationId = actor.homeOrganizationId;
  if (typeof organizationId !== "number" || !Number.isInteger(organizationId) || organizationId <= 0) return null;

  const organization = await getPolicyCraftOrganizationRecord(organizationId);
  if (!organization) return null;
  const availability = {
    id: organization.id,
    source: organization.source,
    deleted: organization.source === "esg" && Boolean(organization.is_deleted),
    expired: organization.source === "esg" && expired(organization.expiry_date),
  };

  let hasAssignment = actor.role === "admin";
  if (actor.role === "manager") {
    const [assignments] = await policyCraftPool.execute<RowDataPacket[]>(
      `SELECT manager_user_id FROM policycraft_manager_organizations
        WHERE manager_user_id = ? AND org_id = ? AND active = 1
        LIMIT 1`,
      [Number(actor.user.id), organization.id],
    );
    hasAssignment = assignments.length > 0;
  } else if (actor.role === "user") {
    hasAssignment = organization.source === "esg" && actor.homeOrganizationId === organization.id;
  }

  const allowed = request.operation === "write"
    ? canMutateOrganization(actor, availability, hasAssignment)
    : canAccessOrganization(actor, availability, hasAssignment);
  if (!allowed) return null;
  return {
    ...organizationSummary(organization),
    deleted: availability.deleted,
    expired: availability.expired,
    readOnly: availability.deleted,
    ...(request.documentId ? { documentId: request.documentId } : {}),
  };
}

export async function requirePolicyCraftAdmin(): Promise<PolicyCraftActor | null> {
  const actor = await getPolicyCraftActor();
  return actor?.role === "admin" ? actor : null;
}

export async function getPolicyCraftAdminResult(): Promise<{ actor: PolicyCraftActor | null; response?: Response }> {
  const result = await getPolicyCraftActorResult();
  if (result.response) return result;
  if (!result.actor) return { actor: null, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (result.actor.role !== "admin") return { actor: null, response: Response.json({ error: "Forbidden" }, { status: 403 }) };
  return result;
}

export async function getPolicyCraftAuth(
  request: Partial<OrganizationRequest> = {},
): Promise<PolicyCraftAuthContext | null> {
  const actor = await getPolicyCraftActor();
  if (!actor) return null;
  try {
    const scope = await resolvePolicyCraftOrganization(actor, {
      ...request,
      operation: request.operation || "read",
    });
    return scope ? { user: actor.user, role: actor.role, organization: scope } : null;
  } catch { return null; }
}

export async function getPolicyCraftAuthResult(
  request: Partial<OrganizationRequest> = {},
): Promise<{ auth: PolicyCraftAuthContext | null; response?: Response }> {
  const result = await getPolicyCraftActorResult();
  if (result.response || !result.actor) return { auth: null, response: result.response || Response.json({ error: "Unauthorized" }, { status: 401 }) };
  try {
    const scope = await resolvePolicyCraftOrganization(result.actor, {
      ...request,
      operation: request.operation || "read",
    });
    return scope
      ? { auth: { user: result.actor.user, role: result.actor.role, organization: scope } }
      : { auth: null, response: Response.json({ error: "Organization access denied." }, { status: 403 }) };
  } catch (error) {
    const migration = policyCraftAuthFailure(error);
    if (migration) return { auth: null, response: migration };
    throw error;
  }
}
