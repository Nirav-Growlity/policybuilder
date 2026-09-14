import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { createCoverTemplate, listCoverTemplates } from "@/lib/cover-repository";
import { normalizeCoverComposition } from "@/lib/cover-composition";

export async function GET() {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ templates: await listCoverTemplates(auth.organization.id) });
}

export async function POST(request: Request) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: unknown; composition?: unknown; previewAssetId?: unknown } | null;
  const composition = normalizeCoverComposition(body?.composition);
  if (!composition || typeof body?.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "A name and valid cover composition are required." }, { status: 400 });
  const id = await createCoverTemplate(auth, body.name, composition, typeof body.previewAssetId === "string" ? body.previewAssetId : null);
  return NextResponse.json({ id }, { status: 201 });
}
