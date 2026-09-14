import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@/lib/docx/generate";
import type { Policy } from "@/lib/types";
import { normalizePolicyQuantitative } from "@/lib/quantitative";
import { getPolicyProfile } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { policy } = (await req.json()) as { policy: Policy };
    let auth: Awaited<ReturnType<(typeof import("@/lib/policycraft-auth"))["getPolicyCraftAuth"]>> = null;
    let resolved = policy;
    if (policy.coverComposition) {
      try {
        const [{ getPolicyCraftAuth }, { resolveCoverAssets }] = await Promise.all([import("@/lib/policycraft-auth"), import("@/lib/cover-repository")]);
        auth = await getPolicyCraftAuth();
        if (auth) resolved = await resolveCoverAssets(policy, auth.organization.id);
      } catch { /* asset-free exports remain available in local/demo mode */ }
    }
    if (policy.coverComposition && !auth && (Boolean(policy.coverComposition.background.assetId && !policy.coverComposition.background.assetId.startsWith("data:")) || policy.coverComposition.elements.some((element) => element.type === "image" && !element.assetId.startsWith("data:")))) throw new Error("Cover assets require authentication");
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
