import { NextResponse } from "next/server";
import { getPolicyCraftAdminResult } from "@/lib/policycraft-auth";
import { listAllAdminDocuments, listPolicyCraftDocumentCreators } from "@/lib/policycraft-repository";

export async function GET(request: Request) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const organizationId = integer(params.get("organizationId"));
  const creatorId = integer(params.get("creatorId"));
  const documents = await listAllAdminDocuments({
    ...(organizationId ? { organizationId } : {}),
    ...(creatorId ? { creatorId } : {}),
    ...(params.get("policyType") ? { policyType: params.get("policyType")! } : {}),
    ...(params.has("archived") ? { archived: params.get("archived") === "true" } : {}),
  });
  const creators = await listPolicyCraftDocumentCreators();
  return NextResponse.json({ documents, creators }, { headers: { "Cache-Control": "private, no-store" } });
}

function integer(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
