import { prepareManualRender, type PreparedSopRender } from "../sop/render-service";
import { renderSopManual, type CompiledManual, type ManualAsset } from "../typst/engine";
import type { SopRenderModel } from "../sop/render-types";
import { buildHandbookRenderModel, type HandbookRenderOptions } from "./render-model";
import type { HandbookManual } from "./types";

type Options = Omit<HandbookRenderOptions, "logoPath" | "coverImagePath">;

/** Images and render model for a handbook; the same pipeline as SOP manuals. */
export function prepareHandbookRender(manual: HandbookManual, orgId: number, options: Options = {}): Promise<PreparedSopRender> {
  return prepareManualRender(manual, orgId, Boolean(options.onlyChapterIds), (logoPath) => buildHandbookRenderModel(manual, { ...options, logoPath }));
}

export async function renderHandbookPdf(manual: HandbookManual, orgId: number, options: Options = {}): Promise<CompiledManual & { model: SopRenderModel; assets: ManualAsset[] }> {
  const prepared = await prepareHandbookRender(manual, orgId, options);
  return { ...renderSopManual(prepared.model, prepared.assets), ...prepared };
}
