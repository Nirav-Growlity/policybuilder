import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { policyCraftPool } from "./db";
import type { PolicyCraftAuthContext } from "./policycraft-auth";
import { mapCompanyMaster } from "./policycraft-mapping";
import type {
  CompanyMasterSnapshot,
  PolicyCraftDocumentState,
  PolicyDocumentSummary,
  StoredPolicyDocument,
} from "./policycraft-types";

type OrganizationRow = RowDataPacket & {
  id: number;
  org_code: string;
  company_name: string;
  address: string;
  country: string;
  city: string;
  website: string;
  sector: string | null;
  sub_sector: string | null;
};

type SiteRow = RowDataPacket & {
  id: number;
  site_code: string;
  name: string;
  address: string;
  type: string;
};

type DocumentRow = RowDataPacket & {
  id: string;
  title: string;
  policy_type: PolicyDocumentSummary["policyType"];
  current_step: PolicyDocumentSummary["currentStep"];
  policy_json: unknown;
  imported_policy_json: unknown;
  lock_version: number;
  created_at: Date | string;
  updated_at: Date | string;
};

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : (value as T);
}

function toSummary(row: DocumentRow): PolicyDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    policyType: row.policy_type,
    currentStep: row.current_step,
    lockVersion: row.lock_version,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
  };
}

function toDocument(row: DocumentRow): StoredPolicyDocument {
  return {
    ...toSummary(row),
    state: {
      step: row.current_step,
      policy: parseJson<PolicyCraftDocumentState["policy"]>(row.policy_json),
      importedPolicy: row.imported_policy_json ? parseJson<PolicyCraftDocumentState["importedPolicy"]>(row.imported_policy_json) : null,
    },
  };
}

export async function getCompanyMaster(auth: PolicyCraftAuthContext): Promise<CompanyMasterSnapshot> {
  const [organizations] = await policyCraftPool.execute<OrganizationRow[]>(
    `SELECT id, org_code, company_name, address, country, city, website, sector, sub_sector
       FROM organizations
      WHERE id = ? AND is_deleted = 0
      LIMIT 1`,
    [auth.organization.id],
  );
  const organization = organizations[0];
  if (!organization) throw new Error("Organization not found");

  const [sites] = await policyCraftPool.execute<SiteRow[]>(
    `SELECT id, site_code, name, address, type
       FROM sites
      WHERE org_id = ? AND is_deleted = 0
      ORDER BY id ASC`,
    [String(auth.organization.id)],
  );

  return mapCompanyMaster(organization, sites);
}

export async function listDocuments(orgId: number): Promise<PolicyDocumentSummary[]> {
  const [rows] = await policyCraftPool.execute<DocumentRow[]>(
    `SELECT id, title, policy_type, current_step, policy_json, imported_policy_json,
            lock_version, created_at, updated_at
       FROM policycraft_documents
      WHERE org_id = ? AND archived_at IS NULL
      ORDER BY updated_at DESC`,
    [orgId],
  );
  return rows.map(toSummary);
}

export async function getDocument(orgId: number, id: string): Promise<StoredPolicyDocument | null> {
  const [rows] = await policyCraftPool.execute<DocumentRow[]>(
    `SELECT id, title, policy_type, current_step, policy_json, imported_policy_json,
            lock_version, created_at, updated_at
       FROM policycraft_documents
      WHERE id = ? AND org_id = ? AND archived_at IS NULL
      LIMIT 1`,
    [id, orgId],
  );
  return rows[0] ? toDocument(rows[0]) : null;
}

export async function createDocument(
  auth: PolicyCraftAuthContext,
  title: string,
  state: PolicyCraftDocumentState,
): Promise<StoredPolicyDocument> {
  const id = randomUUID();
  await policyCraftPool.execute(
    `INSERT INTO policycraft_documents
      (id, org_id, created_by_user_id, updated_by_user_id, title, policy_type,
       current_step, policy_json, imported_policy_json, schema_version, lock_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 1, 1)`,
    [
      id,
      auth.organization.id,
      Number(auth.user.id),
      Number(auth.user.id),
      title,
      state.policy.policyType,
      state.step,
      JSON.stringify(state.policy),
      state.importedPolicy ? JSON.stringify(state.importedPolicy) : null,
    ],
  );
  const document = await getDocument(auth.organization.id, id);
  if (!document) throw new Error("Created document could not be loaded");
  return document;
}

export async function updateDocument(
  auth: PolicyCraftAuthContext,
  id: string,
  title: string,
  state: PolicyCraftDocumentState,
  lockVersion: number,
): Promise<"updated" | "conflict" | "not_found"> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_documents
        SET title = ?, policy_type = ?, current_step = ?, policy_json = CAST(? AS JSON),
            imported_policy_json = CAST(? AS JSON), updated_by_user_id = ?,
            lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NULL AND lock_version = ?`,
    [
      title,
      state.policy.policyType,
      state.step,
      JSON.stringify(state.policy),
      state.importedPolicy ? JSON.stringify(state.importedPolicy) : null,
      Number(auth.user.id),
      id,
      auth.organization.id,
      lockVersion,
    ],
  );
  if (result.affectedRows > 0) return "updated";
  const existing = await getDocument(auth.organization.id, id);
  return existing ? "conflict" : "not_found";
}

export async function renameDocument(
  orgId: number,
  id: string,
  title: string,
  lockVersion: number,
): Promise<"updated" | "conflict" | "not_found"> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_documents
        SET title = ?, lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NULL AND lock_version = ?`,
    [title, id, orgId, lockVersion],
  );
  if (result.affectedRows > 0) return "updated";
  const existing = await getDocument(orgId, id);
  return existing ? "conflict" : "not_found";
}

export async function archiveDocument(orgId: number, userId: number, id: string): Promise<boolean> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_documents
        SET archived_at = CURRENT_TIMESTAMP(3), updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NULL`,
    [userId, id, orgId],
  );
  return result.affectedRows > 0;
}
