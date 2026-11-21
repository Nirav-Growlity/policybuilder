import { NextRequest, NextResponse } from "next/server";
import { parseDocxWithImages } from "@/lib/docx/parse";
import { addSdgGoalsFromImages } from "@/lib/ai/sdg-vision";
import type { PolicyType } from "@/lib/types";
import {
  getPolicyCraftAuthResult,
  parsePolicyCraftOrganizationSelector,
  policyCraftAuthFailure,
  policyCraftMutationFailure,
} from "@/lib/policycraft-auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const mutationFailure = policyCraftMutationFailure(req, "multipart");
  if (mutationFailure) return mutationFailure;

  const selector = parsePolicyCraftOrganizationSelector(req.nextUrl.searchParams.get("orgId"));
  if (!selector.provided || !selector.valid) {
    return NextResponse.json({ error: "A valid organization is required." }, { status: 400 });
  }

  try {
    const access = await getPolicyCraftAuthResult({
      organizationId: selector.organizationId,
      documentId: req.nextUrl.searchParams.get("documentId") || undefined,
      operation: "write",
    });
    if (!access.auth) return access.response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } catch (error) {
    const failure = policyCraftAuthFailure(error);
    if (failure) return failure;
    throw error;
  }

  try {
    const fd = await req.formData();
    const file = fd.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".docx")) {
      return NextResponse.json({ error: "Only .docx files are supported" }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "The DOCX must be smaller than 15 MB" }, { status: 413 });
    }
    const arr = await file.arrayBuffer();
    const buf = Buffer.from(arr);
    const requestedType = fd.get("policyType");
    const policyType: PolicyType =
      requestedType === "labour-human-rights" || requestedType === "living-wage" || requestedType === "ethics" || requestedType === "sustainable-procurement"
        ? requestedType
        : "environmental";
    const parsed = await parseDocxWithImages(buf, { fileName: file.name, policyType });
    // Goal tiles set as pictures are read by the model; a failure leaves the goals for the user to pick.
    // Only "Load existing policy" uses the goals; attaching AI context skips the model call.
    const { reference: referencePolicy } = fd.get("readSdgImages") === "1"
      ? await addSdgGoalsFromImages(parsed.reference, parsed.sdgImages)
      : { reference: parsed.reference };
    return NextResponse.json({ referencePolicy });
  } catch (e) {
    console.error("Parse failed", e);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
