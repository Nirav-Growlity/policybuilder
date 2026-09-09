"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Eye, Search, X } from "lucide-react";
import { DOCUMENT_THEMES } from "@/lib/document-themes";
import { POLICY_PROFILES } from "@/lib/constants";
import { templatePreviewPolicy, PREVIEW_POLICY_TYPES } from "@/lib/sample-policies";
import { PdfPolicyPreview as PolicyPreview } from "@/components/policy/pdf-policy-preview";
import { ThemeContactSheet } from "@/components/builder/document-theme-picker";
import type { PolicyType } from "@/lib/types";

type UniversalMeta = (typeof DOCUMENT_THEMES)[number];

const FAMILIES = ["all", ...Array.from(new Set(DOCUMENT_THEMES.map((t) => t.universalFamily)))];
const INTENTS = ["all", ...Array.from(new Set(DOCUMENT_THEMES.map((t) => t.intent)))];
const DENSITIES = ["all", "compact", "balanced", "spacious"];
const IMAGE_OPTIONS = [
  { value: "all", label: "All image support" },
  { value: "none", label: "Image-free" },
  { value: "cover", label: "Cover image" },
  { value: "section", label: "Section image" },
];

export function UniversalTemplateCatalog({ templates }: { templates: UniversalMeta[] }) {
  const [query, setQuery] = React.useState("");
  const [family, setFamily] = React.useState("all");
  const [intent, setIntent] = React.useState("all");
  const [density, setDensity] = React.useState("all");
  const [imageSupport, setImageSupport] = React.useState("all");
  const [previewId, setPreviewId] = React.useState<string | null>(null);
  const [previewPolicyType, setPreviewPolicyType] = React.useState<PolicyType>("environmental");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const filtered = templates.filter((t) => {
    if (family !== "all" && t.universalFamily !== family && t.family !== family) return false;
    if (intent !== "all" && t.intent !== intent) return false;
    if (density !== "all" && t.defaults.density !== density) return false;
    if (imageSupport !== "all") {
      if (imageSupport === "none" && t.imageSupport.length !== 0) return false;
      if (imageSupport !== "none" && !t.imageSupport.includes(imageSupport as "cover" | "section")) return false;
    }
    if (!normalizedQuery) return true;
    return [t.name, t.description, t.family, t.universalFamily, t.intent, t.layout.bestFor, ...t.layout.descriptors, ...t.tags].join(" ").toLocaleLowerCase().includes(normalizedQuery);
  });

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setPreviewId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const previewTemplate = previewId ? templates.find((t) => t.id === previewId) ?? null : null;

  return (
    <section className="border-t border-[var(--color-line)]">
      <div className="sticky top-0 z-20 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-cream)_92%,transparent)] backdrop-blur-xl">
        <div className="mx-auto grid max-w-7xl gap-3 px-5 py-4 sm:px-8 md:grid-cols-[1fr_150px_150px_150px_170px] lg:px-14">
          <label className="flex h-11 items-center gap-2 border-b border-[var(--color-line-2)] bg-white/45 px-1 focus-within:border-[var(--color-forest)]"><Search size={15} className="text-[var(--color-muted)]" /><span className="sr-only">Search visual templates</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by intent, family, or use" className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /></label>
          <FilterSelect label="Family" value={family} onChange={setFamily} options={FAMILIES} />
          <FilterSelect label="Intent" value={intent} onChange={setIntent} options={INTENTS} />
          <FilterSelect label="Density" value={density} onChange={setDensity} options={DENSITIES} />
          <label className="text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-muted)]">Image support<select value={imageSupport} onChange={(event) => setImageSupport(event.target.value)} className="mt-1 block h-8 w-full border-0 border-b border-[var(--color-line-2)] bg-transparent text-[12px] font-semibold normal-case tracking-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-forest)]">{IMAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8 lg:px-14">
        <div className="mb-7 flex items-baseline justify-between border-b border-[var(--color-line)] pb-3"><h2 className="font-display text-[24px] font-semibold">Visual templates</h2><span className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-muted)]">{filtered.length} results</span></div>
        {filtered.length ? (
          <div className="grid gap-6 md:grid-cols-2">
            {filtered.map((template) => (
              <UniversalCard key={template.id} template={template} onPreview={() => { setPreviewId(template.id); setPreviewPolicyType("environmental"); }} />
            ))}
          </div>
        ) : (
          <div className="py-24 text-center"><div className="font-display text-[25px] font-semibold">No matching templates</div><p className="mt-2 text-[13px] text-[var(--color-muted)]">Try a broader family, intent, density, or image filter.</p></div>
        )}
      </div>

      {previewTemplate && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[#122018]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="universal-preview-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewId(null); }}>
          <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto bg-[var(--color-paper)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-6 py-4">
              <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Full preview · {previewTemplate.universalFamily} · {previewTemplate.intent}</span>
              <button type="button" onClick={() => setPreviewId(null)} aria-label="Close preview" className="grid h-8 w-8 place-items-center text-[var(--color-muted)] hover:text-[var(--color-ink)]"><X size={17} /></button>
            </div>
            <div className="px-6 pt-5">
              <h2 id="universal-preview-title" className="font-display text-[30px] font-semibold">{previewTemplate.name}</h2>
              <p className="mt-1 text-[12px] text-[var(--color-muted)]">{previewTemplate.description}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[.14em] text-[var(--color-muted)]">Sample content:</span>
                {PREVIEW_POLICY_TYPES.map((type) => (
                  <button key={type} type="button" onClick={() => setPreviewPolicyType(type)} className={`rounded-full border px-3 py-1.5 text-[10.5px] font-semibold ${previewPolicyType === type ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-white" : "border-[var(--color-line-2)] text-[var(--color-ink-2)]"}`}>{POLICY_PROFILES[type].short}</button>
                ))}
              </div>
            </div>
            <div className="px-6 py-6">
              <PolicyPreview policy={templatePreviewPolicy(previewTemplate.id, previewPolicyType)} />
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] px-6 py-4">
              <Link href={`/preview/${previewTemplate.id}?policyType=${previewPolicyType}`} className="flex h-10 items-center border border-[var(--color-line-2)] bg-white px-4 text-[11.5px] font-semibold">Open full page</Link>
              <Link href={`/builder?visualTemplate=${previewTemplate.id}&type=${previewPolicyType}`} className="flex h-10 items-center gap-2 bg-[var(--color-forest)] px-4 text-[11.5px] font-semibold text-white">Use template <ArrowRight size={14} /></Link>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function UniversalCard({ template, onPreview }: { template: UniversalMeta; onPreview: () => void }) {
  const profile = POLICY_PROFILES.environmental;
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white/60">
      <div className="p-3">
        <ThemeContactSheet theme={template} companyName="Acme Specialty Chemicals" policyLabel={profile.label} policyType="environmental" />
      </div>
      <div className="px-4 pb-4">
        <div className="mb-1 flex flex-wrap items-center gap-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--color-forest)]"><span>{template.universalFamily}</span><span className="text-[var(--color-line-2)]">/</span><span>{template.intent}</span><span className="text-[var(--color-line-2)]">/</span><span>{template.defaults.density}</span></div>
        <h3 className="font-display text-[20px] font-semibold leading-tight">{template.name}</h3>
        <p className="mt-1 text-[12px] leading-6 text-[var(--color-ink-2)]">{template.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <button type="button" onClick={onPreview} className="inline-flex h-10 items-center gap-2 border border-[var(--color-line-2)] bg-white px-3 text-[11.5px] font-semibold hover:border-[var(--color-forest)]"><Eye size={14} /> Preview</button>
          <Link href={`/builder?visualTemplate=${template.id}`} className="inline-flex h-10 items-center gap-2 bg-[var(--color-forest)] px-3 text-[11.5px] font-semibold text-white hover:bg-[var(--color-forest-deep)]">Use <ArrowRight size={14} /></Link>
        </div>
      </div>
    </article>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="text-[9.5px] font-semibold uppercase tracking-[.12em] text-[var(--color-muted)]">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-8 w-full border-0 border-b border-[var(--color-line-2)] bg-transparent text-[12px] font-semibold normal-case tracking-normal text-[var(--color-ink)] outline-none focus:border-[var(--color-forest)]">{options.map((option) => <option key={option} value={option}>{option === "all" ? `All ${label.toLowerCase()}` : option}</option>)}</select></label>;
}
