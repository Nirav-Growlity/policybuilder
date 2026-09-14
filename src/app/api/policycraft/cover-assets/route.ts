import { NextResponse } from "next/server";
import sharp from "sharp";
import { getPolicyCraftAuth } from "@/lib/policycraft-auth";
import { createCoverAsset } from "@/lib/cover-repository";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const auth = await getPolicyCraftAuth();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
