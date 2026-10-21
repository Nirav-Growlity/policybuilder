import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getCoverBindingValue } from "../../cover-composition";
import { resolveCoverTextLayout } from "../../cover-renderer";
import { renderCoverRaster } from "../../cover-raster";
import { getPolicyProfile } from "../../constants";
import { runningLogoFit, tableLabelAlignment } from "../../document-themes";
import { buildDocumentRenderModel, getRunningHeaderBrand, type AuthorApprovalRenderData, type DocumentRenderModel, type DocumentRenderSection } from "../../document-render-model";
import { typesetProse } from "../../hyphenation";
import { listMarkerText } from "../../list-formatting";
import { pageBorderContentInsetMm, pageFooterVerticalShiftMm, pageHeaderLogoTopMm, pageHeaderMarginMm, pageMarginMm } from "../../page-geometry";
import { formatQuantitativeTargetSentence, groupQuantitativeTargets } from "../../quantitative";
import type { CoverTextElement, ListMarkerStyle, Policy, RichTextBlock, ThemeBackground } from "../../types";
import type { ManualAsset } from "../compile";
import { fontLineMetrics, typstFontFamily } from "../fonts";
import { TYPST_OPTICAL_SIZES } from "../typst-font-set";
import { decodeDataUrl, toTypstImage, type LoadedImage } from "../images";

// The JSON lib/typst/policy/policy.typ reads from /model.json. Every layout
// decision the HTML preview makes from the policy (which treatment, which
// marker, which sentence) is made here, so the template only lays things out.
// Optional values are null rather than missing: Typst errors on absent keys.
// Lengths are millimetres, type sizes points.

type Marker = ListMarkerStyle;
type Table = { headers: string[]; rows: string[][] };

export type TypstSectionContent =
  | { type: "narrative"; paragraphs: string[]; sites: Table | null }
  | { type: "focus"; items: { marker: string; text: string }[] }
  | { type: "qualitative"; itemMarker: Marker; groups: { marker: string; area: string; items: string[] }[] }
  | { type: "quantitative"; treatment: "table" | "bands" | "journal" | "modern"; itemMarker: Marker; indexHeader: string; groups: { marker: string; area: string; targets: string[] }[] }
  | { type: "sdg"; display: "tiles" | "names"; mosaic: boolean; goals: { number: number; label: string; color: string; icon: string | null }[] }
  | { type: "responsibilities"; treatment: "table" | "list"; entries: { marker: string; role: string; duty: string }[] }
  | { type: "table"; table: Table }
  | { type: "custom"; blocks: ({ type: "p"; paragraphs: string[] } | { type: "ul" | "ol"; items: string[] } | { type: "table"; table: Table })[] };

export type TypstSection = Pick<DocumentRenderSection, "id" | "kind" | "title" | "density" | "recipe"> & { marker: string; content: TypstSectionContent };

export type TypstCoverText = {
  x: number; y: number; width: number; height: number; rotation: number; opacity: number;
  lines: string[]; font: string; size: number; color: string; bold: boolean; italic: boolean; underline: boolean;
  align: CoverTextElement["align"]; lineHeight: number; letterSpacing: number;
  /** AI covers draw a thin dark outline behind light titles, as the Word export does. */
  outline: boolean;
};

/** A logo, or the company name set in the same box (runningLogoFit). */
type Brand = { kind: "logo"; image: string; widthMm: number; heightMm: number } | { kind: "name"; text: string; widthMm: number };

export type PolicyTypstModel = {
  meta: { title: string; author: string };
  /** Ascent and descent (em) per family, so the template builds CSS-sized line boxes. */
  fonts: Record<string, { ascent: number; descent: number }>;
  /**
   * Chromium sets a variable font's opsz axis to the CSS px size. For those
   * families, CSS weight -> the px sizes with a "<family> Opsz <size>" instance;
   * the template draws each text with the nearest one for its weight.
   */
  opticalSizes: Record<string, Record<string, number[]>>;
  page: {
    widthMm: number; heightMm: number; marginTopMm: number; marginXMm: number; marginBottomMm: number;
    background: ThemeBackground;
    border: { enabled: boolean; widthPt: number; insetMm: number; color: string; scope: "all" | "all-except-cover" | "cover" };
  };
  /** Running header from page 2. It is never drawn on the cover. */
  header: { brand: Brand; position: "left" | "center" | "right"; logoTopMm: number; insetMm: number };
  footer: { documentNumber: string; reviewDate: string; insetMm: number; heightMm: number; shiftMm: number };
  theme: {
    id: string;
    variant: string;
    layout: Pick<DocumentRenderModel["theme"]["layout"], "toc" | "pageFrame" | "sectionOpener" | "dataLayout" | "acknowledgement" | "imageTreatment">;
    colors: DocumentRenderModel["theme"]["colors"];
    densityFactor: number;
    alignment: DocumentRenderModel["theme"]["textAlignment"];
    tableLabelAlignment: DocumentRenderModel["theme"]["textAlignment"];
  };
  typography: { body: string; heading: string; headingSize: number; subheadingSize: number; paragraphSize: number; lineSpacing: number };
  cover:
    | { kind: "standard"; brand: Brand; title: string; feature: { image: string; focal: { x: number; y: number }; treatment: string } | null }
    | {
      kind: "composition"; image: string; texts: TypstCoverText[];
      /** Text outlines drawn as vector shapes under the text; render.ts fills this in with a first Typst pass. */
      outline: { image: string; widthPt: number; heightPt: number } | null;
    };
  toc: { marker: Marker; entries: { id: string; marker: string; title: string }[] } | null;
  sectionFeature: { image: string; focal: { x: number; y: number } } | null;
  sections: TypstSection[];
  acknowledgement: { title: string; statement: string; fields: { label: string; value: string | null }[]; signature: string | null } | null;
};

export type PreparedPolicyRender = { model: PolicyTypstModel; assets: ManualAsset[] };

const publicDir = () => path.resolve(process.cwd(), "public");
const PUBLIC_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp" };

/** Data URLs and files under public/ (template art, SDG icons). Anything else is not drawn. */
async function loadImage(reference: string | undefined): Promise<LoadedImage | null> {
  if (!reference) return null;
  if (reference.startsWith("data:")) return decodeDataUrl(reference);
  if (!reference.startsWith("/") || reference.startsWith("//") || reference.startsWith("/api/")) return null;
  const file = path.resolve(publicDir(), decodeURIComponent(reference.slice(1).split("?")[0]));
  if (!file.startsWith(publicDir() + path.sep)) return null;
  const mime = PUBLIC_MIME[path.extname(file).toLowerCase()];
  if (!mime) return null;
  return readFile(file).then((content) => ({ content, mime }), () => null);
}

const sdgIconCache = new Map<number, Promise<Buffer | null>>();
function sdgIcon(goal: number): Promise<Buffer | null> {
  let icon = sdgIconCache.get(goal);
  if (!icon) {
    const file = path.join(publicDir(), "E SDG Icons WEB", `E-WEB-Goal-${String(goal).padStart(2, "0")}.png`);
    icon = readFile(file).then((content) => sharp(content).resize({ width: 400, withoutEnlargement: true }).png().toBuffer(), () => null);
    sdgIconCache.set(goal, icon);
  }
  return icon;
}

// Logos and feature photos rarely change between live-preview edits, but
// re-encoding them costs 10-100 ms each, so the prepared bytes are kept by
// source hash and settings. The author signature never goes through here.
const preparedImages = new Map<string, Promise<unknown>>();
function preparedImage<T>(content: Buffer, settings: unknown, prepare: () => Promise<T>): Promise<T> {
  const key = createHash("sha1").update(content).update(JSON.stringify(settings)).digest("hex");
  let prepared = preparedImages.get(key) as Promise<T> | undefined;
  if (!prepared) {
    prepared = prepare();
    prepared.catch(() => preparedImages.delete(key));
    preparedImages.set(key, prepared);
    while (preparedImages.size > 16) preparedImages.delete(preparedImages.keys().next().value!);
  } else {
    preparedImages.delete(key);
    preparedImages.set(key, prepared);
  }
  return prepared;
}

// The cover raster depends only on the composition and the logo, so palette,
// border or typography edits never redraw it.
const coverCache = new Map<string, Promise<Buffer>>();
function coverRaster(policy: Policy, composition: NonNullable<DocumentRenderModel["cover"]["composition"]>): Promise<Buffer> {
  const key = createHash("sha1").update(JSON.stringify([composition, policy.company.companyLogo || ""])).digest("hex");
  let raster = coverCache.get(key);
  if (!raster) {
    // The page is opaque, so JPEG keeps a photo cover small without visible loss at print size.
    raster = renderCoverRaster(policy, composition, { includeElements: true, includeText: false }).then((cover) => cover.jpeg({ quality: 90 }).toBuffer());
    raster.catch(() => coverCache.delete(key));
    coverCache.set(key, raster);
    while (coverCache.size > 8) coverCache.delete(coverCache.keys().next().value!);
  }
  return raster;
}

// The simplified cover's feature figure: full content width, 52 mm tall, the
// photo cropped around its focal point, desaturated and faded into the paper
// colour from the left, as the HTML cover draws it with CSS filters.
const COVER_FEATURE_MM = { width: 210 - 2 * 22 - 2 * 12.7, height: 52 };
const FEATURE_OPACITY: Record<string, number> = { "full-bleed-cover": 0.42, "section-led": 0.17 };
async function coverFeatureImage(image: LoadedImage, focal: { x: number; y: number }, paper: string, treatment: string): Promise<Buffer> {
  const width = Math.round(COVER_FEATURE_MM.width / 25.4 * 300);
  const height = Math.round(COVER_FEATURE_MM.height / 25.4 * 300);
  const source = sharp(image.content);
  const { width: sourceWidth = 1, height: sourceHeight = 1 } = await source.metadata();
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const scaledWidth = Math.max(width, Math.round(sourceWidth * scale));
  const scaledHeight = Math.max(height, Math.round(sourceHeight * scale));
  const left = Math.round((scaledWidth - width) * Math.min(100, Math.max(0, focal.x)) / 100);
  const top = Math.round((scaledHeight - height) * Math.min(100, Math.max(0, focal.y)) / 100);
  const rgba = await sharp(image.content).resize(scaledWidth, scaledHeight, { fit: "fill", kernel: "cubic" }).extract({ left, top, width, height })
    .modulate({ saturation: 0.72 }).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const opacity = FEATURE_OPACITY[treatment] ?? 0.22;
  for (let index = 3; index < rgba.data.length; index += 4) rgba.data[index] = Math.round(rgba.data[index] * opacity);
  const photo = await sharp(rgba.data, { raw: rgba.info }).png().toBuffer();
  const fade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><linearGradient id="f" x1="0" x2="1" y1="0" y2="0"><stop offset=".1" stop-color="${paper}"/><stop offset=".54" stop-color="${paper}" stop-opacity=".58"/><stop offset="1" stop-color="${paper}" stop-opacity="0"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#f)"/></svg>`);
  return sharp({ create: { width, height, channels: 3, background: paper } })
    .composite([{ input: photo }, { input: fade }])
    .png()
    .toBuffer();
}

const paragraphs = (text: string) => text.split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
const table = (headers: string[], rows: string[][]): Table => ({ headers, rows: rows.map((row) => headers.map((_, index) => row[index] || "")) });

function sectionContent(section: DocumentRenderSection, model: DocumentRenderModel, policy: Policy, icons: Map<number, string>): TypstSectionContent {
  const { content } = section;
  const lists = model.listFormatting;
  const modern = model.dataTreatment === "clean-bullets";
  switch (content.type) {
    case "narrative":
      return {
        type: "narrative",
        paragraphs: paragraphs(content.text),
        sites: content.sites?.length
          ? table(["Location / Unit", "Address", "Primary Function"], content.sites.map((site, index) => [site.location || `Site ${index + 1}`, site.address, site.primaryFunction || "Operating Site"]))
          : null,
      };
    case "focus":
      // The HTML preview prints an area's extra lines inline, as one run of text.
      return { type: "focus", items: content.areas.map((area, index) => ({ marker: listMarkerText(lists.focusAreas, index + 1), text: area.replace(/\s*\n+\s*/g, " ") })) };
    case "qualitative":
      return { type: "qualitative", itemMarker: lists.qualitativeItems, groups: content.groups.map((group, index) => ({ marker: listMarkerText(lists.qualitativeGroups, index + 1), area: group.area, items: group.items })) };
    case "quantitative": {
      const layout = model.theme.layout.dataLayout;
      const treatment = !modern ? "table"
        : layout === "target-bands" && section.density !== "dense" ? "bands"
        : layout === "quiet-rules" && section.density !== "dense" ? "journal"
        : "modern";
      return {
        type: "quantitative",
        treatment,
        itemMarker: lists.quantitativeItems,
        indexHeader: lists.quantitativeGroups === "bullet" ? "•" : "Sr No.",
        groups: groupQuantitativeTargets(content.areas).map((group, index) => ({
          marker: listMarkerText(lists.quantitativeGroups, index + 1),
          area: group.area,
          targets: group.targets.map((target) => typesetProse(formatQuantitativeTargetSentence(target), model.theme.textAlignment)),
        })),
      };
    }
    case "sdg":
      return {
        type: "sdg",
        display: policy.sdgDisplay === "tiles" ? "tiles" : "names",
        mosaic: model.theme.layout.dataLayout === "target-bands",
        goals: content.goals.map((goal) => ({ ...goal, icon: icons.get(goal.number) ?? null })),
      };
    case "responsibilities":
      return {
        type: "responsibilities",
        treatment: model.dataTreatment === "formal-tables" ? "table" : "list",
        entries: content.entries.map((entry, index) => ({ marker: listMarkerText(lists.responsibilities, index + 1), role: entry.role, duty: entry.duty })),
      };
    case "revision":
      return { type: "table", table: table(["Revision No.", "Date", "Description of Change"], content.entries.map((entry) => [entry.revisionNo, entry.date, entry.description])) };
    case "custom":
      return { type: "custom", blocks: content.blocks.map(customBlock) };
  }
}

function customBlock(block: RichTextBlock): Extract<TypstSectionContent, { type: "custom" }>["blocks"][number] {
  if (block.type === "paragraph") return { type: "p", paragraphs: paragraphs(block.text) };
  if (block.type === "table") return { type: "table", table: table(block.columns || [], block.rows || []) };
  return { type: block.type === "bullets" ? "ul" : "ol", items: paragraphs(block.text) };
}

/** Chromium sizes line boxes from the OS/2 typo metrics when a font asks for them, else from the Windows metrics. */
function cssLineMetrics(family: string) {
  const metrics = fontLineMetrics(family);
  return metrics.useTypo ? { ascent: metrics.typoAscent, descent: metrics.typoDescent } : { ascent: metrics.winAscent, descent: metrics.winDescent };
}

/** Running header and footer furniture print in Arial, which Typst draws with its stand-in. */
export const FURNITURE_FONT = "Arimo";

/**
 * Chromium breaks a line after a hyphen between digits ("FY 2030-" / "31"),
 * where Typst follows UAX #14 and keeps "2030-31" whole, which rewraps narrow
 * justified columns. A zero-width space after the hyphen allows that break in
 * every font (most have no U+2010 HYPHEN); render.ts keeps it out of the text layer.
 */
function breakableNumberHyphens<T>(value: T): T {
  if (typeof value === "string") return value.replace(/(?<=\d)-(?=\d)/g, "-\u200b") as T;
  if (Array.isArray(value)) return value.map(breakableNumberHyphens) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, breakableNumberHyphens(item)])) as T;
  return value;
}

/**
 * Builds the Typst model and the workspace files it references (logo, cover,
 * feature image, SDG icons, signature). Expects the export payload, where
 * private cover assets are already data URLs (see resolveCoverAssets).
 * The signature is never cached: it only lives in the returned assets.
 */
export async function preparePolicyTypstRender(policy: Policy, authorApproval?: AuthorApprovalRenderData): Promise<PreparedPolicyRender> {
  const model = buildDocumentRenderModel(policy, authorApproval);
  const { theme, typography } = model;
  const assets: ManualAsset[] = [];
  const addImage = async (name: string, image: LoadedImage | null, maxWidth: number) => {
    if (!image) return null;
    const convert = () => toTypstImage(image, maxWidth);
    const converted = await (name === "signature" ? convert() : preparedImage(image.content, [image.mime, maxWidth], convert)).catch(() => null);
    if (!converted) return null;
    assets.push({ path: `assets/${name}.${converted.ext}`, content: converted.content });
    return `/assets/${name}.${converted.ext}`;
  };
  const addBuffer = (name: string, content: Buffer) => {
    assets.push({ path: `assets/${name}`, content });
    return `/assets/${name}`;
  };

  const bodyFont = typstFontFamily(typography.fontFamily, typstFontFamily(theme.defaults.typography.fontFamily, "Source Sans 3"));
  const headingFont = typstFontFamily(typography.headingFontFamily || typography.fontFamily, bodyFont);

  // Page geometry mirrors lib/pdf/print-document.tsx.
  const logoFit = runningLogoFit(theme.logoScale);
  const brandSource = getRunningHeaderBrand(policy.company);
  const logo = brandSource.kind === "logo" ? await addImage("logo", await loadImage(brandSource.source), 800) : null;
  const brand: Brand = logo
    ? { kind: "logo", image: logo, widthMm: logoFit.widthMm, heightMm: logoFit.heightMm }
    : { kind: "name", text: brandSource.kind === "name" ? brandSource.text : policy.company.name || "[Company Name]", widthMm: logoFit.widthMm };
  const marginXMm = pageMarginMm(theme.pageBorder);
  const marginTopMm = logo ? pageHeaderMarginMm(theme.pageBorder, logoFit.heightMm) : marginXMm;
  const insetMm = pageBorderContentInsetMm(theme.pageBorder);

  let cover: PolicyTypstModel["cover"];
  const composition = model.cover.composition;
  if (composition) {
    const image = addBuffer("cover.jpg", await coverRaster(policy, composition));
    const texts = composition.elements
      .filter((element): element is CoverTextElement => element.type === "text" && element.visible)
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((element) => {
        const value = element.content.kind === "binding" ? getCoverBindingValue(policy, element.content.binding) : element.content.text;
        const layout = resolveCoverTextLayout(value, element, composition.sourceTemplateId);
        return {
          x: element.x, y: element.y, width: element.width, height: element.height, rotation: element.rotation, opacity: element.opacity,
          lines: layout.lines, font: typstFontFamily(layout.presentation.fontFamily, bodyFont), size: layout.presentation.fontSize,
          color: layout.presentation.color, bold: layout.presentation.bold, italic: element.italic, underline: element.underline,
          align: element.align, lineHeight: element.lineHeight, letterSpacing: layout.presentation.letterSpacing,
          outline: Boolean(layout.presentation.textShadow),
        };
      });
    cover = { kind: "composition", image, texts, outline: null };
  } else {
    const featureSource = model.featureImage?.placement === "cover" ? await loadImage(model.featureImage.dataUrl) : null;
    const feature = featureSource && model.featureImage
      ? addBuffer("cover-feature.png", await preparedImage(featureSource.content, [model.featureImage.focalPosition, theme.colors.paper, theme.layout.imageTreatment],
        () => coverFeatureImage(featureSource, model.featureImage!.focalPosition, theme.colors.paper, theme.layout.imageTreatment)))
      : null;
    cover = {
      kind: "standard",
      brand,
      title: model.cover.policyLabel,
      feature: feature && model.featureImage ? { image: feature, focal: model.featureImage.focalPosition, treatment: theme.layout.imageTreatment } : null,
    };
  }

  const sectionFeatureImage = model.featureImage?.placement === "section" ? await addImage("section-feature", await loadImage(model.featureImage.dataUrl), 2000) : null;

  const icons = new Map<number, string>();
  if (policy.sdgDisplay === "tiles") {
    for (const section of model.sections) {
      if (section.content.type !== "sdg") continue;
      for (const goal of section.content.goals) {
        if (icons.has(goal.number)) continue;
        const icon = await sdgIcon(goal.number);
        if (icon) icons.set(goal.number, addBuffer(`sdg-${String(goal.number).padStart(2, "0")}.png`, icon));
      }
    }
  }

  const acknowledgement = model.acknowledgement;
  const signature = acknowledgement?.authorApproval ? await addImage("signature", decodeDataUrl(acknowledgement.authorApproval.signatureDataUrl), 600) : null;
  const tocEntries = acknowledgement
    ? [...model.tocEntries, { id: "acknowledgement", index: model.tocEntries.length + 1, title: acknowledgement.title }]
    : model.tocEntries;

  const families = new Set([bodyFont, headingFont, FURNITURE_FONT, ...(cover.kind === "composition" ? cover.texts.map((text) => text.font) : [])]);

  return {
    assets,
    // Prose keeps typesetProse's soft hyphens: the template breaks words only
    // there, as Chromium does (render.ts keeps them out of the text layer).
    model: {
      meta: { title: getPolicyProfile(policy.policyType).label, author: policy.company.name || "" },
      fonts: Object.fromEntries([...families].map((family) => [family, cssLineMetrics(family)])),
      opticalSizes: Object.fromEntries([...families].flatMap((family) => TYPST_OPTICAL_SIZES[family] ? [[family, TYPST_OPTICAL_SIZES[family]]] : [])),
      page: {
        widthMm: 210, heightMm: 297, marginTopMm, marginXMm, marginBottomMm: marginXMm,
        background: theme.background,
        border: { enabled: theme.pageBorder.enabled, widthPt: theme.pageBorder.widthPt, insetMm: theme.pageBorder.insetMm, color: theme.pageBorder.color || theme.colors.primary, scope: theme.pageBorder.scope },
      },
      header: { brand, position: policy.logoPosition || theme.defaults.logoPosition, logoTopMm: pageHeaderLogoTopMm(theme.pageBorder), insetMm },
      footer: {
        documentNumber: model.footer.documentNumber,
        reviewDate: model.footer.reviewDate,
        insetMm,
        heightMm: theme.pageBorder.enabled ? Math.max(10, insetMm - 2) : 10,
        shiftMm: pageFooterVerticalShiftMm(theme.pageBorder),
      },
      theme: {
        id: theme.id,
        variant: theme.layout.professionalVariant || "corporate",
        layout: {
          toc: theme.layout.toc, pageFrame: theme.layout.pageFrame, sectionOpener: theme.layout.sectionOpener,
          dataLayout: theme.layout.dataLayout, acknowledgement: theme.layout.acknowledgement, imageTreatment: theme.layout.imageTreatment,
        },
        colors: theme.colors,
        densityFactor: theme.density === "compact" ? 0.82 : theme.density === "spacious" ? 1.18 : 1,
        alignment: theme.textAlignment,
        tableLabelAlignment: tableLabelAlignment(theme.textAlignment),
      },
      typography: {
        body: bodyFont, heading: headingFont,
        headingSize: typography.headingSize, subheadingSize: typography.subheadingSize, paragraphSize: typography.paragraphSize, lineSpacing: typography.lineSpacing,
      },
      cover,
      toc: policy.showTableOfContents
        ? { marker: model.listFormatting.outline, entries: tocEntries.map((entry) => ({ id: entry.id, marker: listMarkerText(model.listFormatting.outline, entry.index), title: entry.title })) }
        : null,
      sectionFeature: sectionFeatureImage && model.featureImage ? { image: sectionFeatureImage, focal: model.featureImage.focalPosition } : null,
      sections: model.sections.map((section) => ({
        id: section.id, kind: section.kind, title: breakableNumberHyphens(section.title), density: section.density, recipe: section.recipe,
        marker: listMarkerText(model.listFormatting.outline, section.index),
        content: breakableNumberHyphens(sectionContent(section, model, policy, icons)),
      })),
      acknowledgement: acknowledgement
        ? { title: acknowledgement.title, statement: acknowledgement.statement, fields: acknowledgement.fields.map((field) => ({ label: field.label, value: field.value ?? null })), signature }
        : null,
    },
  };
}
