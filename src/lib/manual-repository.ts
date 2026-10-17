import { randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import { policyCraftPool } from "./db";
import type { PolicyCraftAuthContext } from "./policycraft-auth";
import { nextUniqueDraftTitle } from "./policycraft-draft-view";
import { policyCraftOrganizationLookupSql } from "./policycraft-organization-repository";

/** Long multi-part documents in the Documents area. Handbooks reuse the same storage later. */
export type ManualKind = "sop" | "handbook";

export type ManualSummary = {
  id: string;
  kind: ManualKind;
  title: string;
  currentStage: string;
  lockVersion: number;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  pageCount: number | null;
  /** Number of enabled parts (SOPs for an SOP manual). */
  partCount: number;
  templateId: string | null;
  createdBy?: { id: string; name: string; email: string };
  organization?: { id: number; code: string; name: string };
};

export type StoredManual<Manual = unknown, Imported = unknown> = ManualSummary & {
  manual: Manual;
  importedContext: Imported | null;
};

type SummaryRow = RowDataPacket & {
  id: string;
  kind: ManualKind;
  title: string;
  current_stage: string;
  lock_version: number;
  created_at: Date | string;
  updated_at: Date | string;
  archived_at: Date | string | null;
  page_count: number | null;
  part_count: number | null;
  template_id: string | null;
  created_by_user_id: number;
  created_by_name: string | null;
  created_by_email: string | null;
  organization_id: number;
  organization_code: string | null;
  organization_name: string | null;
};

type ManualRow = SummaryRow & { manual_json: unknown; imported_context_json: unknown };

const isoDate = (value: Date | string) => (value instanceof Date ? value : new Date(value)).toISOString();
const parseJson = <T>(value: unknown): T => (typeof value === "string" ? JSON.parse(value) as T : value as T);

// Counts and theme come from JSON paths so list queries never load whole manuals.
const summarySelect = `m.id, m.kind, m.title, m.current_stage, m.lock_version, m.created_at, m.updated_at,
  m.archived_at, m.page_count, m.created_by_user_id,
  JSON_LENGTH(m.manual_json, '$.sops') AS part_count,
  JSON_UNQUOTE(JSON_EXTRACT(m.manual_json, '$.theme')) AS template_id,
  creator.name AS created_by_name, creator.email AS created_by_email,
  o.id AS organization_id, o.org_code AS organization_code, o.company_name AS organization_name`;

const fromManuals = `FROM policycraft_manuals m
  INNER JOIN (${policyCraftOrganizationLookupSql}) o ON o.id = m.org_id
  LEFT JOIN users creator ON creator.id = m.created_by_user_id`;

function toSummary(row: SummaryRow): ManualSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    currentStage: row.current_stage,
    lockVersion: row.lock_version,
    createdAt: isoDate(row.created_at),
    updatedAt: isoDate(row.updated_at),
    archivedAt: row.archived_at === null ? null : isoDate(row.archived_at),
    pageCount: row.page_count,
    partCount: row.part_count ?? 0,
    templateId: row.template_id && row.template_id !== "null" ? row.template_id : null,
    ...(row.created_by_name !== null && row.created_by_email !== null
      ? { createdBy: { id: String(row.created_by_user_id), name: row.created_by_name, email: row.created_by_email } }
      : {}),
    organization: { id: row.organization_id, code: row.organization_code || "", name: row.organization_name || "" },
  };
}

export async function listManuals(orgId: number, options: { archived?: boolean; kind?: ManualKind } = {}): Promise<ManualSummary[]> {
  const predicates = ["m.org_id = ?", `m.archived_at IS ${options.archived ? "NOT " : ""}NULL`];
  const values: (number | string)[] = [orgId];
  if (options.kind) { predicates.push("m.kind = ?"); values.push(options.kind); }
  const [rows] = await policyCraftPool.execute<SummaryRow[]>(
    `SELECT ${summarySelect} ${fromManuals}
      WHERE ${predicates.join(" AND ")}
      ORDER BY m.updated_at DESC, m.id ASC`,
    values,
  );
  return rows.map(toSummary);
}

export async function getManual<Manual, Imported = unknown>(
  orgId: number,
  id: string,
  includeArchived = false,
): Promise<StoredManual<Manual, Imported> | null> {
  const [rows] = await policyCraftPool.execute<ManualRow[]>(
    `SELECT ${summarySelect}, m.manual_json, m.imported_context_json ${fromManuals}
      WHERE m.id = ? AND m.org_id = ? ${includeArchived ? "" : "AND m.archived_at IS NULL"}
      LIMIT 1`,
    [id, orgId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...toSummary(row),
    manual: parseJson<Manual>(row.manual_json),
    importedContext: row.imported_context_json ? parseJson<Imported>(row.imported_context_json) : null,
  };
}

export async function createManual<Manual, Imported = unknown>(
  auth: PolicyCraftAuthContext,
  input: { kind: ManualKind; title: string; stage: string; manual: Manual; importedContext?: Imported | null },
): Promise<StoredManual<Manual, Imported>> {
  const id = randomUUID();
  const connection = await policyCraftPool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute<(RowDataPacket & { title: string })[]>(
      `SELECT title FROM policycraft_manuals WHERE org_id = ? FOR UPDATE`,
      [auth.organization.id],
    );
    const title = nextUniqueDraftTitle(input.title.trim() || "Untitled manual", existing.map((row) => row.title));
    await connection.execute(
      `INSERT INTO policycraft_manuals
        (id, org_id, kind, created_by_user_id, updated_by_user_id, title, current_stage,
         manual_json, imported_context_json, schema_version, lock_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 1, 1)`,
      [
        id, auth.organization.id, input.kind, Number(auth.user.id), Number(auth.user.id), title, input.stage,
        JSON.stringify(input.manual), input.importedContext ? JSON.stringify(input.importedContext) : null,
      ],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const created = await getManual<Manual, Imported>(auth.organization.id, id);
  if (!created) throw new Error("Created manual could not be loaded");
  return created;
}

export type ManualUpdate<Manual, Imported> = {
  title: string;
  stage: string;
  manual: Manual;
  /** Leave undefined to keep the stored import; null clears it. */
  importedContext?: Imported | null;
};

export async function updateManual<Manual, Imported = unknown>(
  auth: PolicyCraftAuthContext,
  id: string,
  update: ManualUpdate<Manual, Imported>,
  lockVersion: number,
): Promise<"updated" | "conflict" | "not_found"> {
  const keepImport = update.importedContext === undefined;
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_manuals
        SET title = ?, current_stage = ?, manual_json = CAST(? AS JSON),
            imported_context_json = ${keepImport ? "imported_context_json" : "CAST(? AS JSON)"},
            updated_by_user_id = ?, lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NULL AND lock_version = ?`,
    [
      update.title.trim() || "Untitled manual",
      update.stage,
      JSON.stringify(update.manual),
      ...(keepImport ? [] : [update.importedContext ? JSON.stringify(update.importedContext) : null]),
      Number(auth.user.id),
      id,
      auth.organization.id,
      lockVersion,
    ],
  );
  if (result.affectedRows > 0) return "updated";
  return (await getManual(auth.organization.id, id)) ? "conflict" : "not_found";
}

/** Records the page count of the latest full render; never bumps lock_version. */
export async function recordManualPageCount(orgId: number, id: string, pageCount: number) {
  await policyCraftPool.execute(
    `UPDATE policycraft_manuals SET page_count = ?, updated_at = updated_at WHERE id = ? AND org_id = ?`,
    [pageCount, id, orgId],
  );
}

export async function archiveManual(orgId: number, userId: number, id: string): Promise<boolean> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_manuals
        SET archived_at = CURRENT_TIMESTAMP(3), updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NULL`,
    [userId, id, orgId],
  );
  return result.affectedRows > 0;
}

export async function restoreManual(orgId: number, userId: number, id: string): Promise<boolean> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `UPDATE policycraft_manuals
        SET archived_at = NULL, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP(3)
      WHERE id = ? AND org_id = ? AND archived_at IS NOT NULL`,
    [userId, id, orgId],
  );
  return result.affectedRows > 0;
}

export async function deleteArchivedManual(orgId: number, id: string): Promise<boolean> {
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `DELETE FROM policycraft_manuals WHERE id = ? AND org_id = ? AND archived_at IS NOT NULL`,
    [id, orgId],
  );
  return result.affectedRows > 0;
}
