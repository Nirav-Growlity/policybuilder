"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, ArrowRight, BadgeIndianRupee, Leaf, ShieldCheck, Users } from "lucide-react";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyType } from "@/lib/types";

const ICONS = { Leaf, Users, BadgeIndianRupee, ShieldCheck };

export function PolicySelector({ onSelect, onBack }: { onSelect: (type: PolicyType) => void; onBack?: () => void }) {
  return (
    <main className="pc-builder-authoring min-h-screen bg-[var(--pc-page)] text-[var(--pc-text)]">
      <header className="sticky top-0 z-10 px-5 lg:px-8 py-4 flex items-center justify-between gap-4 border-b border-[var(--pc-divider)] bg-[var(--pc-panel)]">
        <Link href="/" className="font-display text-[18px] font-semibold tracking-tight">PolicyCraft</Link>
        <div className="flex items-center gap-4">
          {onBack && (
          <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-medium text-[var(--color-ink-2)] hover:text-[var(--color-forest)] transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} /> Back to Company Info
            </button>
          )}
          <span className="hidden sm:block text-[12px] font-medium text-[var(--color-muted)]">Sustainability Suite</span>
        </div>
      </header>
      <section className="flex items-start px-5 lg:px-8 py-8 lg:py-10">
        <div className="max-w-6xl w-full mx-auto">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Step 2 of 2 · Select Policy</p>
            <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1.08] tracking-tight font-semibold mt-3">Choose the policy you need to build.</h1>
            <p className="mt-3 max-w-xl text-[14px] leading-[1.6] text-[var(--color-ink-2)]">Start with a guided structure calibrated to the policy’s subject matter, then tailor every commitment, target and approval detail.</p>
          </div>
          <div className="mt-8 border-y border-[var(--color-line)] divide-y lg:divide-y-0 lg:divide-x lg:grid lg:grid-cols-5">
            {Object.values(POLICY_PROFILES).map((profile, index) => {
              const Icon = ICONS[profile.icon];
              const desc =
                profile.id === "environmental"
                  ? "Environmental stewardship, targets and compliance."
                  : profile.id === "living-wage"
                  ? "Fair compensation, wage benchmarks and worker wellbeing."
                  : profile.id === "labour-human-rights"
                  ? "Dignity, safe work and responsible labour practices."
                  : profile.id === "ethics"
                  ? "Integrity, transparency and anti-corruption practices."
                  : "Responsible sourcing, supplier standards and supply chain integrity.";
              return (
                <button key={profile.id} type="button" onClick={() => onSelect(profile.id)} className="group text-left px-3 py-5 lg:px-4 lg:py-4 min-h-[184px] flex flex-col items-start justify-center transition-colors hover:bg-[var(--pc-inset)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2" style={{ "--tw-ring-color": "var(--pc-brand)" } as CSSProperties}>
                  <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: profile.accentSoft, color: profile.accent }}><Icon size={18} /></span>
                    <span className="font-mono text-[10px] text-[var(--color-muted)]">0{index + 1}</span>
                  </div>
                  <h2 className="font-display text-[17px] leading-tight mt-4 font-semibold tracking-tight">{profile.short}</h2>
                  <p className="text-[14px] leading-[1.45] text-[var(--color-ink-2)] mt-2">{desc}</p>
                  <span className="inline-flex items-center gap-2 mt-3 text-[13px] font-semibold text-[var(--pc-primary)]">Start policy <ArrowRight size={14} /></span>
                </button>
              );
            })}
          </div>
          <p className="mt-5 flex items-center gap-2 text-[13px] text-[var(--color-muted)]"><ShieldCheck size={15} /> You can import an existing policy after choosing the policy type.</p>
        </div>
      </section>
    </main>
  );
}
