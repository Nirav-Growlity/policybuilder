"use client";

import Link from "next/link";
import { ArrowLeft, Leaf } from "lucide-react";

export const WIZARD_STEPS = ["Company & manual", "Choose SOPs", "Look & cover"] as const;

/** The policy setup screens' sticky header: brand on the left, the step on the right. */
export function WizardHeader({ step, backHref, steps = WIZARD_STEPS }: { step: number; backHref: string; steps?: readonly string[] }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--pc-divider)] bg-[var(--pc-panel)] px-5 py-3 lg:px-8">
      <div className="flex min-w-0 items-center gap-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-forest)] text-[var(--pc-primary-text)]">
            <Leaf size={16} aria-hidden="true" />
          </span>
          <span className="font-display text-[18px] font-semibold tracking-tight">PolicyCraft</span>
        </Link>
        <span aria-hidden="true" className="hidden h-5 w-px bg-[var(--pc-divider)] sm:block" />
        <Link href={backHref} className="hidden items-center gap-1.5 text-[13px] font-medium text-[var(--color-muted)] hover:text-[var(--pc-text)] sm:inline-flex">
          <ArrowLeft size={13} aria-hidden="true" />Documents
        </Link>
      </div>
      <span className="text-[13px] font-medium text-[var(--color-muted)]">
        Step {step + 1} of {steps.length}<span className="hidden sm:inline">: {steps[step]}</span>
      </span>
    </header>
  );
}

/** Page heading shared by the three steps, in the policy setup screens' type scale. */
export function WizardHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-[clamp(1.9rem,3.6vw,2.6rem)] font-semibold leading-[1.1] tracking-tight text-[var(--color-ink)]">{title}</h1>
      <p className="mt-2 max-w-xl text-[14.5px] leading-[1.6] text-[var(--color-ink-2)]">{description}</p>
    </div>
  );
}
