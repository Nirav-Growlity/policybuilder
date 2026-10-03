import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { policyCraftPool } from "./db";
import type { PolicyCraftAuthContext } from "./policycraft-auth";
import { coverAssetIdFromReference } from "./cover-composition";
import { alignGeneratedDraftTitle, nextUniqueDraftTitle } from "./policycraft-draft-view";
import { mapCompanyMaster } from "./policycraft-mapping";
import type {
  CompanyMasterSnapshot,
  PolicyCraftDocumentState,
  PolicyCoverPreviewSnapshot,
  PolicyDocumentSummary,
  StoredPolicyDocument,
} from "./policycraft-types";
import type { Policy } from "./types";

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
  archived_at: Date | string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  organization_id?: number;
  organization_code?: string;
  organization_name?: string;
  organization_deleted?: number;
  organization_expiry?: Date | string | null;
  created_by_user_id?: number;
};

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIsoDate(value: Date | string | null): string | null {
  return value === null ? null : isoDate(value);
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
    archivedAt: nullableIsoDate(row.archived_at),
    ...(row.created_by_user_id !== undefined && row.created_by_name !== null && row.created_by_email !== null
      ? { createdBy: { id: String(row.created_by_user_id), name: row.created_by_name || "", email: row.created_by_email || "" } } : {}),
    ...(row.organization_id !== undefined ? { organization: {
      id: row.organization_id,
      code: row.organization_code || "",
      name: row.organization_name || "",
      deleted: Boolean(row.organization_deleted),
      expired: row.organization_expiry !== null && row.organization_expiry !== undefined && new Date(row.organization_expiry).getTime() < Date.now(),
    } } : {}),
  };
}

const documentMetadataSelect = `d.id, d.title, d.policy_type, d.current_step, d.policy_json, d.imported_policy_json,
  d.lock_version, d.created_at, d.updated_at, d.archived_at, d.created_by_user_id,
  creator.name AS created_by_name, creator.email AS created_by_email,
  o.id AS organization_id, o.org_code AS organization_code, o.company_name AS organization_name,
  o.is_deleted AS organization_deleted, o.expiry_date AS organization_expiry`;

function coverAssetUrl(value: string | undefined): string | undefined {
  if (!value || value.startsWith("data:") || value.startsWith("/") || /^https?:\/\//i.test(value)) return value;
  return `/api/policycraft/cover-assets/${encodeURIComponent(value)}`;
}

function coverCompositionPreview(composition: Policy["coverComposition"]): Policy["coverComposition"] {
  if (!composition) return undefined;
  return {
    ...composition,
    background: { ...composition.background, assetId: coverAssetIdFromReference(composition.background.assetId) },
    elements: composition.elements.map((element) => element.type === "text"
      ? element
      : { ...element, ...(element.assetId ? { assetId: coverAssetIdFromReference(element.assetId) } : {}) }),
  };
}

function toCoverPreview(policy: Policy): PolicyCoverPreviewSnapshot {
  return {
    policyType: policy.policyType,
    presentationTemplate: policy.presentationTemplate,
    documentTemplate: policy.documentTemplate,
    documentTheme: policy.documentTheme,
    documentThemeOverrides: policy.documentThemeOverrides,
    templateBrandOverrides: policy.templateBrandOverrides,
    brandColorSource: policy.brandColorSource,
    visualStyle: policy.visualStyle,
    logoPosition: policy.logoPosition,
    typography: policy.typography,
    featureImage: policy.featureImage,
    coverComposition: coverCompositionPreview(policy.coverComposition),
    aiCoverComposition: coverCompositionPreview(policy.aiCoverComposition),
    activeCoverVariant: policy.activeCoverVariant,
    company: {
      name: policy.company.name,
      companyLogo: coverAssetUrl(policy.company.companyLogo),
      logoPalette: policy.company.logoPalette,
      docNum: policy.company.docNum,
      effectiveDate: policy.company.effectiveDate,
      revNum: policy.company.revNum,
      reviewDate: policy.company.reviewDate,
    },
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

export async function listDocuments(orgId: number, archived = false): Promise<PolicyDocumentSummary[]> {
  const archivePredicate = archived ? "IS NOT NULL" : "IS NULL";
  const [orderedIds] = await policyCraftPool.execute<(RowDataPacket & { id: string })[]>(
    `SELECT id
       FROM policycraft_documents
      WHERE org_id = ? AND archived_at ${archivePredicate}
      ORDER BY updated_at DESC, id ASC`,
    [orgId],
  );
  if (orderedIds.length === 0) return [];

  const idPlaceholders = orderedIds.map(() => "?").join(", ");
  const [rows] = await policyCraftPool.execute<DocumentRow[]>(
    `SELECT ${documentMetadataSelect}
       FROM policycraft_documents d
       INNER JOIN organizations o ON o.id = d.org_id
       LEFT JOIN users creator ON creator.id = d.created_by_user_id
      WHERE d.org_id = ? AND d.archived_at ${archivePredicate} AND d.id IN (${idPlaceholders})`,
    [orgId, ...orderedIds.map((row) => row.id)],
  );
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  return orderedIds.flatMap(({ id }) => {
    const row = rowsById.get(id);
    if (!row) return [];
    const policy = parseJson<Policy>(row.policy_json);
    return [{ ...toSummary(row), coverPreview: toCoverPreview(policy) }];
  });
}

export async function getDocument(orgId: number, id: string, includeArchived = false): Promise<StoredPolicyDocument | null> {
  const [rows] = await policyCraftPool.execute<DocumentRow[]>(
    `SELECT ${documentMetadataSelect}
       FROM policycraft_documents d
       INNER JOIN organizations o ON o.id = d.org_id
       LEFT JOIN users creator ON creator.id = d.created_by_user_id
      WHERE d.id = ? AND d.org_id = ? ${includeArchived ? "" : "AND d.archived_at IS NULL"}
      LIMIT 1`,
    [id, orgId],
  );
  return rows[0] ? toDocument(rows[0]) : null;
}

export async function listAllAdminDocuments(filters: { organizationId?: number; creatorId?: number; policyType?: string; archived?: boolean }) {
  const predicates: string[] = [];
  const values: (number | string)[] = [];
  if (filters.organizationId) { predicates.push("d.org_id = ?"); values.push(filters.organizationId); }
  if (filters.creatorId) { predicates.push("d.created_by_user_id = ?"); values.push(filters.creatorId); }
  if (filters.policyType) { predicates.push("d.policy_type = ?"); values.push(filters.policyType); }
  if (filters.archived !== undefined) predicates.push(`d.archived_at IS ${filters.archived ? "NOT " : ""}NULL`);
  const [rows] = await policyCraftPool.execute<DocumentRow[]>(
    `SELECT ${documentMetadataSelect}
       FROM policycraft_documents d
       INNER JOIN organizations o ON o.id = d.org_id
       LEFT JOIN users creator ON creator.id = d.created_by_user_id
       ${predicates.length ? `WHERE ${predicates.join(" AND ")}` : ""}
      ORDER BY d.updated_at DESC, d.id ASC`, values,
  );
  return rows.map(toSummary);
}

export async function listPolicyCraftDocumentCreators(): Promise<Array<{ id: string; name: string; email: string }>> {
  const [rows] = await policyCraftPool.execute<(RowDataPacket & { id: number; name: string; email: string })[]>(
    `SELECT DISTINCT u.id, u.name, u.email
       FROM policycraft_documents d
       INNER JOIN users u ON u.id = d.created_by_user_id
      ORDER BY u.name ASC, u.id ASC`,
  );
  return rows.map((row) => ({ id: String(row.id), name: row.name, email: row.email }));
}

export async function createDocument(
  auth: PolicyCraftAuthContext,
  title: string,
  state: PolicyCraftDocumentState,
): Promise<StoredPolicyDocument> {
  const id = randomUUID();
  const baseTitle = alignGeneratedDraftTitle(title, state.policy.policyType);
  const connection = await policyCraftPool.getConnection();
  try {
    await connection.beginTransaction();
    const [existingTitles] = await connection.execute<(RowDataPacket & { title: string })[]>(
      `SELECT title FROM policycraft_documents WHERE org_id = ? FOR UPDATE`,
      [auth.organization.id],
    );
    const savedTitle = nextUniqueDraftTitle(baseTitle, existingTitles.map((row) => row.title));
    await connection.execute(
      `INSERT INTO policycraft_documents
        (id, org_id, created_by_user_id, updated_by_user_id, title, policy_type,
         current_step, policy_json, imported_policy_json, schema_version, lock_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 1, 1)`,
      [
        id,
        auth.organization.id,
        Number(auth.user.id),
        Number(auth.user.id),
        savedTitle,
        state.policy.policyType,
        state.step,
        JSON.stringify(state.policy),
        state.importedPolicy ? JSON.stringify(state.importedPolicy) : null,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
  let savedTitle = alignGeneratedDraftTitle(title, state.policy.policyType);
  if (savedTitle !== title.trim()) {
    const [existingTitles] = await policyCraftPool.execute<(RowDataPacket & { title: string })[]>(
      `SELECT title FROM policycraft_documents WHERE org_id = ? AND id <> ?`,
      [auth.organization.id, id],
    );
    savedTitle = nextUniqueDraftTitle(savedTitle, existingTitles.map((row) => row.title));
  }
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_documents
        SET title = ?, policy_type = ?, current_step = ?, policy_json = CAST(? AS JSON),
            imported_policy_json = CAST(? AS JSON), updated_by_user_id = ?,
            lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NULL AND lock_version = ?`,
    [
      savedTitle,
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

export async function restoreDocument(orgId: number, userId: number, id: string): Promise<boolean> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_documents
        SET archived_at = NULL, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NOT NULL`,
    [userId, id, orgId],
  );
  return result.affectedRows > 0;
}

export async function deleteArchivedDocument(orgId: number, id: string): Promise<boolean> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `DELETE FROM policycraft_documents
      WHERE id = ? AND org_id = ? AND archived_at IS NOT NULL`,
    [id, orgId],
  );
  return result.affectedRows > 0;
}
