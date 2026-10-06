import type { RowDataPacket } from "mysql2";
import { policyCraftPool } from "./db";
import type {
  PolicyCraftAdminAddPort,
  PolicyCraftAdminAddTransaction,
  PolicyCraftAdminAddUser,
} from "./policycraft-admin-add";
import { normalizeAdminAddEmail } from "./policycraft-admin-add";
import { policyCraftAdminAddUserSelect } from "./policycraft-admin-add-sql";
export { policyCraftAdminAddUserSelect };

type AdminAddUserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  active: number;
  is_deleted: number;
  access_role: "admin" | "manager" | null;
  access_status: "active" | "disabled" | null;
  credential_hash: string | null;
};

function mapAdminAddUser(row: AdminAddUserRow): PolicyCraftAdminAddUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    active: Boolean(row.active),
    deleted: Boolean(row.is_deleted),
    accessRole: row.access_role,
    accessStatus: row.access_status,
    credentialHash: row.credential_hash,
  };
}

/** Transaction boundary for adding an admin. Workflow tests use the port directly and never acquire a DB connection. */
export const policyCraftAdminAddRepository: PolicyCraftAdminAddPort = {
  async withTransaction<T>(work: (transaction: PolicyCraftAdminAddTransaction) => Promise<T>): Promise<T> {
    const connection = await policyCraftPool.getConnection();
    try {
      await connection.beginTransaction();
      const transaction: PolicyCraftAdminAddTransaction = {
        async hasPendingInvitationForUpdate(email) {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM policycraft_manager_invitations
              WHERE email = ? AND accepted_at IS NULL AND cancelled_at IS NULL
              ORDER BY id ASC LIMIT 1 FOR UPDATE`,
            [normalizeAdminAddEmail(email)],
          );
          return rows.length > 0;
        },
        async lockAllAccessGrants() {
          // All adds lock grants in the same order, serializing authorization checks and duplicate grants.
          await connection.execute<RowDataPacket[]>(
            `SELECT user_id FROM policycraft_user_access ORDER BY user_id ASC FOR UPDATE`,
          );
        },
        async findUserForUpdate(userId) {
          const [rows] = await connection.execute<AdminAddUserRow[]>(
            `${policyCraftAdminAddUserSelect} WHERE u.id = ? ORDER BY credential.createdAt DESC LIMIT 1 FOR UPDATE`,
            [userId],
          );
          return rows[0] ? mapAdminAddUser(rows[0]) : null;
        },
        async findUserByEmailForUpdate(email) {
          const [rows] = await connection.execute<AdminAddUserRow[]>(
            `${policyCraftAdminAddUserSelect} WHERE LOWER(u.email) = ? ORDER BY u.id ASC, credential.createdAt DESC LIMIT 2 FOR UPDATE`,
            [normalizeAdminAddEmail(email)],
          );
          // Ambiguous case-insensitive matches are never silently resolved to an arbitrary shared account.
          return rows.length === 1 ? mapAdminAddUser(rows[0]) : null;
        },
        async addAdmin(userId, createdByUserId) {
          await connection.execute(
            `INSERT INTO policycraft_user_access (user_id, role, status, created_by_user_id)
             VALUES (?, 'admin', 'active', ?)
             ON DUPLICATE KEY UPDATE role = 'admin', status = 'active', created_by_user_id = VALUES(created_by_user_id),
               updated_at = CURRENT_TIMESTAMP(3)`,
            [userId, createdByUserId],
          );
        },
      };
      const result = await work(transaction);
      await connection.commit();
      return result;
    } catch (error) {
      try { await connection.rollback(); } catch { /* Preserve the original failure. */ }
      throw error;
    } finally {
      connection.release();
    }
  },
};
