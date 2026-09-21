import { LEGACY_REVISION_HISTORY_DEFAULT, REVISION_HISTORY_DEFAULT } from "./constants";
import type { Policy, RevisionEntry } from "./types";

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

function anniversaryDate(effectiveDate: string, yearOffset: number): string {
  const [, year, month, day] = DATE_RE.exec(effectiveDate)!;
  const targetYear = Number(year) + yearOffset;
  const targetMonth = Number(month);
  const maxDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${month}-${String(Math.min(Number(day), maxDay)).padStart(2, "0")}`;
}

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
): RevisionEntry[] {
  const validEffectiveDate = isValidIsoDate(effectiveDate) ? effectiveDate : "";
  if (!validEffectiveDate) return [];

  const validLastReviewDate = isValidIsoDate(lastReviewDate) && lastReviewDate >= validEffectiveDate
    ? lastReviewDate
    : "";
  const previousYear = Number(DATE_RE.exec(validEffectiveDate)![1]);
  const reviewYear = validLastReviewDate ? Number(DATE_RE.exec(validLastReviewDate)![1]) : previousYear;
  const yearSpan = reviewYear - previousYear;
  const entries: RevisionEntry[] = [];
  const count = yearSpan === 0 && validLastReviewDate && validLastReviewDate !== validEffectiveDate
    ? 2
    : yearSpan + 1;

  for (let index = 0; index < count; index += 1) {
    const prior = previousScheduled[index];
    let date = index === 0
      ? validEffectiveDate
      : index === yearSpan && validLastReviewDate
        ? validLastReviewDate
        : anniversaryDate(validEffectiveDate, index);

    // If the review happens in the effective year, the second row is a same-year minor revision.
    let revisionNo = yearSpan === 0 && index === 1 ? "0.1" : `${index}.0`;
    if (prior && !(yearSpan === 0 && index === 1 && prior.revisionNo === "1.0")) revisionNo = prior.revisionNo;
    if (index === 0) date = validEffectiveDate;
    if (index === count - 1 && validLastReviewDate) date = validLastReviewDate;

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

/** Build and reconcile date-linked annual rows while retaining custom revisions. */
export function resolveRevisionHistory(
  entries: RevisionEntry[] | undefined,
  effectiveDate: string,
  lastReviewDate?: string,
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
  const scheduled = buildScheduledEntries(effectiveDate, lastReviewDate, previousScheduled);
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
