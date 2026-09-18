import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { createCoverTemplate, listCoverTemplates } from "@/lib/cover-repository";
import { normalizeCoverComposition } from "@/lib/cover-composition";
import { POLICY_PROFILES } from "@/lib/constants";
import type { CoverLibrarySource, PolicyType } from "@/lib/types";

function isPolicyType(value: unknown): value is PolicyType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POLICY_PROFILES, value);
}

export async function GET(request: Request) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sourceParam = new URL(request.url).searchParams.get("source");
  const source: CoverLibrarySource | undefined = sourceParam === "ai" || sourceParam === "manual" ? sourceParam : undefined;
  const policyTypeParam = new URL(request.url).searchParams.get("policyType");
  const policyType = isPolicyType(policyTypeParam) ? policyTypeParam : undefined;
  if (source === "ai" && !policyType) return NextResponse.json({ error: "A policy type is required for AI cover templates." }, { status: 400 });
  const templates = await listCoverTemplates(auth.organization.id, source, policyType);
  return NextResponse.json({ templates: templates.map((template) => ({ ...template, canDelete: template.createdByUserId === Number(auth.user.id) })) });
}

export async function POST(request: Request) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: unknown; composition?: unknown; previewAssetId?: unknown; policyType?: unknown } | null;
  const composition = normalizeCoverComposition(body?.composition);
  const policyType = isPolicyType(body?.policyType) ? body.policyType : undefined;
  if (!composition || typeof body?.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "A name and valid cover composition are required." }, { status: 400 });
  if (composition.sourceTemplateId === "ai-generated" && !policyType) return NextResponse.json({ error: "An AI cover policy type is required." }, { status: 400 });
  const id = await createCoverTemplate(auth, body.name, composition, typeof body.previewAssetId === "string" ? body.previewAssetId : null, policyType);
  return NextResponse.json({ id }, { status: 201 });
}
