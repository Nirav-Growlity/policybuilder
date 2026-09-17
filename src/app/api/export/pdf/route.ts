import { NextRequest, NextResponse } from "next/server";
import { generatePdf } from "@/lib/pdf/generate";
import type { Policy } from "@/lib/types";
import { normalizePolicyQuantitative } from "@/lib/quantitative";
import { getPolicyProfile } from "@/lib/constants";
import { hasExternalCoverAssets, stripExternalActiveCoverAssets } from "@/lib/cover-composition";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { policy } = (await req.json()) as { policy: Policy };
    let auth: Awaited<ReturnType<(typeof import("@/lib/policycraft-auth"))["getPolicyCraftAuth"]>> = null;
    let resolved = policy;
    if (policy.coverComposition || policy.aiCoverComposition) {
      try {
        const [{ getPolicyCraftAuth }, { resolveCoverAssets }] = await Promise.all([import("@/lib/policycraft-auth"), import("@/lib/cover-repository")]);
        const candidateAuth = await getPolicyCraftAuth();
        if (candidateAuth) {
          resolved = await resolveCoverAssets(policy, candidateAuth.organization.id);
          auth = candidateAuth;
        }
      } catch {
        auth = null;
        resolved = policy;
      }
    }
    if (!auth && hasExternalCoverAssets(policy)) resolved = stripExternalActiveCoverAssets(policy);
    const buf = await generatePdf(normalizePolicyQuantitative(resolved));
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
