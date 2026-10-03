import { NextResponse } from "next/server";
import { getPolicyCraftActor, policyCraftAuthFailure, policyCraftMutationFailure, resolvePolicyCraftOrganization } from "./policycraft-auth";
import { CoverAssetUnavailableError, resolveCoverAssets } from "./cover-repository";
import { getPolicyCraftUserSignature } from "./policycraft-signature-repository";
import { PolicyExportError, prepareAuthorizedPolicyExport } from "./policycraft-export";

export async function preparePolicyCraftRequestExport(request: Request) {
  const mutationFailure = policyCraftMutationFailure(request);
  if (mutationFailure) return { failure: mutationFailure };
  const payload: unknown = await request.json().catch(() => null);
  const prepared = await prepareAuthorizedPolicyExport(payload, {
    actor: getPolicyCraftActor,
    organization: async (actor, options) => {
      const organization = await resolvePolicyCraftOrganization(actor, options);
      return organization ? { organization } : null;
    },
    assets: resolveCoverAssets,
    signature: getPolicyCraftUserSignature,
  });
  return { prepared };
}

export function policyCraftExportFailure(error: unknown, format: "PDF" | "DOCX"): Response {
  const authFailure = policyCraftAuthFailure(error);
  if (authFailure) return authFailure;
  if (error instanceof PolicyExportError || error instanceof CoverAssetUnavailableError) {
    return NextResponse.json({ error: error.message }, {
      status: error instanceof PolicyExportError ? error.status : 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  console.error(`${format} export failed`, error);
  return NextResponse.json({ error: `${format} export failed` }, { status: 500 });
}
