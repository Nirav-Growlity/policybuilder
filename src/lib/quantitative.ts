import type { Policy, QuantitativeTarget } from "./types";

export const REPORTING_FREQUENCY = "Annually" as const;
export const TARGET_PERIOD = "Target period" as const;

export function formatQuantitativeYear(year: number, reportingPeriod: "FY" | "CY" = "FY") {
  return reportingPeriod === "FY"
    ? `FY ${year}-${String(year + 1).slice(-2)}`
    : String(year);
}

export function getQuantitativeYearOptions(reportingPeriod: "FY" | "CY" = "FY", currentYear = new Date().getFullYear()) {
  return {
    baseline: Array.from({ length: currentYear - 2020 + 1 }, (_, i) => formatQuantitativeYear(2020 + i, reportingPeriod)),
    deadline: Array.from({ length: 2050 - currentYear }, (_, i) => formatQuantitativeYear(currentYear + 1 + i, reportingPeriod)),
  };
}

export function normalizeQuantitativeTarget(
  target: Partial<QuantitativeTarget>,
  reportingPeriod: "FY" | "CY" = "FY"
): QuantitativeTarget {
  const years = getQuantitativeYearOptions(reportingPeriod);
  // Earlier versions assigned "Annually" to every target while retaining dates.
  // Treat those persisted rows as date-based targets so the new default is preserved.
  const isLegacyAnnualWithDates =
    target.reportingFrequency === REPORTING_FREQUENCY &&
    Boolean(target.baseline || target.deadline);
  const reportingFrequency = target.reportingFrequency === REPORTING_FREQUENCY && !isLegacyAnnualWithDates
    ? REPORTING_FREQUENCY
    : TARGET_PERIOD;
  return {
    target: target.target || "",
    baseline: reportingFrequency === REPORTING_FREQUENCY ? "" : (years.baseline.includes(target.baseline || "") ? target.baseline! : years.baseline.at(-1)!),
    deadline: reportingFrequency === REPORTING_FREQUENCY ? "" : (years.deadline.includes(target.deadline || "") ? target.deadline! : years.deadline[0]),
    reportingFrequency,
  };
}

export function normalizePolicyQuantitative(policy: Policy): Policy {
  const reportingPeriod = policy.company.reportingPeriod || "FY";
  return {
    ...policy,
    quantitative: (policy.quantitative || []).map((area) => ({
      ...area,
      targets: (area.targets || []).map((target) => normalizeQuantitativeTarget(target, reportingPeriod)),
    })),
  };
}
