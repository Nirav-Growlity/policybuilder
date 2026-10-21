import sharp from "sharp";
import { COVER_BACKGROUND_OVERSCAN, COVER_HEIGHT_MM, COVER_WIDTH_MM } from "./cover-composition";
import { createCoverCompositionSvg } from "./cover-renderer";
import type { CoverComposition, Policy } from "./types";

const SVG_DATA_URL = /^data:image\/svg\+xml(?:;charset=[\w-]+)?(;base64)?,/i;
const MAX_ASSET_PX = 4096;

function decodeSvgDataUrl(source: string): Buffer | null {
  const match = SVG_DATA_URL.exec(source);
  if (!match) return null;
  const body = source.slice(match[0].length);
  try {
    return match[1] ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8");
  } catch {
    return null;
  }
}

/**
 * librsvg draws an SVG nested in an <image> at its user-space size (a 112 mm
 * logo box becomes ~112 px) and then scales that bitmap up, and it stretches
 * SVGs without a viewBox to fill the box. Pre-rendering each SVG asset to a PNG
 * large enough for its largest box keeps it sharp and in proportion.
 */
async function rasterizeSvgAssets(policy: Policy, composition: CoverComposition, includeElements: boolean, pxPerMm: number): Promise<Map<string, string>> {
  const boxes = new Map<string, { width: number; height: number }>();
  const need = (source: string | undefined, widthMm: number, heightMm: number) => {
    if (!source || !SVG_DATA_URL.test(source)) return;
    const current = boxes.get(source);
    boxes.set(source, { width: Math.max(current?.width ?? 0, widthMm * pxPerMm), height: Math.max(current?.height ?? 0, heightMm * pxPerMm) });
  };
  need(composition.background.assetId, COVER_WIDTH_MM * COVER_BACKGROUND_OVERSCAN, COVER_HEIGHT_MM * COVER_BACKGROUND_OVERSCAN);
  if (includeElements) {
    for (const element of composition.elements) {
      if (!element.visible || element.type === "text") continue;
      need(element.type === "logo" ? element.assetId || policy.company.companyLogo : element.assetId, element.width, element.height);
    }
  }
  const rasters = new Map<string, string>();
  await Promise.all([...boxes].map(async ([source, box]) => {
    const svg = decodeSvgDataUrl(source);
    if (!svg) return;
    try {
      const { width = 0, height = 0 } = await sharp(svg).metadata();
      if (!width || !height) return;
      // Enough pixels to fill the box on either axis, so "contain" and "cover" both stay sharp.
      const scale = Math.min(Math.max(box.width / width, box.height / height), MAX_ASSET_PX / Math.max(width, height));
      const png = await sharp(svg, { density: 72 * scale }).png().toBuffer();
      rasters.set(source, `data:image/png;base64,${png.toString("base64")}`);
    } catch {
      // An unreadable SVG keeps its original source, as before.
    }
  }));
  return rasters;
}

/** The cover composition as a print-resolution sharp pipeline (A4 at 300 dpi). */
export async function renderCoverRaster(policy: Policy, composition: CoverComposition, options: { includeElements: boolean; includeText: boolean }) {
  const width = 2480;
  const height = 3508;
  const rasters = await rasterizeSvgAssets(policy, composition, options.includeElements, width / COVER_WIDTH_MM);
  const svg = createCoverCompositionSvg(policy, composition, {
    ...options,
    width,
    height,
    resolveAsset: (source) => source?.startsWith("data:image/") ? rasters.get(source) ?? source : undefined,
  });
  return sharp(Buffer.from(svg));
}
