import assert from "node:assert/strict";
import test from "node:test";
import { getStarterTemplate, queryStarterTemplates, STARTER_TEMPLATES } from "./starter-templates";

test("publishes exactly five generic starters for each policy type and profile", () => {
  assert.equal(STARTER_TEMPLATES.length, 25);
  assert.equal(new Set(STARTER_TEMPLATES.map((starter) => starter.id)).size, 25);
  const byType = new Map<string, number>();
  const byProfile = new Map<string, number>();
  STARTER_TEMPLATES.forEach((starter) => {
    byType.set(starter.policyType, (byType.get(starter.policyType) || 0) + 1);
    byProfile.set(starter.profile, (byProfile.get(starter.profile) || 0) + 1);
    const serialized = JSON.stringify(starter);
    assert.doesNotMatch(serialized, /Acme|Allchem|Kraftwares|Yash|Vasuda|Ganges/i);
    assert.equal(starter.policy.company.name, "[Organization Name]");
    starter.policy.quantitative.forEach((group) => group.targets.forEach((target) => {
      assert.equal(target.baseline, "");
      assert.equal(target.deadline, "");
    }));
  });
  assert.equal(byType.size, 5);
  byType.forEach((count) => assert.equal(count, 5));
  assert.equal(byProfile.size, 5);
  byProfile.forEach((count) => assert.equal(count, 5));
});

test("starter search and filters return public catalog data only", () => {
  assert.equal(queryStarterTemplates({ policyType: "ethics" }).length, 5);
  assert.equal(queryStarterTemplates({ profile: "compliance" }).length, 5);
  assert.equal(queryStarterTemplates({ policyType: "living-wage", profile: "evidence-led" }).length, 1);
  assert.equal(queryStarterTemplates({ q: "nonexistent phrase" }).length, 0);
  assert.equal(getStarterTemplate("environmental-standard")?.profile, "standard");
});
