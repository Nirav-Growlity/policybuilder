"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBuilder, getStepOrder } from "@/lib/store";
import { getPolicyProfile, getPolicySteps } from "@/lib/constants";
import { Icon } from "@/components/icons";
import { Leaf, ArrowLeft, Sparkles, FileText, RotateCcw, Users, BadgeIndianRupee } from "lucide-react";
import { clsx } from "clsx";

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
  const pathname = usePathname();
  const policyMeta = getPolicyProfile(policy.policyType);
  const PolicyIcon = policyMeta.icon === "Users" ? Users : policyMeta.icon === "BadgeIndianRupee" ? BadgeIndianRupee : Leaf;

  const order = getStepOrder(policy);
  const visibleSteps = getPolicySteps(policy.policyType).filter((s) => order.includes(s.id));
  const currentIndex = Math.max(0, visibleSteps.findIndex((s) => s.id === step));
  const progress = ((currentIndex + 1) / visibleSteps.length) * 100;

  const currentStep = visibleSteps[currentIndex];
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    contentRef.current?.scrollTo(0, 0);
  }, [step]);

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-cream)]">
      {showSidebar && (
        <aside className="w-[272px] flex-shrink-0 flex flex-col border-r border-[var(--color-line)] bg-[var(--color-paper)]">
          {/* Brand */}
          <div className="px-5 py-5 border-b border-[var(--color-line)]">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-forest)] to-[var(--color-forest-mid)] flex items-center justify-center shadow-[0_2px_8px_rgba(26,92,58,0.25)] group-hover:scale-105 transition-transform">
                <Leaf size={17} className="text-white" strokeWidth={2.2} />
              </div>
              <div>
                <div className="font-display text-[16px] font-semibold tracking-tight leading-none">PolicyCraft</div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)] mt-1">Sustainability Suite</div>
              </div>
            </Link>
          </div>

          {/* Policy type badge */}
          <div className="px-4 pt-4">
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
          <div className="px-4 pt-4">
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
          <div className="border-t border-[var(--color-line)] p-3 space-y-2">
            <button
              onClick={loadSample}
              className="w-full inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] hover:bg-[var(--color-cream-2)] text-[12.5px] font-medium transition-colors"
            >
              <Sparkles size={13} className="text-[var(--color-forest)]" /> Load sample policy
            </button>
            <button
              onClick={() => {
                if (confirm("Reset all fields and start over?")) reset();
              }}
              className="w-full inline-flex items-center justify-center gap-2 h-9 px-3 rounded-lg text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] text-[12px] font-medium transition-colors"
            >
              <RotateCcw size={12} /> Reset all fields
            </button>
          </div>
        </aside>
      )}

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="px-7 py-4 border-b border-[var(--color-line)] bg-[var(--color-paper)]/85 backdrop-blur-md flex items-center justify-between gap-4">
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
          <div className="flex items-center gap-2 flex-shrink-0">{topActions}</div>
        </header>

        <div ref={contentRef} className="flex-1 overflow-y-auto scrollbar-thin">{children}</div>
      </main>
    </div>
  );
}
