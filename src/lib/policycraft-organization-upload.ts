import sharp from "sharp";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_LOGO_BYTES = 10 * 1024 * 1024;

export class PolicyCraftOrganizationInputError extends Error {
  constructor(message: string) { super(message); this.name = "PolicyCraftOrganizationInputError"; }
}

export async function readPolicyCraftOrganizationLogo(form: FormData, required: boolean) {
  const value = form.get("logo");
  if (value === null && !required) return undefined;
  if (!(value instanceof File) || !ALLOWED_MIME_TYPES.has(value.type) || value.size <= 0 || value.size > MAX_LOGO_BYTES) {
    throw new PolicyCraftOrganizationInputError("Use a PNG, JPEG, or WebP logo smaller than 10 MB.");
  }
  try {
    const processed = await sharp(Buffer.from(await value.arrayBuffer()), { failOn: "error" })
      .rotate().resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const metadata = await sharp(processed).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Missing image dimensions.");
    return { bytes: processed, width: metadata.width, height: metadata.height };
  } catch {
    throw new PolicyCraftOrganizationInputError("The logo could not be processed.");
  }
}
