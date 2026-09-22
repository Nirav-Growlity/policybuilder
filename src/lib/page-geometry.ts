import type { PageBorder } from "./types";

export const A4 = { widthMm: 210, heightMm: 297, pointsPerMm: 72 / 25.4 };
export function normalizePageBorder(value: unknown): PageBorder {
  const raw = value && typeof value === "object" ? value as Partial<PageBorder> : {};
  const finite = (v: unknown, fallback: number) => typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    enabled: raw.enabled === true,
    widthPt: Math.round(Math.min(6, Math.max(.5, finite(raw.widthPt, 1))) * 2) / 2,
    insetMm: Math.min(20, Math.max(5, finite(raw.insetMm, 10))),
    scope: raw.scope === "all" || raw.scope === "cover" ? raw.scope : "all-except-cover",
    ...(typeof raw.color === "string" && /^#[a-f0-9]{6}$/i.test(raw.color) ? { color: raw.color.toUpperCase() } : {}),
  };
}

/** Whether a zero-based PDF page index receives the configured page border. */
export function pageBorderAppliesToPage(scope: PageBorder["scope"], pageIndex: number): boolean {
  return scope === "all" || (scope === "cover" ? pageIndex === 0 : pageIndex > 0);
}

/** Reserve room for border stroke, running furniture, and body copy. */
export function pageMarginMm(border: PageBorder): number {
  return border.enabled ? Math.max(22, border.insetMm + border.widthPt / A4.pointsPerMm / 2 + 9) : 22;
}

/** Keep running furniture safely on the inside of an enabled page border. */
export function pageBorderContentInsetMm(border: PageBorder): number {
  return border.enabled ? border.insetMm + border.widthPt / A4.pointsPerMm / 2 + 2 : pageMarginMm(border);
}

/** Return the effective native Word border spacing, which is capped at 31pt. */
export function pageBorderSpaceMm(border: PageBorder): number {
  return border.enabled ? Math.min(31, border.insetMm * A4.pointsPerMm) / A4.pointsPerMm : 0;
}

/** Reserve footer room above the rendered border without changing footer content. */
export function pageFooterDistanceMm(border: PageBorder, clearanceMm = 6.5): number {
  return border.enabled ? pageBorderSpaceMm(border) + border.widthPt / A4.pointsPerMm / 2 + clearanceMm : 12.5;
}

/** Move PDF footer furniture above the rendered border stroke. */
export function pageFooterVerticalShiftMm(border: PageBorder, clearanceMm = 6.5): number {
  return border.enabled ? border.widthPt / A4.pointsPerMm / 2 + clearanceMm : 0;
}

/** Move header furniture below the top border rather than straddling it. */
export function pageBorderHeaderVerticalShiftMm(border: PageBorder): number {
  return border.enabled ? Math.max(3, border.insetMm - 7) : 0;
}

/** Position a running logo just inside the page border, with a small breathing room. */
export function pageHeaderLogoTopMm(border: PageBorder, gapMm = 2): number {
  return border.enabled ? border.insetMm + border.widthPt / A4.pointsPerMm / 2 + gapMm : 4;
}

/** Reserve the complete header band so body content starts after the logo and a visible gap. */
export function pageHeaderMarginMm(border: PageBorder, logoHeightMm: number, gapMm = 10): number {
  return Math.max(pageMarginMm(border), pageHeaderLogoTopMm(border, 2) + logoHeightMm + gapMm);
}
