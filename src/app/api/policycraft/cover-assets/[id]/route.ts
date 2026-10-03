import { NextResponse } from "next/server";
import { getPolicyCraftAuthResult, parsePolicyCraftOrganizationSelector } from "@/lib/policycraft-auth";
import { getCoverAsset } from "@/lib/cover-repository";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const { auth, response } = await getPolicyCraftAuthResult({ ...(selector.provided ? { organizationId: selector.organizationId } : {}), operation: "read" });
  if (!auth) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const asset = await getCoverAsset(auth.organization.id, id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(asset.content), { headers: { "Content-Type": asset.mime_type, "Cache-Control": "private, no-store" } });
}
