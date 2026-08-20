"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowLeft, ArrowRight, BadgeIndianRupee, Leaf, ShieldCheck, Users } from "lucide-react";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyType } from "@/lib/types";

const ICONS = { Leaf, Users, BadgeIndianRupee, ShieldCheck };

export function PolicySelector({ onSelect, onBack }: { onSelect: (type: PolicyType) => void; onBack?: () => void }) {
  return (
    <main className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)] overflow-hidden">
      <header className="absolute top-0 inset-x-0 z-10 px-7 lg:px-12 py-6 flex items-center justify-between">
        <Link href="/" className="font-display text-[18px] font-semibold tracking-tight">PolicyCraft</Link>
        <div className="flex items-center gap-4">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--color-ink-2)] hover:text-[var(--color-forest)] transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} /> Back to Company Info
            </button>
          )}
          <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-muted)]">Sustainability Suite</span>
        </div>
      </header>
      <section className="relative min-h-screen flex items-center px-7 lg:px-12 py-28">
        <div aria-hidden className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(55% 70% at 8% 20%, rgba(26,92,58,.13), transparent 70%), radial-gradient(45% 65% at 100% 80%, rgba(124,63,29,.11), transparent 70%)" }} />
        <div className="relative max-w-6xl w-full mx-auto">
          <div className="max-w-2xl animate-fade-up">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Step 2 of 2 · Select Policy</p>
            <h1 className="font-display text-[clamp(3rem,7vw,6.2rem)] leading-[.91] tracking-[-.045em] font-semibold mt-5">Choose the policy<br />you need to build.</h1>
            <p className="mt-6 max-w-xl text-[16px] leading-[1.7] text-[var(--color-ink-2)]">Start with a guided structure calibrated to the policy’s subject matter, then tailor every commitment, target and approval detail.</p>
          </div>
          <div className="mt-14 border-y border-[var(--color-line)] divide-y lg:divide-y-0 lg:divide-x lg:grid lg:grid-cols-5 animate-fade-up stagger-2">
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
                <button key={profile.id} type="button" onClick={() => onSelect(profile.id)} className="group text-left px-0 py-7 lg:px-5 lg:py-1 min-h-[210px] flex flex-col justify-center transition-colors hover:bg-white/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-4" style={{ "--tw-ring-color": profile.accent } as CSSProperties}>
                  <div className="flex items-center justify-between">
                    <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: profile.accentSoft, color: profile.accent }}><Icon size={18} /></span>
                    <span className="font-mono text-[10px] text-[var(--color-muted)]">0{index + 1}</span>
                  </div>
                  <h2 className="font-display text-[22px] leading-none mt-7 font-semibold tracking-tight">{profile.short}</h2>
                  <p className="text-[12.5px] leading-[1.55] text-[var(--color-ink-2)] mt-3">{desc}</p>
                  <span className="inline-flex items-center gap-2 mt-5 text-[12px] font-semibold opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" style={{ color: profile.accent }}>Start policy <ArrowRight size={14} /></span>
                </button>
              );
            })}
          </div>
          <p className="mt-7 flex items-center gap-2 text-[11px] text-[var(--color-muted)]"><ShieldCheck size={13} /> You can import an existing policy or choose a source template next.</p>
        </div>
      </section>
    </main>
  );
}
