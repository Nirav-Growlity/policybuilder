"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, FileDown, FileText, Leaf, ListChecks, PanelLeftClose, PanelLeftOpen, Settings2, X } from "lucide-react";
import { clsx } from "clsx";
import shell from "@/components/builder/shell.module.css";
import { ApplicationSessionMenu } from "@/components/ui/application-user-menu";
import { Button } from "@/components/ui/button";
import { useSopBuilder } from "@/lib/sop/store";
import { manualProgress } from "../manual-helpers";
import { useSopBuilderActions, type BuilderMode } from "./builder-context";
import { ManualRail, ManualRailMini, ManualSummary } from "./manual-rail";
import { ProgressPill } from "./progress-pill";
import styles from "./builder.module.css";

// Same breakpoint and preference keys as the policy builder, so both remember one choice.
const NARROW_QUERY = "(max-width: 1199px)";
const COLLAPSE_KEY = "policycraft_sidebar_collapsed";
const COLLAPSE_EVENT = "policycraft-sidebar-collapse";
const PREVIEW_KEY = "policycraft_builder_preview_open";
const PREVIEW_EVENT = "policycraft-builder-preview";

function subscribe(eventName: string) {
  return (callback: () => void) => {
    window.addEventListener("storage", callback);
    window.addEventListener(eventName, callback);
    return () => { window.removeEventListener("storage", callback); window.removeEventListener(eventName, callback); };
  };
}
const subscribeCollapse = subscribe(COLLAPSE_EVENT);
const subscribePreview = subscribe(PREVIEW_EVENT);
const readFlag = (key: string) => { try { return window.localStorage.getItem(key) === "true"; } catch { return false; } };
const writeFlag = (key: string, eventName: string, value: boolean) => {
  try { window.localStorage.setItem(key, String(value)); } catch { /* optional */ }
  window.dispatchEvent(new Event(eventName));
};
const serverFalse = () => false;
const subscribeViewport = (callback: () => void) => {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};

export function useNarrowViewport() {
  return React.useSyncExternalStore(subscribeViewport, () => window.matchMedia(NARROW_QUERY).matches, serverFalse);
}

export type WriteHeading = { title: string; subtitle?: string; position: string; prev?: { label: string; onSelect: () => void }; next?: { label: string; onSelect: () => void } };

type ShellProps = {
  mode: BuilderMode;
  saveStatus: string | null;
  heading: WriteHeading;
  children: React.ReactNode;
  preview: React.ReactNode;
  design: React.ReactNode;
  review: React.ReactNode;
  exporting: "pdf" | "docx" | null;
  onDownload: (format: "pdf" | "docx") => void;
};

/**
 * The policy BuilderShell's frame for an SOP manual: same top bar, mode switch,
 * rail, footer and preview pane, with the manual outline in the rail.
 */
export function SopBuilderShell({ onAddSop, onDeleteSop, ...props }: ShellProps & { onAddSop: () => void; onDeleteSop: (sopId: string) => void }) {
  const { workspaceHref, setMode, openDetails } = useSopBuilderActions();
  const manual = useSopBuilder((state) => state.manual!);
  const title = useSopBuilder((state) => state.title);
  const selectionKey = useSopBuilder((state) => (state.selection.kind === "sop" ? state.selection.sopId : state.selection.kind));
  return (
    <BuilderFrame
      {...props}
      workspaceHref={workspaceHref}
      setMode={setMode}
      openDetails={openDetails}
      title={title}
      documentLabel="SOP manual"
      selectionKey={selectionKey}
      progress={manualProgress(manual)}
      kindIcon={<ListChecks size={15} aria-hidden="true" />}
      railSummary={<ManualSummary title={manual.company.name || title || "SOP manual"} />}
      rail={<ManualRail onAddSop={onAddSop} onDeleteSop={onDeleteSop} />}
      railMini={<ManualRailMini />}
      progressPill={<ProgressPill />}
    />
  );
}

/**
 * The builder chrome shared by SOP manuals and employee handbooks: top bar,
 * mode switch, collapsible outline rail, Write footer and live preview pane.
 * Everything document-specific arrives as props.
 */
export function BuilderFrame({ mode, saveStatus, heading, children, preview, design, review, exporting, onDownload, workspaceHref, setMode, openDetails, title, documentLabel, selectionKey, progress, kindIcon, railSummary, rail, railMini, progressPill }: ShellProps & {
  workspaceHref: string;
  setMode: (mode: BuilderMode) => void;
  openDetails: () => void;
  /** The document's name in the top bar. */
  title: string;
  /** "SOP manual" or "Employee handbook", where the title is empty. */
  documentLabel: string;
  /** Changes when the outline selection changes; the content scrolls to the top. */
  selectionKey: string;
  progress: { written: number; total: number };
  kindIcon: React.ReactNode;
  railSummary: React.ReactNode;
  rail: React.ReactNode;
  railMini: React.ReactNode;
  progressPill: React.ReactNode;
}) {
  const narrow = useNarrowViewport();
  const collapsed = React.useSyncExternalStore(subscribeCollapse, () => readFlag(COLLAPSE_KEY), serverFalse);
  const previewOpen = React.useSyncExternalStore(subscribePreview, () => readFlag(PREVIEW_KEY), serverFalse);
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const percent = progress.total ? Math.round((progress.written / progress.total) * 100) : 0;
  const showRail = mode === "write";
  const railExpanded = narrow || !collapsed;
  const showPreview = mode === "write" && previewOpen;
  const closePreview = React.useCallback(() => writeFlag(PREVIEW_KEY, PREVIEW_EVENT, false), []);
  const toggleSidebar = React.useCallback(() => writeFlag(COLLAPSE_KEY, COLLAPSE_EVENT, !readFlag(COLLAPSE_KEY)), []);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); setMode(mode === "design" ? "write" : "design"); }
      if ((event.ctrlKey || event.metaKey) && (event.key === "\\" || event.key === "[")) { event.preventDefault(); toggleSidebar(); }
      if (event.key === "Escape" && workflowOpen) setWorkflowOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, setMode, toggleSidebar, workflowOpen]);

  React.useLayoutEffect(() => { contentRef.current?.scrollTo({ top: 0, behavior: "auto" }); }, [selectionKey, mode]);
  // Picking an item on a narrow screen closes the outline drawer.
  const [seenSelection, setSeenSelection] = React.useState(selectionKey);
  if (seenSelection !== selectionKey) { setSeenSelection(selectionKey); setWorkflowOpen(false); }

  const modeButton = (value: BuilderMode, label: string) => (
    <button type="button" aria-pressed={mode === value} onClick={() => { setWorkflowOpen(false); setMode(value); }} className={shell.modeButton}>{label}</button>
  );

  return (
    <div className={shell.shell} data-sidebar-preference-loaded data-builder-mode={mode} style={{ "--rail-offset": `${showRail && !narrow ? (railExpanded ? 272 : 68) : 0}px` } as React.CSSProperties}>
      {showRail && workflowOpen ? <button type="button" aria-label="Close outline" onClick={() => setWorkflowOpen(false)} className={shell.scrim} /> : null}
      {showRail ? (
        <aside id="builder-workflow" role={narrow ? "dialog" : undefined} aria-modal={narrow && workflowOpen || undefined} aria-label="Manual outline" aria-hidden={narrow && !workflowOpen || undefined} inert={narrow && !workflowOpen} className={clsx(shell.rail, railExpanded ? shell.railExpanded : shell.railCollapsed, workflowOpen && shell.railOpen)}>
          {railExpanded ? <>
            <div className={shell.brandRow}>
              <Link href="/" className={shell.brand} aria-label="PolicyCraft home">
                <span className={shell.brandMark}><Leaf size={16} aria-hidden="true" /></span>
                <span className="min-w-0"><span className={shell.brandTitle}>PolicyCraft</span><span className={shell.brandSub}>Sustainability suite</span></span>
              </Link>
              <button type="button" onClick={toggleSidebar} title="Collapse sidebar (Ctrl+\)" aria-label="Collapse sidebar" className={clsx(shell.railButton, shell.wideOnly)}><PanelLeftClose size={16} aria-hidden="true" /></button>
              <button type="button" onClick={() => setWorkflowOpen(false)} aria-label="Close outline" className={clsx(shell.railButton, shell.narrowOnly)}><X size={16} aria-hidden="true" /></button>
            </div>
            {railSummary}
            {rail}
          </> : <>
            <div className={shell.collapsedBrand}><Link href="/" className={shell.brandMarkLink} aria-label="PolicyCraft home"><span className={shell.brandMark}><Leaf size={16} aria-hidden="true" /></span></Link></div>
            <div className={shell.collapsedContent}>
              <span className={shell.miniPolicy} title={documentLabel}>{kindIcon}</span>
              <span className={shell.miniProgress} title={`${progress.written} of ${progress.total} written`}>{percent}%</span>
              {railMini}
            </div>
          </>}
        </aside>
      ) : null}

      <main className={shell.contentColumn}>
        <header className={shell.header}>
          <div className={clsx(shell.headerStart, styles.headerStart)}>
            {showRail && collapsed ? <button type="button" onClick={toggleSidebar} title="Expand sidebar (Ctrl+\)" aria-label="Expand sidebar" className={clsx(shell.railButton, shell.expandButton)}><PanelLeftOpen size={16} aria-hidden="true" /></button> : null}
            <Link href={workspaceHref} className={shell.workspaceLink}><ArrowLeft size={13} aria-hidden="true" />Documents</Link>
            <span aria-hidden="true" className={shell.divider} />
            <p className={shell.identity}>
              <span className={shell.policyLabel}>{title || documentLabel}</span>
            </p>
            {saveStatus !== null ? <span role="status" aria-live="polite" className={shell.saveStatus}>{saveStatus}</span> : null}
          </div>
          <div role="group" aria-label="Builder mode" className={shell.modeSwitch}>
            {modeButton("write", "Write")}
            {modeButton("design", "Design")}
            {modeButton("review", "Review & export")}
          </div>
          <div className={shell.headerEnd}>
            {progressPill}
            {mode === "write" ? <button type="button" onClick={openDetails} aria-label={`Company and ${documentLabel.toLowerCase()} details`} title={`Company and ${documentLabel.toLowerCase()} details`} className={shell.headerButton}><Settings2 size={14} aria-hidden="true" /><span className={styles.wideLabel}>Details</span></button> : null}
            {mode === "write" ? <button type="button" aria-pressed={previewOpen} aria-controls={previewOpen ? "builder-preview" : undefined} onClick={() => (previewOpen ? closePreview() : writeFlag(PREVIEW_KEY, PREVIEW_EVENT, true))} className={clsx(shell.headerButton, previewOpen && shell.headerButtonActive)}>Preview</button> : null}
            <ApplicationSessionMenu workspaceHref={workspaceHref} />
            {mode === "write" ? <button type="button" aria-expanded={workflowOpen} aria-controls="builder-workflow" onClick={() => setWorkflowOpen((open) => !open)} className={clsx(shell.headerButton, shell.mobileWorkflow)}>{workflowOpen ? "Hide outline" : "Outline"}</button> : null}
          </div>
        </header>

        <div className={shell.body}>
          {mode === "design" ? design : (
            <>
              <div className={shell.main}>
                <div id="builder-content" ref={contentRef} className={shell.scrollRegion}>
                  <div className={shell.frame}>
                    <div className={clsx(shell.stepHeading, mode === "review" && shell.stepHeadingWithActions)}>
                      <div className="min-w-0">
                        <h1 className={shell.title}>{mode === "review" ? "Review & export" : heading.title}</h1>
                        <p className={shell.subtitle}>{mode === "review" ? `Check what is left, preview the whole ${documentLabel === "SOP manual" ? "manual" : "handbook"}, then download it.` : heading.subtitle}</p>
                      </div>
                      {mode === "review" ? (
                        <div role="group" aria-label="Export document" className={shell.exportActions}>
                          <Button variant="secondary" size="md" disabled={Boolean(exporting)} loading={exporting === "docx"} icon={<FileText size={14} aria-hidden="true" />} onClick={() => onDownload("docx")}>{exporting === "docx" ? "Downloading Word…" : "Download DOCX"}</Button>
                          <Button variant="primary" size="md" disabled={Boolean(exporting)} loading={exporting === "pdf"} icon={<FileDown size={14} aria-hidden="true" />} onClick={() => onDownload("pdf")}>{exporting === "pdf" ? "Downloading PDF…" : "Download PDF"}</Button>
                          <span className="sr-only" role="status" aria-live="polite">{exporting ? `Preparing ${exporting === "pdf" ? "PDF" : "Word"} download.` : ""}</span>
                        </div>
                      ) : null}
                    </div>
                    {mode === "review" ? review : children}
                  </div>
                </div>
                {mode === "write" ? (
                  <div className={shell.footer}>
                    <p className={shell.stepCount}>{heading.position}</p>
                    <div className={shell.footerActions}>
                      <Button variant="secondary" size="md" icon={<ArrowLeft size={14} aria-hidden="true" />} onClick={heading.prev?.onSelect} disabled={!heading.prev} aria-label={heading.prev?.label}>{heading.prev && !narrow ? heading.prev.label : "Back"}</Button>
                      {heading.next
                        ? <Button variant="primary" size="md" trailingIcon={<ArrowRight size={14} aria-hidden="true" />} onClick={heading.next.onSelect} aria-label={`Next: ${heading.next.label}`}>{narrow ? "Next" : `Next: ${heading.next.label}`}</Button>
                        : <Button variant="primary" size="md" trailingIcon={<ArrowRight size={14} aria-hidden="true" />} onClick={() => setMode("design")}>Next: Design</Button>}
                    </div>
                  </div>
                ) : null}
              </div>
              {showPreview ? (
                <aside id="builder-preview" aria-label="Live PDF preview" role={narrow ? "dialog" : undefined} aria-modal={narrow || undefined} className={shell.previewPane}>
                  <div className={shell.paneHeader}>
                    <h2 className={shell.paneTitle}>Live preview</h2>
                    <button type="button" onClick={closePreview} aria-label="Close preview" className={shell.railButton}><X size={16} aria-hidden="true" /></button>
                  </div>
                  <div className={shell.previewBody} data-lenis-prevent="">{preview}</div>
                </aside>
              ) : null}
              {showPreview && narrow ? <button type="button" aria-label="Dismiss live preview" onClick={closePreview} className={shell.scrim} /> : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
