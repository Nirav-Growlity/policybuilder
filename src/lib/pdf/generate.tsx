import { generatePreviewPdf } from "./preview-pdf";
import { normalizePolicyQuantitative } from "../quantitative";
import type { Policy } from "../types";

export function generatePdf(inputPolicy: Policy): Promise<Buffer> {
  return generatePreviewPdf(normalizePolicyQuantitative(inputPolicy));
}
