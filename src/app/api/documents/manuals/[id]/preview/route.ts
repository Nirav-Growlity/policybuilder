import { NextResponse } from "next/server";
import { policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { MAX_MANUAL_JSON_BYTES, resolveManualAuth } from "@/lib/manual-request";
import { manualItemIds, parseAnyManual, renderParsedPdf } from "@/lib/documents/manual-render";
import { TypstCompileError } from "@/lib/typst/compile";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

/**
 * Live preview of the manual or handbook as it is being edited (not yet
 * saved). With an item id (`sopId`, which also names a handbook chapter),
 * only that item's pages are laid out, which keeps the preview fast on long
 * documents. Returns a PDF for the in-app pdf.js viewer.
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

  const parsed = parseAnyManual(body.manual);
  if (!parsed) return NextResponse.json({ error: "The document is not valid." }, { status: 400 });
  const itemId = typeof body.sopId === "string" && manualItemIds(parsed).includes(body.sopId) ? body.sopId : null;

  try {
    const started = performance.now();
    const rendered = await renderParsedPdf(parsed, resolved.auth.organization.id, {
      includeEmptySections: Boolean(itemId),
      ...(itemId ? { onlyItemIds: [itemId] } : {}),
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
      console.error("Manual preview layout failed", JSON.stringify(error.diagnostics).slice(0, 2000));
      return NextResponse.json({ error: "The preview could not be laid out." }, { status: 500 });
    }
    throw error;
  }
}
