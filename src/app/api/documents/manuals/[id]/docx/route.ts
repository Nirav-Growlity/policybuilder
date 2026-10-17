import { NextResponse } from "next/server";
import { generateSopDocx, sopPagesFromPdf } from "@/lib/docx/sop-generate";
import { getManual } from "@/lib/manual-repository";
import { resolveManualAuth } from "@/lib/manual-request";
import { prepareSopRender } from "@/lib/sop/render-service";
import { sopManualSchema } from "@/lib/sop/schema";
import type { SopManual } from "@/lib/sop/types";
import { TypstCompileError } from "@/lib/typst/compile";
import { renderSopManual } from "@/lib/typst/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

function fileName(title: string) {
  return `${title.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-") || "SOP-Manual"}.docx`;
}

/** Downloads the saved manual as a Word file laid out like the PDF. */
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const resolved = await resolveManualAuth(request, { manualId: id, operation: "read" });
  if ("response" in resolved) return resolved.response;
  const orgId = resolved.auth.organization.id;
  const stored = await getManual<unknown>(orgId, id, resolved.auth.role === "admin");
  if (!stored || stored.kind !== "sop") return NextResponse.json({ error: "Manual not found." }, { status: 404 });
  const parsed = sopManualSchema.safeParse(stored.manual);
  if (!parsed.success) return NextResponse.json({ error: "This manual could not be read." }, { status: 422 });
  const { model, assets } = await prepareSopRender(parsed.data as SopManual, orgId);
  // The PDF layout (usually cached from the PDF route) gives the contents its page numbers.
  let pages: Awaited<ReturnType<typeof sopPagesFromPdf>> | undefined;
  try {
    pages = await sopPagesFromPdf(renderSopManual(model, assets).pdf, model);
  } catch (error) {
    if (error instanceof TypstCompileError) console.error("SOP manual layout failed", JSON.stringify(error.diagnostics).slice(0, 2000));
    else console.error("SOP manual page lookup failed", error);
  }
  const docx = await generateSopDocx(model, assets, { pages });
  return new Response(new Uint8Array(docx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName(stored.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
