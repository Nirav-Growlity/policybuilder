"use client";
import * as React from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { policyPreviewKey } from "@/lib/pdf-preview-state";
import { getPdfPageWidth } from "@/lib/pdf-preview-layout";
import type { Policy } from "@/lib/types";
import "pdfjs-dist/web/pdf_viewer.css";

type PreviewResult = { key: string; bytes: Uint8Array };

// Keep completed previews across remounts (theme dialogs and builder steps are
// frequently opened more than once) and deduplicate requests shared by those
// surfaces. The PDF remains the source of truth; this only avoids regenerating
// an identical document.
const previewCache = new Map<string, Uint8Array>();
const previewRequests = new Map<string, Promise<Uint8Array>>();
const MAX_CACHED_PREVIEWS = 6;

function cachePreview(key: string, bytes: Uint8Array): void {
  previewCache.delete(key);
  previewCache.set(key, bytes);
  while (previewCache.size > MAX_CACHED_PREVIEWS) previewCache.delete(previewCache.keys().next().value!);
}

function requestPreview(key: string): Promise<Uint8Array> {
  const cached = previewCache.get(key);
  if (cached) {
    previewCache.delete(key);
    previewCache.set(key, cached);
    return Promise.resolve(cached);
  }
  const pending = previewRequests.get(key);
  if (pending) return pending;
  const request = fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: `{"policy":${key}}`,
  }).then(async response => {
    if (!response.ok) throw new Error("The preview could not be generated.");
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("The preview returned an invalid PDF.");
    cachePreview(key, bytes);
    return bytes;
  }).finally(() => previewRequests.delete(key));
  previewRequests.set(key, request);
  return request;
}

export function PdfPolicyPreview({ policy }: { policy: Policy }) {
  const key = policyPreviewKey(policy);
  const [result, setResult] = React.useState<PreviewResult | null>(() => {
    const bytes = previewCache.get(key);
    return bytes ? { key, bytes } : null;
  });
  const [renderedKey, setRenderedKey] = React.useState("");
  const [failure, setFailure] = React.useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const bytes = await requestPreview(key);
        if (disposed) return;
        setResult({ key, bytes });
        setFailure(null);
      } catch (error) {
        if (!disposed) setFailure({ key, message: error instanceof Error ? error.message : "Preview unavailable." });
      }
    }, 0);
    return () => { disposed = true; clearTimeout(timer); };
  }, [key, retry]);
  const updating = renderedKey !== key;
  const onRendered = React.useCallback(() => {
    if (!result || result.key !== key) return;
    setRenderedKey(result.key);
  }, [result, key]);
  const onRenderError = React.useCallback(() => setFailure({ key, message: "Could not display this PDF. Please retry." }), [key]);
  return <div className="pdf-preview" aria-label="PDF document preview" aria-busy={updating}>
    <div className="mb-3 flex min-h-6 items-center justify-between gap-3 text-[13px] text-[var(--color-muted)]" role="status">
      <span>{failure?.key === key ? failure.message : updating ? "Updating preview…" : "Preview matches your PDF download"}</span>
      {failure?.key === key && <button type="button" className="underline" onClick={() => { setFailure(null); setRetry(v => v + 1); }}>Retry</button>}
    </div>
    {result ? <PdfPages bytes={result.bytes} onRendered={onRendered} onError={onRenderError} /> : <div className="mx-auto grid aspect-[210/297] max-w-[794px] place-items-center bg-white text-sm text-slate-500 shadow-sm">Preparing document…</div>}
  </div>;
}

export function PdfPages({ bytes, onRendered, onError }: { bytes: Uint8Array; onRendered?: () => void; onError?: () => void }) {
  const errorHandler = React.useRef(onError);
  React.useEffect(() => { errorHandler.current = onError; }, [onError]);
  const [document, setDocument] = React.useState<PDFDocumentProxy | null>(null);
  const [source, setSource] = React.useState<Uint8Array | null>(null);
  const [error, setError] = React.useState("");
  const [pageNumber, setPageNumber] = React.useState(1);
  const [zoom, setZoom] = React.useState("fit");
  const [viewMode, setViewMode] = React.useState<"continuous" | "paged">("continuous");
  const host = React.useRef<HTMLDivElement>(null);
  const readyReported = React.useRef(false);
  const [width, setWidth] = React.useState(700);
  const [mountedPages, setMountedPages] = React.useState<{ document: PDFDocumentProxy | null; pages: Set<number> }>(() => ({ document: null, pages: new Set([1]) }));
  React.useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    readyReported.current = false;
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    void import("pdfjs-dist").then(async pdfjs => {
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
      task = pdfjs.getDocument({ data: bytes.slice() });
      const pdf = await task.promise;
      if (!disposed) { setDocument(pdf); setSource(bytes); setPageNumber(current => Math.min(current, pdf.numPages)); setError(""); }
    }).catch(() => { if (!disposed) { setError("Could not display this PDF. Please retry the preview."); errorHandler.current?.(); } });
    return () => { disposed = true; void task?.destroy(); };
  }, [bytes]);
  React.useEffect(() => {
    if (viewMode !== "continuous" || !document) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const number = visible?.target instanceof HTMLElement ? Number(visible.target.dataset.pdfPage) : 0;
      if (number) setPageNumber(number);
      const pagesToMount = entries
        .filter(entry => entry.isIntersecting)
        .map(entry => entry.target instanceof HTMLElement ? Number(entry.target.dataset.pdfPage) : 0)
        .filter(Boolean);
      if (pagesToMount.length) {
        setMountedPages(current => {
          const next = new Set(current.document === document ? current.pages : [1]);
          pagesToMount.forEach(page => next.add(page));
          return current.document === document && next.size === current.pages.size
            ? current
            : { document, pages: next };
        });
      }
    }, { threshold: [0.25, 0.6, 0.9] });
    host.current?.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [document, viewMode]);
  const pages = document ? Array.from({ length: document.numPages }, (_, index) => index + 1) : [];
  const targetWidth = zoom === "fit" ? Math.min(width, 1000) : 794 * Number(zoom);
  const pagesToRender = mountedPages.document === document ? mountedPages.pages : new Set([1]);
  const goToPage = (next: number) => {
    setPageNumber(next);
    if (viewMode === "continuous") host.current?.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reportFirstPage = React.useCallback(() => {
    if (readyReported.current) return;
    readyReported.current = true;
    onRendered?.();
  }, [onRendered]);
  const renderPdfPage = (number: number) => {
    const pageWidth = getPdfPageWidth(number, targetWidth);
    return <div key={number} data-pdf-page={number} className="mx-auto" style={{ width: pageWidth, aspectRatio: "210 / 297" }}>
      {pagesToRender.has(number) && <PdfPage document={document!} number={number} width={pageWidth} onRendered={number === 1 && source === bytes ? reportFirstPage : undefined} />}
    </div>;
  };
  return <div ref={host} className="pdf-pages">
    <style>{`
      .pdf-pages .textLayer ::selection { color: transparent !important; -webkit-text-fill-color: transparent; text-shadow: none; background: rgba(37, 99, 235, .26); }
      .pdf-pages .textLayer ::-moz-selection { color: transparent !important; text-shadow: none; background: rgba(37, 99, 235, .26); }
    `}</style>
    <div className="sticky top-0 z-10 mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f3f4f2]/95 py-3 text-[13px] backdrop-blur">
      <div className="flex items-center gap-3"><button type="button" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)} className="disabled:opacity-30" aria-label="Previous page">←</button><span>Page {pageNumber} of {document?.numPages || "—"}</span><button type="button" disabled={!document || pageNumber >= document.numPages} onClick={() => goToPage(pageNumber + 1)} className="disabled:opacity-30" aria-label="Next page">→</button></div>
      <div className="flex flex-wrap items-center gap-2"><div className="flex rounded border border-slate-200 bg-white p-0.5" role="group" aria-label="Document view"><button type="button" aria-pressed={viewMode === "continuous"} onClick={() => setViewMode("continuous")} className={`rounded px-2 py-1 text-[12px] ${viewMode === "continuous" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Continuous scroll</button><button type="button" aria-pressed={viewMode === "paged"} onClick={() => setViewMode("paged")} className={`rounded px-2 py-1 text-[12px] ${viewMode === "paged" ? "bg-slate-900 text-white" : "text-slate-600"}`}>Single page</button></div><select aria-label="Preview zoom" value={zoom} onChange={e => setZoom(e.target.value)} className="rounded border border-slate-200 bg-white px-2 py-1.5"><option value="fit">Fit to width</option><option value=".75">75%</option><option value="1">100%</option><option value="1.25">125%</option></select></div>
    </div>
    {error && <p role="alert">{error}</p>}
    <div className={viewMode === "continuous" ? "space-y-8 overflow-x-auto pb-5" : "overflow-x-auto pb-5"}>{document && (viewMode === "continuous" ? pages.map(renderPdfPage) : <PdfPage document={document} number={pageNumber} width={getPdfPageWidth(pageNumber, targetWidth)} onRendered={source === bytes ? onRendered : undefined} />)}</div>
  </div>;
}

function PdfPage({ document: pdf, number, width, onRendered }: { document: PDFDocumentProxy; number: number; width: number; onRendered?: () => void }) {
  const surface = React.useRef<HTMLDivElement>(null);
  const renderedHandler = React.useRef(onRendered);
  React.useEffect(() => { renderedHandler.current = onRendered; }, [onRendered]);
  React.useEffect(() => {
    let cancelled = false;
    let render: ReturnType<PDFPageProxy["render"]> | undefined;
    let layer: InstanceType<typeof import("pdfjs-dist")["TextLayer"]> | undefined;
    void (async () => {
      const page = await pdf.getPage(number);
      if (cancelled || !surface.current) return;
      const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
      const ratio = window.devicePixelRatio || 1;
      // Paint a detached surface. Resizing a visible canvas clears its current pixels.
      const nextCanvas = window.document.createElement("canvas");
      nextCanvas.setAttribute("aria-label", `Document page ${number}`);
      nextCanvas.width = Math.ceil(viewport.width * ratio);
      nextCanvas.height = Math.ceil(viewport.height * ratio);
      nextCanvas.style.width = `${viewport.width}px`;
      nextCanvas.style.height = `${viewport.height}px`;
      render = page.render({ canvas: nextCanvas, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      if (cancelled) return;
      const { TextLayer } = await import("pdfjs-dist");
      const content = await page.getTextContent();
      if (cancelled) return;
      const nextText = window.document.createElement("div");
      nextText.className = "textLayer";
      nextText.style.setProperty("--scale-factor", String(viewport.scale));
      nextText.style.setProperty("--total-scale-factor", String(viewport.scale));
      layer = new TextLayer({ textContentSource: content, container: nextText, viewport });
      await layer.render();
      if (cancelled || !surface.current) return;
      // Commit the matching pixels and text in one synchronous operation.
      surface.current.replaceChildren(nextCanvas, nextText);
      renderedHandler.current?.();
    })().catch(error => { if (!cancelled) console.error("PDF page rendering failed", error); });
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [pdf, number, width]);
  return <div ref={surface} className="relative mx-auto bg-white shadow-[0_3px_18px_rgba(0,0,0,.10)]" style={{ width }} />;
}
