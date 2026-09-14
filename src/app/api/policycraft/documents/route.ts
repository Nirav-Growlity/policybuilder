import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { createDocument, listDocuments } from "@/lib/policycraft-repository";
import type { PolicyCraftDocumentState } from "@/lib/policycraft-types";
import { normalizeCoverComposition } from "@/lib/cover-composition";

function isDocumentState(value: unknown): value is PolicyCraftDocumentState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PolicyCraftDocumentState>;
  return typeof candidate.step === "string" && !!candidate.policy && typeof candidate.policy === "object";
}

export async function GET(request: Request) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const view = new URL(request.url).searchParams.get("view");
  return NextResponse.json({ documents: await listDocuments(auth.organization.id, view === "archived") });
}

export async function POST(request: Request) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { title?: unknown; state?: unknown } | null;
  if (!body || !isDocumentState(body.state)) {
    return NextResponse.json({ error: "A valid document state is required" }, { status: 400 });
  }
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 255)
    : `${body.state.policy.policyType} policy`;

  try {
    const state: PolicyCraftDocumentState = { ...body.state, policy: { ...body.state.policy, coverComposition: normalizeCoverComposition(body.state.policy.coverComposition) } };
    const document = await createDocument(auth, title, state);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error("PolicyCraft document creation failed", error);
    return NextResponse.json({ error: "Could not create document" }, { status: 500 });
  }
}
