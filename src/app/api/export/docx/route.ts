import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@/lib/docx/generate";
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
    const buf = await generateDocx(normalizePolicyQuantitative(resolved));
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
