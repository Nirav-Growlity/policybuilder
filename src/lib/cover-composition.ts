import type { CoverBinding, CoverComposition, CoverElement, CoverTextElement, Policy } from "./types";
import { getPolicyProfile } from "./constants";

export const COVER_WIDTH_MM = 210;
export const COVER_HEIGHT_MM = 297;
export const COVER_MAX_ELEMENTS = 40;
export const COVER_MAX_IMAGES = 12;
export const COVER_MAX_TEXT_LENGTH = 5000;
export const COVER_BINDINGS: readonly CoverBinding[] = ["policyTitle", "companyName", "documentNumber", "effectiveDate", "revision", "nextReview"];

/**
 * AI artwork can be light, dark, or mixed even when its saved design colors
 * are valid. Keep the stored editable values intact, but give every renderer a
 * consistent, high-contrast presentation for the generated-artwork variant.
 */
export function getCoverTextPresentation(element: CoverTextElement, sourceTemplateId: string) {
  if (sourceTemplateId !== "ai-generated") {
    return {
      color: element.color,
      fontSize: element.fontSize,
      bold: element.bold,
      letterSpacing: element.letterSpacing,
      textShadow: undefined as string | undefined,
    };
  }
  const id = element.id.toLowerCase();
  const isTitle = id.includes("policytitle");
  const isCompany = id.includes("companyname");
  const isLabel = id.endsWith("label");
  return {
    color: isLabel ? "#F8FAFC" : "#FFFFFF",
    fontSize: Math.max(element.fontSize, isTitle ? 32 : isCompany ? 13 : isLabel ? 8.5 : 11.5),
    bold: true,
    letterSpacing: isLabel ? Math.max(element.letterSpacing, 0.8) : element.letterSpacing,
    textShadow: "0 1px 2px rgba(0,0,0,.88), 0 0 7px rgba(0,0,0,.55)",
  };
}

export type CoverVariant = "manual" | "ai";

const HEX = /^#[0-9A-F]{6}$/i;
const DEFAULT_FONT = "Arial";

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return Math.min(max, Math.max(min, finite(value, fallback)));
}

function safeId(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : fallback;
}

function geometry(input: Partial<CoverElement>, index: number) {
  const width = clamp(input.width, 1, COVER_WIDTH_MM, 50);
  const height = clamp(input.height, 1, COVER_HEIGHT_MM, 30);
  return {
    x: clamp(input.x, 0, COVER_WIDTH_MM - width, 20),
    y: clamp(input.y, 0, COVER_HEIGHT_MM - height, 20),
    width,
    height,
    aspectLocked: typeof input.aspectLocked === "boolean" ? input.aspectLocked : input.type !== "text",
    rotation: clamp(input.rotation, -180, 180, 0),
    opacity: clamp(input.opacity, 0, 1, 1),
    zIndex: Math.round(clamp(input.zIndex, 0, 9999, index)),
    visible: input.visible !== false,
    locked: input.locked === true,
  };
}

function normalizeElement(input: unknown, index: number): CoverElement | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<CoverElement>;
  const id = safeId(candidate.id, `cover-element-${index + 1}`);
  const base = geometry(candidate, index);
  if (candidate.type === "text") {
    const content = candidate.content && typeof candidate.content === "object" ? candidate.content : { kind: "literal", text: "" };
    const normalizedContent = (content as { kind?: string; text?: unknown; binding?: unknown }).kind === "binding"
      && COVER_BINDINGS.includes((content as { binding?: CoverBinding }).binding as CoverBinding)
      ? { kind: "binding" as const, binding: (content as { binding: CoverBinding }).binding }
      : { kind: "literal" as const, text: String((content as { text?: unknown }).text ?? "").slice(0, COVER_MAX_TEXT_LENGTH) };
    return {
      ...base, id, type: "text", content: normalizedContent,
      fontFamily: typeof candidate.fontFamily === "string" && candidate.fontFamily.length <= 120 ? candidate.fontFamily : DEFAULT_FONT,
      fontSize: clamp(candidate.fontSize, 4, 96, 16),
      color: typeof candidate.color === "string" && HEX.test(candidate.color) ? candidate.color.toUpperCase() : "#1D2822",
      bold: candidate.bold === true, italic: candidate.italic === true, underline: candidate.underline === true,
      align: candidate.align === "center" || candidate.align === "right" ? candidate.align : "left",
      lineHeight: clamp(candidate.lineHeight, 0.8, 3, 1.2), letterSpacing: clamp(candidate.letterSpacing, -2, 20, 0),
    };
  }
  if (candidate.type === "image") {
    if (typeof candidate.assetId !== "string" || !candidate.assetId) return null;
    return {
      ...base, id, type: "image", assetId: candidate.assetId,
      fit: candidate.fit === "cover" ? "cover" : "contain",
      focalPoint: { x: clamp(candidate.focalPoint?.x, 0, 100, 50), y: clamp(candidate.focalPoint?.y, 0, 100, 50) },
      altText: typeof candidate.altText === "string" ? candidate.altText.slice(0, 180) : "Cover image",
    };
  }
  if (candidate.type === "logo") {
    return {
      ...base, id, type: "logo", fit: "contain",
      ...(typeof candidate.assetId === "string" && candidate.assetId ? { assetId: candidate.assetId } : {}),
      focalPoint: { x: clamp(candidate.focalPoint?.x, 0, 100, 50), y: clamp(candidate.focalPoint?.y, 0, 100, 50) },
      altText: typeof candidate.altText === "string" ? candidate.altText.slice(0, 180) : "Company logo",
    };
  }
  return null;
}

export function normalizeCoverComposition(input: unknown): CoverComposition | undefined {
  if (!input || typeof input !== "object") return undefined;
  const candidate = input as Partial<CoverComposition>;
  const sourceTemplateId = typeof candidate.sourceTemplateId === "string" ? candidate.sourceTemplateId : "custom";
  if (candidate.schemaVersion !== 1) return undefined;
  let imageCount = 0;
  const elements = Array.isArray(candidate.elements)
    ? candidate.elements.slice(0, COVER_MAX_ELEMENTS).map(normalizeElement).filter((item): item is CoverElement => {
      if (!item) return false;
      if (sourceTemplateId === "ai-generated" && item.id === "ai-cover-metadata-backdrop") return false;
      if (item.type === "image") { imageCount += 1; return imageCount <= COVER_MAX_IMAGES; }
      return true;
    })
    : [];
  const background = (candidate.background && typeof candidate.background === "object" ? candidate.background : {}) as Partial<CoverComposition["background"]>;
  return {
    schemaVersion: 1,
    sourceTemplateId,
    background: {
      color: typeof background.color === "string" && HEX.test(background.color) ? background.color.toUpperCase() : "#FFFFFF",
      ...(typeof background.assetId === "string" && background.assetId ? { assetId: background.assetId } : {}),
      fit: background.fit === "contain" ? "contain" : "cover",
      focalPoint: { x: clamp(background.focalPoint?.x, 0, 100, 50), y: clamp(background.focalPoint?.y, 0, 100, 50) },
    },
    elements: elements.sort((a, b) => a.zIndex - b.zIndex),
  };
}

export function getCoverBindingValue(policy: Policy, binding: CoverBinding): string {
  const profileLabel = getPolicyProfile(policy.policyType).label;
  switch (binding) {
    case "policyTitle": return profileLabel;
    case "companyName": return policy.company.name || "[Company Name]";
    case "documentNumber": return policy.company.docNum || "";
    case "effectiveDate": return policy.company.effectiveDate || "";
    case "revision": return policy.company.revNum || "";
    case "nextReview": return policy.company.reviewDate || "";
  }
}

export function cloneCoverComposition(composition: CoverComposition): CoverComposition {
  return structuredClone(composition);
}

export function isLegacyThemeGradientAsset(assetId?: string): boolean {
  if (!assetId?.startsWith("data:image/svg+xml;base64,")) return false;
  try {
    return atob(assetId.slice("data:image/svg+xml;base64,".length)).includes('id="page-wash"');
  } catch {
    return false;
  }
}

export function removeLegacyThemeGradient(composition: CoverComposition): CoverComposition {
  if (!isLegacyThemeGradientAsset(composition.background.assetId)) return composition;
  return normalizeCoverComposition({ ...composition, background: { ...composition.background, assetId: undefined } }) || composition;
}

export function normalizePolicyCovers(policy: Policy): Policy {
  const coverComposition = normalizeCoverComposition(policy.coverComposition);
  const aiCoverComposition = normalizeCoverComposition(policy.aiCoverComposition);
  return {
    ...policy,
    coverComposition,
    aiCoverComposition,
    activeCoverVariant: policy.activeCoverVariant === "ai" && aiCoverComposition ? "ai" : "manual",
  };
}

export function getActiveCoverVariant(policy: Pick<Policy, "activeCoverVariant" | "aiCoverComposition">): CoverVariant {
  return policy.activeCoverVariant === "ai" && normalizeCoverComposition(policy.aiCoverComposition) ? "ai" : "manual";
}

export function getActiveCoverComposition(policy: Pick<Policy, "coverComposition" | "aiCoverComposition" | "activeCoverVariant">): CoverComposition | undefined {
  return getActiveCoverVariant(policy) === "ai"
    ? normalizeCoverComposition(policy.aiCoverComposition)
    : normalizeCoverComposition(policy.coverComposition);
}

/**
 * Cover assets can be persisted as an opaque asset id or observed in the
 * browser as the authenticated asset endpoint URL. Exporters need the
 * underlying id so they can load the bytes server-side instead of passing an
 * authenticated URL to an image library.
 */
export function coverAssetIdFromReference(assetId?: string): string | undefined {
  if (!assetId || assetId.startsWith("data:")) return assetId;
  const match = assetId.match(/^\/api\/policycraft\/cover-assets\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : assetId;
}

function isExternalCoverAsset(assetId?: string): boolean {
  const normalized = coverAssetIdFromReference(assetId);
  return Boolean(normalized && !normalized.startsWith("data:") && !normalized.startsWith("/"));
}

export function hasExternalCoverAssets(policy: Policy): boolean {
  const composition = getActiveCoverComposition(policy);
  if (isExternalCoverAsset(policy.company.companyLogo)) return true;
  if (!composition) return false;
  if (isExternalCoverAsset(composition.background.assetId)) return true;
  if (composition.elements.some((element) => (element.type === "image" || element.type === "logo") && isExternalCoverAsset(element.assetId))) return true;
  return composition.elements.some((element) => element.type === "logo") && isExternalCoverAsset(policy.company.companyLogo);
}

/**
 * Local/demo exports can still render the document when a saved private asset
 * cannot be resolved because there is no session. Never turn those IDs into
 * URLs in the export copy, and never mutate the persisted policy.
 */
export function stripExternalActiveCoverAssets(policy: Policy): Policy {
  const composition = getActiveCoverComposition(policy);
  if (!composition) {
    return {
      ...policy,
      company: { ...policy.company, ...(isExternalCoverAsset(policy.company.companyLogo) ? { companyLogo: undefined } : {}) },
    };
  }
  const elements = composition.elements.filter((element) => {
    if (element.type === "image") return !isExternalCoverAsset(element.assetId);
    if (element.type === "logo") return !isExternalCoverAsset(element.assetId || policy.company.companyLogo);
    return true;
  });
  const background = isExternalCoverAsset(composition.background.assetId)
    ? { ...composition.background, assetId: undefined }
    : composition.background;
  const active = normalizeCoverComposition({ ...composition, background, elements }) || composition;
  return {
    ...policy,
    company: { ...policy.company, ...(isExternalCoverAsset(policy.company.companyLogo) ? { companyLogo: undefined } : {}) },
    ...(getActiveCoverVariant(policy) === "ai" ? { aiCoverComposition: active } : { coverComposition: active }),
  };
}
