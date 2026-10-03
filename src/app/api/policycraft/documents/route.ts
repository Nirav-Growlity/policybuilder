import { NextResponse } from "next/server";
import { getPolicyCraftAuthResult, getPolicyCraftActorResult, parsePolicyCraftOrganizationSelector, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { createDocument, listDocuments } from "@/lib/policycraft-repository";
import type { PolicyCraftDocumentState } from "@/lib/policycraft-types";
import { normalizePolicyCovers } from "@/lib/cover-composition";

function isDocumentState(value: unknown): value is PolicyCraftDocumentState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PolicyCraftDocumentState>;
  return typeof candidate.step === "string" && !!candidate.policy && typeof candidate.policy === "object";
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const selector = parsePolicyCraftOrganizationSelector(params.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const { auth, response } = await getPolicyCraftAuthResult({ ...(selector.provided ? { organizationId: selector.organizationId } : {}), operation: "read" });
  if (!auth) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const view = params.get("view");
  return NextResponse.json({ documents: await listDocuments(auth.organization.id, view === "archived") }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const actor = await getPolicyCraftActorResult();
  if (!actor.actor) return actor.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { title?: unknown; state?: unknown; orgId?: unknown } | null;
  if (!body || !isDocumentState(body.state)) {
    return NextResponse.json({ error: "A valid document state is required" }, { status: 400 });
  }
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim().slice(0, 255)
    : `${body.state.policy.policyType} policy`;

  try {
    const querySelector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
    if (querySelector.provided && !querySelector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
    const bodyProvidesOrg = Object.prototype.hasOwnProperty.call(body, "orgId");
    if (bodyProvidesOrg && (typeof body.orgId !== "number" || !Number.isSafeInteger(body.orgId) || body.orgId <= 0)) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
    if (bodyProvidesOrg && querySelector.provided && querySelector.valid && body.orgId !== querySelector.organizationId) return NextResponse.json({ error: "Conflicting organization selectors." }, { status: 400 });
    const selectedOrgId = bodyProvidesOrg ? Number(body.orgId) : querySelector.provided ? querySelector.organizationId : undefined;
    const { auth, response } = await getPolicyCraftAuthResult({
      ...(selectedOrgId ? { organizationId: selectedOrgId } : {}), operation: "write",
    });
    if (!auth) return response || NextResponse.json({ error: "Organization access denied." }, { status: 403 });
    const state: PolicyCraftDocumentState = { ...body.state, policy: normalizePolicyCovers(body.state.policy) };
    const document = await createDocument(auth, title, state);
    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error("PolicyCraft document creation failed", error);
    return NextResponse.json({ error: "Could not create document" }, { status: 500 });
  }
}
