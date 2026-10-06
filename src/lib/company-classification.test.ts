import assert from "node:assert/strict";
import test from "node:test";
import { getCompanyClassificationContext, getIndustryGroup, getIndustryOptions, getSectorOptions, getSubsectorOptions, withCompanyClassification } from "./company-classification";
import { getCompanyFocusAreaCatalog, initializeFocusAreaCatalogFromDefaults } from "./focus-area-catalog";
import { initialPolicy } from "./initial-policy";

const chemicalCompany = {
  ...initialPolicy().company,
  industry: "Manufacturing",
  subCategory: "Manufacture of chemicals and chemical products",
  industryDetail: "Manufacture of basic chemicals",
};

test("canonical ISIC hierarchy filters subsectors and industries by their parents", () => {
  assert.equal(getSectorOptions().length, 22);
  assert.ok(getSectorOptions().includes("Agriculture, forestry and fishing"));
  assert.ok(getSubsectorOptions("Manufacturing").includes(chemicalCompany.subCategory));
  assert.ok(!getSubsectorOptions("Construction").includes(chemicalCompany.subCategory));
  assert.ok(getIndustryOptions(chemicalCompany.industry, chemicalCompany.subCategory).includes(chemicalCompany.industryDetail));
  assert.deepEqual(getIndustryOptions("Construction", chemicalCompany.subCategory), []);
  assert.deepEqual(getIndustryOptions("", chemicalCompany.subCategory), []);
  assert.deepEqual(getSubsectorOptions("Unknown custom sector"), []);
});

test("hierarchy accepts source codes and slugs without showing duplicate industry names", () => {
  assert.deepEqual(getSubsectorOptions("C"), getSubsectorOptions("Manufacturing"));
  assert.deepEqual(getIndustryOptions("C", "20"), getIndustryOptions(chemicalCompany.industry, chemicalCompany.subCategory));
  assert.ok(getIndustryOptions("c_manufacturing", "20").includes("Manufacture of basic chemicals"));
  const coal = getIndustryOptions("B", "05");
  assert.equal(coal.filter((value) => value === "Mining of hard coal").length, 1);
});

test("AI classification context includes each supplied level with explicit labels", () => {
  assert.equal(getCompanyClassificationContext(chemicalCompany), "Sector: Manufacturing; Subsector: Manufacture of chemicals and chemical products; Industry: Manufacture of basic chemicals");
  assert.equal(getCompanyClassificationContext({ industry: " Legacy sector ", subCategory: "Legacy subsector" }), "Sector: Legacy sector; Subsector: Legacy subsector");
  assert.equal(getCompanyClassificationContext({ industry: "" }), "");
});

test("parent selection changes clear only their descendants and preserve unrelated company details", () => {
  const original = { ...chemicalCompany, name: "Existing Co", websiteLink: "https://example.test" };
  const sectorChanged = withCompanyClassification(original, "industry", "Construction");
  assert.equal(sectorChanged.subCategory, "");
  assert.equal(sectorChanged.industryDetail, "");
  assert.equal(sectorChanged.name, "Existing Co");
  assert.equal(sectorChanged.websiteLink, "https://example.test");
  const subsectorChanged = withCompanyClassification(original, "subCategory", "Manufacture of textiles");
  assert.equal(subsectorChanged.industry, "Manufacturing");
  assert.equal(subsectorChanged.industryDetail, "");
  const industryChanged = withCompanyClassification(original, "industryDetail", "Manufacture of fertilizers and nitrogen compounds");
  assert.equal(industryChanged.industry, original.industry);
  assert.equal(industryChanged.subCategory, original.subCategory);
  assert.equal(original.industryDetail, "Manufacture of basic chemicals");
});

test("reselecting the same parent retains loaded legacy/custom industry values", () => {
  const legacy = { ...chemicalCompany, industry: "Legacy sector", subCategory: "Legacy subsector", industryDetail: "Custom industry" };
  assert.equal(withCompanyClassification(legacy, "industry", "Legacy sector"), legacy);
  assert.equal(withCompanyClassification(legacy, "subCategory", "Legacy subsector"), legacy);
});

test("detailed industry classes resolve existing group focus catalogs", () => {
  assert.equal(getIndustryGroup(chemicalCompany), "Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms");
  const catalog = getCompanyFocusAreaCatalog(chemicalCompany, "environmental");
  assert.ok(catalog);
  assert.equal(catalog.subSector, getIndustryGroup(chemicalCompany));
  assert.ok(catalog.areas.some((area) => area.label === "Air Pollution"));
  const specific = getCompanyFocusAreaCatalog({ ...chemicalCompany, industryDetail: "Manufacture of pesticides and other agrochemical products" }, "environmental");
  assert.equal(specific?.subSector, "Manufacture of pesticides and other agrochemical products");
});

test("new industry selection initializes only untouched defaults and retains saved catalog content", () => {
  const policy = { ...initialPolicy(), company: chemicalCompany };
  const initialized = initializeFocusAreaCatalogFromDefaults(policy);
  assert.equal(initialized.focusAreaSelection?.mode, "catalog");
  const changed = { ...initialized, company: { ...chemicalCompany, industryDetail: "Manufacture of other chemical products n.e.c." } };
  assert.equal(initializeFocusAreaCatalogFromDefaults(changed), changed);
  assert.deepEqual(changed.focusAreas, initialized.focusAreas);

  const authored = { ...policy, qualitative: { "Water Stewardship": ["Keep this authored objective"] } };
  const preserved = initializeFocusAreaCatalogFromDefaults(authored);
  assert.deepEqual(preserved.focusAreas, authored.focusAreas);
  assert.deepEqual(preserved.qualitative, authored.qualitative);
  assert.equal(preserved.focusAreaSelection?.mode, "custom");
});

test("legacy subsector catalogs still match without a new industry", () => {
  const catalog = getCompanyFocusAreaCatalog({ ...initialPolicy().company, industry: "Manufacturing Heavy", subCategory: "Manufacture of other chemical products n.e.c." }, "environmental");
  assert.equal(catalog?.subSector, "Manufacture of other chemical products n.e.c.");
});
