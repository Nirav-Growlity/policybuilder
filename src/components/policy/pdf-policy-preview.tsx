"use client";
import * as React from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { policyPreviewKey } from "@/lib/pdf-preview-state";
import { getPdfPageWidth } from "@/lib/pdf-preview-layout";
import { PdfRenderLoader } from "@/components/policy/pdf-render-loader";
import type { Policy } from "@/lib/types";
import "pdfjs-dist/web/pdf_viewer.css";

type PreviewResult = { key: string; bytes: Uint8Array; id: number };
type PdfViewState = { pageNumber: number; zoom: string; viewMode: "continuous" | "paged" };

// Keep completed previews across remounts (theme dialogs and builder steps are
// frequently opened more than once) and deduplicate requests shared by those
// surfaces. The PDF remains the source of truth; this only avoids regenerating
// an identical document.
const previewCache = new Map<string, Uint8Array>();
const previewRequests = new Map<string, Promise<Uint8Array>>();
const MAX_CACHED_PREVIEWS = 6;
const PREVIEW_REQUEST_TIMEOUT_MS = 150_000;

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
    signal: AbortSignal.timeout(PREVIEW_REQUEST_TIMEOUT_MS),
  }).then(async response => {
    if (!response.ok) throw new Error("The preview could not be generated.");
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("The preview returned an invalid PDF.");
    cachePreview(key, bytes);
    return bytes;
  }).catch(error => {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("Preview generation timed out. Please retry.");
    }
    throw error;
  }).finally(() => previewRequests.delete(key));
  previewRequests.set(key, request);
  return request;
}

export function PdfPolicyPreview({ policy }: { policy: Policy }) {
  const key = policyPreviewKey(policy);
  const [active, setActive] = React.useState<PreviewResult | null>(() => {
    const bytes = previewCache.get(key);
    return bytes ? { key, bytes, id: 0 } : null;
  });
  const [candidate, setCandidate] = React.useState<PreviewResult | null>(null);
  const [paintedId, setPaintedId] = React.useState<number | null>(null);
  const [view, setView] = React.useState<PdfViewState>({ pageNumber: 1, zoom: "fit", viewMode: "continuous" });
  const [failure, setFailure] = React.useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = React.useState<{ key: string; count: number } | null>(null);
  const nextId = React.useRef(1);
  const currentKey = React.useRef(key);
  React.useLayoutEffect(() => { currentKey.current = key; }, [key]);
  const retryCount = retry?.key === key ? retry.count : 0;
  React.useEffect(() => {
    // A cached, already mounted result can paint without another request.
    if (active?.key === key && retryCount === 0) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        const bytes = await requestPreview(key);
        if (disposed) return;
        setCandidate({ key, bytes, id: nextId.current++ });
        setFailure(null);
      } catch (error) {
        if (!disposed) { setCandidate(current => current?.key === key ? null : current); setFailure({ key, message: error instanceof Error ? error.message : "Preview unavailable." }); }
      }
    }, 0);
    return () => { disposed = true; clearTimeout(timer); };
    // active is deliberately read only when a key or retry changes; promoting
    // a painted candidate must not start the same request again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryCount]);
  const currentCandidate = candidate?.key === key ? candidate : null;
  const hasPaintedActive = active !== null && paintedId === active.id;
  const currentFailure = failure?.key === key ? failure : null;
  const ready = hasPaintedActive && active?.key === key && retryCount === 0;
  const updating = !ready && !currentFailure;
  const visible = updating ? hasPaintedActive ? active : null : hasPaintedActive ? active : currentCandidate || active;
  const showUpdateOverlay = updating && hasPaintedActive;
  const results = [active, currentCandidate].filter((result): result is PreviewResult => result !== null);
  const onRendered = (result: PreviewResult) => {
    if (currentKey.current !== result.key) return;
    if (currentCandidate?.id === result.id) {
      setActive(result);
      setPaintedId(result.id);
      setCandidate(current => current?.id === result.id ? null : current);
      setRetry(null);
      setFailure(null);
    } else if (active?.id === result.id) {
      setPaintedId(result.id);
    }
  };
  const onRenderError = (result: PreviewResult) => {
    if (currentKey.current !== result.key) return;
    setFailure({ key: result.key, message: "Could not display this PDF. Please retry." });
    setCandidate(current => current?.id === result.id ? null : current);
  };
  return <div className="pdf-preview" aria-label="PDF document preview" aria-busy={updating || undefined}>
    <div className="mb-2 flex min-h-8 items-center justify-between gap-3 px-1 text-[12px] text-[var(--color-muted)]" role="status" aria-live="polite">
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${currentFailure ? "bg-[#b73a3a]" : updating ? "animate-pulse bg-[#b58a23] motion-reduce:animate-none" : "bg-[var(--color-forest-mid)]"}`} />
        <span className="truncate">{currentFailure ? `${currentFailure.message}${hasPaintedActive && active?.key !== key ? " Showing previous version." : ""}` : updating ? "Updating PDF preview…" : "PDF preview ready"}</span>
      </span>
      <span className="shrink-0 text-[11px] text-[#89948d]">{currentFailure ? null : updating ? "Rendering" : "Matches download"}</span>
      {currentFailure && <button type="button" className="shrink-0 rounded-md border border-[var(--color-line-2)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-forest)]" onClick={() => { setFailure(null); setRetry(current => ({ key, count: current?.key === key ? current.count + 1 : 1 })); }}>Retry preview</button>}
    </div>
    <div className="relative">
      {showUpdateOverlay && <div className="pointer-events-none sticky top-0 z-20 h-px">
        <div className="absolute inset-x-0 top-0 grid h-[clamp(460px,70vh,700px)] place-items-center">
          <PdfRenderLoader updating />
        </div>
      </div>}
      {results.map(result => <div key={result.id} className={result.id === visible?.id ? "relative" : "invisible pointer-events-none absolute inset-x-0 top-0"} aria-hidden={result.id !== visible?.id} inert={result.id !== visible?.id}>
        <PdfPages bytes={result.bytes} view={view} onViewChange={setView} interactive={result.id === visible?.id} dimmed={showUpdateOverlay && result.id === active?.id} onRendered={() => onRendered(result)} onError={() => onRenderError(result)} />
      </div>)}
      {!showUpdateOverlay && (updating || !visible) && <div className="grid min-h-[clamp(460px,70vh,700px)] w-full place-items-center"><PdfRenderLoader updating={hasPaintedActive && updating} still={!!currentFailure} /></div>}
    </div>
  </div>;
}

export function PdfPages({ bytes, view, onViewChange, interactive, dimmed = false, onRendered, onError }: { bytes: Uint8Array; view: PdfViewState; onViewChange: React.Dispatch<React.SetStateAction<PdfViewState>>; interactive: boolean; dimmed?: boolean; onRendered?: () => void; onError?: () => void }) {
  const errorHandler = React.useRef(onError);
  React.useEffect(() => { errorHandler.current = onError; }, [onError]);
  const [document, setDocument] = React.useState<PDFDocumentProxy | null>(null);
  const [source, setSource] = React.useState<Uint8Array | null>(null);
  const [error, setError] = React.useState("");
  const { zoom, viewMode } = view;
  const pageNumber = Math.min(view.pageNumber, document?.numPages || view.pageNumber);
  const host = React.useRef<HTMLDivElement>(null);
  const readyReported = React.useRef(false);
  const paintedPages = React.useRef(new Set<number>());
  const [width, setWidth] = React.useState(700);
  const [mountedPages, setMountedPages] = React.useState<{ document: PDFDocumentProxy | null; pages: Set<number> }>(() => ({ document: null, pages: new Set([1, view.pageNumber]) }));
  React.useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    readyReported.current = false;
    paintedPages.current.clear();
    let disposed = false;
    let task: ReturnType<typeof import("pdfjs-dist")["getDocument"]> | undefined;
    void import("pdfjs-dist").then(async pdfjs => {
      if (disposed) return;
      pdfjs.GlobalWorkerOptions.workerSrc = "/api/pdf-worker";
      task = pdfjs.getDocument({ data: bytes.slice() });
      const pdf = await task.promise;
      if (!disposed) { setDocument(pdf); setSource(bytes); setError(""); }
    }).catch(() => { if (!disposed) { setError("Could not display this PDF. Please retry the preview."); errorHandler.current?.(); } });
    return () => { disposed = true; void task?.destroy(); };
  }, [bytes]);
  React.useEffect(() => {
    if (!interactive || !document) return;
    onViewChange(current => current.pageNumber > document.numPages ? { ...current, pageNumber: document.numPages } : current);
  }, [document, interactive, onViewChange]);
  React.useEffect(() => {
    if (!interactive || viewMode !== "continuous" || !document) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const number = visible?.target instanceof HTMLElement ? Number(visible.target.dataset.pdfPage) : 0;
      if (number) onViewChange(current => current.pageNumber === number ? current : { ...current, pageNumber: number });
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
  }, [document, viewMode, interactive, onViewChange]);
  const pages = document ? Array.from({ length: document.numPages }, (_, index) => index + 1) : [];
  const targetWidth = zoom === "fit" ? Math.min(width, 1000) : 794 * Number(zoom);
  const pagesToRender = new Set(mountedPages.document === document ? mountedPages.pages : [1]);
  pagesToRender.add(pageNumber);
  const goToPage = (next: number) => {
    onViewChange(current => ({ ...current, pageNumber: next }));
    if (viewMode === "continuous") host.current?.querySelector<HTMLElement>(`[data-pdf-page="${next}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const reportPage = React.useCallback((number: number) => {
    if (readyReported.current) return;
    paintedPages.current.add(number);
    const required = viewMode === "continuous" ? [1, pageNumber] : [pageNumber];
    if (!required.every(page => paintedPages.current.has(page))) return;
    readyReported.current = true;
    onRendered?.();
  }, [onRendered, pageNumber, viewMode]);
  React.useEffect(() => {
    if (readyReported.current || source !== bytes) return;
    const required = viewMode === "continuous" ? [1, pageNumber] : [pageNumber];
    if (required.every(page => paintedPages.current.has(page))) {
      readyReported.current = true;
      onRendered?.();
    }
  }, [bytes, onRendered, pageNumber, source, viewMode]);
  const renderPdfPage = (number: number) => {
    const pageWidth = getPdfPageWidth(number, targetWidth);
    return <div key={number} data-pdf-page={number} className="mx-auto" style={{ width: pageWidth, aspectRatio: "210 / 297" }}>
      {pagesToRender.has(number) && <PdfPage document={document!} number={number} width={pageWidth} onRendered={(number === 1 || number === pageNumber) && source === bytes ? () => reportPage(number) : undefined} onError={onError} />}
    </div>;
  };
  return <div ref={host} className="pdf-pages rounded-xl border border-[var(--color-line)] bg-[#eef1ed]">
    <style>{`
      .pdf-pages .textLayer ::selection { color: transparent !important; -webkit-text-fill-color: transparent; text-shadow: none; background: rgba(37, 99, 235, .26); }
      .pdf-pages .textLayer ::-moz-selection { color: transparent !important; text-shadow: none; background: rgba(37, 99, 235, .26); }
    `}</style>
    <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] bg-white/95 px-3 py-2.5 text-[12px] backdrop-blur sm:px-4">
      <div className="flex items-center gap-2">
        <button type="button" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)} className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Previous page">←</button>
        <span className="min-w-[86px] text-center font-medium tabular-nums text-[var(--color-ink-2)]">Page {pageNumber} <span className="text-[var(--color-muted)]">/ {document?.numPages || "—"}</span></span>
        <button type="button" disabled={!document || pageNumber >= document.numPages} onClick={() => goToPage(pageNumber + 1)} className="grid h-8 w-8 place-items-center rounded-md border border-[var(--color-line)] bg-white text-[var(--color-ink-2)] transition-colors hover:border-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-35" aria-label="Next page">→</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--color-line)] bg-[#f5f6f3] p-0.5" role="group" aria-label="Document view">
          <button type="button" aria-pressed={viewMode === "continuous"} onClick={() => onViewChange(current => ({ ...current, viewMode: "continuous" }))} className={`h-7 rounded-md px-3 text-[11px] font-medium transition-colors ${viewMode === "continuous" ? "bg-[var(--color-forest)] text-white shadow-sm" : "text-[var(--color-ink-2)] hover:bg-white"}`}>Continuous</button>
          <button type="button" aria-pressed={viewMode === "paged"} onClick={() => onViewChange(current => ({ ...current, viewMode: "paged" }))} className={`h-7 rounded-md px-3 text-[11px] font-medium transition-colors ${viewMode === "paged" ? "bg-[var(--color-forest)] text-white shadow-sm" : "text-[var(--color-ink-2)] hover:bg-white"}`}>Single page</button>
        </div>
        <select aria-label="Preview zoom" value={zoom} onChange={e => onViewChange(current => ({ ...current, zoom: e.target.value }))} className="h-8 rounded-md border border-[var(--color-line)] bg-white px-2.5 text-[11px] font-medium text-[var(--color-ink-2)] outline-none transition-colors focus:border-[var(--color-forest)]">
          <option value="fit">Fit to width</option><option value=".75">75%</option><option value="1">100%</option><option value="1.25">125%</option>
        </select>
      </div>
    </div>
    {error && <p role="alert" className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-800">{error}</p>}
    <div className={viewMode === "continuous" ? "min-h-[480px] space-y-8 overflow-x-auto px-3 py-5 sm:px-6 sm:py-7" : "min-h-[480px] overflow-x-auto px-3 py-5 sm:px-6 sm:py-7"} style={{ opacity: dimmed ? 0.16 : 1, transition: "opacity 180ms ease" }}>{document && (viewMode === "continuous" ? pages.map(renderPdfPage) : <PdfPage document={document} number={pageNumber} width={getPdfPageWidth(pageNumber, targetWidth)} onRendered={source === bytes ? () => reportPage(pageNumber) : undefined} onError={onError} />)}</div>
  </div>;
}

function PdfPage({ document: pdf, number, width, onRendered, onError }: { document: PDFDocumentProxy; number: number; width: number; onRendered?: () => void; onError?: () => void }) {
  const surface = React.useRef<HTMLDivElement>(null);
  const renderedHandler = React.useRef(onRendered);
  const errorHandler = React.useRef(onError);
  React.useEffect(() => { renderedHandler.current = onRendered; }, [onRendered]);
  React.useEffect(() => { errorHandler.current = onError; }, [onError]);
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
    })().catch(error => { if (!cancelled) { console.error("PDF page rendering failed", error); errorHandler.current?.(); } });
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [pdf, number, width]);
  return <div ref={surface} role="group" aria-label={`Preview page ${number}`} className="relative mx-auto aspect-[210/297] bg-white shadow-[0_8px_28px_rgba(14,26,20,.14)]" style={{ width }} />;
}
