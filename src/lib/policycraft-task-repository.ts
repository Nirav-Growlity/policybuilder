import { randomUUID } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { policyCraftPool } from "./db";
import type { PolicyCraftActor, PolicyCraftAuthContext } from "./policycraft-auth";
import { parsePolicyCraftTaskDeadline, policyCraftTaskUnavailableReason } from "./policycraft-task-rules";
import type {
  PolicyCraftManagerWork,
  PolicyCraftTask,
  PolicyCraftTaskEvent,
  PolicyCraftTaskManager,
  PolicyCraftTaskProgress,
  PolicyCraftTaskProgressSection,
} from "./policycraft-task-types";
import type { PolicyCraftDocumentState } from "./policycraft-types";
import { alignGeneratedDraftTitle, nextUniqueDraftTitle } from "./policycraft-draft-view";
import { applyCompanyMaster } from "./policycraft-mapping";
import { getCompanyMasterFromRegistry, policyCraftOrganizationLookupSql } from "./policycraft-organization-repository";
import { initialPolicy } from "./initial-policy";
import { calculatePolicyProgress } from "./policycraft-progress";
import type { PolicyType } from "./types";

export class PolicyCraftTaskError extends Error {
  constructor(readonly code: "not_found" | "forbidden" | "conflict" | "invalid" | "migration_required", message: string) {
    super(message);
    this.name = "PolicyCraftTaskError";
  }
}

type TaskRow = RowDataPacket & {
  id: string; org_id: number; assigned_manager_user_id: number; title: string; instructions: string;
  policy_type: PolicyType; due_at: Date | string; status: PolicyCraftTask["status"]; lock_version: number;
  document_id: string | null; started_at: Date | string | null; completed_at: Date | string | null;
  created_at: Date | string; updated_at: Date | string;
  organization_code: string; organization_name: string; organization_source: "esg" | "standalone"; organization_deleted: number; organization_expiry: Date | string | null;
  manager_name: string; manager_email: string; manager_active: number; manager_deleted: number;
  manager_access_status: "active" | "disabled" | null; manager_org_active: number | null;
  document_archived: Date | string | null;
  current_document_version: number | null;
  progress_percentage: number | null; progress_filled_sections: number | null; progress_total_sections: number | null;
  progress_sections_json: unknown; progress_saved_at: Date | string | null; progress_document_version: number | null;
};

type TaskManagerRow = RowDataPacket & { id: number; name: string; email: string };
type EventRow = RowDataPacket & { id: number; task_id: string; event_type: string; actor_user_id: number; actor_name: string; actor_role: "admin" | "manager"; details_json: unknown; created_at: Date | string };
type WorkRow = RowDataPacket & {
  org_id: number; document_id: string; manager_user_id: number; snapshot_title: string | null; snapshot_policy_type: PolicyType | null;
  current_title: string; current_policy_type: PolicyType;
  organization_code: string; organization_name: string; organization_source: "esg" | "standalone"; organization_deleted: number; organization_expiry: Date | string | null;
  manager_name: string; manager_email: string; manager_active: number; manager_deleted: number;
  manager_access_status: "active" | "disabled" | null; manager_org_active: number | null;
  percentage: number | null; filled_sections: number | null; total_sections: number | null;
  sections_json: unknown; saved_at: Date | string | null; document_version: number | null; document_archived: Date | string | null;
  current_document_version: number | null;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function nullableIso(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

function localDueDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

function jsonValue<T>(value: unknown): T {
  return typeof value === "string" ? JSON.parse(value) as T : value as T;
}

function policyCraftProgress(row: Pick<TaskRow,
  "progress_percentage" | "progress_filled_sections" | "progress_total_sections" | "progress_sections_json" | "progress_saved_at" | "progress_document_version"
>): PolicyCraftTaskProgress | null {
  if (row.progress_percentage === null || row.progress_saved_at === null || row.progress_document_version === null) return null;
  return {
    percentage: Number(row.progress_percentage),
    filledSections: Number(row.progress_filled_sections || 0),
    totalSections: Number(row.progress_total_sections || 0),
    sections: jsonValue<PolicyCraftTaskProgressSection[]>(row.progress_sections_json || []),
    savedAt: iso(row.progress_saved_at),
    documentVersion: Number(row.progress_document_version),
  };
}

function unavailable(row: Pick<TaskRow,
  "status" | "document_id" | "current_document_version" | "organization_deleted" | "organization_expiry" | "manager_active" | "manager_deleted" | "manager_access_status" | "manager_org_active" | "document_archived"
>): string | null {
  const organizationExpired = row.organization_expiry !== null && new Date(row.organization_expiry).getTime() < Date.now();
  return policyCraftTaskUnavailableReason({
    organizationDeleted: Boolean(row.organization_deleted),
    organizationExpired,
    managerActive: Boolean(row.manager_active && !row.manager_deleted && row.manager_access_status === "active"),
    organizationAssigned: Boolean(row.manager_org_active),
  }) || (row.document_archived !== null ? "The linked draft is archived." : null)
    || (row.document_id !== null && row.current_document_version === null ? "The linked draft is unavailable." : null);
}

function toTask(row: TaskRow): PolicyCraftTask {
  const progress = policyCraftProgress(row);
  return {
    id: row.id,
    title: row.title,
    instructions: row.instructions,
    policyType: row.policy_type,
    organization: {
      id: row.org_id,
      code: row.organization_code,
      name: row.organization_name,
      source: row.organization_source || "esg",
      deleted: Boolean(row.organization_deleted),
      expired: row.organization_expiry !== null && new Date(row.organization_expiry).getTime() < Date.now(),
    },
    manager: { id: String(row.assigned_manager_user_id), name: row.manager_name, email: row.manager_email },
    dueDate: localDueDate(row.due_at),
    status: row.status,
    version: Number(row.lock_version),
    documentId: row.document_id,
    documentVersion: row.current_document_version === null ? null : Number(row.current_document_version),
    progress,
    available: unavailable(row) === null,
    unavailableReason: unavailable(row),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    startedAt: nullableIso(row.started_at),
    completedAt: nullableIso(row.completed_at),
  };
}

const taskSelect = `t.id, t.org_id, t.assigned_manager_user_id, t.title, t.instructions, t.policy_type,
  t.due_at, t.status, t.lock_version, t.document_id, t.started_at, t.completed_at, t.created_at, t.updated_at,
  o.org_code AS organization_code, o.company_name AS organization_name, o.source AS organization_source,
  o.is_deleted AS organization_deleted, o.expiry_date AS organization_expiry,
  u.name AS manager_name, u.email AS manager_email, u.active AS manager_active, u.is_deleted AS manager_deleted,
  a.status AS manager_access_status, mo.active AS manager_org_active, d.archived_at AS document_archived,
  p.percentage AS progress_percentage, p.filled_sections AS progress_filled_sections,
  p.total_sections AS progress_total_sections, p.sections_json AS progress_sections_json,
  p.saved_at AS progress_saved_at, p.document_version AS progress_document_version, d.lock_version AS current_document_version`;

const taskJoins = `FROM policycraft_tasks t
  INNER JOIN (${policyCraftOrganizationLookupSql}) o ON o.id = t.org_id
  INNER JOIN users u ON u.id = t.assigned_manager_user_id
  LEFT JOIN policycraft_user_access a ON a.user_id = t.assigned_manager_user_id AND a.role = 'manager'
  LEFT JOIN policycraft_manager_organizations mo ON mo.manager_user_id = t.assigned_manager_user_id AND mo.org_id = t.org_id
  LEFT JOIN policycraft_documents d ON d.id = t.document_id AND d.org_id = t.org_id
  LEFT JOIN policycraft_manager_progress p ON p.org_id = t.org_id AND p.document_id = t.document_id AND p.manager_user_id = t.assigned_manager_user_id`;

function taskFilters(organizationId?: number, managerId?: number, documentId?: string) {
  const where: string[] = [];
  const values: (number | string)[] = [];
  if (organizationId !== undefined) { where.push("t.org_id = ?"); values.push(organizationId); }
  if (managerId !== undefined) { where.push("t.assigned_manager_user_id = ?"); values.push(managerId); }
  if (documentId !== undefined) { where.push("t.document_id = ?"); values.push(documentId); }
  if (managerId !== undefined) {
    where.push("mo.active = 1", "o.is_deleted = 0", "(o.expiry_date IS NULL OR o.expiry_date >= CURRENT_TIMESTAMP(3))");
  }
  return { sql: where.length ? `WHERE ${where.join(" AND ")}` : "", values };
}

export async function listPolicyCraftTasks(filters: { organizationId?: number; managerId?: number; documentId?: string } = {}): Promise<PolicyCraftTask[]> {
  const filter = taskFilters(filters.organizationId, filters.managerId, filters.documentId);
  const [rows] = await policyCraftPool.execute<TaskRow[]>(
    `SELECT ${taskSelect} ${taskJoins} ${filter.sql} ORDER BY t.due_at ASC, t.created_at DESC, t.id ASC`, filter.values,
  );
  return rows.map(toTask);
}

export async function listPolicyCraftTaskManagers(organizationId?: number): Promise<PolicyCraftTaskManager[]> {
  const [rows] = await policyCraftPool.execute<TaskManagerRow[]>(
    `SELECT DISTINCT u.id, u.name, u.email
       FROM policycraft_user_access a
       INNER JOIN users u ON u.id = a.user_id
       INNER JOIN policycraft_manager_organizations mo ON mo.manager_user_id = u.id AND mo.active = 1
       INNER JOIN (${policyCraftOrganizationLookupSql}) o ON o.id = mo.org_id
      WHERE a.role = 'manager' AND a.status = 'active' AND u.active = 1 AND u.is_deleted = 0
        AND o.is_deleted = 0 AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_TIMESTAMP(3))
        ${organizationId === undefined ? "" : "AND o.id = ?"}
      ORDER BY u.name ASC, u.id ASC`, organizationId === undefined ? [] : [organizationId],
  );
  return rows.map((row) => ({ id: String(row.id), name: row.name, email: row.email }));
}

function progressFromWorkRow(row: WorkRow): PolicyCraftTaskProgress | null {
  if (row.percentage === null || row.saved_at === null || row.document_version === null) return null;
  return {
    percentage: Number(row.percentage),
    filledSections: Number(row.filled_sections || 0),
    totalSections: Number(row.total_sections || 0),
    sections: jsonValue<PolicyCraftTaskProgressSection[]>(row.sections_json || []),
    savedAt: iso(row.saved_at),
    documentVersion: Number(row.document_version),
  };
}

function toWork(row: WorkRow): PolicyCraftManagerWork {
  const unavailableReason = policyCraftTaskUnavailableReason({
    organizationDeleted: Boolean(row.organization_deleted),
    organizationExpired: row.organization_expiry !== null && new Date(row.organization_expiry).getTime() < Date.now(),
    managerActive: Boolean(row.manager_active && !row.manager_deleted && row.manager_access_status === "active"),
    organizationAssigned: Boolean(row.manager_org_active),
  }) || (row.document_archived !== null ? "The linked draft is archived." : null);
  return {
    documentId: row.document_id,
    title: row.snapshot_title || row.current_title,
    policyType: row.snapshot_policy_type || row.current_policy_type,
    organization: {
      id: row.org_id, code: row.organization_code, name: row.organization_name,
      source: row.organization_source || "esg",
      deleted: Boolean(row.organization_deleted),
      expired: row.organization_expiry !== null && new Date(row.organization_expiry).getTime() < Date.now(),
    },
    manager: { id: String(row.manager_user_id), name: row.manager_name, email: row.manager_email },
    progress: progressFromWorkRow(row),
    available: unavailableReason === null,
    unavailableReason,
  };
}

export async function listPolicyCraftManagerWork(organizationId?: number): Promise<PolicyCraftManagerWork[]> {
  const orgFilter = organizationId === undefined ? "" : "AND x.org_id = ?";
  const values = organizationId === undefined ? [] : [organizationId];
  const [rows] = await policyCraftPool.execute<WorkRow[]>(
    `SELECT x.org_id, x.document_id, x.manager_user_id, p.title AS snapshot_title, p.policy_type AS snapshot_policy_type,
            d.title AS current_title, d.policy_type AS current_policy_type,
            o.org_code AS organization_code, o.company_name AS organization_name, o.source AS organization_source,
            o.is_deleted AS organization_deleted, o.expiry_date AS organization_expiry,
            u.name AS manager_name, u.email AS manager_email, u.active AS manager_active, u.is_deleted AS manager_deleted,
            a.status AS manager_access_status, mo.active AS manager_org_active, d.archived_at AS document_archived,
            p.percentage, p.filled_sections, p.total_sections, p.sections_json, p.saved_at, p.document_version
       FROM (
         SELECT p.org_id, p.document_id, p.manager_user_id
           FROM policycraft_manager_progress p
         UNION
         SELECT d.org_id, d.id AS document_id, d.created_by_user_id AS manager_user_id
           FROM policycraft_documents d
           INNER JOIN policycraft_user_access creator_access ON creator_access.user_id = d.created_by_user_id AND creator_access.role = 'manager'
          WHERE d.archived_at IS NULL
         UNION
         SELECT d.org_id, d.id AS document_id, d.updated_by_user_id AS manager_user_id
           FROM policycraft_documents d
           INNER JOIN policycraft_user_access updater_access ON updater_access.user_id = d.updated_by_user_id AND updater_access.role = 'manager'
          WHERE d.archived_at IS NULL
       ) x
       INNER JOIN policycraft_documents d ON d.id = x.document_id AND d.org_id = x.org_id AND d.archived_at IS NULL
       INNER JOIN (${policyCraftOrganizationLookupSql}) o ON o.id = x.org_id
       INNER JOIN users u ON u.id = x.manager_user_id
       LEFT JOIN policycraft_user_access a ON a.user_id = x.manager_user_id AND a.role = 'manager'
       LEFT JOIN policycraft_manager_organizations mo ON mo.manager_user_id = x.manager_user_id AND mo.org_id = x.org_id
       LEFT JOIN policycraft_manager_progress p ON p.org_id = x.org_id AND p.document_id = x.document_id AND p.manager_user_id = x.manager_user_id
      WHERE 1 = 1 ${orgFilter}
      ORDER BY o.company_name ASC, COALESCE(p.title, d.title) ASC, u.name ASC, x.document_id ASC`, values,
  );
  return rows.map(toWork);
}

export async function getPolicyCraftTask(taskId: string, organizationId?: number, managerId?: number): Promise<PolicyCraftTask | null> {
  const [rows] = await policyCraftPool.execute<TaskRow[]>(
    `SELECT ${taskSelect} ${taskJoins} WHERE t.id = ?
      ${organizationId === undefined ? "" : "AND t.org_id = ?"}
      ${managerId === undefined ? "" : "AND t.assigned_manager_user_id = ? AND mo.active = 1 AND o.is_deleted = 0 AND (o.expiry_date IS NULL OR o.expiry_date >= CURRENT_TIMESTAMP(3))"} LIMIT 1`,
    [taskId, ...(organizationId === undefined ? [] : [organizationId]), ...(managerId === undefined ? [] : [managerId])],
  );
  return rows[0] ? toTask(rows[0]) : null;
}

export async function listPolicyCraftTaskEvents(taskId: string): Promise<PolicyCraftTaskEvent[]> {
  const [rows] = await policyCraftPool.execute<EventRow[]>(
    `SELECT e.id, e.task_id, e.event_type, e.actor_user_id, e.actor_role, e.details_json, e.created_at, u.name AS actor_name
       FROM policycraft_task_events e
       INNER JOIN users u ON u.id = e.actor_user_id
      WHERE e.task_id = ? ORDER BY e.id ASC`, [taskId],
  );
  return rows.map((row) => ({
    id: String(row.id), taskId: row.task_id, eventType: row.event_type,
    actor: { id: String(row.actor_user_id), name: row.actor_name, role: row.actor_role },
    details: row.details_json ? jsonValue<Record<string, unknown>>(row.details_json) : {}, createdAt: iso(row.created_at),
  }));
}

function isTaskTablesMissing(error: unknown, expectedTable?: string): boolean {
  if (!error || typeof error !== "object" || !("code" in error) || (error as { code?: unknown }).code !== "ER_NO_SUCH_TABLE") return false;
  const message = "sqlMessage" in error ? String((error as { sqlMessage?: unknown }).sqlMessage || "") : "";
  const fallback = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  const names = expectedTable ? [expectedTable] : ["policycraft_tasks", "policycraft_task_events", "policycraft_manager_progress"];
  return names.some((table) => new RegExp(`\\b${table}\\b`, "i").test(`${message} ${fallback}`));
}

export function isMissingPolicyCraftTaskTablesError(error: unknown): boolean {
  return isTaskTablesMissing(error);
}

export async function arePolicyCraftTaskTablesInstalled(connection: Pick<PoolConnection, "execute"> = policyCraftPool): Promise<boolean> {
  const [rows] = await connection.execute<(RowDataPacket & { table_count: number })[]>(
    `SELECT COUNT(*) AS table_count FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('policycraft_tasks', 'policycraft_task_events', 'policycraft_manager_progress')`,
  );
  return Number(rows[0]?.table_count) === 3;
}

function missingTaskMigration(error: unknown): never {
  if (isTaskTablesMissing(error)) throw new PolicyCraftTaskError("migration_required", "Apply the PolicyCraft tasks migration before using task assignments.");
  throw error;
}

async function recordTaskEvent(connection: PoolConnection, taskId: string, orgId: number, actor: PolicyCraftActor, type: string, details: Record<string, unknown> = {}) {
  await connection.execute(
    `INSERT INTO policycraft_task_events (task_id, org_id, actor_user_id, actor_role, event_type, details_json)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [taskId, orgId, Number(actor.user.id), actor.role, type, JSON.stringify(details)],
  );
}

async function validateAssignment(connection: PoolConnection, organizationId: number, managerId: number, lock = true): Promise<void> {
  const lockClause = lock ? "FOR UPDATE" : "";
  const [rows] = await connection.execute<(RowDataPacket & {
    organization_deleted: number; organization_expiry: Date | string | null;
    manager_active: number; manager_deleted: number; access_status: string | null; assignment_active: number | null;
  })[]>(
    `SELECT o.is_deleted AS organization_deleted, o.expiry_date AS organization_expiry,
            u.active AS manager_active, u.is_deleted AS manager_deleted, a.status AS access_status, mo.active AS assignment_active
       FROM (${policyCraftOrganizationLookupSql}) o
       INNER JOIN users u ON u.id = ?
       LEFT JOIN policycraft_user_access a ON a.user_id = u.id AND a.role = 'manager'
       LEFT JOIN policycraft_manager_organizations mo ON mo.manager_user_id = u.id AND mo.org_id = o.id
      WHERE o.id = ? ${lockClause}`,
    [managerId, organizationId],
  );
  const row = rows[0];
  if (!row || row.organization_deleted || (row.organization_expiry !== null && new Date(row.organization_expiry).getTime() < Date.now())) {
    throw new PolicyCraftTaskError("invalid", "Choose an available organization.");
  }
  if (!row.manager_active || row.manager_deleted || row.access_status !== "active" || !row.assignment_active) {
    throw new PolicyCraftTaskError("invalid", "Choose an active manager assigned to this organization.");
  }
}

async function validateOrganization(connection: PoolConnection, organizationId: number): Promise<void> {
  const [rows] = await connection.execute<(RowDataPacket & { is_deleted: number; expiry_date: Date | string | null })[]>(
    `SELECT o.is_deleted, o.expiry_date FROM (${policyCraftOrganizationLookupSql}) o WHERE o.id = ? LIMIT 1 FOR UPDATE`, [organizationId],
  );
  const organization = rows[0];
  if (!organization || organization.is_deleted || (organization.expiry_date !== null && new Date(organization.expiry_date).getTime() < Date.now())) {
    throw new PolicyCraftTaskError("invalid", "Choose an available organization.");
  }
}

async function validateAdminActor(connection: PoolConnection, admin: PolicyCraftActor): Promise<void> {
  if (admin.role !== "admin") throw new PolicyCraftTaskError("forbidden", "Administrator access is required.");
  const [rows] = await connection.execute<(RowDataPacket & { active: number; is_deleted: number; access_status: string | null })[]>(
    `SELECT u.active, u.is_deleted, a.status AS access_status
       FROM users u LEFT JOIN policycraft_user_access a ON a.user_id = u.id AND a.role = 'admin'
      WHERE u.id = ? LIMIT 1 FOR UPDATE`, [Number(admin.user.id)],
  );
  const row = rows[0];
  if (!row || !row.active || row.is_deleted || row.access_status !== "active") {
    throw new PolicyCraftTaskError("forbidden", "Administrator access is no longer active.");
  }
}

export async function createPolicyCraftTask(input: {
  organizationId: number; managerId: number; title: string; instructions: string; policyType: PolicyType; dueDate: unknown;
}, admin: PolicyCraftActor): Promise<PolicyCraftTask> {
  const deadline = parsePolicyCraftTaskDeadline(input.dueDate);
  if (!deadline) throw new PolicyCraftTaskError("invalid", "dueDate must be a valid calendar date.");
  const id = randomUUID();
  const connection = await policyCraftPool.getConnection();
  try {
    await connection.beginTransaction();
    await validateAdminActor(connection, admin);
    await validateAssignment(connection, input.organizationId, input.managerId);
    await connection.execute(
      `INSERT INTO policycraft_tasks
        (id, org_id, assigned_manager_user_id, created_by_admin_user_id, title, instructions, policy_type, due_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned')`,
      [id, input.organizationId, input.managerId, Number(admin.user.id), input.title.trim().slice(0, 255), input.instructions.trim().slice(0, 5000), input.policyType, deadline],
    );
    await recordTaskEvent(connection, id, input.organizationId, admin, "created", {
      managerId: String(input.managerId), dueDate: deadline.toISOString(), policyType: input.policyType,
    });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (isTaskTablesMissing(error)) missingTaskMigration(error);
    throw error;
  } finally {
    connection.release();
  }
  const task = await getPolicyCraftTask(id);
  if (!task) throw new Error("Created PolicyCraft task could not be loaded.");
  return task;
}

export async function updatePolicyCraftTask(input: {
  taskId: string; version: number; action: "edit" | "reassign" | "cancel" | "reopen";
  admin: PolicyCraftActor; managerId?: number; organizationId?: number; title?: string; instructions?: string; policyType?: PolicyType; dueDate?: unknown;
}): Promise<PolicyCraftTask> {
  const connection = await policyCraftPool.getConnection();
  try {
    await connection.beginTransaction();
    await validateAdminActor(connection, input.admin);
    const [rows] = await connection.execute<(RowDataPacket & {
      id: string; org_id: number; assigned_manager_user_id: number; title: string; instructions: string;
      policy_type: PolicyType; due_at: Date | string; status: PolicyCraftTask["status"]; document_id: string | null; lock_version: number;
    })[]>(`SELECT id, org_id, assigned_manager_user_id, title, instructions, policy_type, due_at, status, document_id, lock_version
           FROM policycraft_tasks WHERE id = ? LIMIT 1 FOR UPDATE`, [input.taskId]);
    const task = rows[0];
    if (!task) throw new PolicyCraftTaskError("not_found", "Task not found.");
    if (task.lock_version !== input.version) throw new PolicyCraftTaskError("conflict", "This task changed in another session. Refresh before saving.");
    if (input.action === "reopen" && task.status !== "completed" && task.status !== "cancelled") {
      throw new PolicyCraftTaskError("conflict", "Only completed or cancelled tasks can be reopened.");
    }
    if (input.action === "reopen") await validateAssignment(connection, task.org_id, task.assigned_manager_user_id);
    if (input.action === "reopen" && task.document_id) {
      const [documents] = await connection.execute<RowDataPacket[]>(
        `SELECT id FROM policycraft_documents WHERE id = ? AND org_id = ? AND archived_at IS NULL LIMIT 1 FOR UPDATE`,
        [task.document_id, task.org_id],
      );
      if (!documents.length) throw new PolicyCraftTaskError("conflict", "The linked task draft is missing or archived and cannot be reopened.");
    }
    if (input.action === "cancel" && task.status === "cancelled") throw new PolicyCraftTaskError("conflict", "This task is already cancelled.");
    if (input.action === "reassign") {
      if (!Number.isInteger(input.managerId) || !input.managerId) throw new PolicyCraftTaskError("invalid", "Choose an eligible manager.");
      await validateAssignment(connection, task.org_id, input.managerId);
      await connection.execute(
        `UPDATE policycraft_tasks SET assigned_manager_user_id = ?, lock_version = lock_version + 1,
            updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND lock_version = ?`,
        [input.managerId, task.id, input.version],
      );
      await recordTaskEvent(connection, task.id, task.org_id, input.admin, "reassigned", {
        fromManagerId: String(task.assigned_manager_user_id), toManagerId: String(input.managerId),
      });
    } else if (input.action === "cancel") {
      await connection.execute(
        `UPDATE policycraft_tasks SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP(3),
            lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND lock_version = ?`,
        [task.id, input.version],
      );
      await recordTaskEvent(connection, task.id, task.org_id, input.admin, "cancelled");
    } else if (input.action === "reopen") {
      await connection.execute(
        `UPDATE policycraft_tasks SET status = IF(document_id IS NULL, 'assigned', 'in_progress'), completed_at = NULL, cancelled_at = NULL,
            lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND lock_version = ?`,
        [task.id, input.version],
      );
      await recordTaskEvent(connection, task.id, task.org_id, input.admin, "reopened", { documentId: task.document_id });
    } else {
      const organizationId = input.organizationId === undefined ? task.org_id : input.organizationId;
      const managerId = input.managerId === undefined ? task.assigned_manager_user_id : input.managerId;
      if (!Number.isInteger(organizationId) || organizationId <= 0) throw new PolicyCraftTaskError("invalid", "Choose a valid organization.");
      if (!Number.isInteger(managerId) || managerId <= 0) throw new PolicyCraftTaskError("invalid", "Choose an eligible manager.");
      await validateOrganization(connection, organizationId);
      if (task.document_id && (organizationId !== task.org_id || managerId !== task.assigned_manager_user_id)) {
        throw new PolicyCraftTaskError("conflict", "Organization and manager are fixed after the task draft is created. Use Reassign to change the manager.");
      }
      if (organizationId !== task.org_id || managerId !== task.assigned_manager_user_id) {
        await validateAssignment(connection, organizationId, managerId);
      }
      const title = input.title === undefined ? task.title : input.title.trim();
      const instructions = input.instructions === undefined ? task.instructions : input.instructions.trim();
      if (!title || title.length > 255 || instructions.length > 5000) throw new PolicyCraftTaskError("invalid", "Task title and instructions are invalid.");
      if (task.document_id && input.policyType && input.policyType !== task.policy_type) {
        throw new PolicyCraftTaskError("conflict", "Policy type is fixed after the task draft is created.");
      }
      const policyType = input.policyType || task.policy_type;
      const deadline = input.dueDate === undefined ? new Date(task.due_at) : parsePolicyCraftTaskDeadline(input.dueDate);
      if (!deadline) throw new PolicyCraftTaskError("invalid", "dueDate must be a valid calendar date.");
      await connection.execute(
        `UPDATE policycraft_tasks SET org_id = ?, assigned_manager_user_id = ?, title = ?, instructions = ?, policy_type = ?, due_at = ?, lock_version = lock_version + 1,
            updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND lock_version = ?`,
        [organizationId, managerId, title.slice(0, 255), instructions.slice(0, 5000), policyType, deadline, task.id, input.version],
      );
      const details = {
        dueDate: deadline.toISOString(), policyType,
        fromOrganizationId: task.org_id, toOrganizationId: organizationId,
        fromManagerId: String(task.assigned_manager_user_id), toManagerId: String(managerId),
      };
      await recordTaskEvent(connection, task.id, organizationId, input.admin, "edited", details);
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (isTaskTablesMissing(error)) missingTaskMigration(error);
    throw error;
  } finally {
    connection.release();
  }
  const updated = await getPolicyCraftTask(input.taskId);
  if (!updated) throw new Error("Updated PolicyCraft task could not be loaded.");
  return updated;
}

async function validateManagerTask(connection: PoolConnection, taskId: string, managerId: number) {
  const [rows] = await connection.execute<(RowDataPacket & {
    id: string; org_id: number; assigned_manager_user_id: number; policy_type: PolicyType; title: string;
    status: PolicyCraftTask["status"]; document_id: string | null; linked_document_id: string | null; lock_version: number;
    organization_deleted: number; organization_expiry: Date | string | null; manager_active: number; manager_deleted: number;
    manager_access_status: string | null; manager_org_active: number | null; document_archived: Date | string | null;
  })[]>(
    `SELECT t.id, t.org_id, t.assigned_manager_user_id, t.policy_type, t.title, t.status, t.document_id, d.id AS linked_document_id, t.lock_version,
            o.is_deleted AS organization_deleted, o.expiry_date AS organization_expiry,
            u.active AS manager_active, u.is_deleted AS manager_deleted, a.status AS manager_access_status,
            mo.active AS manager_org_active, d.archived_at AS document_archived
       FROM policycraft_tasks t
       INNER JOIN (${policyCraftOrganizationLookupSql}) o ON o.id = t.org_id
       INNER JOIN users u ON u.id = t.assigned_manager_user_id
       LEFT JOIN policycraft_user_access a ON a.user_id = u.id AND a.role = 'manager'
       LEFT JOIN policycraft_manager_organizations mo ON mo.manager_user_id = u.id AND mo.org_id = t.org_id
       LEFT JOIN policycraft_documents d ON d.id = t.document_id AND d.org_id = t.org_id
      WHERE t.id = ? AND t.assigned_manager_user_id = ? LIMIT 1 FOR UPDATE`, [taskId, managerId],
  );
  const task = rows[0];
  if (!task) throw new PolicyCraftTaskError("not_found", "Task not found.");
  if (task.document_id && !task.linked_document_id) {
    throw new PolicyCraftTaskError("conflict", task.document_archived ? "The linked task draft is archived." : "The linked task draft is unavailable.");
  }
  const reason = policyCraftTaskUnavailableReason({
    organizationDeleted: Boolean(task.organization_deleted),
    organizationExpired: task.organization_expiry !== null && new Date(task.organization_expiry).getTime() < Date.now(),
    managerActive: Boolean(task.manager_active && !task.manager_deleted && task.manager_access_status === "active"),
    organizationAssigned: Boolean(task.manager_org_active),
  }) || (task.document_archived !== null ? "The linked draft is archived." : null);
  if (reason) throw new PolicyCraftTaskError("forbidden", reason);
  return task;
}

export async function startPolicyCraftTask(taskId: string, managerId: number): Promise<{ task: PolicyCraftTask; documentId: string; organizationId: number }> {
  const connection = await policyCraftPool.getConnection();
  let documentId = "";
  let organizationId = 0;
  try {
    await connection.beginTransaction();
    const task = await validateManagerTask(connection, taskId, managerId);
    organizationId = task.org_id;
    if (task.status === "in_progress" && task.document_id) {
      documentId = task.document_id;
    } else {
      if (task.status !== "assigned") throw new PolicyCraftTaskError("conflict", "This task cannot be started in its current state.");
      if (task.document_id) {
        const [docs] = await connection.execute<RowDataPacket[]>(
          `SELECT id FROM policycraft_documents WHERE id = ? AND org_id = ? AND archived_at IS NULL LIMIT 1 FOR UPDATE`, [task.document_id, task.org_id],
        );
        if (!docs.length) throw new PolicyCraftTaskError("conflict", "The task draft is unavailable.");
        documentId = task.document_id;
      } else {
        documentId = randomUUID();
        const company = await getCompanyMasterFromRegistry(task.org_id, connection);
        const documentState: PolicyCraftDocumentState = {
          step: "structure",
          policy: applyCompanyMaster(initialPolicy(task.policy_type), company),
          importedPolicy: null,
        };
        const [existing] = await connection.execute<(RowDataPacket & { title: string })[]>(
          `SELECT title FROM policycraft_documents WHERE org_id = ? FOR UPDATE`, [task.org_id],
        );
        const draftTitle = nextUniqueDraftTitle(alignGeneratedDraftTitle(task.title, task.policy_type), existing.map((row) => row.title));
        await connection.execute(
          `INSERT INTO policycraft_documents
            (id, org_id, created_by_user_id, updated_by_user_id, title, policy_type, current_step,
             policy_json, imported_policy_json, schema_version, lock_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 1, 1)`,
          [documentId, task.org_id, managerId, managerId, draftTitle, task.policy_type, documentState.step,
            JSON.stringify(documentState.policy), documentState.importedPolicy ? JSON.stringify(documentState.importedPolicy) : null],
        );
        await saveManagerProgressSnapshot({
          connection,
          auth: {
            user: { id: String(managerId), name: "", email: "" }, role: "manager",
            organization: { id: task.org_id, code: company.code, name: company.name, source: company.source || "esg", deleted: false, expired: false, readOnly: false },
          },
          documentId, title: draftTitle, policyType: task.policy_type, state: documentState, documentVersion: 1,
        });
      }
      await connection.execute(
        `UPDATE policycraft_tasks SET status = 'in_progress', document_id = ?,
            started_at = COALESCE(started_at, CURRENT_TIMESTAMP(3)), lock_version = lock_version + 1,
            updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND assigned_manager_user_id = ? AND lock_version = ? AND status = 'assigned'`,
        [documentId, taskId, managerId, task.lock_version],
      );
      await recordTaskEvent(connection, taskId, task.org_id, {
        user: { id: String(managerId), name: "", email: "" }, role: "manager",
      }, "started", { documentId });
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (isTaskTablesMissing(error)) missingTaskMigration(error);
    throw error;
  } finally {
    connection.release();
  }
  const task = await getPolicyCraftTask(taskId, organizationId, managerId);
  if (!task) throw new Error("Started PolicyCraft task could not be loaded.");
  return { task, documentId, organizationId };
}

export async function completePolicyCraftTask(input: {
  taskId: string; managerId: number; version: number; documentVersion: number; confirmIncomplete: boolean;
}): Promise<PolicyCraftTask> {
  const connection = await policyCraftPool.getConnection();
  let orgId = 0;
  try {
    await connection.beginTransaction();
    const task = await validateManagerTask(connection, input.taskId, input.managerId);
    orgId = task.org_id;
    if (task.status !== "in_progress" || !task.document_id) throw new PolicyCraftTaskError("conflict", "Start this task before completing it.");
    if (task.lock_version !== input.version) throw new PolicyCraftTaskError("conflict", "This task changed in another session. Refresh before completing it.");
    const [docs] = await connection.execute<(RowDataPacket & { lock_version: number; archived_at: Date | string | null })[]>(
      `SELECT lock_version, archived_at FROM policycraft_documents WHERE id = ? AND org_id = ? LIMIT 1 FOR UPDATE`, [task.document_id, task.org_id],
    );
    const doc = docs[0];
    if (!doc || doc.archived_at) throw new PolicyCraftTaskError("conflict", "The linked draft is unavailable.");
    if (doc.lock_version !== input.documentVersion) throw new PolicyCraftTaskError("conflict", "Save the latest draft before completing this task.");
    const [progressRows] = await connection.execute<(RowDataPacket & { percentage: number; document_version: number })[]>(
      `SELECT percentage, document_version FROM policycraft_manager_progress
        WHERE org_id = ? AND document_id = ? AND manager_user_id = ? LIMIT 1 FOR UPDATE`,
      [task.org_id, task.document_id, input.managerId],
    );
    const savedProgress = progressRows[0];
    if (!savedProgress || savedProgress.document_version !== input.documentVersion) {
      throw new PolicyCraftTaskError("conflict", "Save the latest draft before completing this task.");
    }
    if (Number(savedProgress.percentage) < 100 && !input.confirmIncomplete) {
      throw new PolicyCraftTaskError("invalid", "Confirm completion below 100% progress.");
    }
    await connection.execute(
      `UPDATE policycraft_tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP(3),
          lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3)
        WHERE id = ? AND assigned_manager_user_id = ? AND status = 'in_progress' AND lock_version = ?`,
      [task.id, input.managerId, input.version],
    );
    await recordTaskEvent(connection, task.id, task.org_id, {
      user: { id: String(input.managerId), name: "", email: "" }, role: "manager",
    }, "completed", { documentId: task.document_id, percentage: Number(savedProgress.percentage) });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (isTaskTablesMissing(error)) missingTaskMigration(error);
    throw error;
  } finally {
    connection.release();
  }
  const task = await getPolicyCraftTask(input.taskId, orgId, input.managerId);
  if (!task) throw new Error("Completed PolicyCraft task could not be loaded.");
  return task;
}

export async function saveManagerProgressSnapshot(input: {
  connection: PoolConnection;
  auth: PolicyCraftAuthContext;
  documentId: string;
  title: string;
  policyType: PolicyType;
  state: PolicyCraftDocumentState;
  documentVersion: number;
}) {
  if (input.auth.role !== "manager") return;
  const progress = calculatePolicyProgress(input.state.policy);
  await input.connection.execute(
    `INSERT INTO policycraft_manager_progress
      (org_id, document_id, manager_user_id, title, policy_type, percentage, filled_sections,
       total_sections, sections_json, document_version, saved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE
       title = VALUES(title), policy_type = VALUES(policy_type), percentage = VALUES(percentage),
       filled_sections = VALUES(filled_sections), total_sections = VALUES(total_sections),
       sections_json = VALUES(sections_json), document_version = VALUES(document_version), saved_at = VALUES(saved_at)`,
    [input.auth.organization.id, input.documentId, Number(input.auth.user.id), input.title, input.policyType,
      progress.percentage, progress.filledSections, progress.totalSections, JSON.stringify(progress.sections), input.documentVersion],
  );
}

export async function isTaskLinkedDocument(connection: PoolConnection, orgId: number, documentId: string): Promise<boolean> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT id FROM policycraft_tasks WHERE org_id = ? AND document_id = ? LIMIT 1`, [orgId, documentId],
  );
  return rows.length > 0;
}

export async function recordIndependentManagerCreation(input: {
  connection: PoolConnection; auth: PolicyCraftAuthContext; documentId: string; title: string; policyType: PolicyType;
  state: PolicyCraftDocumentState; documentVersion: number;
}) {
  await saveManagerProgressSnapshot({ ...input, auth: input.auth });
}

export function taskActorFromAuth(auth: PolicyCraftAuthContext): PolicyCraftActor {
  return { user: auth.user, role: auth.role };
}
