"use client";

import * as React from "react";
import Link from "next/link";
import { useBuilder, getStepOrder } from "@/lib/store";
import { getPolicyProfile, getPolicySteps } from "@/lib/constants";
import { Icon } from "@/components/icons";
import {
  Leaf,
  ArrowLeft,
  Sparkles,
  RotateCcw,
  Users,
  BadgeIndianRupee,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { DesignInspector } from "@/components/builder/design-inspector";
import { usePolicyDownload } from "@/components/builder/dock-sections";

export function BuilderShell({
  children,
  topActions,
  showSidebar = true,
}: {
  children: React.ReactNode;
  topActions?: React.ReactNode;
  showSidebar?: boolean;
}) {
  const { step, setStep, policy, reset, loadSample } = useBuilder();

  const policyMeta = getPolicyProfile(policy.policyType);
  const PolicyIcon = policyMeta.icon === "Users" ? Users : policyMeta.icon === "BadgeIndianRupee" ? BadgeIndianRupee : Leaf;

  const order = getStepOrder(policy);
  const visibleSteps = getPolicySteps(policy.policyType).filter((s) => order.includes(s.id));
  const currentIndex = Math.max(0, visibleSteps.findIndex((s) => s.id === step));
  const progress = ((currentIndex + 1) / visibleSteps.length) * 100;

  const currentStep = visibleSteps[currentIndex];
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [workflowOpen, setWorkflowOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const workflowPanel = React.useRef<HTMLElement>(null);
  const closeInspector = React.useCallback(() => setInspectorOpen(false), [setInspectorOpen]);
  const { download, exporting, pdfReady } = usePolicyDownload();

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("policycraft_sidebar_collapsed");
      if (saved !== null) {
        setSidebarCollapsed(saved === "true");
      }
    } catch {}
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("policycraft_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setInspectorOpen((value) => !value);
      }
      if ((event.ctrlKey || event.metaKey) && (event.key === "\\" || event.key === "[")) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  React.useEffect(() => {
    const mobile = window.matchMedia("(max-width:1199px)").matches;
    const previous = document.activeElement as HTMLElement | null;
    if (!mobile || !workflowOpen) return;
    workflowPanel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setWorkflowOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = Array.from(workflowPanel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]') || []).filter(el => el.getClientRects().length);
      const first = elements[0];
      const last = elements.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === workflowPanel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, [workflowOpen]);

  React.useLayoutEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [step]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-cream)]">
      {showSidebar && workflowOpen && <button type="button" aria-label="Close workflow navigation" onClick={() => setWorkflowOpen(false)} className="fixed inset-0 z-30 bg-black/25 min-[1200px]:hidden" />}
      {showSidebar && (
        <aside
          ref={workflowPanel}
          tabIndex={-1}
          id="builder-workflow"
          className={clsx(
            "flex flex-shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-paper)] outline-none select-none",
            "transition-[width] duration-200 ease-in-out",
            "max-[1199px]:fixed max-[1199px]:inset-y-0 max-[1199px]:left-0 max-[1199px]:z-40 max-[1199px]:w-[280px] max-[1199px]:shadow-2xl",
            workflowOpen ? "max-[1199px]:translate-x-0" : "max-[1199px]:-translate-x-full",
            sidebarCollapsed ? "min-[1200px]:w-[68px]" : "min-[1200px]:w-[272px]"
          )}
        >
          {/* Collapsed Mini-Rail View (Desktop only, minimal controls seen) */}
          {sidebarCollapsed && (
            <div className="hidden min-[1200px]:flex flex-col h-full w-full">
              {/* Header with expand toggle */}
              <div className="h-[65px] px-2 border-b border-[var(--color-line)] flex items-center justify-center flex-shrink-0">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  title="Expand sidebar (Ctrl+\)"
                  aria-label="Expand sidebar"
                  className="w-10 h-10 rounded-xl bg-[var(--color-cream-2)] hover:bg-[var(--color-forest-soft)] text-[var(--color-ink-2)] hover:text-[var(--color-forest-deep)] border border-[var(--color-line-2)] flex items-center justify-center transition-all shadow-xs group"
                >
                  <PanelLeftOpen size={18} className="group-hover:scale-110 transition-transform" />
                </button>
              </div>

              {/* Active policy mini badge */}
              <div className="px-2 pt-3 flex justify-center flex-shrink-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center cursor-default shadow-xs transition-transform hover:scale-105"
                  style={{
                    background: policyMeta.accentSoft,
                    border: "1px solid #cfe2d7",
                    color: policyMeta.accent,
                  }}
                  title={`Active policy: ${policyMeta.label}`}
                >
                  <PolicyIcon size={17} strokeWidth={2.2} />
                </div>
              </div>

              {/* Mini progress */}
              <div
                className="px-2 pt-3 pb-1 flex flex-col items-center cursor-default flex-shrink-0"
                title={`Progress: ${Math.round(progress)}% (Step ${currentIndex + 1} of ${visibleSteps.length})`}
              >
                <span className="text-[10px] font-mono text-[var(--color-forest)] font-bold">
                  {Math.round(progress)}%
                </span>
                <div className="w-9 h-1 rounded-full bg-[var(--color-line)] mt-1.5 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--color-forest)] to-[var(--color-forest-mid)] transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Compact Step Icons */}
              <nav className="flex-1 overflow-y-auto py-3 px-2 scrollbar-none flex flex-col items-center gap-1.5">
                {visibleSteps.map((s, i) => {
                  const done = i < currentIndex;
                  const active = i === currentIndex;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStep(s.id)}
                      title={`Step ${i + 1}: ${s.label} — ${s.desc}`}
                      aria-label={`Step ${i + 1}: ${s.label}`}
                      aria-current={active ? "step" : undefined}
                      className={clsx(
                        "w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-semibold transition-all duration-150 relative",
                        active
                          ? "bg-[var(--color-forest)] text-white shadow-sm ring-2 ring-[var(--color-forest)]/25 scale-105"
                          : done
                          ? "bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)] hover:bg-[var(--color-forest)] hover:text-white"
                          : "bg-[var(--color-cream-2)] text-[var(--color-muted)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] border border-[var(--color-line-2)]"
                      )}
                    >
                      {done ? <Icon name="Check" size={13} /> : String(i + 1).padStart(2, "0")}
                    </button>
                  );
                })}
              </nav>

              {/* Bottom Minimal Actions */}
              <div className="border-t border-[var(--color-line)] p-2 flex flex-col items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={loadSample}
                  title="Load sample policy"
                  aria-label="Load sample policy"
                  className="w-9 h-9 rounded-xl border border-[var(--color-line-2)] bg-[var(--color-paper)] hover:bg-[var(--color-cream-2)] text-[var(--color-forest)] flex items-center justify-center transition-colors shadow-xs"
                >
                  <Sparkles size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Reset all fields and start over?")) reset();
                  }}
                  title="Reset all fields"
                  aria-label="Reset all fields"
                  className="w-9 h-9 rounded-xl text-[var(--color-muted)] hover:bg-red-50 hover:text-red-600 flex items-center justify-center transition-colors"
                >
                  <RotateCcw size={14} />
                </button>
                <div
                  className="w-8 h-8 rounded-full bg-[var(--color-ink)] text-white flex items-center justify-center text-[11px] font-semibold shadow-xs select-none"
                  title="User account"
                >
                  N
                </div>
              </div>
            </div>
          )}

          {/* Full Expanded View (Default on desktop, and inside mobile slide-over) */}
          <div className={clsx("flex-col h-full w-full", sidebarCollapsed ? "flex min-[1200px]:hidden" : "flex")}>
            {/* Brand Header with collapse toggle */}
            <div className="h-[65px] px-5 py-3.5 border-b border-[var(--color-line)] flex items-center justify-between gap-2 flex-shrink-0">
              <Link href="/" className="flex items-center gap-2.5 group min-w-0">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-forest)] to-[var(--color-forest-mid)] flex items-center justify-center shadow-[0_2px_8px_rgba(26,92,58,0.25)] group-hover:scale-105 transition-transform flex-shrink-0">
                  <Leaf size={17} className="text-white" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="font-display text-[16px] font-semibold tracking-tight leading-none truncate">PolicyCraft</div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)] mt-1 truncate">Sustainability Suite</div>
                </div>
              </Link>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleSidebar}
                  title="Collapse sidebar (Ctrl+\)"
                  aria-label="Collapse sidebar"
                  className="hidden min-[1200px]:flex w-8 h-8 items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] transition-colors flex-shrink-0"
                >
                  <PanelLeftClose size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setWorkflowOpen(false)}
                  aria-label="Close navigation"
                  className="min-[1200px]:hidden w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] transition-colors flex-shrink-0"
                >
                  <X size={17} />
                </button>
              </div>
            </div>

            {/* Policy type badge */}
            <div className="px-4 pt-4 flex-shrink-0">
              <div
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border"
                style={{
                  background: policyMeta.accentSoft,
                  borderColor: "#cfe2d7",
                  color: policyMeta.accent,
                }}
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: policyMeta.accent }}
                >
                  <PolicyIcon size={14} className="text-white" strokeWidth={2.2} />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Active policy</div>
                  <div className="text-[13px] font-semibold truncate">{policyMeta.label}</div>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="px-4 pt-4 flex-shrink-0">
              <div className="flex items-center justify-between text-[11px] text-[var(--color-muted)] mb-2 font-mono">
                <span>
                  {String(currentIndex + 1).padStart(2, "0")} / {String(visibleSteps.length).padStart(2, "0")}
                </span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-1 rounded-full bg-[var(--color-line)] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[var(--color-forest)] to-[var(--color-forest-mid)] transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Steps */}
            <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)] px-2 mb-2">
                Workflow
              </div>
              <ul className="space-y-0.5">
                {visibleSteps.map((s, i) => {
                  const done = i < currentIndex;
                  const active = i === currentIndex;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => setStep(s.id)}
                        className={clsx(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 group",
                          active
                            ? "bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)]"
                            : "hover:bg-[var(--color-cream-2)] text-[var(--color-ink-2)]"
                        )}
                      >
                        <div
                          className={clsx(
                            "w-6 h-6 rounded-md flex items-center justify-center text-[10.5px] font-semibold flex-shrink-0 transition-colors",
                            done && "bg-[var(--color-forest)] text-white",
                            active && "bg-[var(--color-forest)] text-white",
                            !done && !active && "bg-[var(--color-cream-2)] text-[var(--color-muted)] border border-[var(--color-line-2)]"
                          )}
                        >
                          {done ? <Icon name="Check" size={12} /> : String(i + 1).padStart(2, "0")}
                        </div>
                        <div className="min-w-0">
                          <div
                            className={clsx(
                              "text-[13px] font-medium leading-tight",
                              active && "font-semibold"
                            )}
                          >
                            {s.label}
                          </div>
                          <div
                            className={clsx(
                              "text-[11px] leading-tight mt-0.5 truncate",
                              active ? "text-[var(--color-forest-deep)]/70" : "text-[var(--color-muted)]"
                            )}
                          >
                            {s.desc}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Footer actions */}
            <div className="border-t border-[var(--color-line)] p-3 space-y-2 flex-shrink-0">
              <button
                onClick={loadSample}
                className="w-full inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] hover:bg-[var(--color-cream-2)] text-[12.5px] font-medium transition-colors"
              >
                <Sparkles size={13} className="text-[var(--color-forest)]" /> Load sample policy
              </button>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full bg-[var(--color-ink)] text-white flex items-center justify-center text-[11px] font-semibold shadow-xs flex-shrink-0 select-none"
                  title="User account"
                >
                  N
                </div>
                <button
                  onClick={() => {
                    if (confirm("Reset all fields and start over?")) reset();
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 h-8 px-2.5 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] text-[12px] font-medium transition-colors"
                >
                  <RotateCcw size={12} /> Reset all fields
                </button>
              </div>
            </div>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="px-7 py-4 border-b border-[var(--color-line)] bg-[var(--color-paper)]/85 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {showSidebar && sidebarCollapsed && (
              <button
                type="button"
                onClick={toggleSidebar}
                title="Expand sidebar (Ctrl+\)"
                aria-label="Expand sidebar"
                className="hidden min-[1200px]:inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[var(--color-line)] hover:bg-[var(--color-cream-2)] text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors flex-shrink-0"
              >
                <PanelLeftOpen size={16} />
              </button>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)] font-semibold">
                <Link href="/" className="hover:text-[var(--color-ink)] inline-flex items-center gap-1">
                  <ArrowLeft size={11} /> Home
                </Link>
                <span className="text-[var(--color-line-2)]">/</span>
                <span>Builder</span>
              </div>
              <h1 className="font-display text-[22px] font-semibold tracking-tight mt-1 truncate">
                {currentStep?.label}
              </h1>
              <p className="text-[12.5px] text-[var(--color-muted)] mt-0.5 truncate">
                Step {currentIndex + 1} of {visibleSteps.length} — {currentStep?.desc}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {topActions}
            {step === "export" && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!pdfReady || !!exporting}
                  onClick={() => download("pdf")}
                  className="rounded-lg bg-[var(--color-forest)] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  {exporting === "pdf" ? "Downloading…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  disabled={!!exporting}
                  onClick={() => download("docx")}
                  className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-[13px]"
                >
                  Word
                </button>
              </div>
            )}
            {showSidebar && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-expanded={workflowOpen}
                  aria-controls="builder-workflow"
                  onClick={() => setWorkflowOpen((value) => !value)}
                  className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-[13px] min-[1200px]:hidden"
                >
                  {workflowOpen ? "Hide workflow" : "Workflow"}
                </button>
                <button
                  type="button"
                  aria-expanded={inspectorOpen}
                  aria-controls="design-inspector"
                  onClick={() => setInspectorOpen((value) => !value)}
                  className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-[13px]"
                >
                  {inspectorOpen ? "Hide controls" : "Design controls"}
                </button>
              </div>
            )}
          </div>
        </header>

        <div ref={contentRef} className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </main>

      {showSidebar && <DesignInspector open={inspectorOpen} onClose={closeInspector} />}
    </div>
  );
}
