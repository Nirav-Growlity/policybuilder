"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Eye, FileText, Search, X } from "lucide-react";
import { POLICY_PROFILES } from "@/lib/constants";
import { DOCUMENT_THEMES } from "@/lib/document-themes";
import type { StarterProfile, starterTemplateMeta } from "@/lib/starter-templates";
import type { PolicyType } from "@/lib/types";

type StarterMeta = ReturnType<typeof starterTemplateMeta>;
const PROFILE_OPTIONS: { id: StarterProfile; label: string }[] = [
  { id: "essential", label: "Essential" }, { id: "standard", label: "Standard" }, { id: "compliance", label: "Compliance" }, { id: "stakeholder", label: "Stakeholder" }, { id: "evidence-led", label: "Evidence-led" },
];

export function StarterTemplateCatalog({ templates }: { templates: StarterMeta[] }) {
  const [query, setQuery] = React.useState("");
  const [policyType, setPolicyType] = React.useState<PolicyType | "all">("all");
  const [profile, setProfile] = React.useState<StarterProfile | "all">("all");
  const [preview, setPreview] = React.useState<StarterMeta | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = templates.filter((template) => (policyType === "all" || template.policyType === policyType) && (profile === "all" || template.profile === profile) && (!normalizedQuery || [template.name, template.summary, template.intendedAudience].join(" ").toLocaleLowerCase().includes(normalizedQuery)));

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="border-t border-[var(--color-line)]">
      <div className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-cream)_92%,transparent)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl gap-3 px-5 py-4 sm:px-8 md:grid-cols-[1fr_210px_210px] lg:px-14">
          <label className="flex h-11 items-center gap-2 border-b border-[var(--color-line-2)] bg-white/45 px-1 focus-within:border-[var(--color-forest)]"><Search size={15} className="text-[var(--color-muted)]" /><span className="sr-only">Search starter templates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by purpose or audience" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label>
          <FilterSelect label="Policy type" value={policyType} onChange={(value) => setPolicyType(value as PolicyType | "all")} options={[{ value: "all", label: "All policy types" }, ...Object.values(POLICY_PROFILES).map((item) => ({ value: item.id, label: item.short }))]} />
          <FilterSelect label="Profile" value={profile} onChange={(value) => setProfile(value as StarterProfile | "all")} options={[{ value: "all", label: "All profiles" }, ...PROFILE_OPTIONS.map((item) => ({ value: item.id, label: item.label }))]} />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-14">
        <div className="mb-7 flex items-baseline justify-between border-b border-[var(--color-line)] pb-3"><h2 className="font-display text-[24px] font-semibold">Starter templates</h2><span className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-muted)]">{filtered.length} results</span></div>
        {filtered.length ? (
          <div className="divide-y divide-[var(--color-line)]">
            {filtered.map((template, index) => <StarterRow key={template.id} template={template} index={index + 1} onPreview={() => setPreview(template)} />)}
          </div>
        ) : (
          <div className="py-24 text-center"><div className="font-display text-[25px] font-semibold">No matching starters</div><p className="mt-2 text-[13px] text-[var(--color-muted)]">Try a broader policy type, profile, or search term.</p></div>
        )}
      </div>

      {preview && <StarterPreview template={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}

function StarterRow({ template, index, onPreview }: { template: StarterMeta; index: number; onPreview: () => void }) {
  return (
    <article className="group grid gap-5 py-7 transition-colors hover:bg-white/35 md:grid-cols-[42px_minmax(0,1fr)_210px] md:px-3">
      <div className="font-mono text-[11px] text-[var(--color-muted)]">{String(index).padStart(2, "0")}</div>
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--color-forest)]"><span>{POLICY_PROFILES[template.policyType].short}</span><span className="text-[var(--color-line-2)]">/</span><span>{template.profileLabel}</span><span className="text-[var(--color-line-2)]">/</span><span>{template.estimatedLength}</span></div>
        <h3 className="font-display text-[24px] font-semibold leading-tight">{template.name}</h3>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--color-ink-2)]">{template.summary}</p>
        <p className="mt-3 text-[11px] text-[var(--color-muted)]"><span className="font-semibold text-[var(--color-ink-2)]">For:</span> {template.intendedAudience}</p>
      </div>
      <div className="flex items-center gap-2 md:justify-end">
        <button type="button" onClick={onPreview} className="inline-flex h-10 items-center gap-2 border border-[var(--color-line-2)] bg-white px-3 text-[11.5px] font-semibold transition-colors hover:border-[var(--color-forest)]"><Eye size={14} /> Preview</button>
        <Link href={`/builder?template=${template.id}&type=${template.policyType}`} className="inline-flex h-10 items-center gap-2 bg-[var(--color-forest)] px-3 text-[11.5px] font-semibold text-white transition-colors hover:bg-[var(--color-forest-deep)]">Use <ArrowRight size={14} /></Link>
      </div>
    </article>
  );
}

function StarterPreview({ template, onClose }: { template: StarterMeta; onClose: () => void }) {
  const names = template.recommendedThemes.map((id) => DOCUMENT_THEMES.find((theme) => theme.id === id)?.name).filter(Boolean);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#122018]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="starter-preview-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-[var(--color-paper)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-4"><span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Starter preview</span><button type="button" onClick={onClose} aria-label="Close preview" className="grid h-8 w-8 place-items-center text-[var(--color-muted)] hover:text-[var(--color-ink)]"><X size={17} /></button></div>
        <div className="grid gap-8 p-7 md:grid-cols-[1fr_230px] md:p-10">
          <div><div className="mb-3 text-[10px] font-semibold uppercase tracking-[.15em] text-[var(--color-muted)]">{POLICY_PROFILES[template.policyType].short} · {template.profileLabel}</div><h2 id="starter-preview-title" className="font-display text-[38px] font-semibold leading-[1.02]">{template.name}</h2><p className="mt-5 text-[14px] leading-7 text-[var(--color-ink-2)]">{template.summary}</p><div className="mt-8 border-y border-[var(--color-line)] py-5"><div className="text-[11px] font-semibold">Designed for</div><p className="mt-1 text-[12px] leading-6 text-[var(--color-muted)]">{template.intendedAudience}</p></div><div className="mt-6 text-[11px] font-semibold">Recommended themes</div><div className="mt-2 flex flex-wrap gap-2">{names.map((name) => <span key={name} className="border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-muted)]">{name}</span>)}</div></div>
          <div className="flex flex-col bg-[var(--color-cream-2)] p-6"><FileText size={22} className="text-[var(--color-forest)]" /><div className="mt-7 text-[10px] font-semibold uppercase tracking-[.15em] text-[var(--color-muted)]">Estimated document</div><div className="mt-1 font-display text-[28px] font-semibold">{template.estimatedLength}</div><p className="mt-5 text-[11px] leading-5 text-[var(--color-muted)]">Generic organization fields are preserved until you add your own. No company-specific dates, results, targets, or citations are invented.</p><div className="mt-auto pt-10"><Link href={`/preview/${template.id}`} className="mb-2 flex h-10 items-center justify-center border border-[var(--color-line-2)] bg-white text-[11.5px] font-semibold">Open full preview</Link><Link href={`/builder?template=${template.id}&type=${template.policyType}`} className="flex h-10 items-center justify-center gap-2 bg-[var(--color-forest)] text-[11.5px] font-semibold text-white">Use starter <ArrowRight size={14} /></Link></div></div>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-muted)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-8 w-full border-0 border-b border-[var(--color-line-2)] bg-transparent text-[12px] font-semibold normal-case tracking-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-forest)]">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}
