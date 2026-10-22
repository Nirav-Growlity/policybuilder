import sharp from "sharp";

const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const MAX_LOGO_EDGE = 3000;
const SVG_TARGET_EDGE = 2000;

export class PolicyCraftOrganizationInputError extends Error {
  constructor(message: string) { super(message); this.name = "PolicyCraftOrganizationInputError"; }
}

/** SVGs render at 72 DPI by default, so small viewBoxes would rasterize blurry. Pick a density that lands near SVG_TARGET_EDGE. */
async function svgDensity(input: Buffer) {
  const { width, height } = await sharp(input).metadata();
  const edge = Math.max(width || 0, height || 0);
  if (!edge) return 72;
  return Math.min(2400, Math.max(72, Math.round(72 * SVG_TARGET_EDGE / edge)));
}

export async function readPolicyCraftOrganizationLogo(form: FormData, required: boolean) {
  const value = form.get("logo");
  if (value === null && !required) return undefined;
  if (!(value instanceof File) || !ALLOWED_MIME_TYPES.has(value.type) || value.size <= 0 || value.size > MAX_LOGO_BYTES) {
    throw new PolicyCraftOrganizationInputError("Use a PNG, JPEG, WebP or SVG logo smaller than 10 MB.");
  }
  try {
    const input = Buffer.from(await value.arrayBuffer());
    // SVGs are rasterized to PNG like every other logo, so no markup or script is ever stored or served.
    const density = value.type === "image/svg+xml" ? await svgDensity(input) : undefined;
    const processed = await sharp(input, { failOn: "error", ...(density ? { density } : {}) })
      .rotate().resize({ width: MAX_LOGO_EDGE, height: MAX_LOGO_EDGE, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const metadata = await sharp(processed).metadata();
    if (!metadata.width || !metadata.height) throw new Error("Missing image dimensions.");
    return { bytes: processed, width: metadata.width, height: metadata.height };
  } catch {
    throw new PolicyCraftOrganizationInputError("The logo could not be processed.");
  }
}
