import { generatePreviewPdf } from "./print-document";
import { normalizePolicyQuantitative } from "../quantitative";
import type { Policy } from "../types";

const pdfCache = new Map<string, Buffer>();
const pdfRequests = new Map<string, Promise<Buffer>>();
const MAX_CACHED_PDFS = 4;

export function generatePdf(inputPolicy: Policy): Promise<Buffer> {
  const policy = normalizePolicyQuantitative(inputPolicy);
  const key = JSON.stringify(policy);
  const cached = pdfCache.get(key);
  if (cached) {
    pdfCache.delete(key);
    pdfCache.set(key, cached);
    return Promise.resolve(cached);
  }
  const pending = pdfRequests.get(key);
  if (pending) return pending;
  const request = generatePreviewPdf(policy).then(pdf => {
    pdfCache.delete(key);
    pdfCache.set(key, pdf);
    while (pdfCache.size > MAX_CACHED_PDFS) pdfCache.delete(pdfCache.keys().next().value!);
    return pdf;
  }).finally(() => pdfRequests.delete(key));
  pdfRequests.set(key, request);
  return request;
}
