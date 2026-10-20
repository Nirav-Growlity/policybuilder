import { generatePreviewPdf } from "./print-document";
import { normalizePolicyQuantitative } from "../quantitative";
import { renderPolicyTypstPdf } from "../typst/policy/render";
import type { Policy } from "../types";
import type { AuthorApprovalRenderData } from "../document-render-model";

/**
 * `chromium` prints the HTML preview with a headless browser; `typst` lays the
 * same render model out with the warm Typst compiler (lib/typst/policy). The
 * default stays `chromium` until every template is signed off
 * (.scratch/policy-typst/issues/10-signoff.md).
 */
export type PolicyPdfEngine = "chromium" | "typst";

export function policyPdfEngine(): PolicyPdfEngine {
  return process.env.POLICY_PDF_ENGINE === "typst" ? "typst" : "chromium";
}

const pdfCache = new Map<string, Buffer>();
const pdfRequests = new Map<string, Promise<Buffer>>();
const MAX_CACHED_PDFS = 4;

function render(policy: Policy, authorApproval: AuthorApprovalRenderData | undefined, engine: PolicyPdfEngine) {
  return engine === "typst" ? renderPolicyTypstPdf(policy, authorApproval) : generatePreviewPdf(policy, authorApproval);
}

export function generatePdf(inputPolicy: Policy, authorApproval?: AuthorApprovalRenderData, cacheScope = "public-template", engine = policyPdfEngine()): Promise<Buffer> {
  const policy = normalizePolicyQuantitative(inputPolicy);
  // A signed PDF is personal data. Avoid retaining it or its signature bytes in
  // the shared process cache; callers requesting an unsigned PDF keep caching.
  if (authorApproval) return render(policy, authorApproval, engine);
  const key = JSON.stringify([engine, cacheScope, policy]);
  const cached = pdfCache.get(key);
  if (cached) {
    pdfCache.delete(key);
    pdfCache.set(key, cached);
    return Promise.resolve(cached);
  }
  const pending = pdfRequests.get(key);
  if (pending) return pending;
  const request = render(policy, authorApproval, engine).then(pdf => {
    pdfCache.delete(key);
    pdfCache.set(key, pdf);
    while (pdfCache.size > MAX_CACHED_PDFS) pdfCache.delete(pdfCache.keys().next().value!);
    return pdf;
  }).finally(() => pdfRequests.delete(key));
  pdfRequests.set(key, request);
  return request;
}
