"use client";
import * as React from "react";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, LayoutGrid, Minus, Plus, RectangleVertical, RotateCw, Rows3 } from "lucide-react";
import { getPdfCanvasTransform, getPdfPageWidth } from "@/lib/pdf-preview-layout";
import { PdfRenderLoader } from "@/components/policy/pdf-render-loader";
import styles from "@/components/policy/pdf-policy-preview.module.css";
import { SelectMenu } from "@/components/ui/select-menu";
import type { Policy } from "@/lib/types";
import { policyCraftExportContext, policyCraftScopeKey, usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { requestPolicyPreview } from "@/lib/pdf/policy-preview-request";
import "pdfjs-dist/web/pdf_viewer.css";

// An A4 page is 794 CSS pixels wide at 100%.
const A4_WIDTH = 794;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const ZOOM_OPTIONS = [{ value: "fit", label: "Fit width" }, ...ZOOM_STEPS.map(step => ({ value: String(step), label: `${Math.round(step * 100)}%` }))];
const EASE = [0.22, 1, 0.36, 1] as const;

type PreviewResult = { key: string; scopeKey: string; bytes: Uint8Array; id: number; includesAuthorSignature: boolean };
type PdfViewState = { pageNumber: number; zoom: string; viewMode: "continuous" | "paged" };
type PreviewStatus = "ready" | "updating" | "failed";
/** "card" sits inside page content; "pane" fills a scrolling side or design pane edge to edge. */
type PreviewSurface = "card" | "pane";

const STATUS_LABEL: Record<PreviewStatus, string> = { ready: "Up to date", updating: "Updating…", failed: "Update failed" };

export function PdfPolicyPreview({ policy, includeAuthorSignature = false, authorSignatureDate = "", signatureUpdatedAt, surface = "card" }: { policy: Policy; includeAuthorSignature?: boolean; authorSignatureDate?: string; signatureUpdatedAt?: string | number | null; surface?: PreviewSurface }) {
  const scope = usePolicyCraftScope((state) => state.scope);
  const scopeKey = policyCraftScopeKey(scope);
  const body = JSON.stringify({ policy, includeAuthorSignature, authorSignatureDate, ...policyCraftExportContext(scope) });
  const key = JSON.stringify({ scopeKey, body, signatureUpdatedAt: includeAuthorSignature ? signatureUpdatedAt ?? null : null });
  const [active, setActive] = React.useState<PreviewResult | null>(null);
  const [candidate, setCandidate] = React.useState<PreviewResult | null>(null);
  const [paintedId, setPaintedId] = React.useState<number | null>(null);
  const [view, setView] = React.useState<PdfViewState>({ pageNumber: 1, zoom: "fit", viewMode: "continuous" });
  const [failure, setFailure] = React.useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = React.useState<{ key: string; count: number } | null>(null);
  const nextId = React.useRef(1);
  const currentKey = React.useRef(key);
  React.useLayoutEffect(() => { currentKey.current = key; }, [key]);
  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setActive(current => current && (current.scopeKey !== scopeKey || (current.includesAuthorSignature && current.key !== key)) ? null : current);
      setCandidate(current => current && (current.scopeKey !== scopeKey || (current.includesAuthorSignature && current.key !== key)) ? null : current);
      setPaintedId(current => active && (active.scopeKey !== scopeKey || (active.includesAuthorSignature && active.key !== key)) && current === active.id ? null : current);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, key, scopeKey]);
  const retryCount = retry?.key === key ? retry.count : 0;
  React.useEffect(() => {
    // A cached, already mounted result can paint without another request.
    if (active?.key === key && retryCount === 0) return;
    let disposed = false;
    const timer = setTimeout(async () => {
      try {
        if (!scope) throw new Error("Select an organization to preview this policy.");
        const bytes = await requestPolicyPreview({ key, body, includeAuthorSignature, scope });
        if (disposed) return;
        setCandidate({ key, scopeKey, bytes, id: nextId.current++, includesAuthorSignature: includeAuthorSignature });
        setFailure(null);
      } catch (error) {
        if (!disposed) { setCandidate(current => current?.key === key ? null : current); setFailure({ key, message: error instanceof Error ? error.message : "Preview unavailable." }); }
      }
    }, 0);
    return () => { disposed = true; clearTimeout(timer); };
    // active is deliberately read only when a key or retry changes; promoting
    // a painted candidate must not start the same request again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryCount, scope, scopeKey, body, includeAuthorSignature]);
  const currentCandidate = candidate?.key === key && candidate.scopeKey === scopeKey ? candidate : null;
  const currentActive = active !== null && active.scopeKey === scopeKey && (!active.includesAuthorSignature || active.key === key) ? active : null;
  const hasPaintedActive = currentActive !== null && paintedId === currentActive.id;
  const currentFailure = failure?.key === key ? failure : null;
  const ready = hasPaintedActive && active?.key === key && retryCount === 0;
  const updating = !ready && !currentFailure;
  // Every render, first or not, shows the rendering animation in place of the pages until it paints.
  const visible = updating ? null : hasPaintedActive ? currentActive : currentCandidate || currentActive;
  const status: PreviewStatus = currentFailure ? "failed" : updating ? "updating" : "ready";
  const failureMessage = currentFailure ? `${currentFailure.message}${hasPaintedActive && active?.key !== key ? " Showing the previous version." : ""}` : null;
  const results = [currentActive, currentCandidate].filter((result): result is PreviewResult => result !== null);
  const retryPreview = () => { setFailure(null); setRetry(current => ({ key, count: current?.key === key ? current.count + 1 : 1 })); };
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
    setFailure({ key: result.key, message: "Could not display this PDF." });
    setCandidate(current => current?.id === result.id ? null : current);
  };
  return <div className={`pdf-preview ${styles.preview}`} data-surface={surface} aria-label="PDF document preview" aria-busy={updating}>
    <p className="sr-only" role="status" aria-live="polite">{currentFailure ? `Preview update failed. ${failureMessage}` : updating ? "Updating PDF preview." : "PDF preview ready. It matches the download."}</p>
    <div className="relative">
      {results.map(result => <div key={result.id} className={result.id === visible?.id ? "relative" : "invisible pointer-events-none absolute inset-x-0 top-0"} aria-hidden={result.id !== visible?.id} inert={result.id !== visible?.id}>
        <PdfPages
          bytes={result.bytes}
          view={view}
          onViewChange={setView}
          interactive={result.id === visible?.id}
          status={status}
          failureMessage={failureMessage}
          onRetry={retryPreview}
          onRendered={() => onRendered(result)}
          onError={() => onRenderError(result)}
        />
      </div>)}
      {(updating || !visible) &&<div className={styles.loaderStage}>
        <PdfRenderLoader updating={hasPaintedActive && updating} still={!!currentFailure} />
        {currentFailure && <div className="-mt-4 flex flex-col items-center gap-3 px-6 pb-10 text-center">
          <p className="max-w-sm text-[12px] text-[var(--pc-error)]">{currentFailure.message}</p>
          <button type="button" className={styles.retryButton} onClick={retryPreview}><RotateCw size={14} aria-hidden="true" />Retry preview</button>
        </div>}
      </div>}
    </div>
  </div>;
}

/** The nearest ancestor that scrolls vertically; the preview borrows its host's scroller. */
function findScrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") return node;
  }
  return null;
}

type PdfPagesProps = {
  bytes: Uint8Array;
  view: PdfViewState;
  onViewChange: React.Dispatch<React.SetStateAction<PdfViewState>>;
  interactive: boolean;
  status?: PreviewStatus;
  failureMessage?: string | null;
  onRetry?: () => void;
  onRendered?: () => void;
  onError?: () => void;
};

export function PdfPages({ bytes, view, onViewChange, interactive, status = "ready", failureMessage = null, onRetry, onRendered, onError }: PdfPagesProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const instanceId = React.useId();
  const errorHandler = React.useRef(onError);
  React.useEffect(() => { errorHandler.current = onError; }, [onError]);
  const [document, setDocument] = React.useState<PDFDocumentProxy | null>(null);
  const [source, setSource] = React.useState<Uint8Array | null>(null);
  const [error, setError] = React.useState("");
  const { zoom, viewMode } = view;
  const pageCount = document?.numPages ?? 0;
  const pageNumber = Math.min(view.pageNumber, pageCount || view.pageNumber);
  const root = React.useRef<HTMLDivElement>(null);
  const stage = React.useRef<HTMLDivElement>(null);
  const toolbar = React.useRef<HTMLDivElement>(null);
  const pagesButton = React.useRef<HTMLButtonElement>(null);
  const readyReported = React.useRef(false);
  const paintedPages = React.useRef(new Set<number>());
  const navigating = React.useRef(false);
  const settleTimer = React.useRef(0);
  const zoomTimer = React.useRef(0);
  const [width, setWidth] = React.useState(700);
  const [toolbarHeight, setToolbarHeight] = React.useState(48);
  const [direction, setDirection] = React.useState(1);
  const [pageDraft, setPageDraft] = React.useState<string | null>(null);
  const [pagesOpen, setPagesOpen] = React.useState(false);
  const [mountedPages, setMountedPages] = React.useState<{ document: PDFDocumentProxy | null; pages: Set<number> }>(() => ({ document: null, pages: new Set([1, view.pageNumber]) }));

  React.useEffect(() => {
    const stageElement = stage.current;
    const toolbarElement = toolbar.current;
    if (!stageElement || !toolbarElement) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === stageElement) setWidth(Math.max(200, entry.contentRect.width));
        else setToolbarHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      }
    });
    observer.observe(stageElement);
    observer.observe(toolbarElement);
    return () => observer.disconnect();
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
    }).catch(() => { if (!disposed) { setError("Could not display this PDF."); errorHandler.current?.(); } });
    return () => { disposed = true; void task?.destroy(); };
  }, [bytes]);
  React.useEffect(() => {
    if (!interactive || !document) return;
    onViewChange(current => current.pageNumber > document.numPages ? { ...current, pageNumber: document.numPages } : current);
  }, [document, interactive, onViewChange]);
  React.useEffect(() => () => { window.clearTimeout(settleTimer.current); window.clearTimeout(zoomTimer.current); }, []);

  const mountPages = React.useCallback((numbers: number[]) => {
    if (!document || !numbers.length) return;
    setMountedPages(current => {
      const next = new Set(current.document === document ? current.pages : [1]);
      numbers.forEach(page => next.add(page));
      return current.document === document && next.size === current.pages.size ? current : { document, pages: next };
    });
  }, [document]);

  // Pages paint a viewport ahead of the reader so scrolling never lands on blank paper.
  React.useEffect(() => {
    if (!interactive || viewMode !== "continuous" || !document) return;
    const observer = new IntersectionObserver(entries => {
      mountPages(entries.filter(entry => entry.isIntersecting).map(entry => Number((entry.target as HTMLElement).dataset.pdfPage)).filter(Boolean));
    }, { root: findScrollParent(root.current), rootMargin: "100% 0px" });
    root.current?.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, [document, viewMode, interactive, mountPages]);

  // The page counter follows the page that fills most of the visible area.
  const toolbarOffset = React.useRef(toolbarHeight);
  React.useEffect(() => { toolbarOffset.current = toolbarHeight; }, [toolbarHeight]);
  React.useEffect(() => {
    if (!interactive || viewMode !== "continuous" || !document) return;
    const scroller = findScrollParent(root.current);
    const target: HTMLElement | Window = scroller ?? window;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const elements = root.current?.querySelectorAll<HTMLElement>("[data-pdf-page]");
      if (!elements?.length) return;
      const bounds = scroller?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
      const top = bounds.top + toolbarOffset.current;
      let best = 0;
      let bestVisible = 0;
      elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, bounds.bottom) - Math.max(rect.top, top);
        if (visibleHeight > bestVisible + 1) { bestVisible = visibleHeight; best = Number(element.dataset.pdfPage); }
      });
      if (best) onViewChange(current => current.pageNumber === best ? current : { ...current, pageNumber: best });
    };
    const onScroll = () => {
      // A requested jump owns the counter until its smooth scroll settles.
      if (navigating.current) {
        window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(() => { navigating.current = false; }, 140);
        return;
      }
      if (!frame) frame = requestAnimationFrame(measure);
    };
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => { target.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame); };
  }, [document, viewMode, interactive, onViewChange]);

  const scrollBehavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
  const scrollToPage = (number: number, behavior: ScrollBehavior) => {
    navigating.current = true;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { navigating.current = false; }, 900);
    root.current?.querySelector<HTMLElement>(`[data-pdf-page="${number}"]`)?.scrollIntoView({ behavior, block: "start" });
  };
  const revealViewerTop = (behavior: ScrollBehavior) => {
    const scroller = findScrollParent(root.current);
    const viewerTop = root.current?.getBoundingClientRect().top ?? 0;
    if (viewerTop < (scroller?.getBoundingClientRect().top ?? 0)) root.current?.scrollIntoView({ behavior, block: "start" });
  };
  const goToPage = (next: number) => {
    if (!document) return;
    const page = Math.min(Math.max(1, Math.round(next)), document.numPages);
    setPageDraft(null);
    if (page === pageNumber) return;
    setDirection(page > pageNumber ? 1 : -1);
    onViewChange(current => ({ ...current, pageNumber: page }));
    if (viewMode === "continuous") { mountPages([page]); scrollToPage(page, scrollBehavior); }
    else revealViewerTop(scrollBehavior);
  };
  // A re-rendered version replaces the loader at the top; return the reader to their page.
  const wasInteractive = React.useRef(interactive);
  React.useEffect(() => {
    const promoted = interactive && !wasInteractive.current;
    wasInteractive.current = interactive;
    if (!promoted || !document || viewMode !== "continuous" || pageNumber <= 1) return;
    const frame = requestAnimationFrame(() => scrollToPage(pageNumber, "auto"));
    return () => cancelAnimationFrame(frame);
    // Only the moment this version becomes the visible one matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive, document]);
  const setViewMode = (mode: PdfViewState["viewMode"]) => {
    if (mode === viewMode) return;
    onViewChange(current => ({ ...current, viewMode: mode }));
    // Keep the reader on the same page across the switch.
    requestAnimationFrame(() => mode === "continuous" ? scrollToPage(pageNumber, "auto") : revealViewerTop("auto"));
  };
  const fitScale = Math.min(width, 1000) / A4_WIDTH;
  const scale = zoom === "fit" ? fitScale : Number(zoom);
  const setZoom = (value: string) => {
    if (value === zoom) return;
    // Pages ease to the new size, then repaint sharply at it.
    if (!reduceMotion && root.current) {
      root.current.dataset.zooming = "";
      window.clearTimeout(zoomTimer.current);
      zoomTimer.current = window.setTimeout(() => { delete root.current?.dataset.zooming; }, 320);
    }
    onViewChange(current => ({ ...current, zoom: value }));
  };
  const zoomIn = ZOOM_STEPS.find(step => step > scale + 0.01);
  const zoomOut = [...ZOOM_STEPS].reverse().find(step => step < scale - 0.01);

  const pages = document ? Array.from({ length: document.numPages }, (_, index) => index + 1) : [];
  const targetWidth = zoom === "fit" ? Math.min(width, 1000) : A4_WIDTH * Number(zoom);
  const pagesToRender = new Set(mountedPages.document === document ? mountedPages.pages : [1]);
  pagesToRender.add(pageNumber);
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

  const onStageKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
    const paged = viewMode === "paged";
    const moves: Record<string, number | undefined> = {
      ArrowLeft: pageNumber - 1,
      ArrowRight: pageNumber + 1,
      PageUp: paged ? pageNumber - 1 : undefined,
      PageDown: paged ? pageNumber + 1 : undefined,
      Home: paged ? 1 : undefined,
      End: paged ? pageCount : undefined,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    goToPage(next);
  };
  const commitPageDraft = () => {
    if (pageDraft === null) return;
    const value = Number.parseInt(pageDraft, 10);
    if (Number.isFinite(value)) goToPage(value);
    setPageDraft(null);
  };

  const renderSheet = (number: number) => {
    const pageWidth = getPdfPageWidth(number, targetWidth);
    return <div key={number} data-pdf-page={number} className={styles.sheet} style={{ width: pageWidth }}>
      {document && pagesToRender.has(number) && <PdfPage document={document} number={number} width={pageWidth} onRendered={(number === 1 || number === pageNumber) && source === bytes ? () => reportPage(number) : undefined} onError={onError} />}
    </div>;
  };
  const turn = {
    enter: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * 28 }),
    center: { opacity: 1, x: 0 },
    exit: (dir: number) => ({ opacity: 0, x: reduceMotion ? 0 : dir * -28 }),
  };
  const notice = error || failureMessage;
  const panelId = `${instanceId}-pages`;

  return <div
    ref={root}
    className={`${styles.viewer} pdf-pages`}
    style={{ "--pdf-toolbar-h": `${toolbarHeight}px` } as React.CSSProperties}
  >
    <style>{`
      .pdf-pages .textLayer ::selection { color: transparent !important; -webkit-text-fill-color: transparent; text-shadow: none; background: rgba(65, 134, 243, .26); }
      .pdf-pages .textLayer ::-moz-selection { color: transparent !important; text-shadow: none; background: rgba(65, 134, 243, .26); }
    `}</style>
    <div ref={toolbar} className={styles.toolbar}>
      <div className={styles.toolbarRow}>
        <div className={styles.group} role="group" aria-label="Page navigation">
          <button
            ref={pagesButton}
            type="button"
            className={styles.iconButton}
            data-active={pagesOpen || undefined}
            aria-label="Show all pages"
            title="Show all pages"
            aria-expanded={pagesOpen}
            aria-controls={pagesOpen ? panelId : undefined}
            disabled={!document}
            onClick={() => setPagesOpen(open => !open)}
          ><LayoutGrid size={16} aria-hidden="true" /></button>
          <span className={styles.divider} aria-hidden="true" />
          <button type="button" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)} className={styles.iconButton} aria-label="Previous page" title="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
          <span className={styles.pageCounter}>
            <input
              className={styles.pageInput}
              aria-label={`Page number, ${pageNumber} of ${pageCount || "unknown"}`}
              inputMode="numeric"
              autoComplete="off"
              disabled={!document}
              value={pageDraft ?? String(pageNumber)}
              style={{ width: `${Math.max(2, String(pageCount || pageNumber).length) + 1.5}ch` }}
              onFocus={event => event.currentTarget.select()}
              onChange={event => setPageDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
              onBlur={commitPageDraft}
              onKeyDown={event => {
                if (event.key === "Enter") { event.preventDefault(); commitPageDraft(); }
                else if (event.key === "Escape") { event.preventDefault(); setPageDraft(null); }
                else if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); goToPage(pageNumber + (event.key === "ArrowUp" ? 1 : -1)); }
              }}
            />
            <span className={styles.pageTotal}>of {pageCount || "—"}</span>
          </span>
          <button type="button" disabled={!document || pageNumber >= pageCount} onClick={() => goToPage(pageNumber + 1)} className={styles.iconButton} aria-label="Next page" title="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
        </div>

        <div className={styles.toolbarEnd}>
          <span className={styles.status} data-status={status} title={status === "ready" ? "This preview matches the downloaded PDF." : undefined}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={status}
                className={styles.statusText}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                transition={{ duration: 0.16, ease: EASE }}
              >{STATUS_LABEL[status]}</motion.span>
            </AnimatePresence>
          </span>
          <div className={styles.segmented} role="group" aria-label="Page layout">
            {([["continuous", "Continuous", "Continuous scroll", Rows3], ["paged", "Single page", "Single page", RectangleVertical]] as const).map(([mode, label, name, Icon]) => <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              aria-label={name}
              title={name}
              onClick={() => setViewMode(mode)}
              className={styles.segment}
            >
              {viewMode === mode && <motion.span layoutId={`${instanceId}-view`} className={styles.segmentThumb} transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 }} />}
              <Icon size={14} aria-hidden="true" className={styles.segmentIcon} />
              <span className={styles.segmentLabel}>{label}</span>
            </button>)}
          </div>
          <div className={styles.group} role="group" aria-label="Zoom">
            <button type="button" className={`${styles.iconButton} ${styles.zoomStep}`} aria-label="Zoom out" title="Zoom out" disabled={zoomOut === undefined} onClick={() => zoomOut !== undefined && setZoom(String(zoomOut))}><Minus size={15} aria-hidden="true" /></button>
            <SelectMenu aria-label="Preview zoom" size="compact" value={zoom} onValueChange={setZoom} options={ZOOM_OPTIONS} className={styles.zoomSelect} />
            <button type="button" className={`${styles.iconButton} ${styles.zoomStep}`} aria-label="Zoom in" title="Zoom in" disabled={zoomIn === undefined} onClick={() => zoomIn !== undefined && setZoom(String(zoomIn))}><Plus size={15} aria-hidden="true" /></button>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {pagesOpen && document && <PageGrid
          id={panelId}
          document={document}
          pageNumber={pageNumber}
          reduceMotion={reduceMotion}
          onSelect={number => { setPagesOpen(false); goToPage(number); }}
          onClose={(restoreFocus) => { setPagesOpen(false); if (restoreFocus) pagesButton.current?.focus(); }}
          anchor={pagesButton}
        />}
      </AnimatePresence>
    </div>

    <AnimatePresence initial={false}>
      {notice && <motion.div
        key="notice"
        role="alert"
        className={styles.noticeWrap}
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "auto", opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: EASE }}
      >
        <div className={styles.notice}>
          <span className="min-w-0">{notice}</span>
          {onRetry && <button type="button" className={styles.retryButton} onClick={onRetry}><RotateCw size={14} aria-hidden="true" />Retry</button>}
        </div>
      </motion.div>}
    </AnimatePresence>

    <div
      ref={stage}
      className={styles.stage}
      data-mode={viewMode}
      tabIndex={0}
      role="region"
      aria-label={viewMode === "paged" ? `Document page ${pageNumber} of ${pageCount}. Use the left and right arrow keys to turn pages.` : "Document pages. Use the left and right arrow keys to jump between pages."}
      onKeyDown={onStageKeyDown}
    >
      {document && (viewMode === "continuous"
        ? pages.map(renderSheet)
        : <AnimatePresence initial={false} mode="popLayout" custom={direction}>
          <motion.div
            key={pageNumber}
            custom={direction}
            variants={turn}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduceMotion ? 0.12 : 0.26, ease: EASE }}
            className={styles.turn}
          >{renderSheet(pageNumber)}</motion.div>
        </AnimatePresence>)}
    </div>
  </div>;
}

function PageGrid({ id, document: pdf, pageNumber, reduceMotion, onSelect, onClose, anchor }: { id: string; document: PDFDocumentProxy; pageNumber: number; reduceMotion: boolean; onSelect: (page: number) => void; onClose: (restoreFocus: boolean) => void; anchor: React.RefObject<HTMLButtonElement | null> }) {
  const panel = React.useRef<HTMLDivElement>(null);
  const pages = Array.from({ length: pdf.numPages }, (_, index) => index + 1);
  React.useEffect(() => {
    const current = panel.current?.querySelector<HTMLElement>(`[data-thumb="${pageNumber}"]`);
    current?.focus({ preventScroll: true });
    current?.scrollIntoView({ block: "nearest" });
    // Focus only on open; later page changes come from this panel itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose(false);
    };
    window.document.addEventListener("pointerdown", onPointerDown);
    return () => window.document.removeEventListener("pointerdown", onPointerDown);
  }, [anchor, onClose]);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(true); return; }
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const step = keys[event.key];
    const focused = (event.target as HTMLElement).dataset.thumb;
    if (!step || !focused) return;
    event.preventDefault();
    panel.current?.querySelector<HTMLElement>(`[data-thumb="${Number(focused) + step}"]`)?.focus();
  };
  return <motion.div
    ref={panel}
    id={id}
    role="dialog"
    aria-label="All pages"
    className={styles.pagePanel}
    onKeyDown={onKeyDown}
    initial={{ opacity: 0, y: reduceMotion ? 0 : -6, scale: reduceMotion ? 1 : 0.98 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: reduceMotion ? 0 : -4, scale: reduceMotion ? 1 : 0.99, transition: { duration: 0.12 } }}
    transition={{ duration: 0.2, ease: EASE }}
  >
    <div className={styles.pagePanelGrid}>
      {pages.map(number => <button
        key={number}
        type="button"
        data-thumb={number}
        aria-current={number === pageNumber ? "page" : undefined}
        aria-label={`Go to page ${number}`}
        className={styles.thumb}
        onClick={() => onSelect(number)}
      >
        <PdfThumbnail document={pdf} number={number} />
        <span className={styles.thumbLabel}>{number}</span>
      </button>)}
    </div>
  </motion.div>;
}

const THUMB_WIDTH = 132;
// Painted thumbnails live as long as their document, so reopening the panel is instant.
const thumbnailCache = new WeakMap<PDFDocumentProxy, Map<number, string>>();

function PdfThumbnail({ document: pdf, number }: { document: PDFDocumentProxy; number: number }) {
  const [url, setUrl] = React.useState(() => thumbnailCache.get(pdf)?.get(number) ?? null);
  React.useEffect(() => {
    if (url) return;
    let cancelled = false;
    let render: ReturnType<PDFPageProxy["render"]> | undefined;
    void (async () => {
      const page = await pdf.getPage(number);
      if (cancelled) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (THUMB_WIDTH * ratio) / page.getViewport({ scale: 1 }).width });
      const canvas = window.document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      render = page.render({ canvas, viewport });
      await render.promise;
      if (cancelled) return;
      const next = canvas.toDataURL("image/png");
      if (!thumbnailCache.has(pdf)) thumbnailCache.set(pdf, new Map());
      thumbnailCache.get(pdf)!.set(number, next);
      setUrl(next);
    })().catch(() => undefined);
    return () => { cancelled = true; render?.cancel(); };
  }, [number, pdf, url]);
  return <span className={styles.thumbPaper}>
    {/* eslint-disable-next-line @next/next/no-img-element -- a data URL painted from the local PDF. */}
    {url && <img src={url} alt="" className={styles.thumbImage} />}
  </span>;
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
      render = page.render({ canvas: nextCanvas, viewport, transform: getPdfCanvasTransform(viewport.width, viewport.height, nextCanvas.width, nextCanvas.height) });
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
      // Only a page's first paint fades in; later repaints (zoom, resize) swap in place.
      if (!surface.current.dataset.painted) nextCanvas.dataset.enter = "";
      // Commit the matching pixels and text in one synchronous operation.
      surface.current.replaceChildren(nextCanvas, nextText);
      surface.current.dataset.painted = "";
      renderedHandler.current?.();
    })().catch(error => { if (!cancelled) { console.error("PDF page rendering failed", error); errorHandler.current?.(); } });
    return () => { cancelled = true; render?.cancel(); layer?.cancel(); };
  }, [pdf, number, width]);
  return <div ref={surface} role="group" aria-label={`Preview page ${number}`} className={styles.paper} />;
}
