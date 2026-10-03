import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { policyCraftPool } from "./db";
import type {
  PolicyCraftAdminTransferPort,
  PolicyCraftAdminTransferTransaction,
  PolicyCraftTransferUser,
} from "./policycraft-admin-transfer";
import { normalizeTransferEmail } from "./policycraft-admin-transfer";

type TransferUserRow = RowDataPacket & {
  id: number;
  name: string;
  email: string;
  active: number;
  is_deleted: number;
  access_role: "admin" | "manager" | null;
  access_status: "active" | "disabled" | null;
  credential_hash: string | null;
};

function mapTransferUser(row: TransferUserRow): PolicyCraftTransferUser {
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

const transferUserSelect = `SELECT u.id, u.name, u.email, u.active, u.is_deleted,
       access.role AS access_role, access.status AS access_status,
       credential.password AS credential_hash
  FROM users u
  LEFT JOIN policycraft_user_access access ON access.user_id = u.id
  LEFT JOIN account credential ON credential.userId = CAST(u.id AS CHAR) AND credential.providerId = 'credential'`;

/** Transaction boundary for admin handover. Tests use the workflow port directly and never acquire a DB connection. */
export const policyCraftAdminTransferRepository: PolicyCraftAdminTransferPort = {
  async withTransaction<T>(work: (transaction: PolicyCraftAdminTransferTransaction) => Promise<T>): Promise<T> {
    const connection = await policyCraftPool.getConnection();
    try {
      await connection.beginTransaction();
      const transaction: PolicyCraftAdminTransferTransaction = {
        async hasPendingInvitationForUpdate(email) {
          const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT id FROM policycraft_manager_invitations
              WHERE email = ? AND accepted_at IS NULL AND cancelled_at IS NULL
              ORDER BY id ASC LIMIT 1 FOR UPDATE`,
            [normalizeTransferEmail(email)],
          );
          return rows.length > 0;
        },
        async lockAllAccessGrants() {
          // Every active admin is present here, so transfers serialize even when their target accounts differ.
          await connection.execute<RowDataPacket[]>(
            `SELECT user_id FROM policycraft_user_access ORDER BY user_id ASC FOR UPDATE`,
          );
        },
        async findUserForUpdate(userId) {
          const [rows] = await connection.execute<TransferUserRow[]>(
            `${transferUserSelect} WHERE u.id = ? ORDER BY credential.createdAt DESC LIMIT 1 FOR UPDATE`,
            [userId],
          );
          return rows[0] ? mapTransferUser(rows[0]) : null;
        },
        async findUserByEmailForUpdate(email) {
          const [rows] = await connection.execute<TransferUserRow[]>(
            `${transferUserSelect} WHERE LOWER(u.email) = ? ORDER BY u.id ASC, credential.createdAt DESC LIMIT 2 FOR UPDATE`,
            [normalizeTransferEmail(email)],
          );
          // Ambiguous case-insensitive matches are never silently resolved to an arbitrary shared account.
          return rows.length === 1 ? mapTransferUser(rows[0]) : null;
        },
        async promoteToAdmin(userId, createdByUserId) {
          await connection.execute(
            `INSERT INTO policycraft_user_access (user_id, role, status, created_by_user_id)
             VALUES (?, 'admin', 'active', ?)
             ON DUPLICATE KEY UPDATE role = 'admin', status = 'active', created_by_user_id = VALUES(created_by_user_id),
               updated_at = CURRENT_TIMESTAMP(3)`,
            [userId, createdByUserId],
          );
        },
        async disableAdmin(userId) {
          const [result] = await connection.execute<ResultSetHeader>(
            `UPDATE policycraft_user_access SET status = 'disabled', updated_at = CURRENT_TIMESTAMP(3)
              WHERE user_id = ? AND role = 'admin' AND status = 'active'`,
            [userId],
          );
          if (!result.affectedRows) throw new Error("Administrator authority changed during transfer.");
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
