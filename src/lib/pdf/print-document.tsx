import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { chromium, type Browser, type BrowserContext } from "playwright-core";
import { PDFDocument, PDFDict, PDFName, rgb } from "pdf-lib";
import { PolicyCoverPreview, PolicyPreview } from "@/components/policy/policy-preview";
import { getPolicyDocumentTheme, runningLogoFit } from "@/lib/document-themes";
import { buildDocumentRenderModel, getRunningHeaderBrand } from "@/lib/document-render-model";
import { A4, pageBorderContentInsetMm, pageFooterVerticalShiftMm, pageHeaderLogoTopMm, pageHeaderMarginMm, pageMarginMm } from "@/lib/page-geometry";
import type { Policy, PageBorder, ThemeBackground } from "@/lib/types";

let pdfBrowserPromise: Promise<Browser> | null = null;
const customCoverCache = new Map<string, Promise<Uint8Array>>();
const PDF_CONTEXT_TIMEOUT_MS = 20_000;
const PDF_PAGE_TIMEOUT_MS = 30_000;
const PDF_RENDER_TIMEOUT_MS = 65_000;
const CUSTOM_COVER_RENDER_TIMEOUT_MS = 45_000;
const PDF_CONTEXT_CLEANUP_TIMEOUT_MS = 2_000;
const pdfContextClosures = new WeakMap<BrowserContext, Promise<void>>();

export async function generatePreviewPdf(policy: Policy): Promise<Buffer> {
  const model = buildDocumentRenderModel(policy);
  const theme = model.theme;
  const brand = getRunningHeaderBrand(policy.company);
  const logoFit = runningLogoFit(theme.logoScale);
  const hasLogo = brand.kind === "logo";
  const logoHeight = hasLogo ? logoFit.heightMm : 0;
  const horizontalMargin = pageMarginMm(theme.pageBorder);
  const topMargin = hasLogo ? pageHeaderMarginMm(theme.pageBorder, logoHeight) : horizontalMargin;
  let customCoverData: Uint8Array | undefined;
  if (model.cover.composition) {
    try {
      customCoverData = await getCachedCustomCoverPng(policy, model);
    } catch (error) {
      // Keep PDF preview/export available if the optional full-bleed cover
      // raster takes too long. PolicyPreview will render the editable cover
      // composition directly into the PDF page as a fallback.
      console.warn("Custom cover rasterization failed; using the in-flow cover fallback.", error);
    }
  }
  const customCoverPng = customCoverData ? `data:image/png;base64,${Buffer.from(customCoverData).toString("base64")}` : undefined;
  const markup = await inlinePublicAssets(renderToStaticMarkup(<PolicyPreview policy={policy} customCoverPng={customCoverPng} />));
  const { context } = await createPdfContextWithTimeout();
  const page = await withTimeout(
    context.newPage(),
    PDF_PAGE_TIMEOUT_MS,
    () => { void closePdfContext(context); },
    "PDF page creation timed out",
  );
  try {
    return await withTimeout((async () => {
      await page.route(/^https?:/, route => route.abort());
      await page.setContent(createPrintDocument(markup, policy, topMargin, horizontalMargin), { waitUntil: "load", timeout: 20000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode()));
      });
      const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const logoPosition = policy.logoPosition || theme.defaults.logoPosition;
      const logo = brand.kind === "logo" && /^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,/i.test(brand.source)
        ? `<img src="${brand.source}" style="display:block;width:auto;height:auto;max-width:${logoFit.widthMm}mm;max-height:${logoFit.heightMm}mm;object-fit:contain;" alt=""/>`
        : brand.kind === "name" ? `<span>${escape(brand.text)}</span>` : "";
      const headerInset = pageBorderContentInsetMm(theme.pageBorder);
      const logoTop = pageHeaderLogoTopMm(theme.pageBorder);
      const logoCenter = logoTop + (hasLogo ? logoHeight / 2 : 2);
      const headerStyle = `box-sizing:border-box;font-family:Arial;font-size:8px;color:${theme.colors.muted};width:calc(100% - ${headerInset * 2}mm);height:${topMargin}mm;margin:0 ${headerInset}mm;position:relative;display:block;overflow:visible;`;
      const footerHeight = theme.pageBorder.enabled ? Math.max(10, headerInset - 2) : 10;
      const footerShift = pageFooterVerticalShiftMm(theme.pageBorder);
      const footerStyle = `box-sizing:border-box;font-family:Arial;font-size:8px;color:${theme.colors.muted};width:calc(100% - ${headerInset * 2}mm);height:${footerHeight}mm;margin:0 ${headerInset}mm;display:grid;grid-template-columns:1fr 1.5fr 1fr;align-items:center;gap:8mm;position:relative;transform:translateY(-${footerShift}mm);`;
      const brandPosition = logoPosition === "right" ? "right:0;" : logoPosition === "center" ? "left:50%;" : "left:0;";
      const brandMarkup = `<span style="position:absolute;top:${logoCenter}mm;width:${logoFit.widthMm}mm;height:${logoFit.heightMm}mm;display:flex;align-items:center;justify-content:center;transform:${logoPosition === "center" ? "translate(-50%,-50%)" : "translateY(-50%)"};${brandPosition}">${logo}</span>`;
      const reviewInfo = [model.footer.reviewDate, ...model.footer.reviewerDesignations].filter(Boolean).join(" · ");
      const output = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
        headerTemplate: `<div style="${headerStyle}">${brandMarkup}</div>`,
        footerTemplate: `<div style="${footerStyle}"><span><b>Document No.</b> ${escape(model.footer.documentNumber)}</span><span style="text-align:center;"><b>Review</b> ${escape(reviewInfo)}</span><span style="text-align:right;"><b>Page</b> <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
        margin: { top: `${topMargin}mm`, right: `${horizontalMargin}mm`, bottom: `${horizontalMargin}mm`, left: `${horizontalMargin}mm` },
      });
      if (!output.length || output.subarray(0, 5).toString() !== "%PDF-") throw new Error("Invalid PDF output");
      return finalizePdf(output, theme.background, policy.company.companyLogo ? topMargin : 0, customCoverData, theme.pageBorder, theme.colors.primary);
    })(), PDF_RENDER_TIMEOUT_MS, () => { void closePdfContext(context); }, "PDF rendering timed out");
  } finally {
    await closePdfContext(context);
  }
}

async function getCachedCustomCoverPng(policy: Policy, model: ReturnType<typeof buildDocumentRenderModel>): Promise<Uint8Array> {
  const key = JSON.stringify({
    cover: model.cover,
    theme: model.theme,
    typography: model.typography,
    logoPosition: policy.logoPosition,
    companyLogo: policy.company.companyLogo,
  });
  const cached = customCoverCache.get(key);
  if (cached) return cached;
  const pending = renderCustomCoverPng(policy).catch(error => {
    customCoverCache.delete(key);
    throw error;
  });
  customCoverCache.set(key, pending);
  while (customCoverCache.size > 8) customCoverCache.delete(customCoverCache.keys().next().value!);
  return pending;
}

async function renderCustomCoverPng(policy: Policy): Promise<Uint8Array> {
  const markup = await inlinePublicAssets(renderToStaticMarkup(<PolicyCoverPreview policy={policy} />));
  const { context } = await createPdfContextWithTimeout();
  try {
    return await withTimeout((async () => {
      const page = await withTimeout(
        context.newPage(),
        PDF_PAGE_TIMEOUT_MS,
        () => { void closePdfContext(context); },
        "Custom cover page creation timed out",
      );
      await page.setViewportSize({ width: 794, height: 1123 });
      await page.route(/^https?:/, route => route.abort());
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/></head><body>${markup}<style>
        html,body { margin:0!important; padding:0!important; width:210mm; height:297mm; overflow:hidden; background:#fff; }
        .cover-preview-only { width:210mm!important; height:297mm!important; max-width:none!important; overflow:hidden!important; box-shadow:none!important; }
        .cover-preview-only > .policy-cover { width:210mm!important; height:297mm!important; min-height:297mm!important; max-height:297mm!important; overflow:hidden!important; }
        .cover-preview-only .policy-custom-cover { width:210mm!important; height:297mm!important; min-height:297mm!important; max-height:297mm!important; page-break-after:none!important; }
      </style></body></html>`, { waitUntil: "load", timeout: 20000 });
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode().catch(() => undefined)));
      });
      const cover = page.locator(".policy-custom-cover");
      if (!(await cover.count())) throw new Error("Custom cover could not be rendered");
      return await cover.screenshot({ type: "png" });
    })(), CUSTOM_COVER_RENDER_TIMEOUT_MS, () => { void closePdfContext(context); }, "Custom cover rasterization timed out");
  } finally {
    await closePdfContext(context);
  }
}

async function createPdfContextWithTimeout(): Promise<{ context: BrowserContext }> {
  const pending = createPdfContext();
  try {
    // A slow context belongs to this request. Closing the shared browser here
    // would also interrupt other in-flight PDF renders in the same function.
    return await withTimeout(pending, PDF_CONTEXT_TIMEOUT_MS, () => undefined, "Chromium context creation timed out");
  } catch (error) {
    void pending.then(({ context }) => closePdfContext(context), () => undefined);
    throw error;
  }
}

function closePdfContext(context: BrowserContext): Promise<void> {
  const closing = pdfContextClosures.get(context);
  if (closing) return closing;
  const promise = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        context.close().catch(() => undefined),
        new Promise<void>(resolve => { timer = setTimeout(resolve, PDF_CONTEXT_CLEANUP_TIMEOUT_MS); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
  pdfContextClosures.set(context, promise);
  return promise;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try { onTimeout(); } catch { /* Preserve the timeout even if cleanup fails. */ }
      reject(new Error(message));
    }, timeoutMs);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); },
    );
  });
}

async function createPdfContext(): Promise<{ context: BrowserContext }> {
  const browser = await getPdfBrowser();
  return { context: await browser.newContext() };
}

async function getPdfBrowser(): Promise<Browser> {
  if (!pdfBrowserPromise) {
    pdfBrowserPromise = (async () => {
      const launch = await getChromeLaunchOptions();
      return chromium.launch({ ...launch, headless: true, timeout: 15000 });
    })().catch((error) => {
      pdfBrowserPromise = null;
      throw error;
    });
  }
  const browser = await pdfBrowserPromise;
  if (!browser.isConnected()) {
    pdfBrowserPromise = null;
    return getPdfBrowser();
  }
  return browser;
}

/** Paint behind the content streams: Chromium clips CSS backgrounds to @page
 * margins. Native PDF shading reaches the page edges without rasterizing text. */
export async function applyPageBackground(bytes: Uint8Array, background: ThemeBackground, coverHeaderMm = 0): Promise<Buffer> {
  if (background.kind === "solid" && background.color.toUpperCase() === "#FFFFFF" && !coverHeaderMm) return Buffer.from(bytes);
  const pdf = await PDFDocument.load(bytes);
  paintPageBackground(pdf, background, coverHeaderMm);
  return Buffer.from(await pdf.save());
}

function paintPageBackground(pdf: PDFDocument, background: ThemeBackground, coverHeaderMm: number): void {
  const channels = (hex: string) => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  for (const [index, page] of pdf.getPages().entries()) {
    const width = page.getWidth(), height = page.getHeight();
    const { Resources, Contents } = page.node.normalizedEntries();
    let paint: string;
    if (background.kind === "gradient") {
      const coords = background.direction === "horizontal" ? [0, 0, width, 0]
        : background.direction === "vertical" ? [0, height, 0, 0] : [0, height, width, 0];
      const shading = pdf.context.obj({ ShadingType: 2, ColorSpace: "DeviceRGB", Coords: coords,
        Function: { FunctionType: 2, Domain: [0, 1], C0: channels(background.from), C1: channels(background.to), N: 1 }, Extend: [true, true] });
      const shadings = Resources.lookupMaybe(PDFName.of("Shading"), PDFDict) || pdf.context.obj({});
      const name = shadings.uniqueKey("PolicyPageBackground");
      shadings.set(name, pdf.context.register(shading));
      Resources.set(PDFName.of("Shading"), shadings);
      paint = `${name.toString()} sh`;
    } else paint = `${channels(background.color).join(" ")} rg 0 0 ${width} ${height} re f`;
    const backgroundStream = pdf.context.register(pdf.context.flateStream(`q\n${paint}\nQ`));
    if (Contents) Contents.insert(0, backgroundStream);
    else page.node.addContentStream(backgroundStream);
    if (index === 0 && coverHeaderMm) {
      const band = coverHeaderMm * A4.pointsPerMm;
      // Remove the cover's running logo using the same continuous background.
      page.node.addContentStream(pdf.context.register(pdf.context.flateStream(`q\n0 ${height - band} ${width} ${band} re W n\n${paint}\nQ`)));
    }
  }
}

/** Paint the saved cover over the complete first PDF page, including print margins and furniture. */
export async function applyCustomCoverPage(bytes: Uint8Array, coverData: Uint8Array): Promise<Buffer> {
  const pdf = await PDFDocument.load(bytes);
  await drawCustomCover(pdf, coverData);
  return Buffer.from(await pdf.save());
}

async function drawCustomCover(pdf: PDFDocument, coverData: Uint8Array): Promise<void> {
  const page = pdf.getPages()[0];
  if (!page) return;
  const image = await pdf.embedPng(coverData);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
}

export async function applyPageBorders(bytes: Uint8Array, border: PageBorder, primary: string): Promise<Buffer> {
  if (!border.enabled) return Buffer.from(bytes);
  const pdf = await PDFDocument.load(bytes);
  drawPageBorders(pdf, border, primary);
  return Buffer.from(await pdf.save());
}

function drawPageBorders(pdf: PDFDocument, border: PageBorder, primary: string): void {
  const hex = (border.color || primary).slice(1);
  const color = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255);
  const inset = border.insetMm * A4.pointsPerMm;
  for (const page of border.scope === "cover" ? pdf.getPages().slice(0, 1) : pdf.getPages()) page.drawRectangle({ x: inset, y: inset, width: page.getWidth() - 2 * inset, height: page.getHeight() - 2 * inset, borderWidth: border.widthPt, borderColor: color });
}

async function finalizePdf(bytes: Uint8Array, background: ThemeBackground, coverHeaderMm: number, coverData: Uint8Array | undefined, border: PageBorder, primary: string): Promise<Buffer> {
  const shouldPaintBackground = !(background.kind === "solid" && background.color.toUpperCase() === "#FFFFFF" && !coverHeaderMm);
  if (!shouldPaintBackground && !coverData && !border.enabled) return Buffer.from(bytes);
  const pdf = await PDFDocument.load(bytes);
  if (shouldPaintBackground) paintPageBackground(pdf, background, coverHeaderMm);
  if (coverData) await drawCustomCover(pdf, coverData);
  if (border.enabled) drawPageBorders(pdf, border, primary);
  return Buffer.from(await pdf.save());
}

async function getChromeLaunchOptions(): Promise<{ executablePath: string; args?: string[] }> {
  const isServerless = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (isServerless && !process.env.POLICY_PDF_CHROME_PATH) {
    const { default: serverlessChromium } = await import("@sparticuz/chromium");
    serverlessChromium.setGraphicsMode = false;
    return { executablePath: await serverlessChromium.executablePath(), args: serverlessChromium.args };
  }
  return { executablePath: await findChrome() };
}

async function findChrome(): Promise<string> {
  const candidates = process.env.POLICY_PDF_CHROME_PATH ? [process.env.POLICY_PDF_CHROME_PATH] : ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"];
  for (const candidate of candidates) { try { await access(candidate); return candidate; } catch { /* next browser */ } }
  throw new Error("Set POLICY_PDF_CHROME_PATH to an installed Chromium browser.");
}

async function inlinePublicAssets(markup: string): Promise<string> {
  const publicDir = path.resolve(process.cwd(), "public");
  const embed = async (source: string) => {
    const asset = path.resolve(publicDir, decodeURIComponent(source.slice(1)));
    if (!asset.startsWith(publicDir + path.sep)) throw new Error("Invalid document asset path");
    const bytes = await readFile(asset);
    const mime: Record<string, string> = { ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff" };
    return `data:${mime[path.extname(asset)] || "image/jpeg"};base64,${bytes.toString("base64")}`;
  };
  let output = markup;
  for (const match of [...output.matchAll(/src="(\/[^\"]+)"/g)].reverse()) output = output.slice(0, match.index) + `src="${await embed(match[1])}"` + output.slice(match.index! + match[0].length);
  for (const match of [...output.matchAll(/url\(["']?(\/fonts\/[^)"']+)["']?\)/g)].reverse()) output = output.slice(0, match.index) + `url(${await embed(match[1])})` + output.slice(match.index! + match[0].length);
  return output;
}

export function createPrintDocument(markup: string, policy: Policy, topMargin = pageMarginMm(getPolicyDocumentTheme(policy).pageBorder), horizontalMargin = pageMarginMm(getPolicyDocumentTheme(policy).pageBorder)): string {
  return `<!doctype html><html><head><meta charset="utf-8"/></head><body>${markup}<style>
    @page { size:A4; margin:${topMargin}mm ${horizontalMargin}mm ${horizontalMargin}mm; }
    html,body { margin:0; padding:0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .policy-preview-document { background:transparent !important; }
    .policy-preview-document { width:${210 - horizontalMargin * 2}mm; max-width:none; margin:0; box-shadow:none; animation:none!important; opacity:1!important; transform:none!important; overflow:visible; color:var(--doc-ink); }
    .policy-cover { break-after:page; }
    .policy-custom-cover { height:${297 - topMargin - horizontalMargin}mm; min-height:0; width:100%; break-after:page; }
    [data-collection="professional"] :is(.professional-cover, .editorial-policy-cover) { height:${297 - topMargin - horizontalMargin - 1}mm; min-height:0; break-inside:avoid; }
    [data-collection="professional"] .professional-cover-frame { min-height:0; }
    [data-collection="professional"] .professional-meta { break-inside:avoid; flex-shrink:0; }
    .policy-toc { break-after:page; }
    .policy-running-header,.policy-footer { display:none; }
    .policy-main { padding:0; }
    /* Professional preview rules add an on-screen reading inset. Print pages
       already receive their A4 margins from @page, so do not reserve that
       inset a second time in PDF output. */
    [data-collection="professional"] .policy-main { padding:0 !important; }
    .policy-acknowledgement { break-before:page; }
    .policy-section,.policy-table-wrap,.policy-section-body { overflow:visible; break-inside:auto; }
    h2,h3,.policy-section-heading { break-after:avoid; }
    p { orphans:3; widows:3; overflow-wrap:anywhere; }
    thead { display:table-header-group; } tr { break-inside:avoid; }
    td,th { overflow-wrap:anywhere; } .policy-table { table-layout:fixed; }
    img { max-width:100%; object-fit:contain; }
    .policy-sdg-tiles { display:flex; flex-wrap:wrap; gap:10px; }
    .policy-sdg-tiles .policy-sdg-tile { flex:0 0 100px; width:100px; break-inside:avoid; }
    .policy-sdg-tiles .policy-sdg-tile img { width:100px; height:100px; object-fit:contain; }
    .flex { display:flex; } .ml-auto { margin-left:auto; } .mx-auto { margin-inline:auto; }
    [data-collection="professional"] .policy-section { display:block; }
    [data-collection="professional"] .policy-section > aside { display:none; }
    /* The PDF page margin is the sample's outer whitespace. Remove the
       preview-only cover inset so titles and control rows use that same width. */
    [data-collection="professional"] :is(.professional-cover, .editorial-policy-cover) { padding-inline:0 !important; }
    [data-collection="professional"] .policy-section-heading { display:flex; gap:4mm; align-items:baseline; }
    [data-collection="professional"] .policy-section:not(.frame-numbered-rail):not(.frame-editorial-margin) .policy-section-heading > span { display:block; font-size:10pt; color:var(--doc-muted); }
  </style></body></html>`;
}
