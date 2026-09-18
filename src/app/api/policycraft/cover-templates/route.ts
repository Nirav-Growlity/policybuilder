import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { createCoverTemplate, listCoverTemplates } from "@/lib/cover-repository";
import { normalizeCoverComposition } from "@/lib/cover-composition";
import type { CoverLibrarySource } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sourceParam = new URL(request.url).searchParams.get("source");
  const source: CoverLibrarySource | undefined = sourceParam === "ai" || sourceParam === "manual" ? sourceParam : undefined;
  const templates = await listCoverTemplates(auth.organization.id, source);
  return NextResponse.json({ templates: templates.map((template) => ({ ...template, canDelete: template.createdByUserId === Number(auth.user.id) })) });
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
