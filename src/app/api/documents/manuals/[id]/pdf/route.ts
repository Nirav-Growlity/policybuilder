import { NextResponse } from "next/server";
import { manualFileName, parseManualOfKind, renderParsedPdf } from "@/lib/documents/manual-render";
import { getManual, recordManualPageCount } from "@/lib/manual-repository";
import { resolveManualAuth } from "@/lib/manual-request";
import { TypstCompileError } from "@/lib/typst/compile";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Downloads the saved manual or handbook as a PDF and records its page count for the drafts list. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const resolved = await resolveManualAuth(request, { manualId: id, operation: "read" });
  if ("response" in resolved) return resolved.response;
  const orgId = resolved.auth.organization.id;
  const stored = await getManual<unknown>(orgId, id, resolved.auth.role === "admin");
  if (!stored) return NextResponse.json({ error: "Manual not found." }, { status: 404 });
  const parsed = parseManualOfKind(stored.kind, stored.manual);
  if (!parsed) return NextResponse.json({ error: "This document could not be read." }, { status: 422 });
  try {
    const rendered = await renderParsedPdf(parsed, orgId);
    if (rendered.pageCount !== stored.pageCount) await recordManualPageCount(orgId, id, rendered.pageCount).catch(() => {});
    const inline = new URL(request.url).searchParams.get("disposition") === "inline";
    return new Response(new Uint8Array(rendered.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${manualFileName(stored.title, stored.kind, "pdf")}"`,
        "Cache-Control": "private, no-store",
        "X-Page-Count": String(rendered.pageCount),
      },
    });
  } catch (error) {
    if (error instanceof TypstCompileError) {
      console.error("Manual layout failed", JSON.stringify(error.diagnostics).slice(0, 2000));
      return NextResponse.json({ error: "The document could not be laid out." }, { status: 500 });
    }
    throw error;
  }
}
