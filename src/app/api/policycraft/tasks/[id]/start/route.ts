import { NextResponse } from "next/server";
import { getPolicyCraftActorResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { isMissingPolicyCraftTaskTablesError, PolicyCraftTaskError, startPolicyCraftTask } from "@/lib/policycraft-task-repository";

type Context = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  if (error instanceof PolicyCraftTaskError) {
    const status = error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : error.code === "conflict" ? 409 : error.code === "migration_required" ? 503 : 400;
    return NextResponse.json({ error: error.message, ...(error.code === "migration_required" ? { code: "POLICYCRAFT_MIGRATION_REQUIRED" } : {}) }, { status });
  }
  if (isMissingPolicyCraftTaskTablesError(error)) return NextResponse.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "Apply the PolicyCraft tasks migration before starting tasks." }, { status: 503 });
  console.error("PolicyCraft task start failed", error);
  return NextResponse.json({ error: "Could not start this task." }, { status: 500 });
}

export async function POST(request: Request, context: Context) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { actor, response } = await getPolicyCraftActorResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "manager") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  await request.json().catch(() => ({}));
  const { id } = await context.params;
  try {
    const result = await startPolicyCraftTask(id, Number(actor.user.id));
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
