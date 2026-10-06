import { NextResponse } from "next/server";
import { POLICY_PROFILES } from "@/lib/constants";
import { getPolicyCraftAdminResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { getPolicyCraftTask, isMissingPolicyCraftTaskTablesError, listPolicyCraftTaskEvents, PolicyCraftTaskError, updatePolicyCraftTask } from "@/lib/policycraft-task-repository";
import { isPolicyCraftTaskAction } from "@/lib/policycraft-task-rules";
import type { PolicyType } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

function validPolicyType(value: unknown): value is PolicyType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POLICY_PROFILES, value);
}

function positiveId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

function errorResponse(error: unknown) {
  if (error instanceof PolicyCraftTaskError) {
    const status = error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "conflict" ? 409 : error.code === "migration_required" ? 503 : 400;
    return NextResponse.json({ error: error.message, ...(error.code === "migration_required" ? { code: "POLICYCRAFT_MIGRATION_REQUIRED" } : {}) }, { status });
  }
  if (isMissingPolicyCraftTaskTablesError(error)) return NextResponse.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "Apply the PolicyCraft tasks migration before using task assignments." }, { status: 503 });
  console.error("PolicyCraft task request failed", error);
  return NextResponse.json({ error: "Could not load or save this task." }, { status: 500 });
}

export async function GET(_request: Request, context: Context) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  try {
    const task = await getPolicyCraftTask(id);
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    const events = await listPolicyCraftTaskEvents(task.id);
    return NextResponse.json({ task, events }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as {
    version?: unknown; action?: unknown; managerId?: unknown; organizationId?: unknown; title?: unknown; instructions?: unknown; policyType?: unknown; dueDate?: unknown;
  } | null;
  if (!body || !Number.isInteger(body.version) || Number(body.version) < 1 || !isPolicyCraftTaskAction(body.action)) {
    return NextResponse.json({ error: "A valid task version and action are required." }, { status: 400 });
  }
  const managerId = body.managerId === undefined ? undefined : positiveId(body.managerId);
  const organizationId = body.organizationId === undefined ? undefined : positiveId(body.organizationId);
  if (body.managerId !== undefined && managerId === null) return NextResponse.json({ error: "managerId must be a positive integer." }, { status: 400 });
  if (body.organizationId !== undefined && organizationId === null) return NextResponse.json({ error: "organizationId must be a positive integer." }, { status: 400 });
  if (body.title !== undefined && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 255)) return NextResponse.json({ error: "title must contain 1 to 255 characters." }, { status: 400 });
  if (body.instructions !== undefined && (typeof body.instructions !== "string" || body.instructions.length > 5000)) return NextResponse.json({ error: "instructions must be 5000 characters or fewer." }, { status: 400 });
  if (body.policyType !== undefined && !validPolicyType(body.policyType)) return NextResponse.json({ error: "policyType is invalid." }, { status: 400 });
  if (body.dueDate !== undefined && typeof body.dueDate !== "string") return NextResponse.json({ error: "dueDate must be a date string." }, { status: 400 });
  try {
    const task = await updatePolicyCraftTask({
      taskId: id, version: Number(body.version), action: body.action, admin: actor,
      ...(managerId !== undefined && managerId !== null ? { managerId } : {}),
      ...(organizationId !== undefined && organizationId !== null ? { organizationId } : {}),
      ...(body.title !== undefined ? { title: body.title as string } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions as string } : {}),
      ...(body.policyType !== undefined ? { policyType: body.policyType as PolicyType } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
    });
    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}
