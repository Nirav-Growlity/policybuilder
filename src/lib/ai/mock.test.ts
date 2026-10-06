import assert from "node:assert/strict";
import test from "node:test";
import { makeSamplePolicy } from "../store";
import { mockGenerate } from "./mock";

test("mock AI output carries every supplied company classification level", () => {
  const policy = makeSamplePolicy();
  policy.company.name = "Example Energy";
  policy.company.industry = "Energy";
  policy.company.subCategory = "Renewable energy";
  policy.company.industryDetail = "Solar power generation";

  const preface = mockGenerate({ type: "preface", policy });
  const summary = mockGenerate({ type: "all", policy });

  for (const response of [preface, summary]) {
    assert.match(response.text || "", /Sector: Energy/);
    assert.match(response.text || "", /Subsector: Renewable energy/);
    assert.match(response.text || "", /Industry: Solar power generation/);
  }
});
