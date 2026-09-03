import Link from "next/link";
import { ArrowRight, Leaf } from "lucide-react";
import { STARTER_TEMPLATES, starterTemplateMeta } from "@/lib/starter-templates";
import { StarterTemplateCatalog } from "@/components/templates/starter-template-catalog";

export default function TemplatesPage() {
  return (
    <main className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-14">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--color-forest)] text-white transition-transform group-hover:-translate-y-0.5"><Leaf size={18} strokeWidth={2.2} /></div>
          <div><div className="font-display text-[17px] font-semibold leading-none tracking-tight">PolicyCraft</div><div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--color-muted)]">Starter library</div></div>
        </Link>
        <Link href="/builder" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--color-ink)] px-4 text-[13px] font-medium text-[var(--color-cream)] transition-colors hover:bg-[var(--color-forest-deep)]">Open builder <ArrowRight size={14} /></Link>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-10 pt-12 sm:px-8 lg:px-14 lg:pt-16">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.19em] text-[var(--color-forest)]">25 curated content starters</div>
        <div className="grid items-end gap-7 lg:grid-cols-[minmax(0,1fr)_360px]">
          <h1 className="max-w-4xl font-display text-[44px] font-semibold leading-[0.98] tracking-[-0.03em] sm:text-[58px] lg:text-[68px]">Start with the right level of policy.</h1>
          <p className="border-l border-[var(--color-line-2)] pl-5 text-[14px] leading-7 text-[var(--color-ink-2)]">Choose generic content and structure here. Choose the document’s visual presentation separately in Themes.</p>
        </div>
      </section>

      <StarterTemplateCatalog templates={STARTER_TEMPLATES.map(starterTemplateMeta)} />
    </main>
  );
}
