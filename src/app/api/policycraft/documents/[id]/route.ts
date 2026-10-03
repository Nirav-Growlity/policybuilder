import { NextResponse } from "next/server";
import { getPolicyCraftAuthResult, getPolicyCraftActorResult, isPolicyCraftSameOriginRequest, parsePolicyCraftOrganizationSelector, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { archiveDocument, deleteArchivedDocument, getDocument, renameDocument, restoreDocument, updateDocument } from "@/lib/policycraft-repository";
import type { PolicyCraftDocumentState } from "@/lib/policycraft-types";
import { normalizePolicyCovers } from "@/lib/cover-composition";
import { canPerformPolicyCraftDocumentAction, policyCraftDocumentAction, policyCraftDocumentMutationResponse } from "@/lib/policycraft-document-request";

type Context = { params: Promise<{ id: string }> };

function validState(value: unknown): value is PolicyCraftDocumentState {
  return !!value && typeof value === "object" && typeof (value as PolicyCraftDocumentState).step === "string" && !!(value as PolicyCraftDocumentState).policy;
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const { auth, response } = await getPolicyCraftAuthResult({ documentId: id, ...(selector.provided ? { organizationId: selector.organizationId } : {}), operation: "read" });
  if (!auth) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const document = await getDocument(auth.organization.id, id, auth.role === "admin");
  return document ? NextResponse.json({ document }) : NextResponse.json({ error: "Document not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { action?: unknown; archived?: unknown; orgId?: unknown; title?: unknown; state?: unknown; lockVersion?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const querySelector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (querySelector.provided && !querySelector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const bodyProvidesOrg = Object.prototype.hasOwnProperty.call(body, "orgId");
  if (bodyProvidesOrg && (typeof body.orgId !== "number" || !Number.isSafeInteger(body.orgId) || body.orgId <= 0)) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  if (bodyProvidesOrg && querySelector.provided && querySelector.valid && body.orgId !== querySelector.organizationId) return NextResponse.json({ error: "Conflicting organization selectors." }, { status: 400 });
  const orgId = bodyProvidesOrg ? Number(body.orgId) : querySelector.provided ? querySelector.organizationId : undefined;
  const { auth, response } = await getPolicyCraftAuthResult({ documentId: id, ...(orgId ? { organizationId: orgId } : {}), operation: "write" });
  if (!auth) return response || NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  const action = policyCraftDocumentAction(body);
  if (action && !canPerformPolicyCraftDocumentAction(auth.role, action)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (action === "archive") {
    const archived = await archiveDocument(auth.organization.id, Number(auth.user.id), id);
    return archived ? NextResponse.json({ archived: true }) : NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  if (action === "restore" || action === "delete") {
    if (action === "restore") {
      const restored = await restoreDocument(auth.organization.id, Number(auth.user.id), id);
      return restored ? NextResponse.json({ restored: true }) : NextResponse.json({ error: "Archived document not found." }, { status: 404 });
    }
    const deleted = await deleteArchivedDocument(auth.organization.id, id);
    return deleted ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Archived document not found." }, { status: 404 });
  }
  if (typeof body.title !== "string" || !body.title.trim() || !Number.isInteger(body.lockVersion) || Number(body.lockVersion) < 1) {
    return NextResponse.json({ error: "A title and valid lockVersion are required." }, { status: 400 });
  }
  if (body.state !== undefined) {
    if (!validState(body.state)) return NextResponse.json({ error: "A valid document state is required." }, { status: 400 });
    const state = { ...body.state, policy: normalizePolicyCovers(body.state.policy) };
    const result = await updateDocument(auth, id, body.title.trim().slice(0, 255), state, Number(body.lockVersion));
    return policyCraftDocumentMutationResponse(result, () => getDocument(auth.organization.id, id));
  }
  const result = await renameDocument(auth.organization.id, id, body.title.trim().slice(0, 255), Number(body.lockVersion));
  return policyCraftDocumentMutationResponse(result, () => getDocument(auth.organization.id, id));
}

export async function DELETE(request: Request, context: Context) {
  if (!isPolicyCraftSameOriginRequest(request)) return NextResponse.json({ error: "A trusted same-origin request is required." }, { status: 403 });
  const { id } = await context.params;
  const actor = await getPolicyCraftActorResult();
  if (!actor.actor) return actor.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const orgId = selector.provided ? selector.organizationId : undefined;
  const { auth, response } = await getPolicyCraftAuthResult({ documentId: id, ...(orgId ? { organizationId: orgId } : {}), operation: "write" });
  if (!auth) return response || NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  if (!canPerformPolicyCraftDocumentAction(auth.role, "delete")) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const deleted = await deleteArchivedDocument(auth.organization.id, id);
  return deleted ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: "Archive the document before deleting it." }, { status: 409 });
}
