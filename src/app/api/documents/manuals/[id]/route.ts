import { NextResponse } from "next/server";
import { isPolicyCraftSameOriginRequest, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { archiveManual, deleteArchivedManual, getManual, restoreManual, updateManual } from "@/lib/manual-repository";
import { manualMutationResponse, MAX_MANUAL_JSON_BYTES, resolveManualAuth } from "@/lib/manual-request";
import { validateManualPayload } from "@/lib/manual-validation";
import { canPerformPolicyCraftDocumentAction, policyCraftDocumentAction } from "@/lib/policycraft-document-request";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const resolved = await resolveManualAuth(request, { manualId: id, operation: "read" });
  if ("response" in resolved) return resolved.response;
  const manual = await getManual(resolved.auth.organization.id, id, resolved.auth.role === "admin");
  return manual
    ? NextResponse.json({ manual }, { headers: { "Cache-Control": "private, no-store" } })
    : NextResponse.json({ error: "Manual not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { id } = await context.params;
  const raw = await request.text();
  if (raw.length > MAX_MANUAL_JSON_BYTES) return NextResponse.json({ error: "Manual is too large." }, { status: 413 });
  let body: {
    action?: unknown; archived?: unknown; orgId?: unknown; title?: unknown; stage?: unknown;
    manual?: unknown; importedContext?: unknown; lockVersion?: unknown;
  } | null = null;
  try { body = JSON.parse(raw); } catch { /* reported below */ }
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const resolved = await resolveManualAuth(request, {
    manualId: id,
    operation: "write",
    bodyOrgId: body.orgId,
    bodyProvidesOrg: Object.prototype.hasOwnProperty.call(body, "orgId"),
  });
  if ("response" in resolved) return resolved.response;
  const { auth } = resolved;

  const action = policyCraftDocumentAction(body);
  if (action && !canPerformPolicyCraftDocumentAction(auth.role, action)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  if (action === "archive") {
    return await archiveManual(auth.organization.id, Number(auth.user.id), id)
      ? NextResponse.json({ archived: true })
      : NextResponse.json({ error: "Manual not found." }, { status: 404 });
  }
  if (action === "restore") {
    return await restoreManual(auth.organization.id, Number(auth.user.id), id)
      ? NextResponse.json({ restored: true })
      : NextResponse.json({ error: "Archived manual not found." }, { status: 404 });
  }
  if (action === "delete") {
    return await deleteArchivedManual(auth.organization.id, id)
      ? NextResponse.json({ deleted: true })
      : NextResponse.json({ error: "Archived manual not found." }, { status: 404 });
  }

  if (typeof body.title !== "string" || !Number.isInteger(body.lockVersion) || Number(body.lockVersion) < 1) {
    return NextResponse.json({ error: "A title and valid lockVersion are required." }, { status: 400 });
  }
  const existing = await getManual(auth.organization.id, id);
  if (!existing) return NextResponse.json({ error: "Manual not found." }, { status: 404 });
  const manual = validateManualPayload(existing.kind, body.manual);
  if (!manual.ok) return NextResponse.json({ error: manual.error }, { status: 400 });

  const result = await updateManual(auth, id, {
    title: body.title.slice(0, 255),
    stage: typeof body.stage === "string" && body.stage ? body.stage.slice(0, 64) : existing.currentStage,
    manual: manual.value,
    ...(Object.prototype.hasOwnProperty.call(body, "importedContext") ? { importedContext: body.importedContext ?? null } : {}),
  }, Number(body.lockVersion));
  return manualMutationResponse(result, () => getManual(auth.organization.id, id));
}

export async function DELETE(request: Request, context: Context) {
  if (!isPolicyCraftSameOriginRequest(request)) {
    return NextResponse.json({ error: "A trusted same-origin request is required." }, { status: 403 });
  }
  const { id } = await context.params;
  const resolved = await resolveManualAuth(request, { manualId: id, operation: "write" });
  if ("response" in resolved) return resolved.response;
  if (!canPerformPolicyCraftDocumentAction(resolved.auth.role, "delete")) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  return await deleteArchivedManual(resolved.auth.organization.id, id)
    ? NextResponse.json({ deleted: true })
    : NextResponse.json({ error: "Archive the manual before deleting it." }, { status: 409 });
}
