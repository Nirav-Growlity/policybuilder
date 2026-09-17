import assert from "node:assert/strict";
import test from "node:test";
import { formatQuantitativeTargetSentence, normalizeQuantitativeTarget, syncQuantitativeAreas, targetRequiresPercentage, validateQuantitativeTarget } from "./quantitative";

test("new quantitative focus areas start without placeholder target rows", () => {
  const areas = syncQuantitativeAreas([], ["Supplier Code of Conduct", "Supplier Due Diligence"]);

  assert.deepEqual(areas, [
    { area: "Supplier Code of Conduct", targets: [] },
    { area: "Supplier Due Diligence", targets: [] },
  ]);
});

test("percentage-based targets require a percent while physical metrics remain valid", () => {
  assert.equal(targetRequiresPercentage("Reduce supplier compliance by 20%"), true);
  assert.equal(validateQuantitativeTarget({ target: "Reduce supplier compliance by 20%", baseline: "FY 2022-23", deadline: "FY 2029-30", reportingFrequency: "Target period" }).length, 0);
  assert.equal(targetRequiresPercentage("Reduce energy consumption by 500 kWh per site"), false);
  assert.match(validateQuantitativeTarget({ target: "Increase supplier compliance", baseline: "FY 2022-23", deadline: "FY 2029-30", reportingFrequency: "Target period" })[0], /percentage/);
});

test("target rendering puts baseline and achievement year in one sentence and keeps annual targets date-free", () => {
  const target = normalizeQuantitativeTarget({ target: "Reduce emissions by 30%", baseline: "FY 2022-23", deadline: "FY 2029-30", subtopics: ["Scope 1", "Scope 2", ""] }, "FY");
  assert.equal(formatQuantitativeTargetSentence(target), "Reduce emissions by 30% (baseline year: FY 2022-23; achievement year: FY 2029-30)." );
  assert.deepEqual(target.subtopics, ["Scope 1", "Scope 2"]);
  assert.equal(formatQuantitativeTargetSentence(normalizeQuantitativeTarget({ target: "Conduct annual audits", reportingFrequency: "Annually" }, "FY")), "Conduct annual audits");
});
