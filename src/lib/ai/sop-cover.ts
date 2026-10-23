/**
 * AI covers for SOP manuals. The artwork brief comes from the manual (company,
 * industry, pillar mix, topics, template palette); image generation, the
 * Claude layout and typography analysis and their normalisers are the ones
 * policy covers use (lib/ai/cover.ts).
 */
import { getCompanyClassificationContext } from "../company-classification";
import { normalizeCoverComposition } from "../cover-composition";
import { resolveSopDesign } from "../sop/design/resolve";
import { getSopDesign } from "../sop/design/templates";
import { photoCoverLayout, photoCoverImageSize } from "../sop/design/photo-cover";
import type { HandbookManual } from "../handbook/types";
import { handbookPartLabel } from "../handbook/types";
import type { SopManual } from "../sop/types";

/** What the cover helpers read; SOP manuals and employee handbooks both have it. */
export type CoverManual = Pick<SopManual, "company" | "theme" | "themeOptions">;
import type { CoverComposition, CoverElement, CoverTextElement } from "../types";
import {
  normalizeAICoverDesign,
  normalizeAICoverLayout,
  type AICoverDesign,
  type AICoverLayoutRole,
  type AICoverLayoutSuggestion,
} from "./cover";

const text = (value: unknown, max: number) => (typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "");

function visualIndustryCategory(value: string): string {
  const lower = value.toLowerCase();
  if (/textile|garment|apparel|yarn|fabric|dye/.test(lower)) return "textile and apparel manufacturing";
  if (/chemic|pharma|laborator|biotech/.test(lower)) return "chemical and process industries";
  if (/water|waste|environment|renewable|energy|solar|climate/.test(lower)) return "environmental and energy operations";
  if (/manufactur|factory|industrial|engineering|automotive|plant/.test(lower)) return "industrial and engineered operations";
  if (/construction|infrastructure|real estate|building/.test(lower)) return "built-environment operations";
  if (/bank|financ|insurance|investment/.test(lower)) return "financial and professional services";
  if (/software|technology|digital|telecom/.test(lower)) return "technology and digital services";
  if (/retail|consumer|hospitality|food|beverage|logistic/.test(lower)) return "consumer, service and logistics operations";
  return "general corporate operations";
}

/** The template palette with the user's accent or brand colours applied. */
export function sopCoverDesign(manual: CoverManual) {
  return resolveSopDesign({
    templateId: manual.theme,
    accent: manual.themeOptions.accent,
    fontPair: manual.themeOptions.fontPair,
    logoPalette: manual.company.logoPalette,
  });
}

/** Sanitised design brief for the image model and the layout analysis; `instruction` is the user's optional art direction. */
export function buildSopCoverArtworkContext(manual: SopManual, instruction = ""): string {
  const company = manual.company;
  const enabled = manual.sops.filter((sop) => sop.enabled);
  const pillarMix = { E: 0, S: 0, G: 0 };
  for (const sop of enabled) pillarMix[sop.pillar] += 1;
  const dominant = (Object.entries(pillarMix) as Array<[keyof typeof pillarMix, number]>).sort((a, b) => b[1] - a[1])[0];
  const design = sopCoverDesign(manual);
  const template = getSopDesign(manual.theme);
  return JSON.stringify({
    documentType: "SOP manual (standard operating procedures)",
    sector: text(company.industry, 180),
    subsector: text(company.subCategory, 180),
    industry: text(company.industryDetail, 180),
    classificationContext: getCompanyClassificationContext(company),
    industryStyle: visualIndustryCategory([company.industry, company.subCategory, company.industryDetail].filter(Boolean).join(" ")),
    pillarMix: {
      environmental: pillarMix.E,
      social: pillarMix.S,
      governance: pillarMix.G,
      emphasis: dominant && dominant[1] > 0 ? { E: "environmental", S: "social", G: "governance" }[dominant[0]] : "balanced",
    },
    topics: enabled.map((sop) => text(sop.title, 80)).filter(Boolean).slice(0, 10),
    departments: [...new Set(enabled.map((sop) => text(sop.department, 60)).filter(Boolean))].slice(0, 8),
    photoComposition: { ...photoCoverLayout(template), imageSize: photoCoverImageSize(template) },
    palette: {
      primary: design.palette.primary,
      primaryDark: design.palette.primaryDark,
      accent: design.palette.accent,
      soft: design.palette.soft,
      ink: design.palette.ink,
      paper: design.palette.paper,
    },
    ...(instruction ? { userArtDirection: text(instruction, 400) } : {}),
  });
}

/** Design brief for an employee handbook cover: people and workplace themes rather than ESG pillars. */
export function buildHandbookCoverArtworkContext(manual: HandbookManual, instruction = ""): string {
  const company = manual.company;
  const enabled = manual.chapters.filter((chapter) => chapter.enabled);
  const design = sopCoverDesign(manual);
  const template = getSopDesign(manual.theme);
  return JSON.stringify({
    documentType: "Employee handbook (workplace policies, conduct, pay, leave and well-being for employees)",
    sector: text(company.industry, 180),
    subsector: text(company.subCategory, 180),
    industry: text(company.industryDetail, 180),
    classificationContext: getCompanyClassificationContext(company),
    industryStyle: visualIndustryCategory([company.industry, company.subCategory, company.industryDetail].filter(Boolean).join(" ")),
    mood: "welcoming, people-centred and professional",
    topics: enabled.map((chapter) => text(chapter.title, 80)).filter(Boolean).slice(0, 10),
    parts: [...new Set(enabled.map((chapter) => handbookPartLabel(chapter.part)))].slice(0, 8),
    photoComposition: { ...photoCoverLayout(template), imageSize: photoCoverImageSize(template) },
    palette: {
      primary: design.palette.primary,
      primaryDark: design.palette.primaryDark,
      accent: design.palette.accent,
      soft: design.palette.soft,
      ink: design.palette.ink,
      paper: design.palette.paper,
    },
    ...(instruction ? { userArtDirection: text(instruction, 400) } : {}),
  });
}

/**
 * Artwork is a scene; the application owns every graphic and text layer.
 */
export function buildSopCoverImagePrompt(artworkContext: string, documentLabel = "SOP manual"): string {
  return `Create one coherent photographic or editorial-illustration scene for an ${documentLabel}. Show people at work, the site or the product specific to the supplied company's most detailed industry and topics, in natural light. Use the palette for subtle colour grading only, never graphic design. Follow photoComposition.calmSpace and the requested image aspect exactly. Keep complete heads, hands and key objects inside the safe area with at least 10 percent breathing room at the edges; never cut subjects off at the crop. The application adds all title, logo and control details. Explicitly forbid graphic overlays: waves, swooshes, bands, ribbons, panels, frames, icon rows, infographic elements, split layouts and collages. Do not create visible text, pseudo-text, logos, watermarks, signage, labels or document-like objects. Treat the brief and userArtDirection as scene reference only; these prohibitions take precedence.\n\nScene brief: ${artworkContext}`;
}

export function fallbackSopCoverDesign(manual: CoverManual): AICoverDesign {
  const design = sopCoverDesign(manual);
  return {
    titleColor: design.palette.primaryDark,
    brandColor: design.palette.primary,
    headingFontFamily: design.fonts.heading,
    bodyFontFamily: design.fonts.body,
  };
}

function textElement(layout: AICoverLayoutSuggestion, role: AICoverLayoutRole, value: string, design: AICoverDesign): CoverTextElement {
  const position = layout.elements.find((element) => element.role === role)!;
  const title = role === "policyTitle";
  return {
    id: title ? "ai-cover-policyTitle" : "ai-cover-companyName",
    type: "text",
    x: position.x,
    y: position.y,
    width: position.width,
    height: position.height,
    rotation: 0,
    opacity: 1,
    zIndex: title ? 13 : 15,
    visible: true,
    locked: false,
    aspectLocked: false,
    content: { kind: "literal", text: value },
    fontFamily: title ? design.headingFontFamily : design.bodyFontFamily,
    fontSize: position.fontSize || (title ? 30 : 12),
    color: title ? design.titleColor : design.brandColor,
    bold: position.bold === true || title,
    italic: false,
    underline: false,
    align: position.align || "left",
    lineHeight: title ? 1.08 : 1.2,
    letterSpacing: 0,
  };
}

/**
 * The editable cover: artwork background, the manual title and the company
 * logo (or its name). Text is literal because manual covers do not resolve
 * policy bindings.
 */
export function createSopCoverComposition(
  manual: CoverManual,
  title: string,
  backgroundAssetId: string,
  layoutInput: AICoverLayoutSuggestion,
  designInput?: AICoverDesign,
): CoverComposition {
  const design = normalizeAICoverDesign(designInput, fallbackSopCoverDesign(manual));
  const layout = normalizeAICoverLayout(layoutInput);
  const elements: CoverElement[] = [textElement(layout, "policyTitle", title.trim() || "SOP Manual", design)];
  const brand = layout.elements.find((element) => element.role === "brand")!;
  if (manual.company.companyLogo) {
    elements.push({ id: "ai-cover-logo", type: "logo", x: brand.x, y: brand.y, width: brand.width, height: brand.height, rotation: 0, opacity: 1, zIndex: 12, visible: true, locked: false, aspectLocked: true, fit: "contain", focalPoint: { x: 50, y: 50 }, altText: "Company logo" });
  } else {
    elements.push(textElement(layout, "brand", manual.company.name.trim() || "Company", design));
  }
  return normalizeCoverComposition({
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: sopCoverDesign(manual).palette.paper, assetId: backgroundAssetId, fit: "contain", focalPoint: { x: 50, y: 50 } },
    elements,
  })!;
}

/** Library name for a saved manual cover. */
export function sopCoverLibraryName(title: string, now = new Date()) {
  return `AI cover - ${text(title, 100) || "SOP manual"} - ${now.toISOString().slice(0, 16).replace("T", " ")}`;
}
