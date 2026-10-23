import { NextResponse } from "next/server";
import { generateSopDocx, type SopDocxOptions } from "@/lib/docx/sop-generate";
import { manualFileName, parseManualOfKind, prepareParsedRender } from "@/lib/documents/manual-render";
import { getManual } from "@/lib/manual-repository";
import { resolveManualAuth } from "@/lib/manual-request";
import { TypstCompileError } from "@/lib/typst/compile";
import { renderSopManual } from "@/lib/typst/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

/** Downloads the saved manual or handbook as a Word file laid out like the PDF. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const resolved = await resolveManualAuth(request, { manualId: id, operation: "read" });
  if ("response" in resolved) return resolved.response;
  const orgId = resolved.auth.organization.id;
  const stored = await getManual<unknown>(orgId, id, resolved.auth.role === "admin");
  if (!stored) return NextResponse.json({ error: "Manual not found." }, { status: 404 });
  const parsed = parseManualOfKind(stored.kind, stored.manual);
  if (!parsed) return NextResponse.json({ error: "This document could not be read." }, { status: 422 });
  const { model, assets } = await prepareParsedRender(parsed, orgId);
  // The PDF layout (usually cached from the PDF route) gives the contents its page numbers.
  let pages: SopDocxOptions["pages"];
  try {
    const compiled = renderSopManual(model, assets);
    pages = { anchors: compiled.anchorPages, total: compiled.pageCount };
  } catch (error) {
    if (error instanceof TypstCompileError) console.error("Manual layout failed", JSON.stringify(error.diagnostics).slice(0, 2000));
    else console.error("Manual page lookup failed", error);
  }
  const docx = await generateSopDocx(model, assets, { pages });
  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${manualFileName(stored.title, stored.kind, "docx")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
