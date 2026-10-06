import { NextResponse } from "next/server";
import { POLICY_PROFILES } from "@/lib/constants";
import { getPolicyCraftAdminResult, parsePolicyCraftOrganizationSelector, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { createPolicyCraftTask, isMissingPolicyCraftTaskTablesError, listPolicyCraftManagerWork, listPolicyCraftTaskManagers, listPolicyCraftTasks, PolicyCraftTaskError } from "@/lib/policycraft-task-repository";
import type { PolicyType } from "@/lib/types";

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function positiveId(value: unknown): number | null {
  if (positiveInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return positiveInteger(parsed) ? parsed : null;
  }
  return null;
}

function validPolicyType(value: unknown): value is PolicyType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POLICY_PROFILES, value);
}

function taskError(error: unknown) {
  if (error instanceof PolicyCraftTaskError) {
    const status = error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "conflict" ? 409 : error.code === "migration_required" ? 503 : 400;
    return NextResponse.json({ code: error.code === "migration_required" ? "POLICYCRAFT_MIGRATION_REQUIRED" : undefined, error: error.message }, { status });
  }
  if (isMissingPolicyCraftTaskTablesError(error)) {
    return NextResponse.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "Apply the PolicyCraft tasks migration before using task assignments." }, { status: 503 });
  }
  console.error("PolicyCraft task request failed", error);
  return NextResponse.json({ error: "Could not load or save tasks." }, { status: 500 });
}

export async function GET(request: Request) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  try {
    const organizationId = selector.provided ? selector.organizationId : undefined;
    const [tasks, managers, managerWork] = await Promise.all([
      listPolicyCraftTasks({ organizationId }),
      listPolicyCraftTaskManagers(organizationId),
      listPolicyCraftManagerWork(organizationId),
    ]);
    return NextResponse.json({ tasks, managers, managerWork }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return taskError(error);
  }
}

export async function POST(request: Request) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as {
    organizationId?: unknown; managerId?: unknown; title?: unknown; instructions?: unknown; policyType?: unknown; dueDate?: unknown;
  } | null;
  const organizationId = positiveId(body?.organizationId);
  const managerId = positiveId(body?.managerId);
  if (!body || !organizationId || !managerId
    || typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 255
    || (body.instructions !== undefined && typeof body.instructions !== "string")
    || (typeof body.instructions === "string" && body.instructions.length > 5000)
    || !validPolicyType(body.policyType) || typeof body.dueDate !== "string") {
    return NextResponse.json({ error: "Provide a valid organization, assigned manager, title, policy type, and due date." }, { status: 400 });
  }
  try {
    const task = await createPolicyCraftTask({
      organizationId, managerId, title: body.title,
      instructions: typeof body.instructions === "string" ? body.instructions : "",
      policyType: body.policyType, dueDate: body.dueDate,
    }, actor);
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return taskError(error);
  }
}
