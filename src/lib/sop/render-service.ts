import sharp from "sharp";
import { getCoverAsset } from "../cover-repository";
import { coverAssetIdFromReference } from "../cover-composition";
import { renderSopManual, type CompiledManual, type ManualAsset } from "../typst/engine";
import { decodeDataUrl, toTypstImage, type LoadedImage } from "../typst/images";
import { toCoverBand } from "./cover-band";
import { coverArtSvg } from "./design/cover-art";
import { getSopDesign } from "./design/templates";
import { buildSopRenderModel, type SopRenderOptions } from "./render-model";
import type { SopRenderModel } from "./render-types";
import type { SopManual } from "./types";

async function loadImage(orgId: number, reference: string | undefined): Promise<LoadedImage | null> {
  if (!reference) return null;
  if (reference.startsWith("data:")) return decodeDataUrl(reference);
  const id = coverAssetIdFromReference(reference);
  if (!id || id.startsWith("/") || /^https?:/i.test(id)) return null;
  const asset = await getCoverAsset(orgId, id);
  return asset ? { mime: asset.mime_type, content: Buffer.from(asset.content) } : null;
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

/** What image resolution needs from either document kind. */
export type RenderableManual = Pick<SopManual, "company" | "cover" | "theme">;

/**
 * Resolves the images a manual needs (logo, cover photo or AI cover,
 * template artwork) into workspace files and builds the render model with
 * `build`. Shared by SOP manuals and employee handbooks, and by the PDF,
 * preview and DOCX routes.
 */
export async function prepareManualRender(
  manual: RenderableManual,
  orgId: number,
  previewOnly: boolean,
  build: (logoPath: string | null) => SopRenderModel,
): Promise<PreparedSopRender> {
  const assets: ManualAsset[] = [];
  let logoPath: string | null = null;
  const logo = await loadImage(orgId, manual.company.companyLogo || undefined).catch(() => null);
  if (logo) {
    const image = await toTypstImage(logo, 800);
    logoPath = `/assets/logo.${image.ext}`;
    assets.push({ path: `assets/logo.${image.ext}`, content: image.content });
  }

  const reference = previewOnly ? undefined
    : manual.cover.variant === "upload" ? manual.cover.imageUrl
    : manual.cover.variant === "ai" ? manual.cover.composition?.background.assetId : undefined;
  const cover = await loadImage(orgId, reference).catch(() => null);

  const model = build(logoPath);
  if (cover) {
    // Preserve the complete scene, including older portrait library artwork.
    // Both renderers contain it in the template slot instead of cropping twice.
    const image = manual.cover.variant === "ai" ? await toTypstImage(cover, 2000) : await toCoverBand(cover, model.page, model.design.palette.soft);
    model.cover.photo = manual.cover.variant === "ai";
    model.cover.image = `/assets/cover.${image.ext}`;
    assets.push({ path: `assets/cover.${image.ext}`, content: image.content });
  } else if (!previewOnly && getSopDesign(manual.theme).cover === "image-banner") {
    model.cover.image = "/assets/cover-art.png";
    assets.push({ path: "assets/cover-art.png", content: await templateArt(model) });
  }
  return { model, assets };
}

export async function prepareSopRender(manual: SopManual, orgId: number, options: Omit<SopRenderOptions, "logoPath" | "coverImagePath"> = {}): Promise<PreparedSopRender> {
  return prepareManualRender(manual, orgId, Boolean(options.onlySopIds), (logoPath) => buildSopRenderModel(manual, { ...options, logoPath }));
}

export async function renderManualPdf(manual: SopManual, orgId: number, options: Omit<SopRenderOptions, "logoPath" | "coverImagePath"> = {}): Promise<CompiledManual & { model: SopRenderModel; assets: ManualAsset[] }> {
  const prepared = await prepareSopRender(manual, orgId, options);
  return { ...renderSopManual(prepared.model, prepared.assets), ...prepared };
}
