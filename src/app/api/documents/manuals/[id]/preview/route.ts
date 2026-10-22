import { NextResponse } from "next/server";
import { policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { MAX_MANUAL_JSON_BYTES, resolveManualAuth } from "@/lib/manual-request";
import { renderManualPdf } from "@/lib/sop/render-service";
import { sopManualSchema } from "@/lib/sop/schema";
import type { SopManual } from "@/lib/sop/types";
import { TypstCompileError } from "@/lib/typst/compile";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

/**
 * Live preview of the manual as it is being edited (not yet saved). With a
 * `sopId`, only that SOP's pages are laid out, which keeps the preview fast
 * on long manuals. Returns a PDF for the in-app pdf.js viewer.
 */
export async function POST(request: Request, context: Context) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { id } = await context.params;
  const raw = await request.text();
  if (raw.length > MAX_MANUAL_JSON_BYTES) return NextResponse.json({ error: "Manual is too large." }, { status: 413 });
  let body: { manual?: unknown; sopId?: unknown; orgId?: unknown } | null = null;
  try { body = JSON.parse(raw); } catch { /* reported below */ }
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const resolved = await resolveManualAuth(request, {
    manualId: id,
    operation: "read",
    bodyOrgId: body.orgId,
    bodyProvidesOrg: Object.prototype.hasOwnProperty.call(body, "orgId"),
  });
  if ("response" in resolved) return resolved.response;

  const parsed = sopManualSchema.safeParse(body.manual);
  if (!parsed.success) return NextResponse.json({ error: "The manual is not valid.", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  const manual = parsed.data as SopManual;
  const sopId = typeof body.sopId === "string" && manual.sops.some((sop) => sop.id === body!.sopId) ? body.sopId : null;

  try {
    const started = performance.now();
    const rendered = await renderManualPdf(manual, resolved.auth.organization.id, {
      includeEmptySections: Boolean(sopId),
      ...(sopId ? { onlySopIds: [sopId] } : {}),
    });
    return new Response(new Uint8Array(rendered.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "private, no-store",
        "X-Page-Count": String(rendered.pageCount),
        "Server-Timing": `render;dur=${(performance.now() - started).toFixed(0)}`,
      },
    });
  } catch (error) {
    if (error instanceof TypstCompileError) {
      console.error("SOP preview layout failed", JSON.stringify(error.diagnostics).slice(0, 2000));
      return NextResponse.json({ error: "The preview could not be laid out." }, { status: 500 });
    }
    throw error;
  }
}
