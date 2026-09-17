import assert from "node:assert/strict";
import test from "node:test";
import { formatQuantitativeTargetSentence, normalizeQuantitativeTarget, syncQuantitativeAreas, targetHasNumericMeasure, targetRequiresPercentage, validateQuantitativeTarget } from "./quantitative";

test("new quantitative focus areas start without placeholder target rows", () => {
  const areas = syncQuantitativeAreas([], ["Supplier Code of Conduct", "Supplier Due Diligence"]);

  assert.deepEqual(areas, [
    { area: "Supplier Code of Conduct", targets: [] },
    { area: "Supplier Due Diligence", targets: [] },
  ]);
});

test("quantitative targets accept percentages, numeric units, and explicit zero values", () => {
  assert.equal(targetRequiresPercentage("Reduce supplier compliance by 20%"), true);
  assert.equal(validateQuantitativeTarget({ target: "Reduce supplier compliance by 20%", baseline: "FY 2022-23", deadline: "FY 2029-30", reportingFrequency: "Target period" }).length, 0);
  assert.equal(targetRequiresPercentage("Reduce energy consumption by 500 kWh per site"), false);
  assert.equal(targetHasNumericMeasure("Reduce energy consumption by 500 kWh per site"), true);
  assert.equal(targetHasNumericMeasure("Maintain zero reportable incidents"), true);
  assert.equal(validateQuantitativeTarget({ target: "Maintain zero reportable incidents", baseline: "FY 2022-23", deadline: "FY 2029-30", reportingFrequency: "Target period" }).length, 0);
  assert.match(validateQuantitativeTarget({ target: "Increase supplier compliance", baseline: "FY 2022-23", deadline: "FY 2029-30", reportingFrequency: "Target period" })[0], /percentage.*numeric/i);
  assert.match(validateQuantitativeTarget({ target: "Improve supplier compliance by FY 2029-30", baseline: "FY 2022-23", deadline: "FY 2029-30", reportingFrequency: "Target period" })[0], /percentage.*numeric/i);
});

test("target rendering puts baseline and achievement year in one sentence without duplicate timing", () => {
  const target = normalizeQuantitativeTarget({ target: "Reduce emissions by 30%", baseline: "FY 2022-23", deadline: "FY 2029-30", subtopics: ["Scope 1", "Scope 2", ""] }, "FY");
  assert.equal(formatQuantitativeTargetSentence(target), "Reduce emissions by 30%, by FY 2029-30, measured from the FY 2022-23 baseline." );
  assert.deepEqual(target.subtopics, ["Scope 1", "Scope 2"]);
  assert.equal(formatQuantitativeTargetSentence(normalizeQuantitativeTarget({ target: "Reduce emissions by 30% by FY 2029-30", baseline: "FY 2022-23" }, "FY")), "Reduce emissions by 30% by FY 2029-30, measured from the FY 2022-23 baseline.");
  assert.equal(formatQuantitativeTargetSentence(normalizeQuantitativeTarget({ target: "Conduct 2 annual audits", reportingFrequency: "Annually" }, "FY")), "Conduct 2 annual audits, reported annually.");
  assert.equal(formatQuantitativeTargetSentence(normalizeQuantitativeTarget({ target: "Conduct 2 audits reported annually", reportingFrequency: "Annually" }, "FY")), "Conduct 2 audits reported annually");
});

test("reporting basis keeps annual targets date-free and target-period rows date-based", () => {
  const annual = normalizeQuantitativeTarget({ target: "Complete 2 annual reviews", reportingFrequency: "Annually" }, "FY");
  assert.equal(annual.reportingFrequency, "Annually");
  assert.equal(annual.baseline, "");
  assert.equal(annual.deadline, "");

  const targetPeriod = normalizeQuantitativeTarget({ target: "Complete 2 reviews", reportingFrequency: "Target period" }, "FY");
  assert.equal(targetPeriod.reportingFrequency, "Target period");
  assert.match(targetPeriod.baseline, /^FY /);
  assert.match(targetPeriod.deadline, /^FY /);
});
