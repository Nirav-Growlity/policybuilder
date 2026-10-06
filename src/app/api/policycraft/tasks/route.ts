import { NextResponse } from "next/server";
import { getPolicyCraftActorResult } from "@/lib/policycraft-auth";
import { isMissingPolicyCraftTaskTablesError, listPolicyCraftTasks } from "@/lib/policycraft-task-repository";

export async function GET(request: Request) {
  const { actor, response } = await getPolicyCraftActorResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "manager") return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const requestedDocumentId = new URL(request.url).searchParams.get("documentId");
  if (requestedDocumentId !== null && !/^[0-9a-f-]{36}$/i.test(requestedDocumentId)) return NextResponse.json({ error: "documentId must be a UUID." }, { status: 400 });
  try {
    const tasks = await listPolicyCraftTasks({ managerId: Number(actor.user.id), ...(requestedDocumentId ? { documentId: requestedDocumentId } : {}) });
    return NextResponse.json({ tasks }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isMissingPolicyCraftTaskTablesError(error)) return NextResponse.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "Apply the PolicyCraft tasks migration before using assigned tasks." }, { status: 503 });
    console.error("PolicyCraft manager task request failed", error);
    return NextResponse.json({ error: "Could not load assigned tasks." }, { status: 500 });
  }
}
