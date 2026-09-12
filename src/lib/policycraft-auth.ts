import { cookies } from "next/headers";
import type { RowDataPacket } from "mysql2";
import { auth } from "./auth";
import { policyCraftPool } from "./db";

type UserOrganizationRow = RowDataPacket & {
  user_id: number;
  org_id: number;
  company_name: string;
  org_code: string;
  is_deleted: number;
  active: number;
  expiry_date: Date | string | null;
  org_is_deleted: number;
};

export type PolicyCraftAuthContext = {
  user: { id: string; name: string; email: string; org_id?: string };
  organization: {
    id: number;
    code: string;
    name: string;
  };
};

export async function getPolicyCraftAuth(): Promise<PolicyCraftAuthContext | null> {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;

  const session = await auth.api.getSession({ headers: { Cookie: cookieHeader } });
  if (!session?.user?.id) return null;

  const userId = Number(session.user.id);
  const orgId = Number((session.user as { org_id?: string }).org_id);
  if (!Number.isInteger(userId) || !Number.isInteger(orgId) || orgId <= 0) return null;

  const [rows] = await policyCraftPool.execute<UserOrganizationRow[]>(
    `SELECT u.id AS user_id, u.org_id, o.company_name, o.org_code,
            u.is_deleted, u.active, o.is_deleted AS org_is_deleted, o.expiry_date
       FROM users u
       INNER JOIN organizations o ON o.id = CAST(u.org_id AS UNSIGNED)
      WHERE u.id = ? AND u.org_id = ?
      LIMIT 1`,
    [userId, orgId],
  );
  const row = rows[0];
  if (!row || row.is_deleted || row.org_is_deleted || !row.active) return null;
  if (row.expiry_date && new Date(row.expiry_date).getTime() < Date.now()) return null;

  return {
    user: {
      id: String(session.user.id),
      name: session.user.name,
      email: session.user.email,
      org_id: String(row.org_id),
    },
    organization: {
      id: row.org_id,
      code: row.org_code,
      name: row.company_name,
    },
  };
}
