import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { archiveCoverTemplate, createCoverTemplate, listCoverTemplates, updateCoverTemplate } from "@/lib/cover-repository";
import { normalizeCoverComposition } from "@/lib/cover-composition";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { name?: unknown; composition?: unknown; lockVersion?: unknown } | null;
  const composition = normalizeCoverComposition(body?.composition);
  if (!composition || typeof body?.name !== "string" || !Number.isInteger(body?.lockVersion)) return NextResponse.json({ error: "A name, composition, and lock version are required." }, { status: 400 });
  const updated = await updateCoverTemplate(auth, id, body.name, composition, body.lockVersion as number);
  return updated ? NextResponse.json({ updated: true }) : NextResponse.json({ error: "Not found, not yours, or stale version." }, { status: 409 });
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const template = (await listCoverTemplates(auth.organization.id)).find((item) => item.id === id);
  if (!template?.composition) return NextResponse.json({ error: "Template not found" }, { status: 404 });
  const duplicateId = await createCoverTemplate(auth, `${template.name} copy`, template.composition, template.previewAssetId);
  return NextResponse.json({ id: duplicateId }, { status: 201 });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const archived = await archiveCoverTemplate(auth, id);
  return archived ? NextResponse.json({ archived: true }) : NextResponse.json({ error: "Not found or not yours." }, { status: 404 });
}
