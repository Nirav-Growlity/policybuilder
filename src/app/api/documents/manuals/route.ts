import { NextResponse } from "next/server";
import { policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { createManual, listManuals } from "@/lib/manual-repository";
import { isManualKind, MAX_MANUAL_JSON_BYTES, resolveManualAuth } from "@/lib/manual-request";
import { validateManualPayload } from "@/lib/manual-validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const resolved = await resolveManualAuth(request, { operation: "read" });
  if ("response" in resolved) return resolved.response;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const manuals = await listManuals(resolved.auth.organization.id, {
    archived: params.get("view") === "archived",
    ...(isManualKind(kind) ? { kind } : {}),
  });
  return NextResponse.json({ manuals }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const raw = await request.text();
  if (raw.length > MAX_MANUAL_JSON_BYTES) return NextResponse.json({ error: "Manual is too large." }, { status: 413 });
  let body: { kind?: unknown; title?: unknown; stage?: unknown; manual?: unknown; importedContext?: unknown; orgId?: unknown } | null = null;
  try { body = JSON.parse(raw); } catch { /* reported below */ }
  if (!body || !isManualKind(body.kind)) return NextResponse.json({ error: "A document kind is required." }, { status: 400 });
  const manual = validateManualPayload(body.kind, body.manual);
  if (!manual.ok) return NextResponse.json({ error: manual.error }, { status: 400 });

  const resolved = await resolveManualAuth(request, {
    operation: "write",
    bodyOrgId: body.orgId,
    bodyProvidesOrg: Object.prototype.hasOwnProperty.call(body, "orgId"),
  });
  if ("response" in resolved) return resolved.response;

  try {
    const created = await createManual(resolved.auth, {
      kind: body.kind,
      title: typeof body.title === "string" ? body.title.slice(0, 255) : "",
      stage: typeof body.stage === "string" && body.stage ? body.stage.slice(0, 64) : "write",
      manual: manual.value,
      importedContext: body.importedContext ?? null,
    });
    return NextResponse.json({ manual: created }, { status: 201 });
  } catch (error) {
    console.error("Manual creation failed", error);
    return NextResponse.json({ error: "Could not create the document." }, { status: 500 });
  }
}
