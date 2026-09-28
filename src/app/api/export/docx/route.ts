import { NextRequest, NextResponse } from "next/server";
import { generateDocx } from "@/lib/docx/generate";
import type { Policy } from "@/lib/types";
import { normalizePolicyQuantitative } from "@/lib/quantitative";
import { getPolicyProfile } from "@/lib/constants";
import { hasExternalCoverAssets, stripExternalActiveCoverAssets } from "@/lib/cover-composition";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { policy, includeAuthorSignature, authorSignatureDate } = (await req.json()) as {
      policy: Policy;
      includeAuthorSignature?: boolean;
      authorSignatureDate?: string;
    };
    let auth: Awaited<ReturnType<(typeof import("@/lib/policycraft-auth"))["getPolicyCraftAuth"]>> = null;
    let resolved = policy;
    let authorApproval: import("@/lib/document-render-model").AuthorApprovalRenderData | undefined;
    if (includeAuthorSignature === true) {
      if (!isIsoDate(authorSignatureDate)) {
        return NextResponse.json({ error: "Choose a valid author signature date." }, { status: 400 });
      }
      const [{ getPolicyCraftAuth }, { getPolicyCraftUserSignature }] = await Promise.all([
        import("@/lib/policycraft-auth"),
        import("@/lib/policycraft-signature-repository"),
      ]);
      auth = await getPolicyCraftAuth();
      if (!auth) {
        return NextResponse.json({ error: "Sign in to apply your saved signature." }, { status: 401 });
      }
      const signature = await getPolicyCraftUserSignature(auth.user.id);
      if (!signature) {
        return NextResponse.json({ error: "Save a signature before applying it." }, { status: 404 });
      }
      authorApproval = {
        displayName: auth.user.name.trim() || auth.user.email,
        date: authorSignatureDate,
        signatureDataUrl: `data:image/png;base64,${signature.bytes.toString("base64")}`,
      };
    }
    if (policy.coverComposition || policy.aiCoverComposition || policy.company.companyLogo) {
      try {
        const [{ getPolicyCraftAuth }, { resolveCoverAssets }] = await Promise.all([import("@/lib/policycraft-auth"), import("@/lib/cover-repository")]);
        const candidateAuth = auth ?? await getPolicyCraftAuth();
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
    const buf = await generateDocx(normalizePolicyQuantitative(resolved), authorApproval);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${getPolicyProfile(policy.policyType).exportName}.docx"`,
        ...(includeAuthorSignature === true ? { "Cache-Control": "private, no-store" } : {}),
      },
    });
  } catch (e) {
    console.error("DOCX export failed", e);
    return NextResponse.json({ error: "DOCX export failed" }, { status: 500 });
  }
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
