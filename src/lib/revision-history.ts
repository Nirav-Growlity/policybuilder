import { LEGACY_REVISION_HISTORY_DEFAULT, REVISION_HISTORY_DEFAULT } from "./constants";
import type { Policy, ReviewFrequency, RevisionEntry } from "./types";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAJOR_REVISION_RE = /^(\d+)\.0$/;

function isValidIsoDate(value?: string): value is string {
  if (!value) return false;
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return date.getUTCFullYear() === Number(year)
    && date.getUTCMonth() === Number(month) - 1
    && date.getUTCDate() === Number(day);
}

function formatRevisionDate(isoDate: string): string {
  const [, year, month, day] = DATE_RE.exec(isoDate)!;
  return `${day}-${month}-${year}`;
}

function scheduledDate(effectiveDate: string, monthOffset: number): string {
  const [, year, month, day] = DATE_RE.exec(effectiveDate)!;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1 + monthOffset, 1));
  const targetYear = date.getUTCFullYear();
  const targetMonth = date.getUTCMonth() + 1;
  const maxDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(Number(day), maxDay)).padStart(2, "0")}`;
}

const FREQUENCY_MONTHS: Record<ReviewFrequency, number> = {
  Quarterly: 3,
  "Half-Yearly": 6,
  Yearly: 12,
  "Bi-Yearly": 24,
};

function isLegacyDefault(entries: RevisionEntry[]): boolean {
  return entries.length === LEGACY_REVISION_HISTORY_DEFAULT.length
    && entries.every((entry, index) => {
      const legacy = LEGACY_REVISION_HISTORY_DEFAULT[index];
      return entry.revisionNo === legacy.revisionNo
        && entry.date === legacy.date
        && entry.description === legacy.description;
    });
}

function inferCustomAnchor(revisionNo: string, fallback: number): number {
  const match = /^(\d+)(?:\.|$)/.exec(revisionNo.trim());
  return match ? Math.max(0, Number(match[1])) : fallback;
}

function tagLegacyEntries(entries: RevisionEntry[]): RevisionEntry[] {
  const lastScheduledIndex = entries.reduce(
    (last, entry) => MAJOR_REVISION_RE.test(entry.revisionNo) ? Math.max(last, Number(entry.revisionNo.split(".")[0])) : last,
    0,
  );

  return entries.map((entry) => {
    if (entry.source) {
      return entry.source === "custom"
        ? { ...entry, scheduleAnchor: entry.scheduleAnchor ?? inferCustomAnchor(entry.revisionNo, lastScheduledIndex) }
        : { ...entry };
    }

    if (MAJOR_REVISION_RE.test(entry.revisionNo)) return { ...entry, source: "scheduled" };
    return {
      ...entry,
      source: "custom",
      scheduleAnchor: inferCustomAnchor(entry.revisionNo, lastScheduledIndex),
    };
  });
}

function buildScheduledEntries(
  effectiveDate: string,
  lastReviewDate: string | undefined,
  previousScheduled: RevisionEntry[],
  frequency: ReviewFrequency,
): RevisionEntry[] {
  const validEffectiveDate = isValidIsoDate(effectiveDate) ? effectiveDate : "";
  if (!validEffectiveDate) return [];

  const validLastReviewDate = isValidIsoDate(lastReviewDate) && lastReviewDate >= validEffectiveDate
    ? lastReviewDate
    : "";
  const intervalMonths = FREQUENCY_MONTHS[frequency] || FREQUENCY_MONTHS.Yearly;
  const dates = [validEffectiveDate];
  if (validLastReviewDate && validLastReviewDate > validEffectiveDate) {
    if (intervalMonths === FREQUENCY_MONTHS.Yearly) {
      const yearSpan = Number(DATE_RE.exec(validLastReviewDate)![1]) - Number(DATE_RE.exec(validEffectiveDate)![1]);
      const count = yearSpan === 0 ? 2 : yearSpan + 1;
      for (let index = 1; index < count; index += 1) {
        dates.push(index === count - 1
          ? validLastReviewDate
          : scheduledDate(validEffectiveDate, intervalMonths * index));
      }
    } else {
      for (let index = 1; ; index += 1) {
        const date = scheduledDate(validEffectiveDate, intervalMonths * index);
        if (date >= validLastReviewDate) {
          if (date !== validLastReviewDate) dates.push(validLastReviewDate);
          break;
        }
        dates.push(date);
      }
    }
  }

  const entries: RevisionEntry[] = [];
  for (let index = 0; index < dates.length; index += 1) {
    const prior = previousScheduled[index];
    const date = dates[index];
    // Preserve the existing same-period minor revision convention for annual schedules.
    const samePeriodReview = index === 1 && intervalMonths === 12
      && date.slice(0, 4) === validEffectiveDate.slice(0, 4);
    let revisionNo = samePeriodReview ? "0.1" : `${index}.0`;
    if (prior && !(samePeriodReview && prior.revisionNo === "1.0")) revisionNo = prior.revisionNo;

    entries.push({
      revisionNo,
      date: formatRevisionDate(date),
      description: prior?.description ?? (index === 0 ? "Initial release of policy" : ""),
      source: "scheduled",
    });
  }

  return entries;
}

function mergeScheduledAndCustom(scheduled: RevisionEntry[], custom: RevisionEntry[]): RevisionEntry[] {
  if (!scheduled.length) return custom;
  const byAnchor = new Map<number, RevisionEntry[]>();
  for (const entry of custom) {
    const anchor = Math.min(Math.max(entry.scheduleAnchor ?? scheduled.length - 1, -1), scheduled.length - 1);
    const rows = byAnchor.get(anchor) || [];
    rows.push(entry);
    byAnchor.set(anchor, rows);
  }

  const merged = [...(byAnchor.get(-1) || [])];
  scheduled.forEach((entry, index) => {
    merged.push(entry, ...(byAnchor.get(index) || []));
  });
  return merged;
}

/** Build and reconcile frequency-based date-linked rows while retaining custom revisions. */
export function resolveRevisionHistory(
  entries: RevisionEntry[] | undefined,
  effectiveDate: string,
  lastReviewDate?: string,
  frequency: ReviewFrequency = "Yearly",
): RevisionEntry[] {
  const provided = Array.isArray(entries) ? entries : [];
  const legacyStaticDefault = isLegacyDefault(provided);
  if (legacyStaticDefault) {
    // The old fixed dates were sample content, not a user's dated history.
    if (!isValidIsoDate(effectiveDate)) return REVISION_HISTORY_DEFAULT.map((entry) => ({ ...entry }));
  }

  const tagged = tagLegacyEntries(provided);
  if (!isValidIsoDate(effectiveDate)) {
    if (tagged.length && !isLegacyDefault(provided)) return tagged;
    return REVISION_HISTORY_DEFAULT.map((entry) => ({ ...entry }));
  }

  const previousScheduled = legacyStaticDefault
    ? []
    : tagged.filter((entry) => entry.source === "scheduled");
  const custom = tagged.filter((entry) => entry.source === "custom");
  const scheduled = buildScheduledEntries(effectiveDate, lastReviewDate, previousScheduled, frequency);
  return mergeScheduledAndCustom(scheduled, custom);
}

/** Normalize persisted policy data and keep schedule-derived rows synchronized with its dates. */
export function normalizePolicyRevisionHistory(policy: Policy): Policy {
  return {
    ...policy,
    revisionHistory: resolveRevisionHistory(
      policy.revisionHistory,
      policy.company.effectiveDate,
      policy.company.lastReviewDate,
      policy.company.reviewFrequency,
    ),
  };
}

/** Suggest the next minor revision after a row in the same major release. */
export function suggestMinorRevisionNumber(entries: RevisionEntry[], rowIndex: number): string {
  const current = entries[rowIndex]?.revisionNo.trim() || "0.0";
  const majorMatch = /^(\d+)(?:\.(\d+))?$/.exec(current);
  const major = majorMatch ? Number(majorMatch[1]) : 0;
  const minorVersions = entries
    .map((entry) => /^(\d+)\.(\d+)$/.exec(entry.revisionNo.trim()))
    .filter((match): match is RegExpExecArray => !!match && Number(match[1]) === major)
    .map((match) => Number(match[2]));
  return `${major}.${Math.max(0, ...minorVersions) + 1}`;
}

/** Find the scheduled row that a custom revision should follow. */
export function scheduleAnchorAfter(entries: RevisionEntry[], rowIndex: number): number {
  const row = entries[rowIndex];
  if (row?.source === "scheduled") {
    return entries.slice(0, rowIndex + 1).filter((entry) => entry.source === "scheduled").length - 1;
  }
  if (row?.source === "custom" && row.scheduleAnchor !== undefined) return row.scheduleAnchor;
  return entries.filter((entry) => entry.source === "scheduled").length - 1;
}
