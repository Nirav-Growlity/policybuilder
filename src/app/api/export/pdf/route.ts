import { NextRequest, NextResponse } from "next/server";
import { generatePdf, policyPdfEngine } from "@/lib/pdf/generate";
import { getPolicyProfile } from "@/lib/constants";
import { policyCraftExportFailure, preparePolicyCraftRequestExport } from "@/lib/policycraft-export-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const result = await preparePolicyCraftRequestExport(req);
    if (result.failure) return result.failure;
    const { policy, authorApproval, cacheScope } = result.prepared!;
    const engine = policyPdfEngine();
    const started = performance.now();
    const buf = await generatePdf(policy, authorApproval, cacheScope, engine);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${getPolicyProfile(policy.policyType).exportName}.pdf"`,
        "Cache-Control": "private, no-store",
        "Server-Timing": `render;desc="${engine}";dur=${(performance.now() - started).toFixed(0)}`,
      },
    });
  } catch (error) {
    return policyCraftExportFailure(error, "PDF");
  }
}
