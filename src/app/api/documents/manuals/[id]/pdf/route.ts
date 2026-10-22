import { NextResponse } from "next/server";
import { getManual, recordManualPageCount } from "@/lib/manual-repository";
import { resolveManualAuth } from "@/lib/manual-request";
import { renderManualPdf } from "@/lib/sop/render-service";
import { sopManualSchema } from "@/lib/sop/schema";
import type { SopManual } from "@/lib/sop/types";
import { TypstCompileError } from "@/lib/typst/compile";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

function fileName(title: string) {
  return `${title.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-") || "SOP-Manual"}.pdf`;
}

/** Downloads the saved manual as a PDF and records its page count for the drafts list. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const resolved = await resolveManualAuth(request, { manualId: id, operation: "read" });
  if ("response" in resolved) return resolved.response;
  const orgId = resolved.auth.organization.id;
  const stored = await getManual<unknown>(orgId, id, resolved.auth.role === "admin");
  if (!stored || stored.kind !== "sop") return NextResponse.json({ error: "Manual not found." }, { status: 404 });
  const parsed = sopManualSchema.safeParse(stored.manual);
  if (!parsed.success) return NextResponse.json({ error: "This manual could not be read." }, { status: 422 });
  try {
    const rendered = await renderManualPdf(parsed.data as SopManual, orgId);
    if (rendered.pageCount !== stored.pageCount) await recordManualPageCount(orgId, id, rendered.pageCount).catch(() => {});
    const inline = new URL(request.url).searchParams.get("disposition") === "inline";
    return new Response(new Uint8Array(rendered.pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName(stored.title)}"`,
        "Cache-Control": "private, no-store",
        "X-Page-Count": String(rendered.pageCount),
      },
    });
  } catch (error) {
    if (error instanceof TypstCompileError) {
      console.error("SOP manual layout failed", JSON.stringify(error.diagnostics).slice(0, 2000));
      return NextResponse.json({ error: "The manual could not be laid out." }, { status: 500 });
    }
    throw error;
  }
}
