import assert from "node:assert/strict";
import test from "node:test";
import { formatToDisplay, parseToIso } from "../components/ui/calendar";

test("formatToDisplay converts ISO YYYY-MM-DD to display DD-MM-YYYY", () => {
  assert.equal(formatToDisplay("2025-10-18"), "18-10-2025");
  assert.equal(formatToDisplay("2026-01-01"), "01-01-2026");
  assert.equal(formatToDisplay(""), "");
  assert.equal(formatToDisplay(undefined), "");
  assert.equal(formatToDisplay("invalid-date"), "");
});

test("parseToIso normalizes DD-MM-YYYY and YYYY-MM-DD to standard ISO", () => {
  assert.equal(parseToIso("18-10-2025"), "2025-10-18");
  assert.equal(parseToIso("2025-10-18"), "2025-10-18");
  assert.equal(parseToIso(""), "");
  assert.equal(parseToIso(undefined), "");
});

test("effective date acts as baseline: dates strictly before baseline are identified", () => {
  const effectiveDate = "2025-10-18";

  const isBeforeBaseline = (date: string, baseline: string) => Boolean(baseline && date && date < baseline);

  // Dates before effective date
  assert.equal(isBeforeBaseline("2025-10-17", effectiveDate), true);
  assert.equal(isBeforeBaseline("2024-12-31", effectiveDate), true);

  // Effective date itself (allowed)
  assert.equal(isBeforeBaseline("2025-10-18", effectiveDate), false);

  // Future dates (allowed)
  assert.equal(isBeforeBaseline("2025-10-19", effectiveDate), false);
  assert.equal(isBeforeBaseline("2026-10-18", effectiveDate), false);
});

test("baseline reset logic resets dates that precede updated effective date", () => {
  const previousState = {
    effectiveDate: "2025-05-01",
    lastReviewDate: "2025-05-01",
    reviewDate: "2026-05-01",
  };

  const applyNewEffectiveDate = (state: typeof previousState, newEffective: string) => {
    const updated = { ...state, effectiveDate: newEffective };
    if (newEffective && updated.lastReviewDate && updated.lastReviewDate < newEffective) {
      updated.lastReviewDate = "";
    }
    if (newEffective && updated.reviewDate && updated.reviewDate < newEffective) {
      updated.reviewDate = "";
    }
    return updated;
  };

  // Move effective date forward to 2025-06-01: lastReviewDate (2025-05-01) is cleared
  const updated1 = applyNewEffectiveDate(previousState, "2025-06-01");
  assert.equal(updated1.effectiveDate, "2025-06-01");
  assert.equal(updated1.lastReviewDate, "");
  assert.equal(updated1.reviewDate, "2026-05-01");

  // Move effective date to 2027-01-01: both lastReviewDate and reviewDate (2026-05-01) are cleared
  const updated2 = applyNewEffectiveDate(previousState, "2027-01-01");
  assert.equal(updated2.effectiveDate, "2027-01-01");
  assert.equal(updated2.lastReviewDate, "");
  assert.equal(updated2.reviewDate, "");
});
