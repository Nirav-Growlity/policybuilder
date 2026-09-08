/** Print-first cover settings shared by browser/PDF and Word. No fallback artwork. */
export const COVER_DESIGNS = {
  "sample-quiet-title": { align: "left", titlePt: 34, spaceMm: 48, rule: "none", columns: 2 },
  "sample-control-grid": { align: "left", titlePt: 30, spaceMm: 30, rule: "top", columns: 2 },
  "sample-table-ledger": { align: "left", titlePt: 32, spaceMm: 42, rule: "bottom", columns: 1 },
  "sample-framework-map": { align: "left", titlePt: 34, spaceMm: 58, rule: "top", columns: 2 },
  "sample-compact-strip": { align: "left", titlePt: 28, spaceMm: 24, rule: "bottom", columns: 2 },
  "sample-editorial-image": { align: "left", titlePt: 42, spaceMm: 60, rule: "none", columns: 2 },
  "sample-heritage-crest": { align: "center", titlePt: 34, spaceMm: 52, rule: "none", columns: 2 },
  "sample-operating-tabs": { align: "left", titlePt: 30, spaceMm: 36, rule: "top", columns: 1 },
} as const;
export function coverDesign(scene: string) {
  return COVER_DESIGNS[scene as keyof typeof COVER_DESIGNS] || COVER_DESIGNS["sample-quiet-title"];
}
