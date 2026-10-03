import { NextResponse } from "next/server";
import sharp from "sharp";
import { getPolicyCraftAuthResult, parsePolicyCraftOrganizationSelector, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { createCoverAsset } from "@/lib/cover-repository";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const invalid = policyCraftMutationFailure(request, "multipart");
  if (invalid) return invalid;
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) return NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 });
  const { auth, response } = await getPolicyCraftAuthResult({ ...(selector.provided ? { organizationId: selector.organizationId } : {}), operation: "write" });
  if (!auth) return response || NextResponse.json({ error: "Organization access denied." }, { status: 403 });
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !ALLOWED.has(file.type) || file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "Use a PNG, JPEG, or WebP image smaller than 10 MB." }, { status: 400 });
  try {
    const processed = await sharp(Buffer.from(await file.arrayBuffer())).rotate().resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const metadata = await sharp(processed).metadata();
    const asset = await createCoverAsset(auth, processed, "image/png", metadata.width || 1, metadata.height || 1);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    console.error("Cover asset processing failed", error);
    return NextResponse.json({ error: "The image could not be processed." }, { status: 400 });
  }
}
