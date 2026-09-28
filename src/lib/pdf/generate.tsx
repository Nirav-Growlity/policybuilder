import { generatePreviewPdf } from "./print-document";
import { normalizePolicyQuantitative } from "../quantitative";
import type { Policy } from "../types";
import type { AuthorApprovalRenderData } from "../document-render-model";

const pdfCache = new Map<string, Buffer>();
const pdfRequests = new Map<string, Promise<Buffer>>();
const MAX_CACHED_PDFS = 4;

export function generatePdf(inputPolicy: Policy, authorApproval?: AuthorApprovalRenderData): Promise<Buffer> {
  const policy = normalizePolicyQuantitative(inputPolicy);
  // A signed PDF is personal data. Avoid retaining it or its signature bytes in
  // the shared process cache; callers requesting an unsigned PDF keep caching.
  if (authorApproval) return generatePreviewPdf(policy, authorApproval);
  const key = JSON.stringify(policy);
  const cached = pdfCache.get(key);
  if (cached) {
    pdfCache.delete(key);
    pdfCache.set(key, cached);
    return Promise.resolve(cached);
  }
  const pending = pdfRequests.get(key);
  if (pending) return pending;
  const request = generatePreviewPdf(policy, authorApproval).then(pdf => {
    pdfCache.delete(key);
    pdfCache.set(key, pdf);
    while (pdfCache.size > MAX_CACHED_PDFS) pdfCache.delete(pdfCache.keys().next().value!);
    return pdf;
  }).finally(() => pdfRequests.delete(key));
  pdfRequests.set(key, request);
  return request;
}
