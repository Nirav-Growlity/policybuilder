import { NextRequest, NextResponse } from "next/server";
import { generatePdf } from "@/lib/pdf/generate";
import { getPolicyProfile } from "@/lib/constants";
import { policyCraftExportFailure, preparePolicyCraftRequestExport } from "@/lib/policycraft-export-server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const result = await preparePolicyCraftRequestExport(req);
    if (result.failure) return result.failure;
    const { policy, authorApproval, cacheScope } = result.prepared!;
    const buf = await generatePdf(policy, authorApproval, cacheScope);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${getPolicyProfile(policy.policyType).exportName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return policyCraftExportFailure(error, "PDF");
  }
}
