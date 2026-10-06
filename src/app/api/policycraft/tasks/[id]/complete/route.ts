import { NextResponse } from "next/server";
import { getPolicyCraftActorResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { completePolicyCraftTask, isMissingPolicyCraftTaskTablesError, PolicyCraftTaskError } from "@/lib/policycraft-task-repository";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { actor, response } = await getPolicyCraftActorResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "manager") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await request.json().catch(() => null) as { version?: unknown; documentVersion?: unknown; confirmIncomplete?: unknown } | null;
  if (!body || !Number.isInteger(body.version) || Number(body.version) < 1
    || !Number.isInteger(body.documentVersion) || Number(body.documentVersion) < 1
    || typeof body.confirmIncomplete !== "boolean") {
    return NextResponse.json({ error: "Valid task and document versions and confirmIncomplete are required." }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const task = await completePolicyCraftTask({
      taskId: id, managerId: Number(actor.user.id), version: Number(body.version),
      documentVersion: Number(body.documentVersion), confirmIncomplete: body.confirmIncomplete,
    });
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof PolicyCraftTaskError) {
      const status = error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "conflict" ? 409 : error.code === "migration_required" ? 503 : 400;
      return NextResponse.json({ error: error.message, ...(error.code === "migration_required" ? { code: "POLICYCRAFT_MIGRATION_REQUIRED" } : {}) }, { status });
    }
    if (isMissingPolicyCraftTaskTablesError(error)) return NextResponse.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "Apply the PolicyCraft tasks migration before completing tasks." }, { status: 503 });
    console.error("PolicyCraft task completion failed", error);
    return NextResponse.json({ error: "Could not complete this task." }, { status: 500 });
  }
}
