"use client";

import Link from "next/link";
import { CompanyInfoForm } from "@/components/builder/company-info-form";
import { ArrowRight, ShieldCheck, Leaf } from "lucide-react";

export function CompanySetupScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <main className="pc-builder-authoring min-h-screen bg-[var(--pc-page)] text-[var(--pc-text)] pb-12">
      {/* Header */}
      <header className="px-5 lg:px-8 py-4 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--pc-panel)] sticky top-0 z-20">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-forest)] text-[var(--pc-primary-text)] flex items-center justify-center font-bold">
            <Leaf size={16} />
          </div>
          <span className="font-display text-[18px] font-semibold tracking-tight">PolicyCraft</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-[var(--color-muted)]">
            Step 1 of 2: Company Setup
          </span>
        </div>
      </header>

      {/* Main Section */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-8">
        <div className="mb-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-forest)]">
              New document · Step 1 of 2
            </p>
            <h1 className="font-display text-[30px] md:text-[36px] leading-tight font-semibold tracking-tight mt-1 text-[var(--color-ink)]">
              Enter company information.
            </h1>
            <p className="text-[14.5px] text-[var(--color-ink-2)] mt-1.5 max-w-2xl">
              Provide legal entity details, Sector, Subsector, Industry, website, reporting period, logo and site coverage before selecting a policy type.
            </p>
          </div>

        </div>

        {/* Company Info Form */}
        <CompanyInfoForm />

        {/* Bottom Navigation */}
        <div className="mt-6 p-4 bg-[var(--pc-panel)] border border-[var(--color-line)] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[14px] text-[var(--color-muted)]">
            <ShieldCheck size={16} className="text-[var(--color-forest)] shrink-0" />
            <span>You will select your specific policy type (Environmental, Labour & Human Rights, Living Wage) in the next step.</span>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-lg bg-[var(--color-forest)] text-[var(--pc-primary-text)] text-[14px] font-semibold hover:bg-[var(--color-forest-deep)] transition-colors cursor-pointer shrink-0"
          >
            Continue to Select Policy <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </main>
  );
}
