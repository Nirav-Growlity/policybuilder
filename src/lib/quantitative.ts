import type { Policy, QuantitativeTarget } from "./types";

export const REPORTING_FREQUENCY = "Annually" as const;
export const TARGET_PERIOD = "Target period" as const;

const PERCENTAGE_SIGNALS = /\b(?:reduce|decrease|increase|improve|achieve|maintain|ensure|cover(?:age)?|divert(?:ed)?|source|adopt|engage|participat(?:e|ion)|compliance|renewab|recycl|reuse|train(?:ing)?|workforce|supplier|spend|certif)\b/i;
const UNIT_SIGNALS = /\b(?:kg|tonnes?|tco2e|co2e|kwh|mwh|lit(?:re|er)s?|hours?|days?|sites?|facilit(?:y|ies)|initiatives?|audits?|incidents?|units?|per\s+(?:employee|unit|tonne|site|product)|rate|intensity|count|number|zero|no\s+exceedance)\b/i;

export function normalizeQuantitativeSubtopics(value?: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function targetRequiresPercentage(target: string): boolean {
  const text = target.trim();
  return Boolean(text && PERCENTAGE_SIGNALS.test(text) && !UNIT_SIGNALS.test(text));
}

export function validateQuantitativeTarget(target: Partial<QuantitativeTarget>): string[] {
  const issues: string[] = [];
  const text = (target.target || "").trim();
  if (targetRequiresPercentage(text) && !/\b\d+(?:\.\d+)?\s*%/.test(text)) {
    issues.push("Add a percentage (%) because this target describes a percentage-based outcome.");
  }
  if (text && target.reportingFrequency !== REPORTING_FREQUENCY && (!target.baseline || !target.deadline)) {
    issues.push("Specify both a baseline year and an achievement year.");
  }
  return issues;
}

export function formatQuantitativeTargetSentence(target: Pick<QuantitativeTarget, "target" | "baseline" | "deadline" | "reportingFrequency">): string {
  const text = target.target.trim();
  if (!text || target.reportingFrequency === REPORTING_FREQUENCY) return text;
  const baseline = target.baseline || "baseline year not set";
  const achievement = target.deadline || "achievement year not set";
  if (text.includes(baseline) && text.includes(achievement)) return text;
  const sentence = text.replace(/[.!?]+\s*$/, "");
  return `${sentence} (baseline year: ${baseline}; achievement year: ${achievement}).`;
}

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
    ...(Array.isArray(target.subtopics) ? { subtopics: normalizeQuantitativeSubtopics(target.subtopics) } : {}),
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

export function syncQuantitativeAreas(
  quantitative: Policy["quantitative"],
  focusAreas: string[],
  reportingPeriod: "FY" | "CY" = "FY"
): Policy["quantitative"] {
  const areas = focusAreas.filter(Boolean);
  const focusAreaTargets = new Map(quantitative.map((area) => [area.area, area.targets]));
  const syncedFocusAreas = areas.map((area) => ({
    area,
    targets: (focusAreaTargets.get(area) || []).map((target) => normalizeQuantitativeTarget(target, reportingPeriod)),
  }));
  const customAreas = quantitative
    .filter((area) => !areas.includes(area.area))
    .map((area) => ({
      ...area,
      targets: area.targets.map((target) => normalizeQuantitativeTarget(target, reportingPeriod)),
    }));
  return [...syncedFocusAreas, ...customAreas];
}
