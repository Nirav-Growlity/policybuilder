import { REVISION_HISTORY_DEFAULT, SDG_DATA, getPolicyProfile } from "./constants";
import { getPolicyDocumentTheme, getResolvedTypography, type DocumentSectionRecipe } from "./document-themes";
import { getEnabledSections, sectionHasContent } from "./sections";
import { getCompanySites, type Policy, type PolicySection, type RichTextBlock } from "./types";

export type ContentDensity = "short" | "regular" | "dense";

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
  cover: {
    policyLabel: string;
    companyName: string;
    logo?: string;
    metadata: { label: string; value: string }[];
  };
  tocEntries: { id: string; index: number; title: string }[];
  sections: DocumentRenderSection[];
  acknowledgement?: {
    title: string;
    statement: string;
    fields: string[];
  };
  footer: {
    effectiveDate: string;
    reviewDate: string;
    approver: string;
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
    cover: {
      policyLabel: profile.label,
      companyName,
      logo: policy.company.companyLogo,
      metadata: [
        { label: "Document No.", value: policy.company.docNum || "-" },
        { label: "Effective Date", value: policy.company.effectiveDate || "-" },
        { label: "Revision", value: policy.company.revNum || "01" },
        { label: "Next Review", value: policy.company.reviewDate || "-" },
      ],
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
      effectiveDate: policy.company.effectiveDate || "-",
      reviewDate: policy.company.reviewDate || "-",
      approver: policy.company.approver || "_____________________",
      revision: policy.company.revNum || "01",
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
      groups: Object.entries(policy.qualitative)
        .filter(([, items]) => items.length > 0)
        .map(([area, items]) => ({ area, items })),
    };
    case "quantitative": return {
      type: "quantitative",
      areas: policy.quantitative.filter((area) => area.targets.some((target) => target.target)),
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
    case "revision": return { type: "revision", entries: policy.revisionHistory || REVISION_HISTORY_DEFAULT };
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
      const targets = content.areas.flatMap((area) => area.targets.filter((target) => target.target));
      return {
        characters: targets.reduce((total, target) => total + `${target.target}${target.baseline}${target.deadline}`.length, 0),
        items: targets.length,
        cells: targets.length * 6,
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
