import sharp from "sharp";
import { getCoverAsset } from "../cover-repository";
import { coverAssetIdFromReference } from "../cover-composition";
import { renderSopManual, type CompiledManual, type ManualAsset } from "../typst/engine";
import { toCoverBand } from "./cover-band";
import { coverArtSvg } from "./design/cover-art";
import { getSopDesign } from "./design/templates";
import { buildSopRenderModel, type SopRenderOptions } from "./render-model";
import type { SopRenderModel } from "./render-types";
import type { SopManual } from "./types";

type LoadedImage = { content: Buffer; mime: string };

function decodeDataUrl(value: string): LoadedImage | null {
  const match = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(value);
  return match ? { mime: match[1], content: Buffer.from(match[2], "base64") } : null;
}

async function loadImage(orgId: number, reference: string | undefined): Promise<LoadedImage | null> {
  if (!reference) return null;
  if (reference.startsWith("data:")) return decodeDataUrl(reference);
  const id = coverAssetIdFromReference(reference);
  if (!id || id.startsWith("/") || /^https?:/i.test(id)) return null;
  const asset = await getCoverAsset(orgId, id);
  return asset ? { mime: asset.mime_type, content: Buffer.from(asset.content) } : null;
}

/** Typst reads PNG, JPEG and SVG; anything else becomes PNG. Large photos are scaled for print. */
async function toTypstImage(image: LoadedImage, maxWidth: number): Promise<{ ext: string; content: Buffer }> {
  if (image.mime === "image/svg+xml") return { ext: "svg", content: image.content };
  const pipeline = sharp(image.content).resize({ width: maxWidth, withoutEnlargement: true });
  if (image.mime === "image/jpeg") return { ext: "jpg", content: await pipeline.jpeg({ quality: 88 }).toBuffer() };
  return { ext: "png", content: await pipeline.png().toBuffer() };
}

const artCache = new Map<string, Buffer>();

async function templateArt(model: SopRenderModel): Promise<Buffer> {
  const key = JSON.stringify(model.design.palette);
  let png = artCache.get(key);
  if (!png) {
    png = await sharp(Buffer.from(coverArtSvg(model.design.palette))).png().toBuffer();
    artCache.set(key, png);
    if (artCache.size > 24) artCache.delete(artCache.keys().next().value!);
  }
  return png;
}

export type PreparedSopRender = { model: SopRenderModel; assets: ManualAsset[] };

/**
 * Resolves the images a manual needs (logo, cover photo or AI cover,
 * template artwork) into workspace files and builds the render model.
 * Shared by the PDF route, the preview route and the DOCX export.
 */
export async function prepareSopRender(manual: SopManual, orgId: number, options: Omit<SopRenderOptions, "logoPath" | "coverImagePath"> = {}): Promise<PreparedSopRender> {
  const assets: ManualAsset[] = [];
  let logoPath: string | null = null;
  const logo = await loadImage(orgId, manual.company.companyLogo || undefined).catch(() => null);
  if (logo) {
    const image = await toTypstImage(logo, 800);
    logoPath = `/assets/logo.${image.ext}`;
    assets.push({ path: `assets/logo.${image.ext}`, content: image.content });
  }

  const previewOnly = Boolean(options.onlySopIds);
  const reference = previewOnly ? undefined
    : manual.cover.variant === "upload" ? manual.cover.imageUrl
    : manual.cover.variant === "ai" ? manual.cover.composition?.background.assetId : undefined;
  const cover = await loadImage(orgId, reference).catch(() => null);

  const model = buildSopRenderModel(manual, { ...options, logoPath });
  if (cover) {
    const image = await toCoverBand(cover, model.page, model.design.palette.soft);
    model.cover.image = `/assets/cover.${image.ext}`;
    assets.push({ path: `assets/cover.${image.ext}`, content: image.content });
  } else if (!previewOnly && getSopDesign(manual.theme).cover === "image-banner") {
    model.cover.image = "/assets/cover-art.png";
    assets.push({ path: "assets/cover-art.png", content: await templateArt(model) });
  }
  return { model, assets };
}

export async function renderManualPdf(manual: SopManual, orgId: number, options: Omit<SopRenderOptions, "logoPath" | "coverImagePath"> = {}): Promise<CompiledManual & { model: SopRenderModel; assets: ManualAsset[] }> {
  const prepared = await prepareSopRender(manual, orgId, options);
  return { ...renderSopManual(prepared.model, prepared.assets), ...prepared };
}
