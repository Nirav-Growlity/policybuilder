import { INDUSTRY_SUBSECTORS, getPolicyProfile } from "./constants";
import type { FocusAreaSelectionItem, Policy, PolicyType } from "./types";

export interface FixedFocusArea {
  id: string;
  label: string;
}

export interface FocusAreaCatalog {
  key: string;
  subSector: string;
  policyType: PolicyType;
  areas: FixedFocusArea[];
}

const LABOUR_HUMAN_RIGHTS = [
  "Employee Health & Safety",
  "Working Conditions",
  "Social Dialogue",
  "Career Management & Training",
  "Child Labor, Forced Labor & Human Trafficking",
  "Discrimination and Harassment",
] as const;

const POLICY_WIDE_SUBSECTOR_CATALOGS: Partial<Record<PolicyType, readonly string[]>> = {
  ethics: ["Corruption", "Conflict of interest", "Fraud", "Money laundering", "Responsible Information Management"],
  "sustainable-procurement": ["Supplier Environmental Practices", "Supplier Social Practices"],
};

const SUBSECTOR_CATALOG: Record<string, Partial<Record<PolicyType, readonly string[]>>> = {
  "Manufacture of other chemical products n.e.c.": {
    environmental: ["Energy consumption & GHGs", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms": {
    environmental: ["Energy consumption & GHGs", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of electronic components and boards": {
    environmental: ["Energy consumption & GHGs", "Water", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of pesticides and other agrochemical products": {
    environmental: ["Energy consumption & GHGs", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of basic pharmaceutical products and pharmaceutical preparations": {
    environmental: ["Energy consumption & GHGs", "Biodiversity", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of soap and detergents, cleaning and polishing preparations, perfumes and toilet preparations": {
    environmental: ["Energy consumption & GHGs", "Biodiversity", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of electric motors, generators, transformers and electricity distribution and control ap": {
    environmental: ["Energy consumption & GHGs", "Water", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of other textiles": {
    environmental: ["Energy consumption & GHGs", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of wearing apparel": {
    environmental: ["Energy consumption & GHGs", "Water", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of other electrical equipment": {
    environmental: ["Energy consumption & GHGs", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life", "Customer Health & Safety"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
  "Manufacture of general-purpose machinery": {
    // The workbook labels this theme "Environment"; it maps to Environmental Policy.
    environmental: ["Energy consumption & GHGs", "Water", "Air Pollution", "Materials, Chemicals & Waste", "Product Use", "Product End-of-Life"],
    "labour-human-rights": LABOUR_HUMAN_RIGHTS,
  },
};

const SUBSECTOR_ALIASES: Record<string, string> = {
  "Manufacture of basic chemicals, fertilizers and plastics": "Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms",
  "Manufacture of basic pharmaceutical products and preparations": "Manufacture of basic pharmaceutical products and pharmaceutical preparations",
  "Manufacture of electric motors, generators and transformers": "Manufacture of electric motors, generators, transformers and electricity distribution and control ap",
};

const SUBSECTORS_BY_INDUSTRY: Record<string, string[]> = {
  "Manufacturing Heavy": [
    "Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms",
    "Manufacture of pesticides and other agrochemical products",
    "Manufacture of basic pharmaceutical products and pharmaceutical preparations",
    "Manufacture of soap and detergents, cleaning and polishing preparations, perfumes and toilet preparations",
  ],
  "Manufacturing Advanced": [
    "Manufacture of electric motors, generators, transformers and electricity distribution and control ap",
    "Manufacture of general-purpose machinery",
  ],
};

export function normalizeSubSector(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

const CANONICAL_SUBSECTORS = new Map<string, string>();
for (const subSector of Object.keys(SUBSECTOR_CATALOG)) {
  CANONICAL_SUBSECTORS.set(normalizeSubSector(subSector), subSector);
}
for (const subSector of [
  ...Object.values(INDUSTRY_SUBSECTORS).flat(),
  ...Object.values(SUBSECTORS_BY_INDUSTRY).flat(),
]) {
  const normalized = normalizeSubSector(subSector);
  if (!CANONICAL_SUBSECTORS.has(normalized)) CANONICAL_SUBSECTORS.set(normalized, subSector);
}
for (const [alias, canonical] of Object.entries(SUBSECTOR_ALIASES)) {
  CANONICAL_SUBSECTORS.set(normalizeSubSector(alias), canonical);
}

function slug(value: string): string {
  return normalizeSubSector(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function makeCatalog(subSector: string, policyType: PolicyType, labels: readonly string[], catalogKey?: string): FocusAreaCatalog {
  const key = catalogKey ?? `${slug(subSector)}::${policyType}`;
  return {
    key,
    subSector,
    policyType,
    areas: labels.map((label) => ({ id: `${key}::${slug(label)}`, label })),
  };
}

const CATALOGS_BY_KEY = new Map<string, FocusAreaCatalog>();
for (const [policyType, labels] of Object.entries(POLICY_WIDE_SUBSECTOR_CATALOGS) as [PolicyType, readonly string[]][]) {
  const catalog = makeCatalog("All sub-sectors", policyType, labels, `all-subsectors::${policyType}`);
  CATALOGS_BY_KEY.set(catalog.key, catalog);
}
for (const [subSector, themes] of Object.entries(SUBSECTOR_CATALOG)) {
  const completeThemes = { ...POLICY_WIDE_SUBSECTOR_CATALOGS, ...themes };
  for (const [policyType, labels] of Object.entries(completeThemes) as [PolicyType, readonly string[]][]) {
    const catalog = makeCatalog(subSector, policyType, labels);
    CATALOGS_BY_KEY.set(catalog.key, catalog);
  }
}
for (const subSector of new Set(CANONICAL_SUBSECTORS.values())) {
  for (const [policyType, labels] of Object.entries(POLICY_WIDE_SUBSECTOR_CATALOGS) as [PolicyType, readonly string[]][]) {
    const catalog = makeCatalog(subSector, policyType, labels);
    CATALOGS_BY_KEY.set(catalog.key, catalog);
  }
}

export function getFocusAreaCatalog(subSector: string | undefined, policyType: PolicyType): FocusAreaCatalog | null {
  if (!subSector?.trim()) return null;
  const canonical = CANONICAL_SUBSECTORS.get(normalizeSubSector(subSector));
  if (!canonical) {
    const sharedLabels = POLICY_WIDE_SUBSECTOR_CATALOGS[policyType];
    return sharedLabels?.length
      ? makeCatalog(subSector.trim(), policyType, sharedLabels, `all-subsectors::${policyType}`)
      : null;
  }
  const labels = SUBSECTOR_CATALOG[canonical]?.[policyType] ?? POLICY_WIDE_SUBSECTOR_CATALOGS[policyType];
  return labels?.length ? makeCatalog(canonical, policyType, labels) : null;
}

export function getFocusAreaCatalogByKey(key: string): FocusAreaCatalog | null {
  return CATALOGS_BY_KEY.get(key) || null;
}

export function getIndustrySubsectorOptions(industry: string): string[] {
  const options = [...(INDUSTRY_SUBSECTORS[industry] || []), ...(SUBSECTORS_BY_INDUSTRY[industry] || [])];
  const seen = new Set<string>();
  return options.filter((option) => {
    const normalized = normalizeSubSector(option);
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function sameFocusAreaList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((area, index) => area === right[index]);
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  return labels.map((label) => label.trim()).filter((label) => {
    const normalized = normalizeSubSector(label);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function withFocusAreaCatalogSelection(
  catalog: FocusAreaCatalog,
  selectedIds: string[],
  manualAreas: string[],
  focusAreaItems?: FocusAreaSelectionItem[],
): Pick<Policy, "focusAreas" | "focusAreaSelection"> {
  const selected = new Set(selectedIds.filter((id) => catalog.areas.some((area) => area.id === id)));
  const seenManual = new Set<string>();
  const remainingItems: FocusAreaSelectionItem[] = [];
  const sourceItems = focusAreaItems ?? uniqueLabels(manualAreas).map((label, index) => ({
    id: `manual-${index}`,
    label,
    selected: true,
  }));
  for (const item of sourceItems) {
    const normalized = normalizeSubSector(item.label);
    const sameFixed = normalized
      ? catalog.areas.find((area) => normalizeSubSector(area.label) === normalized)
      : undefined;
    if (sameFixed) {
      if (item.selected) selected.add(sameFixed.id);
      continue;
    }
    if (normalized && seenManual.has(normalized)) continue;
    if (normalized) seenManual.add(normalized);
    remainingItems.push(item);
  }
  const selectedFixedAreas = catalog.areas.filter((area) => selected.has(area.id));
  const remainingManual = uniqueLabels(remainingItems.filter((item) => item.selected).map((item) => item.label));
  return {
    focusAreas: uniqueLabels([...selectedFixedAreas.map((area) => area.label), ...remainingManual]),
    focusAreaSelection: {
      mode: "catalog",
      catalogKey: catalog.key,
      selectedFixedAreaIds: selectedFixedAreas.map((area) => area.id),
      manualAreas: remainingManual,
      focusAreaItems: remainingItems,
    },
  };
}

export function initializeFocusAreaCatalogFromDefaults(policy: Policy): Policy {
  if (policy.focusAreaSelection?.mode !== "profile-default") return policy;
  const defaults = getPolicyProfile(policy.policyType).focusAreas;
  const hasAuthoredAreaContent = Object.values(policy.qualitative).some((items) => items.some((item) => item.trim()))
    || policy.quantitative.some((area) => area.targets.some((target) => target.target.trim()));
  if (!sameFocusAreaList(policy.focusAreas, defaults) || hasAuthoredAreaContent) {
    return { ...policy, focusAreaSelection: { mode: "custom" } };
  }
  const catalog = getFocusAreaCatalog(policy.company.subCategory, policy.policyType);
  if (!catalog) return policy;
  return {
    ...policy,
    ...withFocusAreaCatalogSelection(catalog, catalog.areas.map((area) => area.id), []),
  };
}

export function getInactiveFixedFocusAreaLabels(policy: Policy): Set<string> {
  const selection = policy.focusAreaSelection;
  if (selection?.mode !== "catalog") return new Set();
  const catalog = getFocusAreaCatalogByKey(selection.catalogKey);
  if (!catalog) return new Set();
  const selected = new Set(selection.selectedFixedAreaIds);
  return new Set(catalog.areas.filter((area) => !selected.has(area.id)).map((area) => normalizeSubSector(area.label)));
}

export function visibleQuantitativeAreas(policy: Policy): Policy["quantitative"] {
  const inactive = getInactiveFixedFocusAreaLabels(policy);
  return inactive.size
    ? policy.quantitative.filter((area) => !inactive.has(normalizeSubSector(area.area)))
    : policy.quantitative;
}

export function visibleQualitativeEntries(policy: Policy): [string, string[]][] {
  const inactive = getInactiveFixedFocusAreaLabels(policy);
  return Object.entries(policy.qualitative).filter(([area]) => !inactive.has(normalizeSubSector(area)));
}

export function policyFocusAreaCatalog(policy: Policy): FocusAreaCatalog | null {
  if (policy.focusAreaSelection?.mode === "catalog") {
    const catalog = getFocusAreaCatalogByKey(policy.focusAreaSelection.catalogKey);
    if (catalog?.key === `all-subsectors::${policy.policyType}`) {
      return { ...catalog, subSector: policy.company.subCategory || catalog.subSector };
    }
    return catalog;
  }
  return getFocusAreaCatalog(policy.company.subCategory, policy.policyType);
}
