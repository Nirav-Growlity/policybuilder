import sharp from "sharp";

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp", "svg"]);
const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const MAX_LOGO_EDGE = 3000;
const SVG_TARGET_EDGE = 2000;
const UNSUPPORTED_LOGO = "Use a PNG, JPEG, WebP or SVG logo smaller than 10 MB.";

export class PolicyCraftOrganizationInputError extends Error {
  constructor(message: string) { super(message); this.name = "PolicyCraftOrganizationInputError"; }
}

/** Duck-typed so a File from another realm or runtime still counts; `instanceof File` is not reliable across hosts. */
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && typeof (value as Blob).arrayBuffer === "function" && typeof (value as Blob).size === "number";
}

function rejectLogo(reason: string, value: unknown): never {
  const file = isUploadedFile(value as FormDataEntryValue) ? value as File : undefined;
  console.warn("[policycraft] organization logo rejected", { reason, name: file?.name, type: file?.type, size: file?.size, received: typeof value });
  throw new PolicyCraftOrganizationInputError(UNSUPPORTED_LOGO);
}

/** SVGs render at 72 DPI by default, so small viewBoxes would rasterize blurry. Pick a density that lands near SVG_TARGET_EDGE. */
function svgDensity(width = 0, height = 0) {
  const edge = Math.max(width, height);
  if (!edge) return 72;
  return Math.min(2400, Math.max(72, Math.round(72 * SVG_TARGET_EDGE / edge)));
}

export async function readPolicyCraftOrganizationLogo(form: FormData, required: boolean) {
  const value = form.get("logo");
  if (value === null && !required) return undefined;
  if (!isUploadedFile(value)) return rejectLogo("not a file", value);
  if (value.size <= 0 || value.size > MAX_LOGO_BYTES) return rejectLogo("size", value);
  const input = Buffer.from(await value.arrayBuffer());
  // The format comes from the bytes, not the browser-declared MIME type, which varies by OS and host.
  const metadata = await sharp(input).metadata().catch(() => undefined);
  if (!metadata?.format || !ALLOWED_FORMATS.has(metadata.format)) return rejectLogo(`format ${metadata?.format ?? "unknown"}`, value);
  try {
    // SVGs are rasterized to PNG like every other logo, so no markup or script is ever stored or served.
    const density = metadata.format === "svg" ? svgDensity(metadata.width, metadata.height) : undefined;
    const processed = await sharp(input, { failOn: "error", ...(density ? { density } : {}) })
      .rotate().resize({ width: MAX_LOGO_EDGE, height: MAX_LOGO_EDGE, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const output = await sharp(processed).metadata();
    if (!output.width || !output.height) throw new Error("Missing image dimensions.");
    return { bytes: processed, width: output.width, height: output.height };
  } catch (cause) {
    console.warn("[policycraft] organization logo could not be processed", { name: value.name, type: value.type, size: value.size, format: metadata.format, cause });
    throw new PolicyCraftOrganizationInputError("The logo could not be processed.");
  }
}
