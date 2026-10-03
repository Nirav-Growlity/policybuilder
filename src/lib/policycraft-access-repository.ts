import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { policyCraftPool } from "./db";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "./policycraft-access-types";
import { normalizePolicyCraftEmail } from "./policycraft-access-policy";
import { createPolicyCraftInvitationToken, hashPolicyCraftInvitationToken } from "./policycraft-invitation-tokens";
import { acceptPolicyCraftInvitation, type InvitationAcceptancePort, type InvitationAcceptanceTransaction, type PolicyCraftInvitation } from "./policycraft-invitation-workflow";

const INVITATION_MS = 72 * 60 * 60 * 1000;

type OrganizationRow = RowDataPacket & {
  id: number; org_code: string; company_name: string; is_deleted: number; expiry_date: Date | string | null;
};
type ManagerRow = RowDataPacket & {
  id: number; name: string; email: string; status: "active" | "disabled";
  policy_count: number; org_id: number | null; org_code: string | null; company_name: string | null;
  org_is_deleted: number | null; expiry_date: Date | string | null;
};
type InvitationRow = RowDataPacket & {
  id: string; email: string; name: string; organization_ids_json: unknown; existing_user_id: number | null;
  expires_at: Date | string; delivery_status: "pending" | "sent" | "failed"; accepted_at: Date | string | null;
  cancelled_at: Date | string | null; invited_by_user_id: number;
};

export type ExistingAccount = { id: number; name: string; email: string; active: number; isDeleted: number };
export type InvitationDraft = { name: string; email: string; organizationIds: number[]; linkExisting?: boolean };
export type InvitationSummary = {
  id: string; email: string; name: string; organizationIds: number[]; status: "pending" | "delivery_failed";
  expiresAt: string; existingAccount: boolean;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isExpired(value: Date | string | null): boolean {
  return value !== null && new Date(value).getTime() < Date.now();
}

function parseOrganizationIds(value: unknown): number[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  return Array.isArray(parsed) ? parsed.map(Number).filter((id) => Number.isInteger(id) && id > 0) : [];
}

export async function listPolicyCraftOrganizations(): Promise<PolicyCraftOrganization[]> {
  const [rows] = await policyCraftPool.execute<OrganizationRow[]>(
    `SELECT id, org_code, company_name, is_deleted, expiry_date
       FROM organizations ORDER BY company_name ASC, id ASC`,
  );
  return rows.map((row) => ({
    id: row.id, code: row.org_code, name: row.company_name,
    deleted: Boolean(row.is_deleted), expired: isExpired(row.expiry_date),
  }));
}

export async function listPolicyCraftManagers(): Promise<{ managers: PolicyCraftManagerSummary[]; invitations: InvitationSummary[]; organizations: PolicyCraftOrganization[] }> {
  const [rows] = await policyCraftPool.execute<ManagerRow[]>(
    `SELECT u.id, u.name, u.email, a.status,
            COUNT(DISTINCT d.id) AS policy_count,
            o.id AS org_id, o.org_code, o.company_name, o.is_deleted AS org_is_deleted, o.expiry_date
       FROM policycraft_user_access a
       INNER JOIN users u ON u.id = a.user_id
       LEFT JOIN policycraft_manager_organizations m ON m.manager_user_id = u.id AND m.active = 1
       LEFT JOIN organizations o ON o.id = m.org_id
       LEFT JOIN policycraft_documents d ON d.created_by_user_id = u.id
      WHERE a.role = 'manager' AND u.is_deleted = 0
      GROUP BY u.id, u.name, u.email, a.status, o.id, o.org_code, o.company_name, o.is_deleted, o.expiry_date
      ORDER BY u.name ASC, u.id ASC`,
  );
  const grouped = new Map<string, PolicyCraftManagerSummary>();
  for (const row of rows) {
    const id = String(row.id);
    const manager = grouped.get(id) || {
      id, name: row.name, email: row.email, status: row.status,
      organizations: [], policyCount: Number(row.policy_count || 0),
    };
    if (row.org_id !== null && row.org_code !== null && row.company_name !== null) {
      manager.organizations.push({
        id: row.org_id, code: row.org_code, name: row.company_name,
        deleted: Boolean(row.org_is_deleted), expired: isExpired(row.expiry_date),
      });
    }
    grouped.set(id, manager);
  }
  const [pendingRows] = await policyCraftPool.execute<InvitationRow[]>(
    `SELECT id, email, name, organization_ids_json, existing_user_id, expires_at,
            delivery_status, accepted_at, cancelled_at, invited_by_user_id
       FROM policycraft_manager_invitations
      WHERE accepted_at IS NULL AND cancelled_at IS NULL
      ORDER BY created_at DESC`,
  );
  const invitations: InvitationSummary[] = pendingRows.map((row) => ({
    id: row.id, email: row.email, name: row.name, organizationIds: parseOrganizationIds(row.organization_ids_json),
    status: row.delivery_status === "failed" ? "delivery_failed" : "pending", expiresAt: iso(row.expires_at),
    existingAccount: row.existing_user_id !== null,
  }));
  const organizations = await listPolicyCraftOrganizations();
  return { managers: [...grouped.values(), ...invitations.map((item) => ({
    id: `pending:${item.id}`, name: item.name, email: item.email, status: item.status,
    organizations: organizations.filter((org) => item.organizationIds.includes(org.id)), policyCount: 0,
    invitationId: item.id, expiresAt: item.expiresAt,
  }))], invitations, organizations };
}

export async function findSharedAccountByEmail(email: string): Promise<ExistingAccount | null> {
  const [rows] = await policyCraftPool.execute<(RowDataPacket & { id: number; name: string; email: string; active: number; is_deleted: number })[]>(
    `SELECT id, name, email, active, is_deleted FROM users WHERE LOWER(email) = ? ORDER BY id ASC LIMIT 2`,
    [normalizePolicyCraftEmail(email)],
  );
  if (rows.length > 1) throw new Error("Multiple shared accounts match this email; resolve the duplicate before linking.");
  const row = rows[0];
  return row ? { id: row.id, name: row.name, email: row.email, active: row.active, isDeleted: row.is_deleted } : null;
}

async function validateOrganizations(connection: { execute: typeof policyCraftPool.execute }, ids: number[], allowEmpty = false): Promise<number[]> {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) {
    if (allowEmpty) return [];
    throw new Error("Assign at least one organization.");
  }
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const [rows] = await connection.execute<OrganizationRow[]>(
    `SELECT id, org_code, company_name, is_deleted, expiry_date
       FROM organizations WHERE id IN (${placeholders})`, uniqueIds,
  );
  const valid = new Set(rows.filter((row) => !row.is_deleted).map((row) => row.id));
  if (valid.size !== uniqueIds.length) throw new Error("One or more organizations are unavailable.");
  return uniqueIds;
}

export async function createPolicyCraftManagerInvitation(
  draft: InvitationDraft,
  invitedByUserId: number,
  deliver: (email: string, name: string, url: string) => Promise<void>,
): Promise<{ invitation: InvitationSummary; existingAccount: ExistingAccount | null; sent: boolean }> {
  const email = normalizePolicyCraftEmail(draft.email);
  const organizations = await validateOrganizations(policyCraftPool, draft.organizationIds);
  const existingAccount = await findSharedAccountByEmail(email);
  if (existingAccount && draft.linkExisting !== true) return { invitation: { id: "", email, name: draft.name, organizationIds: organizations, status: "pending", expiresAt: "", existingAccount: true }, existingAccount, sent: false };
  if (!existingAccount && draft.linkExisting === true) throw new Error("No existing account matches this email.");
  if (existingAccount) {
    if (!existingAccount.active || existingAccount.isDeleted) throw new Error("The existing account is disabled and cannot be linked.");
    const [accessRows] = await policyCraftPool.execute<RowDataPacket[]>(
      `SELECT user_id FROM policycraft_user_access WHERE user_id = ? LIMIT 1`, [existingAccount.id],
    );
    if (accessRows.length) throw new Error("This account already has PolicyCraft access.");
  }
  const pair = createPolicyCraftInvitationToken();
  const now = Date.now();
  const id = randomUUID();
  const expiresAt = new Date(now + INVITATION_MS);
  const connection = await policyCraftPool.getConnection();
  try {
    await connection.beginTransaction();
    const normalizedOrganizations = await validateOrganizations(connection, organizations);
    await connection.execute(
      `INSERT INTO policycraft_manager_invitations
        (id, email, name, organization_ids_json, token_hash, existing_user_id, invited_by_user_id, expires_at, delivery_status)
       VALUES (?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE id = VALUES(id), name = VALUES(name), organization_ids_json = VALUES(organization_ids_json),
         token_hash = VALUES(token_hash), existing_user_id = VALUES(existing_user_id), invited_by_user_id = VALUES(invited_by_user_id),
         expires_at = VALUES(expires_at), accepted_at = NULL, cancelled_at = NULL, delivery_status = 'pending', updated_at = CURRENT_TIMESTAMP(3)`,
      [id, email, draft.name.trim().slice(0, 255), JSON.stringify(normalizedOrganizations), pair.tokenHash, existingAccount?.id ?? null, invitedByUserId, expiresAt],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  let sent = false;
  try {
    await deliver(email, draft.name, invitationUrl(pair.token));
    sent = true;
  } catch (error) {
    console.error("PolicyCraft manager invitation delivery failed", error);
  }
  await policyCraftPool.execute(
    `UPDATE policycraft_manager_invitations SET delivery_status = ?, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND token_hash = ? AND accepted_at IS NULL AND cancelled_at IS NULL`,
    [sent ? "sent" : "failed", id, pair.tokenHash],
  );
  return {
    invitation: { id, email, name: draft.name.trim().slice(0, 255), organizationIds: organizations, status: sent ? "pending" : "delivery_failed", expiresAt: expiresAt.toISOString(), existingAccount: existingAccount !== null },
    existingAccount,
    sent,
  };
}

async function readInvitationSummary(id: string): Promise<InvitationSummary | null> {
  const [rows] = await policyCraftPool.execute<InvitationRow[]>(
    `SELECT id, email, name, organization_ids_json, existing_user_id, expires_at, delivery_status, accepted_at, cancelled_at, invited_by_user_id
       FROM policycraft_manager_invitations WHERE id = ? LIMIT 1`, [id],
  );
  const row = rows[0];
  if (!row || row.accepted_at || row.cancelled_at) return null;
  return {
    id: row.id, email: row.email, name: row.name, organizationIds: parseOrganizationIds(row.organization_ids_json),
    status: row.delivery_status === "failed" ? "delivery_failed" : "pending", expiresAt: iso(row.expires_at),
    existingAccount: row.existing_user_id !== null,
  };
}

export async function updatePolicyCraftManagerInvitation(
  id: string,
  action: "edit" | "resend" | "cancel",
  invitedByUserId: number,
  deliver: (email: string, name: string, url: string) => Promise<void>,
  draft?: InvitationDraft,
): Promise<{ invitation: InvitationSummary | null; sent: boolean; existingAccount?: ExistingAccount | null }> {
  const current = await readInvitationSummary(id);
  if (!current) throw new Error("Invitation not found or no longer active.");
  if (action === "cancel") {
    const [result] = await policyCraftPool.execute<ResultSetHeader>(
      `UPDATE policycraft_manager_invitations SET cancelled_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ? AND accepted_at IS NULL AND cancelled_at IS NULL`, [id],
    );
    if (!result.affectedRows) throw new Error("Invitation was accepted or cancelled while this request was being processed.");
    return { invitation: null, sent: false };
  }

  const email = normalizePolicyCraftEmail(draft?.email || current.email);
  const name = (draft?.name || current.name).trim().slice(0, 255);
  const organizationIds = draft ? await validateOrganizations(policyCraftPool, draft.organizationIds, true) : current.organizationIds;
  const foundAccount = await findSharedAccountByEmail(email);
  let existingUserId: number | null = current.existingAccount ? await findSharedAccountIdByEmail(current.email) : null;
  if (action === "edit" && (draft?.linkExisting === true || email !== current.email)) {
    if (foundAccount && draft?.linkExisting !== true) return { invitation: current, sent: false, existingAccount: foundAccount };
    if (!foundAccount && draft?.linkExisting === true) throw new Error("No existing account matches this email.");
    if (foundAccount && (!foundAccount.active || foundAccount.isDeleted)) throw new Error("The existing account is disabled and cannot be linked.");
    existingUserId = foundAccount?.id ?? null;
  }
  const pair = createPolicyCraftInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_MS);
  const [updateResult] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_manager_invitations
        SET email = ?, name = ?, organization_ids_json = CAST(? AS JSON), token_hash = ?, existing_user_id = ?,
            invited_by_user_id = ?, expires_at = ?, delivery_status = 'pending', updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND accepted_at IS NULL AND cancelled_at IS NULL`,
    [email, name, JSON.stringify(organizationIds), pair.tokenHash, existingUserId, invitedByUserId, expiresAt, id],
  );
  if (!updateResult.affectedRows) throw new Error("Invitation was accepted or cancelled while this request was being processed.");
  let sent = false;
  try {
    await deliver(email, name, invitationUrl(pair.token));
    sent = true;
  } catch (error) {
    console.error("PolicyCraft manager invitation delivery failed", error);
  }
  await policyCraftPool.execute(
    `UPDATE policycraft_manager_invitations SET delivery_status = ?, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND token_hash = ? AND accepted_at IS NULL AND cancelled_at IS NULL`,
    [sent ? "sent" : "failed", id, pair.tokenHash],
  );
  return { invitation: await readInvitationSummary(id), sent, existingAccount: null };
}

async function findSharedAccountIdByEmail(email: string): Promise<number | null> {
  const [rows] = await policyCraftPool.execute<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1`, [normalizePolicyCraftEmail(email)],
  );
  return rows[0]?.id || null;
}

export async function updatePolicyCraftManager(
  managerUserId: number,
  updatedByUserId: number,
  changes: { organizationIds?: number[]; active?: boolean },
): Promise<boolean> {
  const connection = await policyCraftPool.getConnection();
  try {
    await connection.beginTransaction();
    const [managers] = await connection.execute<RowDataPacket[]>(
      `SELECT user_id FROM policycraft_user_access WHERE user_id = ? AND role = 'manager' FOR UPDATE`, [managerUserId],
    );
    if (!managers.length) {
      await connection.rollback();
      return false;
    }
    if (changes.active !== undefined) {
      await connection.execute(
        `UPDATE policycraft_user_access SET status = ?, updated_at = CURRENT_TIMESTAMP(3)
          WHERE user_id = ? AND role = 'manager'`, [changes.active ? "active" : "disabled", managerUserId],
      );
      // Keep assignments while disabled so re-enabling does not silently erase access configuration.
    }
    if (changes.organizationIds) {
      const organizationIds = await validateOrganizations(connection, changes.organizationIds, true);
      await connection.execute(`UPDATE policycraft_manager_organizations SET active = 0 WHERE manager_user_id = ?`, [managerUserId]);
      for (const orgId of organizationIds) {
        await connection.execute(
          `INSERT INTO policycraft_manager_organizations (manager_user_id, org_id, assigned_by_user_id, active)
           VALUES (?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE assigned_by_user_id = VALUES(assigned_by_user_id), active = 1, updated_at = CURRENT_TIMESTAMP(3)`,
          [managerUserId, orgId, updatedByUserId],
        );
      }
    }
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function invitationUrl(token: string): string {
  const baseUrl = process.env.POLICYCRAFT_APP_URL?.trim();
  if (!baseUrl) throw new Error("POLICYCRAFT_APP_URL is required to send manager invitations.");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("POLICYCRAFT_APP_URL must use HTTPS outside local development.");
  }
  return new URL(`/accept-invitation?token=${encodeURIComponent(token)}`, url).toString();
}

export async function getPolicyCraftInvitation(token: string): Promise<PolicyCraftInvitation | null> {
  const [rows] = await policyCraftPool.execute<InvitationRow[]>(
    `SELECT id, email, name, organization_ids_json, existing_user_id, invited_by_user_id,
            expires_at, accepted_at, cancelled_at
       FROM policycraft_manager_invitations WHERE token_hash = ? LIMIT 1`,
    [hashPolicyCraftInvitationToken(token)],
  );
  const row = rows[0];
  return row ? {
    id: row.id, email: row.email, name: row.name, organizationIds: parseOrganizationIds(row.organization_ids_json),
    existingUserId: row.existing_user_id, invitedByUserId: row.invited_by_user_id,
    expiresAt: new Date(row.expires_at), acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
  } : null;
}

export function createPolicyCraftInvitationAcceptancePort(): InvitationAcceptancePort {
  return {
    async withTransaction(run) {
      const connection = await policyCraftPool.getConnection();
      try {
        await connection.beginTransaction();
        const transaction: InvitationAcceptanceTransaction = {
          async findInvitationByTokenHash(tokenHash: string) {
            const [rows] = await connection.execute<InvitationRow[]>(
              `SELECT id, email, name, organization_ids_json, existing_user_id, invited_by_user_id,
                      expires_at, accepted_at, cancelled_at
                 FROM policycraft_manager_invitations WHERE token_hash = ? LIMIT 1 FOR UPDATE`, [tokenHash],
            );
            const row = rows[0];
            return row ? {
              id: row.id, email: row.email, name: row.name, organizationIds: parseOrganizationIds(row.organization_ids_json),
              existingUserId: row.existing_user_id, invitedByUserId: row.invited_by_user_id,
              expiresAt: new Date(row.expires_at), acceptedAt: row.accepted_at ? new Date(row.accepted_at) : null,
              cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
            } : null;
          },
          async findSharedUserByEmail(email: string) {
            const [rows] = await connection.execute<(RowDataPacket & { id: number })[]>(
              `SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1 FOR UPDATE`, [normalizePolicyCraftEmail(email)],
            );
            return rows[0] ? { id: rows[0].id } : null;
          },
          async isEligibleInviter(userId: number) {
            const [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT a.user_id FROM policycraft_user_access a
                INNER JOIN users u ON u.id = a.user_id
               WHERE a.user_id = ? AND a.role = 'admin' AND a.status = 'active'
                 AND u.active = 1 AND u.is_deleted = 0 LIMIT 1 FOR UPDATE`, [userId],
            );
            return rows.length > 0;
          },
          async isEligibleExistingUser(userId: number, expectedEmail: string) {
            const [rows] = await connection.execute<RowDataPacket[]>(
              `SELECT id FROM users WHERE id = ? AND LOWER(email) = ? AND active = 1 AND is_deleted = 0 LIMIT 1 FOR UPDATE`, [userId, expectedEmail],
            );
            return rows.length > 0;
          },
          async validateOrganizations(organizationIds: number[]) {
            if (!organizationIds.length) return true;
            const uniqueIds = [...new Set(organizationIds)];
            const [rows] = await connection.execute<OrganizationRow[]>(
              `SELECT id, org_code, company_name, is_deleted, expiry_date
                 FROM organizations WHERE id IN (${uniqueIds.map(() => "?").join(", ")}) FOR UPDATE`, uniqueIds,
            );
            return rows.length === uniqueIds.length && rows.every((row) => !row.is_deleted);
          },
          async createSharedUser(name: string, email: string) {
            const [result] = await connection.execute<ResultSetHeader>(
              `INSERT INTO users (name, email, role, designation, mobile, active, org_id, org_code, password, is_super_admin, site_ids)
               VALUES (?, ?, 'user', 'PolicyCraft Manager', '', 1, '', '', NULL, 0, NULL)`, [name, email],
            );
            if (!result.insertId) throw new Error("Manager account could not be created.");
            return Number(result.insertId);
          },
          async setCredentialPassword(userId: number, passwordHash: string) {
            await connection.execute(`UPDATE users SET password = ? WHERE id = ?`, [passwordHash, userId]);
            await connection.execute(
              `INSERT INTO account (id, accountId, providerId, password, userId, createdAt, updatedAt)
               VALUES (?, ?, 'credential', ?, ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
              [randomUUID(), String(userId), passwordHash, String(userId)],
            );
          },
          async activateManager(userId: number, organizationIds: number[], invitedByUserId: number) {
            const [existing] = await connection.execute<RowDataPacket[]>(
              `SELECT role FROM policycraft_user_access WHERE user_id = ? LIMIT 1 FOR UPDATE`, [userId],
            );
            if (existing.length && existing[0].role === "admin") throw new Error("An administrator account cannot be linked as a manager.");
            await connection.execute(
              `INSERT INTO policycraft_user_access (user_id, role, status, created_by_user_id)
               VALUES (?, 'manager', 'active', ?)
               ON DUPLICATE KEY UPDATE role = 'manager', status = 'active', created_by_user_id = VALUES(created_by_user_id), updated_at = CURRENT_TIMESTAMP(3)`,
              [userId, invitedByUserId],
            );
            await connection.execute(`UPDATE policycraft_manager_organizations SET active = 0 WHERE manager_user_id = ?`, [userId]);
            for (const orgId of organizationIds) {
              await connection.execute(
                `INSERT INTO policycraft_manager_organizations (manager_user_id, org_id, assigned_by_user_id, active)
                 VALUES (?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE assigned_by_user_id = VALUES(assigned_by_user_id), active = 1, updated_at = CURRENT_TIMESTAMP(3)`,
                [userId, orgId, invitedByUserId],
              );
            }
          },
          async consumeInvitation(invitationId: string, acceptedAt: Date) {
            const [result] = await connection.execute<ResultSetHeader>(
              `UPDATE policycraft_manager_invitations SET accepted_at = ?, updated_at = CURRENT_TIMESTAMP(3)
                WHERE id = ? AND accepted_at IS NULL AND cancelled_at IS NULL AND expires_at > ?`,
              [acceptedAt, invitationId, acceptedAt],
            );
            if (!result.affectedRows) throw new Error("This invitation is no longer available.");
          },
        };
        const result = await run(transaction);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        if (error && typeof error === "object" && "code" in error && error.code === "ER_DUP_ENTRY") {
          throw Object.assign(new Error("An account already uses this email address."), { code: "ER_DUP_ENTRY" });
        }
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}

export async function acceptManagerInvitation(token: string, password: string | undefined, currentUserId: number | undefined, hashPassword: (value: string) => Promise<string>) {
  return acceptPolicyCraftInvitation(createPolicyCraftInvitationAcceptancePort(), {
    tokenHash: hashPolicyCraftInvitationToken(token), password, currentUserId, hashPassword,
  });
}
