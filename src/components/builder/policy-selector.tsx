"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, FileUp, Leaf } from "lucide-react";
import { POLICY_PROFILES } from "@/lib/constants";
import type { PolicyType } from "@/lib/types";
import { POLICY_ICONS } from "./policy-icons";

const DESCRIPTIONS: Record<PolicyType, string> = {
  environmental: "Environmental stewardship, emissions and resource targets, and regulatory compliance.",
  "labour-human-rights": "Dignity, safe work, fair conditions and responsible labour practices.",
  "living-wage": "Fair compensation, wage benchmarks and worker wellbeing.",
  ethics: "Integrity, transparency, anti-corruption and speak-up practices.",
  "sustainable-procurement": "Responsible sourcing, supplier standards and supply chain integrity.",
};

const VISIBLE_STANDARDS = 3;

export function PolicySelector({ onSelect, onBack }: { onSelect: (type: PolicyType) => void; onBack?: () => void }) {
  return (
    <main className="pc-builder-authoring min-h-screen bg-[var(--pc-page)] text-[var(--pc-text)]">
      <header className="sticky top-0 z-10 px-5 lg:px-8 py-3 flex items-center justify-between gap-4 border-b border-[var(--pc-divider)] bg-[var(--pc-panel)]">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-[var(--color-forest)] text-[var(--pc-primary-text)] flex items-center justify-center">
            <Leaf size={16} aria-hidden="true" />
          </span>
          <span className="font-display text-[18px] font-semibold tracking-tight">PolicyCraft</span>
        </Link>
        <span className="hidden sm:block text-[13px] font-medium text-[var(--color-muted)]">Step 2 of 2: Select Policy</span>
      </header>
      <section className="px-5 lg:px-8 pt-8 pb-12 lg:pt-12">
        <div className="max-w-6xl w-full mx-auto">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="-ml-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--pc-text)] transition-colors cursor-pointer"
            >
              <ArrowLeft size={14} aria-hidden="true" /> Back to company info
            </button>
          )}
          <div className="max-w-2xl mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-forest)]">New document · Step 2 of 2</p>
            <h1 className="font-display text-[clamp(2rem,4vw,3rem)] leading-[1.08] tracking-tight font-semibold mt-3">Choose the policy you need to build.</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-[1.6] text-[var(--color-ink-2)]">Start with a guided structure calibrated to the policy’s subject matter, then tailor every commitment, target and approval detail.</p>
          </div>
          <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {Object.values(POLICY_PROFILES).map((profile, index) => {
              const Icon = POLICY_ICONS[profile.icon];
              const standards = profile.standards.filter((standard) => standard !== "SDGs");
              const hiddenStandards = standards.length - VISIBLE_STANDARDS;
              return (
                <li key={profile.id} className="flex sm:last:col-span-2 xl:last:col-span-1">
                  <button
                    type="button"
                    onClick={() => onSelect(profile.id)}
                    className="group flex w-full flex-col items-start rounded-xl border border-[var(--pc-divider)] bg-[var(--pc-panel)] p-5 text-left transition-[border-color,background-color,transform] duration-200 cursor-pointer hover:-translate-y-0.5 hover:border-[var(--pc-control)] hover:bg-[var(--pc-inset)] motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                  >
                    <span className="flex w-full items-center justify-between">
                      <span className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: profile.accentSoft, color: profile.accent }}>
                        <Icon size={19} aria-hidden="true" />
                      </span>
                      <span aria-hidden="true" className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{String(index + 1).padStart(2, "0")}</span>
                    </span>
                    <span className="block text-[17px] leading-snug mt-5 font-semibold tracking-tight">{profile.short}</span>
                    <span className="block text-[13.5px] leading-[1.5] text-[var(--color-ink-2)] mt-2">{DESCRIPTIONS[profile.id]}</span>
                    <span className="mt-4 flex flex-wrap gap-1.5" aria-label={`Aligned with ${standards.join(", ")}`}>
                      {standards.slice(0, VISIBLE_STANDARDS).map((standard) => (
                        <span key={standard} aria-hidden="true" className="rounded-md border border-[var(--pc-divider)] px-1.5 py-0.5 text-[11px] font-medium leading-4 text-[var(--color-muted)]">{standard}</span>
                      ))}
                      {hiddenStandards > 0 && (
                        <span aria-hidden="true" className="px-0.5 py-0.5 text-[11px] font-medium leading-4 text-[var(--color-muted)]">+{hiddenStandards}</span>
                      )}
                    </span>
                    <span className="mt-auto w-full pt-5">
                      <span className="flex items-center justify-between border-t border-[var(--pc-divider)] pt-4">
                        <span className="text-[12px] text-[var(--color-muted)]">{profile.focusAreas.length} focus areas</span>
                        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--pc-primary)]">
                          Start
                          <ArrowRight size={14} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 flex items-center gap-2 text-[13px] text-[var(--color-muted)]">
            <FileUp size={15} aria-hidden="true" className="shrink-0" /> Already have a policy? You can import it after choosing the policy type.
          </p>
        </div>
      </section>
    </main>
  );
}
