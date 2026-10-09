"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, BadgeIndianRupee, Check, FileDown, FileText, Leaf, Loader2, PanelLeftClose, PanelLeftOpen, RotateCcw, Users, X } from "lucide-react";
import { clsx } from "clsx";
import { motion } from "motion/react";
import { useBuilder, getStepOrder } from "@/lib/store";
import { getPolicyProfile, getPolicySteps } from "@/lib/constants";
import { DesignInspector } from "@/components/builder/design-inspector";
import { usePolicyDownload } from "@/components/builder/dock-sections";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { ApplicationSessionMenu } from "@/components/ui/application-user-menu";
import styles from "./shell.module.css";

const COLLAPSE_KEY = "policycraft_sidebar_collapsed";
const COLLAPSE_EVENT = "policycraft-sidebar-collapse";
const subscribeSidebarPreference = (callback: () => void) => {
  window.addEventListener("storage", callback);
  window.addEventListener(COLLAPSE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(COLLAPSE_EVENT, callback);
  };
};
const getSidebarPreference = () => {
  try { return window.localStorage.getItem(COLLAPSE_KEY) === "true"; }
  catch { return false; }
};
const getServerSidebarPreference = () => false;
const subscribeHydration = () => () => undefined;
const getHydratedPreference = () => true;
const getServerHydratedPreference = () => false;
const subscribeViewport = (callback: () => void) => {
  const media = window.matchMedia("(max-width: 1199px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const getNarrowViewport = () => window.matchMedia("(max-width: 1199px)").matches;
const getServerNarrowViewport = () => false;

export function BuilderShell({
  children,
  topActions,
  showSidebar = true,
  hideDesignInspector = false,
}: {
  children: React.ReactNode;
  topActions?: React.ReactNode;
  showSidebar?: boolean;
  hideDesignInspector?: boolean;
}) {
  const { step, setStep, policy, reset } = useBuilder();
  const workspaceScope = usePolicyCraftScope((state) => state.scope);
  const policyMeta = getPolicyProfile(policy.policyType);
  const PolicyIcon = policyMeta.icon === "Users" ? Users : policyMeta.icon === "BadgeIndianRupee" ? BadgeIndianRupee : Leaf;
  const order = getStepOrder(policy);
  const visibleSteps = getPolicySteps(policy.policyType).filter((item) => order.includes(item.id));
  const currentIndex = Math.max(0, visibleSteps.findIndex((item) => item.id === step));
  const currentStep = visibleSteps[currentIndex];
  const progress = visibleSteps.length ? ((currentIndex + 1) / visibleSteps.length) * 100 : 0;
  const workspaceHref = workspaceScope?.role === "admin" ? "/admin/policies" : workspaceScope?.role === "manager" ? `/manager?orgId=${workspaceScope.organizationId}` : "/drafts";
  const narrowViewport = React.useSyncExternalStore(subscribeViewport, getNarrowViewport, getServerNarrowViewport);
  const [desktopInspectorOpen, setDesktopInspectorOpen] = React.useState(true);
  const [mobileInspectorOpen, setMobileInspectorOpen] = React.useState(false);
  const inspectorOpen = narrowViewport ? mobileInspectorOpen : desktopInspectorOpen;
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  const sidebarCollapsed = React.useSyncExternalStore(subscribeSidebarPreference, getSidebarPreference, getServerSidebarPreference);
  const sidebarPreferenceLoaded = React.useSyncExternalStore(subscribeHydration, getHydratedPreference, getServerHydratedPreference);
  const workflowPanel = React.useRef<HTMLElement>(null);
  const workflowTrigger = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const { download, exporting } = usePolicyDownload();
  const setInspectorOpen = React.useCallback((open: boolean) => {
    if (narrowViewport) setMobileInspectorOpen(open);
    else setDesktopInspectorOpen(open);
  }, [narrowViewport]);
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [setInspectorOpen]);

  const toggleSidebar = React.useCallback(() => {
    const next = !getSidebarPreference();
    try { window.localStorage.setItem(COLLAPSE_KEY, String(next)); } catch { /* Preference storage is optional. */ }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, []);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setInspectorOpen(!inspectorOpen);
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "\\" || event.key === "[")) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectorOpen, setInspectorOpen, toggleSidebar]);

  React.useEffect(() => {
    if (!workflowOpen || window.matchMedia("(min-width: 1200px)").matches) return;
    const trigger = workflowTrigger.current;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    workflowPanel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setWorkflowOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = Array.from(workflowPanel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]') || []).filter((element) => element.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === workflowPanel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      const restoreTarget = previousActive?.isConnected ? previousActive : trigger;
      if (restoreTarget?.isConnected) restoreTarget.focus();
    };
  }, [workflowOpen]);

  React.useLayoutEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);

  const resetPolicy = () => { if (window.confirm("Reset all fields and start over?")) reset(); };
  const railExpanded = !sidebarCollapsed || !sidebarPreferenceLoaded;

  return (
    <div className={styles.shell} data-sidebar-preference-loaded={sidebarPreferenceLoaded || undefined}>
      {showSidebar && workflowOpen && <button type="button" aria-label="Close workflow navigation" onClick={() => setWorkflowOpen(false)} className={styles.scrim} />}
      {showSidebar && (
        <aside ref={workflowPanel} tabIndex={-1} id="builder-workflow" role={narrowViewport ? "dialog" : undefined} aria-modal={narrowViewport && workflowOpen || undefined} aria-label="Builder workflow navigation" aria-hidden={narrowViewport && !workflowOpen || undefined} inert={narrowViewport && !workflowOpen}
          className={clsx(styles.rail, railExpanded ? styles.railExpanded : styles.railCollapsed, workflowOpen && styles.railOpen)}>
          {railExpanded ? <>
            <div className={styles.brandRow}>
              <Link href="/" className={styles.brand} aria-label="PolicyCraft home">
                <span className={styles.brandMark}><Leaf size={17} aria-hidden="true" /></span>
                <span className="min-w-0"><span className={styles.brandTitle}>PolicyCraft</span><span className={styles.brandSub}>Sustainability suite</span></span>
              </Link>
              <div className="flex items-center gap-1">
                <button type="button" onClick={toggleSidebar} title="Collapse sidebar (Ctrl+\\)" aria-label="Collapse sidebar" className={clsx(styles.railButton, "hidden min-[1200px]:inline-flex")}><PanelLeftClose size={17} aria-hidden="true" /></button>
                <button type="button" onClick={() => setWorkflowOpen(false)} aria-label="Close navigation" className={clsx(styles.railButton, "min-[1200px]:hidden")}><X size={17} aria-hidden="true" /></button>
              </div>
            </div>
            <div className={styles.policyMeta}><span className={styles.policyIcon}><PolicyIcon size={16} aria-hidden="true" /></span><span className="min-w-0"><span className={styles.metaEyebrow}>Active policy</span><span className={styles.metaLabel}>{policyMeta.label}</span></span></div>
            <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-valuetext={`${Math.round(progress)} percent, step ${currentIndex + 1} of ${visibleSteps.length}`} aria-label="Builder progress">
              <div className={styles.progressLabels}><span>{String(currentIndex + 1).padStart(2, "0")} / {String(visibleSteps.length).padStart(2, "0")}</span><span>{Math.round(progress)}%</span></div>
              <div className={styles.progressTrack}><div className={styles.progressBar} style={{ width: `${progress}%` }} /></div>
            </div>
            <nav className={styles.nav} aria-label="Policy sections">
              <p className={styles.navLabel}>Workflow</p>
              <ul className={styles.navList}>{visibleSteps.map((item, index) => {
                const active = item.id === step;
                const done = index < currentIndex;
                return <li key={item.id}><button type="button" onClick={() => setStep(item.id)} aria-current={active ? "step" : undefined} className={styles.navButton}>
                  {active && <motion.span layoutId="builder-workflow-selection" aria-hidden="true" className={styles.workflowMarker} transition={{ duration: 0.2, ease: "easeOut" }} />}
                  <span className={clsx(styles.stepNumber, done && styles.stepDone)}>{done ? <Check size={13} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</span>
                  <span className={styles.stepText}><span className={styles.stepTitle}>{item.label}</span><span className={styles.stepDescription}>{item.desc}</span></span>
                </button></li>;
              })}</ul>
            </nav>
            <div className={styles.railFooter}><button type="button" onClick={resetPolicy} className={clsx(styles.railButton, styles.resetButton)}><RotateCcw size={14} aria-hidden="true" />Reset all fields</button></div>
          </> : <>
            <div className={styles.brandRow} style={{ justifyContent: "center", padding: 0 }}><button type="button" onClick={toggleSidebar} title="Expand sidebar (Ctrl+\\)" aria-label="Expand sidebar" className={styles.railButton}><PanelLeftOpen size={17} aria-hidden="true" /></button></div>
            <div className={styles.collapsedContent}>
              <span className={styles.miniPolicy} title={`Active policy: ${policyMeta.label}`}><PolicyIcon size={16} aria-hidden="true" /></span>
              <span className={styles.miniProgress} title={`Progress ${Math.round(progress)}%`}>{Math.round(progress)}%</span>
              <nav className={styles.miniNav} aria-label="Policy sections">{visibleSteps.map((item, index) => <button type="button" key={item.id} onClick={() => setStep(item.id)} title={`Step ${index + 1}: ${item.label} — ${item.desc}`} aria-label={`Step ${index + 1}: ${item.label}`} aria-current={item.id === step ? "step" : undefined} className={styles.stepIcon}>{item.id === step && <motion.span layoutId="builder-workflow-selection" aria-hidden="true" className={styles.workflowMarkerCompact} transition={{ duration: 0.2, ease: "easeOut" }} />}{index < currentIndex ? <Check size={14} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}</button>)}</nav>
              <button type="button" onClick={resetPolicy} title="Reset all fields" aria-label="Reset all fields" className={styles.railButton}><RotateCcw size={15} aria-hidden="true" /></button>
            </div>
          </>}
        </aside>
      )}

      <main className={styles.contentColumn}>
        <header className={styles.header}>
          <div className={styles.headingGroup}>
            {showSidebar && sidebarCollapsed && <button type="button" onClick={toggleSidebar} title="Expand sidebar (Ctrl+\\)" aria-label="Expand sidebar" className={clsx(styles.railButton, "hidden min-[1200px]:inline-flex")}><PanelLeftOpen size={17} aria-hidden="true" /></button>}
            <div className={styles.headingText}>
              <div className={styles.breadcrumb}><Link href={workspaceHref}><ArrowLeft size={12} aria-hidden="true" />Workspace</Link><span aria-hidden="true">/</span><span>Builder</span></div>
              <h1 className={styles.title}>{currentStep?.label}</h1>
              <p className={styles.subtitle}>{workspaceScope?.organizationName ? <><strong>{workspaceScope.organizationName}</strong><span aria-hidden="true"> · </span></> : null}Step {currentIndex + 1} of {visibleSteps.length} — {currentStep?.desc}</p>
            </div>
          </div>
          <div className={styles.headerActions}>
            {topActions}
            {step === "export" && <div role="group" aria-label="Export document" className="flex flex-wrap items-center gap-2">
              <button type="button" disabled={!!exporting} onClick={() => download("pdf")} aria-busy={exporting === "pdf"} className={clsx(styles.headerButton, "bg-[var(--pc-primary)] text-[var(--pc-primary-text)]")}><span className="inline-flex w-4 justify-center" aria-hidden="true">{exporting === "pdf" ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <FileDown size={16} />}</span>{exporting === "pdf" ? "Downloading PDF…" : "Download PDF"}</button>
              <button type="button" disabled={!!exporting} onClick={() => download("docx")} aria-busy={exporting === "docx"} className={styles.headerButton}><span className="inline-flex w-4 justify-center" aria-hidden="true">{exporting === "docx" ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" /> : <FileText size={16} />}</span>{exporting === "docx" ? "Downloading Word…" : "Download Word"}</button>
              <span className="sr-only" role="status" aria-live="polite">{exporting ? `Preparing ${exporting === "pdf" ? "PDF" : "Word"} download.` : ""}</span>
            </div>}
            <ApplicationSessionMenu workspaceHref={workspaceHref} />
            {showSidebar && !hideDesignInspector && <>
              <button ref={workflowTrigger} type="button" aria-expanded={workflowOpen} aria-controls="builder-workflow" onClick={() => setWorkflowOpen((value) => !value)} className={clsx(styles.headerButton, styles.mobileWorkflow)}>{workflowOpen ? "Hide workflow" : "Workflow"}</button>
              <button type="button" aria-expanded={inspectorOpen} aria-controls="design-inspector" onClick={() => setInspectorOpen(!inspectorOpen)} className={styles.headerButton}>{inspectorOpen ? "Hide controls" : "Design controls"}</button>
            </>}
          </div>
        </header>
        <div ref={contentRef} id="builder-content" className={styles.scrollRegion}>{children}</div>
      </main>
      {showSidebar && !hideDesignInspector && <DesignInspector open={inspectorOpen} mobile={narrowViewport} onClose={closeInspector} />}
    </div>
  );
}
