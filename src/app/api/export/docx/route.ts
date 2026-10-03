import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@/lib/docx/generate";
import { getPolicyProfile } from "@/lib/constants";
import { policyCraftExportFailure, preparePolicyCraftRequestExport } from "@/lib/policycraft-export-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const result = await preparePolicyCraftRequestExport(req);
    if (result.failure) return result.failure;
    const { policy, authorApproval } = result.prepared!;
    const buf = await generateDocx(policy, authorApproval);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${getPolicyProfile(policy.policyType).exportName}.docx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return policyCraftExportFailure(error, "DOCX");
  }
}
