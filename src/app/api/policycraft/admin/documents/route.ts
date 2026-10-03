import { NextResponse } from "next/server";
import { getPolicyCraftAdminResult } from "@/lib/policycraft-auth";
import { parseAdminDocumentFilters } from "@/lib/policycraft-admin-document-filters";
import { listAllAdminDocuments, listPolicyCraftDocumentCreators } from "@/lib/policycraft-repository";

export async function GET(request: Request) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const documents = await listAllAdminDocuments(parseAdminDocumentFilters(params));
  const creators = await listPolicyCraftDocumentCreators();
  return NextResponse.json({ documents, creators }, { headers: { "Cache-Control": "private, no-store" } });
}
