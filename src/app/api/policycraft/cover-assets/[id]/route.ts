import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { getCoverAsset } from "@/lib/cover-repository";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const asset = await getCoverAsset(auth.organization.id, id);
  if (!asset) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(asset.content), { headers: { "Content-Type": asset.mime_type, "Cache-Control": "private, max-age=3600" } });
}
