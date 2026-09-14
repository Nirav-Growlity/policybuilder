import { NextResponse } from "next/server";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { archiveDocument, getDocument, renameDocument, restoreDocument, updateDocument } from "@/lib/policycraft-repository";
import type { PolicyCraftDocumentState } from "@/lib/policycraft-types";
import { normalizeCoverComposition } from "@/lib/cover-composition";

function isDocumentState(value: unknown): value is PolicyCraftDocumentState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PolicyCraftDocumentState>;
  return typeof candidate.step === "string" && !!candidate.policy && typeof candidate.policy === "object";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const document = await getDocument(auth.organization.id, id);
  return document
    ? NextResponse.json({ document })
    : NextResponse.json({ error: "Document not found" }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    title?: unknown;
    state?: unknown;
    lockVersion?: unknown;
    archived?: unknown;
  } | null;

  if (body?.archived === true) {
    const archived = await archiveDocument(auth.organization.id, Number(auth.user.id), id);
    return archived
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (body?.archived === false) {
    const restored = await restoreDocument(auth.organization.id, Number(auth.user.id), id);
    return restored
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (typeof body?.title === "string" && body.title.trim() && body.state === undefined && typeof body.lockVersion === "number") {
    const result = await renameDocument(auth.organization.id, id, body.title.trim().slice(0, 255), body.lockVersion);
    if (result === "not_found") return NextResponse.json({ error: "Document not found" }, { status: 404 });
    if (result === "conflict") return NextResponse.json({ error: "Document changed by another user" }, { status: 409 });
    const document = await getDocument(auth.organization.id, id);
    return NextResponse.json({ document });
  }

  if (!body || !isDocumentState(body.state) || typeof body.lockVersion !== "number") {
    return NextResponse.json({ error: "State and lockVersion are required" }, { status: 400 });
  }
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 255)
    : `${body.state.policy.policyType} policy`;
  const state: PolicyCraftDocumentState = { ...body.state, policy: { ...body.state.policy, coverComposition: normalizeCoverComposition(body.state.policy.coverComposition) } };
  const result = await updateDocument(auth, id, title, state, body.lockVersion);
  if (result === "not_found") return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (result === "conflict") return NextResponse.json({ error: "Document changed by another user" }, { status: 409 });
  const document = await getDocument(auth.organization.id, id);
  return NextResponse.json({ document });
}
