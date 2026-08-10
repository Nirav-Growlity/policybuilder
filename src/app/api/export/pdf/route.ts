import { NextRequest, NextResponse } from "next/server";
import { generatePdf } from "@/lib/pdf/generate";
import type { Policy } from "@/lib/types";
import { normalizePolicyQuantitative } from "@/lib/quantitative";
import { getPolicyProfile } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { policy } = (await req.json()) as { policy: Policy };
    const buf = await generatePdf(normalizePolicyQuantitative(policy));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${getPolicyProfile(policy.policyType).exportName}.pdf"`,
      },
    });
  } catch (e) {
    console.error("PDF export failed", e);
    return NextResponse.json({ error: "PDF export failed" }, { status: 500 });
  }
}
