import assert from "node:assert/strict";
import test from "node:test";
import { alignGeneratedDraftTitle, getDraftDisplayTitles, groupDraftsByPolicyType, nextUniqueDraftTitle } from "./policycraft-draft-view";
import type { PolicyDocumentSummary } from "./policycraft-types";

function draft(id: string, title: string): PolicyDocumentSummary {
  return {
    id,
    title,
    policyType: "environmental",
    currentStep: "structure",
    lockVersion: 1,
    createdAt: "2026-09-23T00:00:00.000Z",
    updatedAt: "2026-09-23T00:00:00.000Z",
    archivedAt: null,
  };
}

test("duplicate draft titles receive display-only numbers and unique titles stay unchanged", () => {
  const labels = getDraftDisplayTitles([
    draft("one", "Nirav sustainable-procurement policy"),
    draft("two", "Nirav sustainable-procurement policy"),
    draft("three", "Nirav ethics policy"),
  ]);

  assert.equal(labels.get("one"), "Nirav sustainable-procurement policy 1");
  assert.equal(labels.get("two"), "Nirav sustainable-procurement policy 2");
  assert.equal(labels.get("three"), "Nirav ethics policy");
});

test("duplicate matching ignores title casing and surrounding whitespace", () => {
  const labels = getDraftDisplayTitles([draft("one", "Policy A"), draft("two", " policy a ")]);
  assert.equal(labels.get("one"), "Policy A 1");
  assert.equal(labels.get("two"), "policy a 2");
});

test("new draft titles are corrected to the saved policy type and numbered durably", () => {
  assert.equal(alignGeneratedDraftTitle("Nirav sustainable-procurement policy 3", "living-wage"), "Nirav living-wage policy 3");
  assert.equal(alignGeneratedDraftTitle("Quarterly Supplier Policy", "living-wage"), "Quarterly Supplier Policy");
  assert.equal(nextUniqueDraftTitle("Nirav living-wage policy", []), "Nirav living-wage policy");
  assert.equal(nextUniqueDraftTitle("Nirav living-wage policy", ["Nirav living-wage policy 1", "Nirav living-wage policy 3"]), "Nirav living-wage policy 4");
  assert.equal(nextUniqueDraftTitle("Nirav living-wage policy", ["Nirav living-wage policy"]), "Nirav living-wage policy 2");
  assert.equal(nextUniqueDraftTitle("Nirav living-wage policy", ["Nirav living-wage policy", "Nirav living-wage policy"]), "Nirav living-wage policy 3");
  assert.equal(nextUniqueDraftTitle("Nirav (North) policy", ["Nirav (North) policy"]), "Nirav (North) policy 2");
});

test("All groups drafts by policy type and a selected type returns only its group", () => {
  const documents = [draft("one", "One"), { ...draft("two", "Two"), policyType: "ethics" as const }];
  const all = groupDraftsByPolicyType(documents);
  assert.deepEqual(all.map((group) => [group.policyType, group.documents.map(({ id }) => id)]), [
    ["environmental", ["one"]],
    ["ethics", ["two"]],
  ]);
  assert.deepEqual(groupDraftsByPolicyType(documents, "ethics").map(({ policyType, documents: group }) => [policyType, group.map(({ id }) => id)]), [["ethics", ["two"]]]);
});
