"use client";

import * as React from "react";
import Link from "next/link";
import { CompanyInfoForm } from "@/components/builder/company-info-form";
import { ArrowRight, Sparkles, ShieldCheck, Leaf } from "lucide-react";
import { useBuilder } from "@/lib/store";
import { useToast } from "@/components/ui/toast";

export function CompanySetupScreen({ onContinue }: { onContinue: () => void }) {
  const { loadSample } = useBuilder();
  const { push } = useToast();

  return (
    <main className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)] pb-20">
      {/* Header */}
      <header className="px-7 lg:px-12 py-6 flex items-center justify-between border-b border-[var(--color-line)] bg-white/40 backdrop-blur-sm sticky top-0 z-20">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-forest)] text-white flex items-center justify-center font-bold">
            <Leaf size={16} />
          </div>
          <span className="font-display text-[18px] font-semibold tracking-tight">PolicyCraft</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-mono uppercase tracking-[0.14em] text-[var(--color-muted)] bg-[var(--color-paper)] px-3 py-1 rounded-full border border-[var(--color-line)]">
            Step 1 of 2: Company Setup
          </span>
        </div>
      </header>

      {/* Main Section */}
      <section className="max-w-5xl mx-auto px-6 pt-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-forest)]">
              New document · Step 1 of 2
            </p>
            <h1 className="font-display text-[32px] md:text-[42px] leading-tight font-semibold tracking-tight mt-1 text-[var(--color-ink)]">
              Enter company information.
            </h1>
            <p className="text-[14.5px] text-[var(--color-ink-2)] mt-1.5 max-w-2xl">
              Provide legal entity details, industry sector, website, financial reporting period, company logo and site coverage before selecting your policy type.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              loadSample();
              push("Sample company information loaded", "success");
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[var(--color-line-2)] bg-white text-[12.5px] font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-cream)] hover:text-[var(--color-forest)] transition-colors cursor-pointer shrink-0 shadow-sm"
          >
            <Sparkles size={14} className="text-[var(--color-forest)]" /> Load sample company
          </button>
        </div>

        {/* Company Info Form */}
        <CompanyInfoForm />

        {/* Bottom Navigation */}
        <div className="mt-8 p-5 bg-white border border-[var(--color-line)] rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-muted)]">
            <ShieldCheck size={16} className="text-[var(--color-forest)] shrink-0" />
            <span>You will select your specific policy type (Environmental, Labour & Human Rights, Living Wage) in the next step.</span>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-7 rounded-xl bg-[var(--color-forest)] text-white text-[14px] font-semibold hover:bg-[var(--color-forest-deep)] transition-colors shadow-[0_4px_14px_rgba(26,92,58,0.2)] cursor-pointer shrink-0"
          >
            Continue to Select Policy <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}
