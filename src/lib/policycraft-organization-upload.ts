import sharp from "sharp";

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp", "svg"]);
const MAX_LOGO_BYTES = 10 * 1024 * 1024;
const MAX_LOGO_EDGE = 3000;
const SVG_TARGET_EDGE = 2000;
const UNSUPPORTED_LOGO = "Use a PNG, JPEG, WebP or SVG logo.";
const DATA_URL = /^data:[^;,]*(;[^,]*)?,/i;

export class PolicyCraftOrganizationInputError extends Error {
  constructor(message: string) { super(message); this.name = "PolicyCraftOrganizationInputError"; }
}

/** Duck-typed so a File from another realm or runtime still counts; `instanceof File` is not reliable across hosts. */
function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && typeof (value as Blob).arrayBuffer === "function" && typeof (value as Blob).size === "number";
}

function rejectLogo(message: string, reason: string, details: Record<string, unknown>): never {
  console.warn("[policycraft] organization logo rejected", { reason, ...details });
  throw new PolicyCraftOrganizationInputError(message);
}

/** The editor sends the logo as a data URL string, the same way the builder's company form reads it; a file part still works. */
async function logoBytes(value: FormDataEntryValue | null) {
  if (typeof value === "string") {
    const header = DATA_URL.exec(value);
    if (!header) return rejectLogo(UNSUPPORTED_LOGO, "not a data URL", { length: value.length });
    const body = value.slice(header[0].length);
    let bytes: Buffer;
    try { bytes = /;base64$/i.test(header[1] || "") ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8"); }
    catch { return rejectLogo(UNSUPPORTED_LOGO, "malformed data URL", { length: value.length }); }
    return { bytes, details: { source: "data URL", size: bytes.length } };
  }
  if (!isUploadedFile(value)) return rejectLogo(UNSUPPORTED_LOGO, "not a file", { received: typeof value });
  return { bytes: Buffer.from(await value.arrayBuffer()), details: { source: "file", name: value.name, type: value.type, size: value.size } };
}

/** SVGs render at 72 DPI by default, so small viewBoxes would rasterize blurry. Pick a density that lands near SVG_TARGET_EDGE. */
function svgDensity(width = 0, height = 0) {
  const edge = Math.max(width, height);
  if (!edge) return 72;
  return Math.min(2400, Math.max(72, Math.round(72 * SVG_TARGET_EDGE / edge)));
}

export async function readPolicyCraftOrganizationLogo(form: FormData, required: boolean) {
  const value = form.get("logo");
  if ((value === null || value === "") && !required) return undefined;
  if (value === null || value === "") return rejectLogo("Upload a company logo.", "missing", {});
  const { bytes: input, details } = await logoBytes(value);
  if (input.length <= 0) return rejectLogo("The logo file is empty.", "empty", details);
  if (input.length > MAX_LOGO_BYTES) return rejectLogo("The logo must be smaller than 10 MB.", "size", details);
  // The format comes from the bytes, not the browser-declared MIME type, which varies by OS and host.
  const metadata = await sharp(input).metadata().catch(() => undefined);
  if (!metadata?.format || !ALLOWED_FORMATS.has(metadata.format)) return rejectLogo(UNSUPPORTED_LOGO, `format ${metadata?.format ?? "unknown"}`, details);
  try {
    // SVGs are rasterized to PNG like every other logo, so no markup or script is ever stored or served.
    const density = metadata.format === "svg" ? svgDensity(metadata.width, metadata.height) : undefined;
    const processed = await sharp(input, { failOn: "error", ...(density ? { density } : {}) })
      .rotate().resize({ width: MAX_LOGO_EDGE, height: MAX_LOGO_EDGE, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const output = await sharp(processed).metadata();
    if (!output.width || !output.height) throw new Error("Missing image dimensions.");
    return { bytes: processed, width: output.width, height: output.height };
  } catch (cause) {
    console.warn("[policycraft] organization logo could not be processed", { ...details, format: metadata.format, cause });
    throw new PolicyCraftOrganizationInputError("The logo could not be processed.");
  }
}
