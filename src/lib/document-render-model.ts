import { SDG_DATA, getPolicyProfile } from "./constants";
import { getPolicyDocumentTheme, getResolvedTypography, type DocumentSectionRecipe } from "./document-themes";
import { getEnabledSections, sectionHasContent } from "./sections";
import { getCompanySites, type CoverComposition, type CoverElement, type CoverTextElement, type Policy, type PolicyFeatureImage, type PolicySection, type RichTextBlock } from "./types";
import { getActiveCoverComposition, getActiveCoverVariant, removeLegacyThemeGradient } from "./cover-composition";
import { groupQuantitativeTargets } from "./quantitative";
import { visibleQualitativeEntries, visibleQuantitativeAreas } from "./focus-area-catalog";
import { resolveRevisionHistory } from "./revision-history";
import { resolvePolicyListFormatting } from "./list-formatting";

export type ContentDensity = "short" | "regular" | "dense";
export type DataTreatment = "formal-tables" | "clean-bullets";

export type RunningHeaderBrand =
  | { kind: "logo"; source: string }
  | { kind: "name"; text: string };

export function getRunningHeaderBrand(company: Pick<Policy["company"], "name" | "companyLogo">): RunningHeaderBrand {
  const logo = company.companyLogo?.trim();
  return logo
    ? { kind: "logo", source: logo }
    : { kind: "name", text: company.name || "[Company Name]" };
}

function coverTextLayer(
  id: string,
  binding: "companyName" | "policyTitle",
  geometry: Pick<CoverTextElement, "x" | "y" | "width" | "height">,
  typography: ReturnType<typeof getResolvedTypography>,
  color: string,
): CoverTextElement {
  const title = binding === "policyTitle";
  return {
    id,
    type: "text",
    ...geometry,
    rotation: 0,
    opacity: 1,
    zIndex: title ? 100 : 99,
    visible: true,
    locked: false,
    aspectLocked: false,
    content: { kind: "binding", binding },
    fontFamily: title ? typography.headingFontFamily || typography.fontFamily : typography.fontFamily,
    fontSize: title ? 32 : 12,
    color,
    bold: title,
    italic: false,
    underline: false,
    align: "left",
    lineHeight: title ? 1.08 : 1.2,
    letterSpacing: 0,
  };
}

/** Returns a display-only cover projection; the persisted composition stays unchanged. */
function projectCoverComposition(composition: CoverComposition, policy: Policy, typography: ReturnType<typeof getResolvedTypography>, theme: ReturnType<typeof getPolicyDocumentTheme>): CoverComposition {
  const visible = composition.elements.filter((element) => element.visible);
  const textLayers = visible.filter((element): element is CoverTextElement => element.type === "text");
  const logoLayers = visible.filter((element) => element.type === "logo");
  const isMetadataFurniture = (element: CoverElement) => element.type === "image"
    && /metadata[-_ ]?(?:rule|divider|backdrop)|document[-_ ]?control/i.test(`${element.id} ${element.altText}`);
  const artwork = visible.filter((element) => element.type !== "text" && element.type !== "logo" && !isMetadataFurniture(element));

  const titleSource = textLayers.find((element) => element.content.kind === "binding" && element.content.binding === "policyTitle")
    || textLayers.find((element) => /title/i.test(element.id));
  const title = titleSource
    ? { ...titleSource, content: { kind: "binding" as const, binding: "policyTitle" as const } }
    : coverTextLayer("policy-title", "policyTitle", { x: 24, y: 78, width: 162, height: 64 }, typography, theme.colors.primaryDark);

  const companySource = textLayers.find((element) => element.content.kind === "binding" && element.content.binding === "companyName")
    || textLayers.find((element) => /company|brand/i.test(element.id));
  const logoSource = logoLayers.find((element) => element.assetId || policy.company.companyLogo);
  const hasLogo = Boolean(policy.company.companyLogo || logoSource?.assetId);
  let brand: CoverElement;
  if (hasLogo) {
    const source = logoSource || companySource;
    brand = source && source.type === "logo"
      ? { ...source, assetId: policy.company.companyLogo || source.assetId }
      : {
          id: "company-logo",
          type: "logo",
          x: source?.x ?? 24,
          y: source?.y ?? 24,
          width: source?.width ?? 80,
          height: Math.max(24, source?.height ?? 24),
          rotation: source?.rotation ?? 0,
          opacity: source?.opacity ?? 1,
          zIndex: 99,
          visible: true,
          locked: false,
          aspectLocked: true,
          fit: "contain",
          focalPoint: { x: 50, y: 50 },
          altText: "Company logo",
        };
  } else {
    const nameGeometry = companySource;
    brand = companySource
      ? { ...companySource, content: { kind: "binding" as const, binding: "companyName" as const } }
      : coverTextLayer("company-name", "companyName", {
          x: 24,
          y: 24,
          width: 162,
          height: 18,
        }, typography, theme.colors.muted);
    if (nameGeometry && brand.type === "text") {
      brand = { ...brand, x: nameGeometry.x, y: nameGeometry.y, width: nameGeometry.width, height: Math.max(18, nameGeometry.height) };
    }
  }

  const titleTop = Math.min(233, Math.max(title.y, brand.y + brand.height + 10));
  const overlayZ = Math.max(99, ...artwork.map((element) => element.zIndex + 1));
  const projectedTitle = { ...title, y: titleTop, zIndex: overlayZ + 1 };
  const projectedBrand = { ...brand, zIndex: overlayZ };
  return { ...composition, elements: [...artwork, projectedBrand, projectedTitle].sort((left, right) => left.zIndex - right.zIndex) };
}

export type DocumentSectionContent =
  | { type: "narrative"; text: string; sites?: ReturnType<typeof getCompanySites> }
  | { type: "focus"; areas: string[] }
  | { type: "qualitative"; groups: { area: string; items: string[] }[] }
  | { type: "quantitative"; areas: Policy["quantitative"] }
  | { type: "sdg"; goals: { number: number; label: string; color: string }[] }
  | { type: "responsibilities"; entries: Policy["responsibilities"] }
  | { type: "revision"; entries: NonNullable<Policy["revisionHistory"]> }
  | { type: "custom"; blocks: RichTextBlock[] };

export type DocumentRenderSection = {
  id: string;
  kind: PolicySection["kind"];
  title: string;
  index: number;
  density: ContentDensity;
  recipe: DocumentSectionRecipe;
  content: DocumentSectionContent;
};

export type DocumentRenderModel = {
  theme: ReturnType<typeof getPolicyDocumentTheme>;
  typography: ReturnType<typeof getResolvedTypography>;
  dataTreatment: DataTreatment;
  listFormatting: ReturnType<typeof resolvePolicyListFormatting>;
  featureImage?: PolicyFeatureImage;
  cover: {
    variant: "manual" | "ai";
    policyLabel: string;
    companyName: string;
    logo?: string;
    metadata: { label: string; value: string }[];
    composition?: CoverComposition;
  };
  tocEntries: { id: string; index: number; title: string }[];
  sections: DocumentRenderSection[];
  acknowledgement?: {
    title: string;
    statement: string;
    fields: string[];
  };
  footer: {
    documentNumber: string;
    effectiveDate: string;
    reviewDate: string;
    revision: string;
  };
};

export function buildDocumentRenderModel(policy: Policy): DocumentRenderModel {
  const theme = getPolicyDocumentTheme(policy);
  const typography = getResolvedTypography(policy);
  const profile = getPolicyProfile(policy.policyType);
  const enabledSections = getEnabledSections(policy).filter(
    (section) => section.kind === "preface" || sectionHasContent(policy, section),
  );
  const sections = enabledSections.map((section, zeroIndex) => ({
    id: section.id,
    kind: section.kind,
    title: section.title,
    index: zeroIndex + 1,
    density: estimateSectionDensity(policy, section),
    recipe: theme.layout.sectionRecipes[section.kind],
    content: getSectionContent(policy, section),
  }));
  const companyName = policy.company.name || "[Company Name]";

  return {
    theme,
    typography,
    // The design selects the document's structural language; this explicit
    // customization selects how policy data is presented within that design.
    dataTreatment: policy.visualStyle === "corporate" ? "formal-tables" : "clean-bullets",
    listFormatting: resolvePolicyListFormatting(policy),
    featureImage: policy.featureImage && theme.imageSupport.includes(policy.featureImage.placement)
      ? structuredClone(policy.featureImage)
      : undefined,
    cover: {
      policyLabel: profile.label,
      companyName,
      logo: policy.company.companyLogo,
      metadata: [
        { label: "Document No.", value: policy.company.docNum || "" },
        { label: "Effective Date", value: policy.company.effectiveDate || "" },
        { label: "Revision", value: policy.company.revNum || "" },
        { label: "Next Review", value: policy.company.reviewDate || "" },
      ],
      variant: getActiveCoverVariant(policy),
      composition: (() => {
        const composition = getActiveCoverComposition(policy);
        const cleaned = composition && theme.background.kind === "solid" && composition.sourceTemplateId !== "custom"
          ? removeLegacyThemeGradient(composition)
          : composition;
        return cleaned ? projectCoverComposition(cleaned, policy, typography, theme) : undefined;
      })(),
    },
    tocEntries: sections.map(({ id, index, title }) => ({ id, index, title })),
    sections,
    acknowledgement: policy.showAcknowledgement
      ? {
          title: "Employee Acknowledgement Form",
          statement: `I acknowledge that I have read and understood the ${profile.label} of ${companyName} and agree to uphold its commitments in my work.`,
          fields: ["Employee Name", "Employee ID", "Department", "Date", "Signature"],
        }
      : undefined,
    footer: {
      documentNumber: policy.company.docNum || "",
      effectiveDate: policy.company.effectiveDate || "",
      reviewDate: policy.company.reviewDate || "",
      revision: policy.company.revNum || "",
    },
  };
}

export function estimateSectionDensity(policy: Policy, section: PolicySection): ContentDensity {
  const { characters, items, cells } = getSectionMetrics(policy, section);
  if (characters >= 1400 || items >= 12 || cells >= 48) return "dense";
  if (characters <= 360 && items <= 4 && cells <= 12) return "short";
  return "regular";
}

function getSectionContent(policy: Policy, section: PolicySection): DocumentSectionContent {
  switch (section.kind) {
    case "preface": return { type: "narrative", text: policy.declaration.preface };
    case "declaration": return { type: "narrative", text: policy.declaration.declaration };
    case "scope": return { type: "narrative", text: policy.declaration.scope, sites: getCompanySites(policy.company) };
    case "definitions": return { type: "narrative", text: policy.definitions?.content || "" };
    case "focus": return { type: "focus", areas: policy.focusAreas.filter(Boolean) };
    case "qualitative": return {
      type: "qualitative",
      groups: visibleQualitativeEntries(policy)
        .filter(([, items]) => items.length > 0)
        .map(([area, items]) => ({ area, items })),
    };
    case "quantitative": return {
      type: "quantitative",
      areas: visibleQuantitativeAreas(policy).filter((area) => area.targets.some((target) => target.target)),
    };
    case "sdg": return {
      type: "sdg",
      goals: policy.sdgs.map((number) => {
        const goal = SDG_DATA.find((item) => item.n === number);
        return { number, label: goal?.label || `Goal ${number}`, color: goal?.c || "#666666" };
      }),
    };
    case "responsibilities": return { type: "responsibilities", entries: policy.responsibilities };
    case "monitoring": return { type: "narrative", text: policy.monitoring };
    case "review": return { type: "narrative", text: policy.reviewMechanism };
    case "revision": return {
      type: "revision",
      entries: resolveRevisionHistory(policy.revisionHistory, policy.company.effectiveDate, policy.company.lastReviewDate, policy.company.reviewFrequency),
    };
    case "custom": return { type: "custom", blocks: section.blocks || [] };
  }
}

function getSectionMetrics(policy: Policy, section: PolicySection) {
  const content = getSectionContent(policy, section);
  switch (content.type) {
    case "narrative": {
      const siteCharacters = (content.sites || []).reduce(
        (total, site) => total + `${site.location}${site.address}${site.primaryFunction}`.length,
        0,
      );
      return { characters: content.text.length + siteCharacters, items: content.sites?.length || 1, cells: (content.sites?.length || 0) * 3 };
    }
    case "focus": return { characters: content.areas.join(" ").length, items: content.areas.length, cells: 0 };
    case "qualitative": return {
      characters: content.groups.reduce((total, group) => total + group.area.length + group.items.join(" ").length, 0),
      items: content.groups.reduce((total, group) => total + group.items.length, content.groups.length),
      cells: 0,
    };
    case "quantitative": {
      const groups = groupQuantitativeTargets(content.areas);
      const targets = groups.flatMap((group) => group.targets);
      return {
        characters: targets.reduce((total, target) => total + `${target.target}${target.baseline}${target.deadline}`.length, 0),
        items: targets.length,
        cells: groups.length * 3,
      };
    }
    case "sdg": return { characters: content.goals.reduce((total, goal) => total + goal.label.length, 0), items: content.goals.length, cells: 0 };
    case "responsibilities": return {
      characters: content.entries.reduce((total, entry) => total + entry.role.length + entry.duty.length, 0),
      items: content.entries.length,
      cells: content.entries.length * 2,
    };
    case "revision": return {
      characters: content.entries.reduce((total, entry) => total + entry.revisionNo.length + entry.date.length + entry.description.length, 0),
      items: content.entries.length,
      cells: content.entries.length * 3,
    };
    case "custom": return {
      characters: content.blocks.reduce((total, block) => total + block.text.length + (block.columns || []).join(" ").length + (block.rows || []).flat().join(" ").length, 0),
      items: content.blocks.length,
      cells: content.blocks.reduce((total, block) => total + (block.rows || []).length * (block.columns || []).length, 0),
    };
  }
}
