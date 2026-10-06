import classification from "../data/isic-classification.json";
import type { Company } from "./types";

// Canonical hierarchy from ESGtech's isic_classification.json. The source includes
// both industry groups and detailed classes; identical display values occur once.
export const COMPANY_CLASSIFICATION = classification;
type ClassificationOption = { code: string; value: string; slug: string };
type CompanyClassification = Pick<Company, "industry" | "subCategory" | "industryDetail">;

/** Update one selection and clear only its descendants when it actually changes. */
export function withCompanyClassification<T extends CompanyClassification>(company: T, field: keyof CompanyClassification, value: string): T {
  if ((company[field] ?? "") === value) return company;
  if (field === "industry") return { ...company, industry: value, subCategory: "", industryDetail: "" };
  if (field === "subCategory") return { ...company, subCategory: value, industryDetail: "" };
  return { ...company, industryDetail: value };
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function matches(option: ClassificationOption, value: string): boolean {
  const key = normalize(value);
  return [option.code, option.value, option.slug].some((alias) => normalize(alias) === key);
}

function findSector(value: string) {
  return classification.find((sector) => matches(sector, value));
}

function findSubsector(sector: string, subsector: string) {
  return findSector(sector)?.subsectors.find((option) => matches(option, subsector));
}

function uniqueValues(options: readonly ClassificationOption[]): string[] {
  return [...new Set(options.map((option) => option.value))];
}

export function getSectorOptions(): string[] {
  return uniqueValues(classification);
}

export function getSubsectorOptions(sector: string): string[] {
  return uniqueValues(findSector(sector)?.subsectors ?? []);
}

export function getIndustryOptions(sector: string, subsector: string): string[] {
  return uniqueValues(findSubsector(sector, subsector)?.industries ?? []);
}

/** Resolves a detailed class to its industry group for the existing focus catalogs. */
export function getIndustryGroup(company: CompanyClassification): string | undefined {
  const subsector = findSubsector(company.industry, company.subCategory ?? "");
  const industry = subsector?.industries.find((option) => matches(option, company.industryDetail ?? ""));
  if (!industry) return undefined;
  return subsector?.industries.find((option) => option.type === "group" && option.code === industry.group)?.value;
}

export function getCompanyClassificationContext(company: CompanyClassification): string {
  return [
    ["Sector", company.industry],
    ["Subsector", company.subCategory],
    ["Industry", company.industryDetail],
  ].filter(([, value]) => value?.trim()).map(([label, value]) => `${label}: ${value!.trim()}`).join("; ");
}
