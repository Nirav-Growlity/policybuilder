import assert from "node:assert/strict";
import test from "node:test";
import { getPolicyProfile, INDUSTRY_SUBSECTORS } from "./constants";
import {
  getFocusAreaCatalog,
  getFocusAreaCatalogByKey,
  getInactiveFixedFocusAreaLabels,
  getIndustrySubsectorOptions,
  initializeFocusAreaCatalogFromDefaults,
  visibleQualitativeEntries,
  visibleQuantitativeAreas,
  withFocusAreaCatalogSelection,
} from "./focus-area-catalog";
import { initialPolicy } from "./store";
import { buildDocumentRenderModel } from "./document-render-model";

const sourceSubSectors = [
  "Manufacture of other chemical products n.e.c.",
  "Manufacture of basic chemicals, fertilizers and nitrogen compounds, plastics and synthetic rubber in primary forms",
  "Manufacture of electronic components and boards",
  "Manufacture of pesticides and other agrochemical products",
  "Manufacture of basic pharmaceutical products and pharmaceutical preparations",
  "Manufacture of soap and detergents, cleaning and polishing preparations, perfumes and toilet preparations",
  "Manufacture of electric motors, generators, transformers and electricity distribution and control ap",
  "Manufacture of other textiles",
  "Manufacture of wearing apparel",
  "Manufacture of other electrical equipment",
  "Manufacture of general-purpose machinery",
];

test("all workbook sub-sectors resolve environmental and labour catalogs", () => {
  for (const subSector of sourceSubSectors) {
    assert.ok(getFocusAreaCatalog(subSector, "environmental"), `${subSector} environmental`);
    assert.ok(getFocusAreaCatalog(subSector, "labour-human-rights"), `${subSector} labour`);
  }
});

test("ethics and procurement use the same fixed areas for every selectable sub-sector", () => {
  const ethicsAreas = ["Corruption", "Conflict of interest", "Fraud", "Money laundering", "Responsible Information Management"];
  const procurementAreas = ["Supplier Environmental Practices", "Supplier Social Practices"];
  const selectableSubSectors = new Set([
    ...sourceSubSectors,
    ...Object.values(INDUSTRY_SUBSECTORS).flat(),
    "User-defined sub-sector",
  ]);

  for (const subSector of selectableSubSectors) {
    assert.deepEqual(getFocusAreaCatalog(subSector, "ethics")?.areas.map((area) => area.label), ethicsAreas, `${subSector} ethics`);
    assert.deepEqual(getFocusAreaCatalog(subSector, "sustainable-procurement")?.areas.map((area) => area.label), procurementAreas, `${subSector} procurement`);
  }

  const chemicals = sourceSubSectors[0];
  assert.equal(getFocusAreaCatalog(chemicals, "living-wage"), null);
  assert.equal(getFocusAreaCatalog(sourceSubSectors[10], "environmental")?.areas.length, 6);
});

test("current shortened sub-sector choices resolve to workbook catalog keys", () => {
  assert.equal(
    getFocusAreaCatalog("Manufacture of basic chemicals, fertilizers and plastics", "environmental")?.subSector,
    sourceSubSectors[1],
  );
  assert.equal(
    getFocusAreaCatalog("Manufacture of basic pharmaceutical products and preparations", "environmental")?.subSector,
    sourceSubSectors[4],
  );
  assert.equal(
    getFocusAreaCatalog("Manufacture of electric motors, generators and transformers", "environmental")?.subSector,
    sourceSubSectors[6],
  );
  assert.ok(getIndustrySubsectorOptions("Manufacturing Heavy").includes(sourceSubSectors[3]));
  assert.ok(getIndustrySubsectorOptions("Manufacturing Advanced").includes(sourceSubSectors[10]));
});

test("a fresh policy adopts fixed areas only while its default focus list is untouched", () => {
  const policy = initialPolicy("environmental");
  policy.company.subCategory = sourceSubSectors[0];
  const initialized = initializeFocusAreaCatalogFromDefaults(policy);
  const catalog = getFocusAreaCatalog(sourceSubSectors[0], "environmental")!;

  assert.deepEqual(initialized.focusAreas, catalog.areas.map((area) => area.label));
  assert.equal(initialized.focusAreaSelection?.mode, "catalog");
  assert.deepEqual(
    initialized.focusAreaSelection?.mode === "catalog" ? initialized.focusAreaSelection.selectedFixedAreaIds : [],
    catalog.areas.map((area) => area.id),
  );

  const editedDefault = initialPolicy("environmental");
  editedDefault.company.subCategory = sourceSubSectors[0];
  editedDefault.focusAreas[0] = "User-authored area";
  const preserved = initializeFocusAreaCatalogFromDefaults(editedDefault);
  assert.deepEqual(preserved.focusAreas, editedDefault.focusAreas);
  assert.equal(preserved.focusAreaSelection?.mode, "custom");
});

test("legacy and already-configured drafts are preserved when their sub-sector changes", () => {
  const legacy = initialPolicy("environmental");
  legacy.company.subCategory = sourceSubSectors[0];
  delete legacy.focusAreaSelection;
  assert.equal(initializeFocusAreaCatalogFromDefaults(legacy), legacy);

  const matched = initializeFocusAreaCatalogFromDefaults({
    ...initialPolicy("environmental"),
    company: { ...initialPolicy("environmental").company, subCategory: sourceSubSectors[0] },
  });
  const changed = {
    ...matched,
    company: { ...matched.company, subCategory: sourceSubSectors[1] },
  };
  assert.equal(initializeFocusAreaCatalogFromDefaults(changed), changed);
});

test("fixed selection stays label-locked and excluded items stay out of dependent content", () => {
  const catalog = getFocusAreaCatalog(sourceSubSectors[0], "environmental")!;
  const policy = initialPolicy("environmental");
  const first = catalog.areas[0];
  const configured = {
    ...policy,
    ...withFocusAreaCatalogSelection(catalog, [first.id, "invalid-fixed-id"], ["Custom scope"]),
    qualitative: {
      [first.label]: ["Visible objective"],
      [catalog.areas[1].label]: ["Hidden objective"],
    },
    quantitative: [
      { area: first.label, targets: [{ target: "Visible target", baseline: "", deadline: "" }] },
      { area: catalog.areas[1].label, targets: [{ target: "Hidden target", baseline: "", deadline: "" }] },
      { area: "Independent quantitative topic", targets: [{ target: "Visible custom target", baseline: "", deadline: "" }] },
    ],
  };

  assert.deepEqual(configured.focusAreas, [first.label, "Custom scope"]);
  assert.deepEqual(getFocusAreaCatalogByKey(catalog.key)?.areas[0].label, first.label);
  assert.deepEqual(
    getInactiveFixedFocusAreaLabels(configured),
    new Set(catalog.areas.slice(1).map((area) => area.label.toLocaleLowerCase("en"))),
  );
  assert.deepEqual(visibleQualitativeEntries(configured).map(([area]) => area), [first.label]);
  assert.deepEqual(visibleQuantitativeAreas(configured).map((area) => area.area), [first.label, "Independent quantitative topic"]);

  const renderedSections = buildDocumentRenderModel(configured).sections;
  const focusSection = renderedSections.find((section) => section.kind === "focus");
  const qualitativeSection = renderedSections.find((section) => section.kind === "qualitative");
  const quantitativeSection = renderedSections.find((section) => section.kind === "quantitative");
  assert.deepEqual(focusSection?.content.type === "focus" ? focusSection.content.areas : [], [first.label, "Custom scope"]);
  assert.deepEqual(qualitativeSection?.content.type === "qualitative" ? qualitativeSection.content.groups.map((group) => group.area) : [], [first.label]);
  assert.deepEqual(quantitativeSection?.content.type === "quantitative" ? quantitativeSection.content.areas.map((area) => area.area) : [], [first.label, "Independent quantitative topic"]);
});

test("missing workbook themes keep the existing policy profile defaults", () => {
  const type = "living-wage";
  const policy = initialPolicy(type);
  policy.company.subCategory = sourceSubSectors[0];
  const result = initializeFocusAreaCatalogFromDefaults(policy);
  assert.deepEqual(result.focusAreas, getPolicyProfile(type).focusAreas);
  assert.equal(result.focusAreaSelection?.mode, "profile-default");
});
