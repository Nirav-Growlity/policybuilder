"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, FileDown, FileText, Leaf, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { POLICY_ICONS } from "./policy-icons";
import { clsx } from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { useBuilder, getStepOrder } from "@/lib/store";
import type { StepId } from "@/lib/types";
import { getPolicyProfile, getPolicySteps } from "@/lib/constants";
import { DesignInspector } from "@/components/builder/design-inspector";
import { usePolicyDownload } from "@/components/builder/dock-sections";
import { DebouncedPolicyPreview } from "@/components/builder/live-preview";
import { AICoverGenerationLoader } from "@/components/builder/ai-cover-generation-loader";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { ApplicationSessionMenu } from "@/components/ui/application-user-menu";
import { Button } from "@/components/ui/button";
import styles from "./shell.module.css";

// Keep these breakpoints in sync with shell.module.css and design-inspector.module.css.
const NARROW_QUERY = "(max-width: 1199px)";
const COLLAPSE_KEY = "policycraft_sidebar_collapsed";
const COLLAPSE_EVENT = "policycraft-sidebar-collapse";
const PREVIEW_KEY = "policycraft_builder_preview_open";
const PREVIEW_EVENT = "policycraft-builder-preview";

type BuilderMode = "write" | "design" | "review";

function subscribeToPreference(eventName: string) {
  return (callback: () => void) => {
    window.addEventListener("storage", callback);
    window.addEventListener(eventName, callback);
    return () => {
      window.removeEventListener("storage", callback);
      window.removeEventListener(eventName, callback);
    };
  };
}
const subscribeSidebarPreference = subscribeToPreference(COLLAPSE_EVENT);
const subscribePreviewPreference = subscribeToPreference(PREVIEW_EVENT);
const readStoredFlag = (key: string) => {
  try { return window.localStorage.getItem(key) === "true"; }
  catch { return false; }
};
const writeStoredFlag = (key: string, eventName: string, value: boolean) => {
  try { window.localStorage.setItem(key, String(value)); }
  catch { /* Preference storage is optional. */ }
  window.dispatchEvent(new Event(eventName));
};
const getSidebarPreference = () => readStoredFlag(COLLAPSE_KEY);
const getPreviewPreference = () => readStoredFlag(PREVIEW_KEY);
const getServerFlag = () => false;
const subscribeHydration = () => () => undefined;
const getHydratedPreference = () => true;
const getServerHydratedPreference = () => false;
const subscribeViewport = (callback: () => void) => {
  const media = window.matchMedia(NARROW_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const getNarrowViewport = () => window.matchMedia(NARROW_QUERY).matches;

// Focus handling shared by the workflow and preview drawers: focus moves into
// the panel, Tab cycles inside it, Escape closes it, and focus returns afterwards.
function useDrawerFocus({ active, panel, trigger, onClose }: {
  active: boolean;
  panel: React.RefObject<HTMLElement | null>;
  trigger: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  React.useEffect(() => {
    if (!active) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const triggerElement = trigger.current;
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]') || []).filter((element) => element.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      const restoreTarget = previousActive?.isConnected ? previousActive : triggerElement;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [active, onClose, panel, trigger]);
}

export function BuilderShell({
  children,
  coverEditing = false,
  saveStatus = null,
  policyMenu,
  taskChip,
  isFirstStep = false,
}: {
  children: React.ReactNode;
  coverEditing?: boolean;
  saveStatus?: string | null;
  policyMenu?: React.ReactNode;
  taskChip?: React.ReactNode;
  // The first-step flag comes from the builder, which owns the step order.
  isFirstStep?: boolean;
}) {
  const { step, setStep, policy, next, prev, coverEditorRequest, includeAuthorSignature, authorSignatureDate, authorSignatureUpdatedAt, isAICoverGenerating } = useBuilder();
  const workspaceScope = usePolicyCraftScope((state) => state.scope);
  const { download, exporting } = usePolicyDownload();
  const policyMeta = getPolicyProfile(policy.policyType);
  const PolicyIcon = POLICY_ICONS[policyMeta.icon];
  const order = getStepOrder(policy);
  const visibleSteps = getPolicySteps(policy.policyType).filter((item) => order.includes(item.id));
  // The rail lists the writing steps only; review and export lives behind its own mode tab.
  const railSteps = visibleSteps.filter((item) => item.id !== "export");
  const reviewing = step === "export";
  const currentIndex = reviewing ? railSteps.length : Math.max(0, railSteps.findIndex((item) => item.id === step));
  const currentStep = visibleSteps.find((item) => item.id === step) ?? railSteps[currentIndex];
  const nextStep = railSteps[currentIndex + 1];
  const progress = reviewing ? 100 : railSteps.length ? ((currentIndex + 1) / railSteps.length) * 100 : 0;
  const stepNumber = Math.min(currentIndex + 1, railSteps.length);
  const workspaceHref = workspaceScope?.role === "admin" ? "/admin/policies" : workspaceScope?.role === "manager" ? `/manager?orgId=${workspaceScope.organizationId}` : "/drafts";
  const narrowViewport = React.useSyncExternalStore(subscribeViewport, getNarrowViewport, getServerFlag);
  const sidebarCollapsed = React.useSyncExternalStore(subscribeSidebarPreference, getSidebarPreference, getServerFlag);
  const sidebarPreferenceLoaded = React.useSyncExternalStore(subscribeHydration, getHydratedPreference, getServerHydratedPreference);
  const previewOpen = React.useSyncExternalStore(subscribePreviewPreference, getPreviewPreference, getServerFlag);
  const reduceMotion = useReducedMotion();
  const markerTransition = { duration: reduceMotion ? 0 : 0.2, ease: "easeOut" as const };

  const [designOpen, setDesignOpen] = React.useState(false);
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  // Render-time adjustments: a step change to export, or a cover edit request,
  // always lands in Review, even when Design was open.
  const [seenStep, setSeenStep] = React.useState<StepId>(step);
  const [seenCoverRequest, setSeenCoverRequest] = React.useState(coverEditorRequest);
  if (step !== seenStep) {
    setSeenStep(step);
    if (step === "export") setDesignOpen(false);
  }
  if (coverEditorRequest !== seenCoverRequest) {
    setSeenCoverRequest(coverEditorRequest);
    if (coverEditorRequest) setDesignOpen(false);
  }

  // The last write step is remembered so Write can return to it from Review.
  const [rememberedWriteStep, setRememberedWriteStep] = React.useState<StepId | null>(step === "export" ? null : step);
  if (step !== "export" && step !== rememberedWriteStep) setRememberedWriteStep(step);

  const workflowPanel = React.useRef<HTMLElement>(null);
  const workflowTrigger = React.useRef<HTMLButtonElement>(null);
  const previewPanel = React.useRef<HTMLElement>(null);
  const previewTrigger = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // While the cover editor is open, the mode switcher and Design shortcut are
  // hidden, matching the inspector toggles that this replaces.
  const coverEditingNow = coverEditing && step === "export";
  const mode: BuilderMode = designOpen ? "design" : step === "export" ? "review" : "write";
  // The step rail belongs to writing; Design and Review & export use the full width.
  const showRail = mode === "write";
  const railExpanded = narrowViewport || !sidebarCollapsed || !sidebarPreferenceLoaded;
  const showPreview = mode === "write" && previewOpen;
  const previewDrawer = showPreview && narrowViewport;
  const signatureUpdatedAt = authorSignatureUpdatedAt ?? null;

  const closeWorkflow = React.useCallback(() => setWorkflowOpen(false), []);
  const closePreview = React.useCallback(() => writeStoredFlag(PREVIEW_KEY, PREVIEW_EVENT, false), []);
  const exitDesign = React.useCallback(() => setDesignOpen(false), []);
  useDrawerFocus({ active: showRail && narrowViewport && workflowOpen, panel: workflowPanel, trigger: workflowTrigger, onClose: closeWorkflow });
  useDrawerFocus({ active: previewDrawer, panel: previewPanel, trigger: previewTrigger, onClose: closePreview });

  const toggleSidebar = React.useCallback(() => {
    writeStoredFlag(COLLAPSE_KEY, COLLAPSE_EVENT, !getSidebarPreference());
  }, []);

  const toggleWorkflow = () => {
    if (!workflowOpen) {
      // Only one drawer is open at a time on narrow screens.
      if (previewOpen) writeStoredFlag(PREVIEW_KEY, PREVIEW_EVENT, false);
      setWorkflowOpen(true);
    } else {
      setWorkflowOpen(false);
    }
  };

  const togglePreview = () => {
    if (!previewOpen) {
      if (narrowViewport) setWorkflowOpen(false);
      writeStoredFlag(PREVIEW_KEY, PREVIEW_EVENT, true);
    } else {
      closePreview();
    }
  };

  const enterWrite = () => {
    setDesignOpen(false);
    if (step !== "export") return;
    const remembered = rememberedWriteStep;
    const target = remembered && visibleSteps.some((item) => item.id === remembered)
      ? remembered
      : visibleSteps.filter((item) => item.id !== "export").at(-1)?.id ?? step;
    setStep(target);
  };
  const enterDesign = () => {
    setWorkflowOpen(false);
    setDesignOpen(true);
  };
  const enterReview = () => {
    setWorkflowOpen(false);
    setDesignOpen(false);
    if (step !== "export") setStep("export");
  };

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        if (!coverEditingNow) setDesignOpen((open) => !open);
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "\\" || event.key === "[")) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coverEditingNow, toggleSidebar]);

  React.useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  const modeButton = (value: BuilderMode, label: string, onSelect: () => void) => (
    <button type="button" aria-pressed={mode === value} onClick={onSelect} className={styles.modeButton}>{label}</button>
  );

  return (
    <div className={styles.shell} data-sidebar-preference-loaded={sidebarPreferenceLoaded || undefined} data-builder-mode={mode} style={{ "--rail-offset": `${showRail && !narrowViewport ? (railExpanded ? 272 : 68) : 0}px` } as React.CSSProperties}>
      {showRail && workflowOpen && <button type="button" aria-label="Close workflow navigation" onClick={closeWorkflow} className={styles.scrim} />}
      {showRail && (
        <aside ref={workflowPanel} tabIndex={-1} id="builder-workflow" role={narrowViewport ? "dialog" : undefined} aria-modal={narrowViewport && workflowOpen || undefined} aria-label="Builder workflow navigation" aria-hidden={narrowViewport && !workflowOpen || undefined} inert={narrowViewport && !workflowOpen}
          className={clsx(styles.rail, railExpanded ? styles.railExpanded : styles.railCollapsed, workflowOpen && styles.railOpen)}>
          {railExpanded ? <>
            <div className={styles.brandRow}>
              <Link href="/" className={styles.brand} aria-label="PolicyCraft home">
                <span className={styles.brandMark}><Leaf size={16} aria-hidden="true" /></span>
                <span className="min-w-0"><span className={styles.brandTitle}>PolicyCraft</span><span className={styles.brandSub}>Sustainability suite</span></span>
              </Link>
              <button type="button" onClick={toggleSidebar} title="Collapse sidebar (Ctrl+\\)" aria-label="Collapse sidebar" className={clsx(styles.railButton, styles.wideOnly)}><PanelLeftClose size={16} aria-hidden="true" /></button>
              <button type="button" onClick={closeWorkflow} aria-label="Close navigation" className={clsx(styles.railButton, styles.narrowOnly)}><X size={16} aria-hidden="true" /></button>
            </div>
            <div className={styles.policyMeta}><span className={styles.policyIcon}><PolicyIcon size={15} aria-hidden="true" /></span><span className="min-w-0"><span className={styles.metaEyebrow}>Active policy</span><span className={styles.metaLabel}>{policyMeta.label}</span></span></div>
            <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-valuetext={`${Math.round(progress)} percent, step ${stepNumber} of ${railSteps.length}`} aria-label="Builder progress">
              <div className={styles.progressLabels}><span>{String(stepNumber).padStart(2, "0")} / {String(railSteps.length).padStart(2, "0")}</span><span>{Math.round(progress)}%</span></div>
              <div className={styles.progressTrack}><div className={styles.progressBar} style={{ width: `${progress}%` }} /></div>
            </div>
            <nav className={styles.nav} aria-label="Policy sections">
              <ul className={styles.navList}>{railSteps.map((item, index) => {
                const active = item.id === step;
                const done = index < currentIndex;
                return <li key={item.id}><button type="button" onClick={() => setStep(item.id)} aria-current={active ? "step" : undefined} title={item.desc} className={styles.navButton}>
                  {active && <motion.span layoutId="builder-workflow-selection" aria-hidden="true" className={styles.workflowMarker} transition={markerTransition} />}
                  <span className={clsx(styles.stepNumber, done && styles.stepDone)}>{done ? <Check size={12} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.stepTitle}>{item.label}</span>
                </button></li>;
              })}</ul>
            </nav>
          </> : <>
            <div className={styles.collapsedBrand}>
              <Link href="/" className={styles.brandMarkLink} aria-label="PolicyCraft home"><span className={styles.brandMark}><Leaf size={16} aria-hidden="true" /></span></Link>
            </div>
            <div className={styles.collapsedContent}>
              <span className={styles.miniPolicy} title={`Active policy: ${policyMeta.label}`}><PolicyIcon size={15} aria-hidden="true" /></span>
              <span className={styles.miniProgress} title={`Progress ${Math.round(progress)}%`}>{Math.round(progress)}%</span>
              <nav className={styles.miniNav} aria-label="Policy sections">{railSteps.map((item, index) => <button type="button" key={item.id} onClick={() => setStep(item.id)} title={`Step ${index + 1}: ${item.label} — ${item.desc}`} aria-label={`Step ${index + 1}: ${item.label}`} aria-current={item.id === step ? "step" : undefined} className={styles.stepIcon}>{item.id === step && <motion.span layoutId="builder-workflow-selection" aria-hidden="true" className={styles.workflowMarkerCompact} transition={markerTransition} />}{index < currentIndex ? <Check size={13} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</button>)}</nav>
            </div>
          </>}
        </aside>
      )}

      <main className={styles.contentColumn}>
        <header className={styles.header}>
          <div className={styles.headerStart}>
            {showRail && sidebarCollapsed && sidebarPreferenceLoaded && <button type="button" onClick={toggleSidebar} title="Expand sidebar (Ctrl+\\)" aria-label="Expand sidebar" className={clsx(styles.railButton, styles.expandButton)}><PanelLeftOpen size={16} aria-hidden="true" /></button>}
            <Link href={workspaceHref} className={styles.workspaceLink}><ArrowLeft size={13} aria-hidden="true" />Workspace</Link>
            <span aria-hidden="true" className={styles.divider} />
            <p className={styles.identity}>
              <span className={styles.policyLabel}>{policyMeta.label}</span>
              {workspaceScope?.organizationName ? <><span aria-hidden="true" className={styles.separator}>·</span><span className={styles.orgName}>{workspaceScope.organizationName}</span></> : null}
            </p>
            {saveStatus !== null && <span role="status" aria-live="polite" className={styles.saveStatus}>{saveStatus}</span>}
          </div>
          {!coverEditingNow && <div role="group" aria-label="Builder mode" className={styles.modeSwitch}>
            {modeButton("write", "Write", enterWrite)}
            {modeButton("design", "Design", enterDesign)}
            {modeButton("review", "Review & export", enterReview)}
          </div>}
          <div className={styles.headerEnd}>
            {taskChip}
            {mode === "write" && policyMenu}
            {mode === "write" && <button ref={previewTrigger} type="button" aria-pressed={previewOpen} aria-controls={previewOpen ? "builder-preview" : undefined} onClick={togglePreview} className={clsx(styles.headerButton, previewOpen && styles.headerButtonActive)}>Preview</button>}
            <ApplicationSessionMenu workspaceHref={workspaceHref} />
            {mode === "write" && <button ref={workflowTrigger} type="button" aria-expanded={workflowOpen} aria-controls="builder-workflow" onClick={toggleWorkflow} className={clsx(styles.headerButton, styles.mobileWorkflow)}>{workflowOpen ? "Hide workflow" : "Workflow"}</button>}
          </div>
        </header>

        <div className={styles.body}>
          {mode === "design" ? (
            <div className={styles.designLayout}>
              <h1 className="sr-only">Document design</h1>
              <DesignInspector open mobile={narrowViewport} onClose={exitDesign} />
              <section aria-label="Document preview" className={styles.designPreview}>
                <div className={styles.paneHeader}><h2 className={styles.paneTitle}>Document preview</h2></div>
                <div className={styles.designPreviewBody}>
                  {isAICoverGenerating
                    ? <div className="relative h-full min-h-[clamp(520px,70vh,760px)]"><AICoverGenerationLoader title={policyMeta.label} company={policy.company.name} accent={policyMeta.accent} /></div>
                    : <DebouncedPolicyPreview policy={policy} includeAuthorSignature={includeAuthorSignature} authorSignatureDate={authorSignatureDate} signatureUpdatedAt={signatureUpdatedAt} />}
                </div>
              </section>
            </div>
          ) : (
            <>
              <div className={styles.main}>
                <div id="builder-content" ref={contentRef} className={styles.scrollRegion}>
                  <div className={styles.frame}>
                    <div className={clsx(styles.stepHeading, reviewing && styles.stepHeadingWithActions)}>
                      <div className="min-w-0">
                        <h1 className={styles.title}>{currentStep?.label}</h1>
                        {currentStep?.desc ? <p className={styles.subtitle}>{currentStep.desc}</p> : null}
                      </div>
                      {reviewing && <div role="group" aria-label="Export document" className={styles.exportActions}>
                        <Button variant="secondary" size="md" disabled={!!exporting} loading={exporting === "docx"} icon={<FileText size={14} aria-hidden="true" />} onClick={() => download("docx")}>{exporting === "docx" ? "Downloading Word…" : "Download Word"}</Button>
                        <Button variant="primary" size="md" disabled={!!exporting} loading={exporting === "pdf"} icon={<FileDown size={14} aria-hidden="true" />} onClick={() => download("pdf")}>{exporting === "pdf" ? "Downloading PDF…" : "Download PDF"}</Button>
                        <span className="sr-only" role="status" aria-live="polite">{exporting ? `Preparing ${exporting === "pdf" ? "PDF" : "Word"} download.` : ""}</span>
                      </div>}
                    </div>
                    {children}
                  </div>
                </div>
                {!reviewing && <div className={styles.footer}>
                  <p className={styles.stepCount}>Step {stepNumber} of {railSteps.length}</p>
                  <div className={styles.footerActions}>
                    <Button variant="secondary" size="md" icon={<ArrowLeft size={14} aria-hidden="true" />} onClick={prev} disabled={isFirstStep}>Back</Button>
                    {nextStep
                      ? <Button variant="primary" size="md" trailingIcon={<ArrowRight size={14} aria-hidden="true" />} onClick={next}>Next: {nextStep.label}</Button>
                      : <Button variant="primary" size="md" trailingIcon={<ArrowRight size={14} aria-hidden="true" />} onClick={enterDesign}>Next: Design</Button>}
                  </div>
                </div>}
              </div>
              {showPreview && (
                <aside ref={previewPanel} tabIndex={-1} id="builder-preview" aria-label="Live PDF preview" role={narrowViewport ? "dialog" : undefined} aria-modal={narrowViewport || undefined} className={styles.previewPane}>
                  <div className={styles.paneHeader}>
                    <h2 className={styles.paneTitle}>Live preview</h2>
                    <button type="button" onClick={closePreview} aria-label="Close preview" className={styles.railButton}><X size={16} aria-hidden="true" /></button>
                  </div>
                  <div className={styles.previewBody}>
                    <DebouncedPolicyPreview policy={policy} includeAuthorSignature={includeAuthorSignature} authorSignatureDate={authorSignatureDate} signatureUpdatedAt={signatureUpdatedAt} />
                  </div>
                </aside>
              )}
              {previewDrawer && <button type="button" aria-label="Dismiss live preview" onClick={closePreview} className={styles.scrim} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
