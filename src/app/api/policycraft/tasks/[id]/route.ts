import { NextResponse } from "next/server";
import { getPolicyCraftActorResult } from "@/lib/policycraft-auth";
import { isMissingPolicyCraftTaskTablesError, listPolicyCraftTaskEvents, listPolicyCraftTasks } from "@/lib/policycraft-task-repository";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { actor, response } = await getPolicyCraftActorResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "manager") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const { id } = await context.params;
  try {
    const tasks = await listPolicyCraftTasks({ managerId: Number(actor.user.id) });
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
    const events = await listPolicyCraftTaskEvents(task.id);
    return NextResponse.json({ task, events }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isMissingPolicyCraftTaskTablesError(error)) return NextResponse.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "Apply the PolicyCraft tasks migration before viewing task details." }, { status: 503 });
    console.error("PolicyCraft manager task detail failed", error);
    return NextResponse.json({ error: "Could not load this task." }, { status: 500 });
  }
}
