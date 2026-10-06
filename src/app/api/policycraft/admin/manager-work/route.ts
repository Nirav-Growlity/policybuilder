import { NextResponse } from "next/server";
import { getPolicyCraftAdminResult, parsePolicyCraftOrganizationSelector } from "@/lib/policycraft-auth";
import { isMissingPolicyCraftTaskTablesError, listPolicyCraftManagerWork } from "@/lib/policycraft-task-repository";

export async function GET(request: Request) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  try {
    const work = await listPolicyCraftManagerWork(selector.provided ? selector.organizationId : undefined);
    return NextResponse.json({ work }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (isMissingPolicyCraftTaskTablesError(error)) return NextResponse.json({ code: "POLICYCRAFT_MIGRATION_REQUIRED", error: "Apply the PolicyCraft tasks migration before viewing manager progress." }, { status: 503 });
    console.error("PolicyCraft manager work request failed", error);
    return NextResponse.json({ error: "Could not load manager progress." }, { status: 500 });
  }
}
