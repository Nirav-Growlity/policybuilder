import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@/lib/docx/generate";
import type { Policy } from "@/lib/types";
import { normalizePolicyQuantitative } from "@/lib/quantitative";
import { getPolicyProfile } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { policy } = (await req.json()) as { policy: Policy };
    const buf = await generateDocx(normalizePolicyQuantitative(policy));
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${getPolicyProfile(policy.policyType).exportName}.docx"`,
      },
    });
  } catch (e) {
    console.error("DOCX export failed", e);
    return NextResponse.json({ error: "DOCX export failed" }, { status: 500 });
  }
}
