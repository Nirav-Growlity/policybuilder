import { DOCUMENT_THEMES, LEGACY_DOCUMENT_THEME_UPGRADES, UNIVERSAL_TEMPLATE_ALIASES, getDocumentTheme, type DocumentThemeDefinition } from "./document-themes";
import type { DocumentTemplateId } from "./types";

export type UniversalTemplateMeta = {
  id: DocumentTemplateId;
  name: string;
  description: string;
  family: string;
  universalFamily: string;
  intent: string;
  tags: readonly string[];
  imageSupport: readonly ("cover" | "section")[];
  density: string;
  previewRecipe: string;
  structuralSignature: string;
  compositionFingerprint: string;
  controlTreatment: DocumentThemeDefinition["layout"]["controlTreatment"];
  bestFor: string;
  descriptors: readonly [string, string, string];
};

export function templateMeta(t: DocumentThemeDefinition): UniversalTemplateMeta {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    family: t.family,
    universalFamily: t.universalFamily,
    intent: t.intent,
    tags: t.tags,
    imageSupport: t.imageSupport,
    density: t.defaults.density,
    previewRecipe: t.previewRecipe,
    structuralSignature: t.structuralSignature,
    compositionFingerprint: t.compositionFingerprint,
    controlTreatment: t.layout.controlTreatment,
    bestFor: t.layout.bestFor,
    descriptors: t.layout.descriptors,
  };
}

export function queryUniversalTemplates(filters: { q?: string | null; family?: string | null; intent?: string | null; imageSupport?: string | null; density?: string | null } = {}): UniversalTemplateMeta[] {
  const q = filters.q?.trim().toLocaleLowerCase() || "";
  const family = filters.family?.trim() || "";
  const intent = filters.intent?.trim() || "";
  const imageSupport = filters.imageSupport?.trim() || "";
  const density = filters.density?.trim() || "";
  return DOCUMENT_THEMES.map(templateMeta).filter((t) => {
    if (family && family !== "all" && t.family !== family && t.universalFamily !== family) return false;
    if (intent && intent !== "all" && t.intent !== intent) return false;
    if (density && density !== "all" && t.density !== density) return false;
    if (imageSupport && imageSupport !== "all") {
      if (imageSupport === "none" && t.imageSupport.length !== 0) return false;
      if (imageSupport !== "none" && !t.imageSupport.includes(imageSupport as "cover" | "section")) return false;
    }
    if (!q) return true;
    return [t.name, t.description, t.family, t.universalFamily, t.intent, t.bestFor, ...t.descriptors, ...t.tags].join(" ").toLocaleLowerCase().includes(q);
  });
}

export function getUniversalTemplate(id: string): DocumentThemeDefinition | undefined {
  if (!DOCUMENT_THEMES.some((t) => t.id === id) && !(id in LEGACY_DOCUMENT_THEME_UPGRADES) && !(id in UNIVERSAL_TEMPLATE_ALIASES)) return undefined;
  const canonical = getDocumentTheme(id);
  return DOCUMENT_THEMES.some((t) => t.id === canonical.id) ? canonical : undefined;
}

export function templateDetail(id: string) {
  const t = getUniversalTemplate(id);
  if (!t) return undefined;
  return {
    ...templateMeta(t),
    composition: t.composition,
    capabilities: {
      coverScene: t.layout.cover,
      contentsScene: t.layout.toc,
      pageZones: t.layout.pageFrame,
      sectionHeading: t.layout.sectionOpener,
      bodyGrid: t.layout.bodyGrid,
      targetTreatment: t.layout.dataLayout,
      tableTreatment: t.layout.dataLayout,
      controlTreatment: t.layout.controlTreatment,
      runningFurniture: t.layout.runningFurniture,
      approvalTreatment: t.layout.acknowledgement,
      motif: t.layout.motif,
      imageTreatment: t.layout.imageTreatment,
    },
    preview: {
      contactSheet: ["cover", "narrative", "data"],
      policyTypeSwitcher: ["environmental", "ethics", "living-wage", "labour-human-rights", "sustainable-procurement"],
    },
  };
}
