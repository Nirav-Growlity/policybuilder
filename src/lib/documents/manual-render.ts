/**
 * One entry point for the Documents render routes (preview, PDF, Word): reads
 * a stored or posted manual as an SOP manual or an employee handbook and
 * prepares the shared render model for it.
 */
import { renderHandbookPdf, prepareHandbookRender } from "../handbook/render-service";
import { handbookManualSchema, looksLikeHandbook } from "../handbook/schema";
import type { HandbookManual } from "../handbook/types";
import type { ManualKind } from "../manual-repository";
import { prepareSopRender, renderManualPdf, type PreparedSopRender } from "../sop/render-service";
import { sopManualSchema } from "../sop/schema";
import type { SopManual } from "../sop/types";

export type ParsedManual = { kind: "sop"; manual: SopManual } | { kind: "handbook"; manual: HandbookManual };

/** The manual validated against its kind's schema, or null when it does not fit. */
export function parseManualOfKind(kind: ManualKind, value: unknown): ParsedManual | null {
  if (kind === "handbook") {
    const parsed = handbookManualSchema.safeParse(value);
    return parsed.success ? { kind, manual: parsed.data as HandbookManual } : null;
  }
  const parsed = sopManualSchema.safeParse(value);
  return parsed.success ? { kind, manual: parsed.data as SopManual } : null;
}

/** A posted manual of either kind, told apart by its shape (handbooks have chapters). */
export function parseAnyManual(value: unknown): ParsedManual | null {
  return parseManualOfKind(looksLikeHandbook(value) ? "handbook" : "sop", value);
}

/** The ids of the manual's items (SOPs or chapters). */
export function manualItemIds(parsed: ParsedManual): string[] {
  return parsed.kind === "sop" ? parsed.manual.sops.map((sop) => sop.id) : parsed.manual.chapters.map((chapter) => chapter.id);
}

export type ManualRenderOptions = { includeEmptySections?: boolean; onlyItemIds?: string[] };

export function prepareParsedRender(parsed: ParsedManual, orgId: number, options: ManualRenderOptions = {}): Promise<PreparedSopRender> {
  const base = { includeEmptySections: options.includeEmptySections };
  return parsed.kind === "sop"
    ? prepareSopRender(parsed.manual, orgId, { ...base, ...(options.onlyItemIds ? { onlySopIds: options.onlyItemIds } : {}) })
    : prepareHandbookRender(parsed.manual, orgId, { ...base, ...(options.onlyItemIds ? { onlyChapterIds: options.onlyItemIds } : {}) });
}

export function renderParsedPdf(parsed: ParsedManual, orgId: number, options: ManualRenderOptions = {}) {
  const base = { includeEmptySections: options.includeEmptySections };
  return parsed.kind === "sop"
    ? renderManualPdf(parsed.manual, orgId, { ...base, ...(options.onlyItemIds ? { onlySopIds: options.onlyItemIds } : {}) })
    : renderHandbookPdf(parsed.manual, orgId, { ...base, ...(options.onlyItemIds ? { onlyChapterIds: options.onlyItemIds } : {}) });
}

/** "Acme-Employee-Handbook.pdf"; the kind's name when the title has no usable characters. */
export function manualFileName(title: string, kind: ManualKind, extension: "pdf" | "docx"): string {
  const fallback = kind === "handbook" ? "Employee-Handbook" : "SOP-Manual";
  return `${title.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-") || fallback}.${extension}`;
}
