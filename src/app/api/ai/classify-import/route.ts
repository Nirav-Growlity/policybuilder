import { NextRequest, NextResponse } from "next/server";
import { classifyImport, parseReferenceInput } from "@/lib/ai/import-classify";
import { flattenUnits } from "@/lib/docx/import-classification";
import { ClaudeKeyMissingError, hasClaudeKey } from "@/lib/ai/claude";
import {
  getPolicyCraftAuthResult,
  parsePolicyCraftOrganizationSelector,
  policyCraftAuthFailure,
  policyCraftMutationFailure,
} from "@/lib/policycraft-auth";

export const runtime = "nodejs";
// The classification is advisory: it answers within the reader's 30 s limit or the browser loads with the built-in rules.
export const maxDuration = 45;

const MAX_BODY_BYTES = 3 * 1024 * 1024;

/**
 * Says where each part of a parsed document belongs in the policy. It returns
 * labels only (ids and destinations); the browser applies them to its own copy
 * of the document, so no text comes back from the model.
 */
export async function POST(req: NextRequest) {
  const mutationFailure = policyCraftMutationFailure(req, "json");
  if (mutationFailure) return mutationFailure;

  const selector = parsePolicyCraftOrganizationSelector(req.nextUrl.searchParams.get("orgId"));
  if (!selector.provided || !selector.valid) {
    return NextResponse.json({ error: "A valid organization is required." }, { status: 400 });
  }

  let access: Awaited<ReturnType<typeof getPolicyCraftAuthResult>>;
  try {
    access = await getPolicyCraftAuthResult({
      organizationId: selector.organizationId,
      documentId: req.nextUrl.searchParams.get("documentId") || undefined,
      operation: "write",
    });
  } catch (error) {
    const failure = policyCraftAuthFailure(error);
    if (failure) return failure;
    throw error;
  }
  if (!access.auth) return access.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasClaudeKey()) return NextResponse.json({ error: new ClaudeKeyMissingError().message }, { status: 503 });

  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BODY_BYTES) return NextResponse.json({ error: "The document is too large to read." }, { status: 413 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const reference = parseReferenceInput((body as { referencePolicy?: unknown } | null)?.referencePolicy);
  if (!reference) return NextResponse.json({ error: "A parsed policy document is required." }, { status: 400 });

  try {
    const result = await classifyImport(reference);
    if (!result) return NextResponse.json({ error: "The document could not be classified." }, { status: 502 });
    return NextResponse.json({ classification: result.classification, unitCount: flattenUnits(reference).length });
  } catch (error) {
    console.error("Import classification failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The document could not be classified." }, { status: 502 });
  }
}
