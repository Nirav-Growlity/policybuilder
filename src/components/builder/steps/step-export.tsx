"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { PolicyPreview } from "@/components/policy/policy-preview";
import { Select } from "@/components/ui/input";
import { Download, FileText, Sparkles, Check, AlertTriangle, FileType, BookOpen, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { FONT_FAMILY_OPTIONS } from "@/lib/typography";
import { getSection } from "@/lib/sections";
import { getDocumentThemePatch, getPolicyDocumentTheme, getResolvedTypography, isDocumentThemeCustomized } from "@/lib/document-themes";

export function StepExport() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [exporting, setExporting] = React.useState<"pdf" | "docx" | null>(null);

  const co = policy.company;
  const areas = policy.focusAreas.filter(Boolean);
  const qualEntries = Object.entries(policy.qualitative).filter(([, v]) => v && v.length);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));
  const documentTheme = getPolicyDocumentTheme(policy);
  const typography = getResolvedTypography(policy);
  const themeCustomized = isDocumentThemeCustomized(policy);

  const completeness = [
    !!co.name,
    !!policy.declaration.preface,
    !!policy.declaration.declaration,
    !!policy.declaration.scope,
    areas.length > 0,
    qualEntries.length > 0,
    quantEntries.length > 0,
    policy.sdgs.length > 0,
    policy.responsibilities.length > 0,
  ].filter(Boolean).length;

  const fileBase = (co.name || "Policy").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");

  const download = async (kind: "pdf" | "docx") => {
    setExporting(kind);
    try {
      const url = kind === "pdf" ? "/api/export/pdf" : "/api/export/docx";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Environmental-Policy_${fileBase}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      push(`${kind.toUpperCase()} download started`, "success");
    } catch {
      push(`${kind.toUpperCase()} export failed`, "error");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <InfoBar variant={completeness >= 7 ? "info" : "warn"} icon={completeness >= 7 ? <Check size={16} /> : <AlertTriangle size={16} />}>
        <div>
          <strong>Policy completeness:</strong> {completeness} / 9 sections filled.
          {completeness < 7 ? " Consider filling more sections for a comprehensive policy." : " Your policy is ready to export."}
        </div>
      </InfoBar>

      <div className="grid lg:grid-cols-[1fr_320px] gap-6 items-start">
        <div className="flex rounded-2xl border border-[var(--color-line)] bg-[#f3eee3]/30 p-6 lg:p-10">
          <div key={policy.documentTheme || "evergreen-heritage"} className="min-h-0 flex-1 pr-1">
            <PolicyPreview policy={policy} />
          </div>
        </div>

        <div className="space-y-4 sticky top-6 self-start">
          <Panel title="Document design" description="The selected design is applied to preview, Word, and PDF." icon={<Sparkles size={17} strokeWidth={1.8} />}>
            <div className="rounded-xl border border-[var(--color-line)] p-3" style={{ background: documentTheme.colors.soft }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: documentTheme.colors.primaryDark }}>{documentTheme.name}{themeCustomized ? " · Customized" : ""}</div>
                  <div className="mt-1 text-[10.5px]" style={{ color: documentTheme.colors.muted }}>{documentTheme.description}</div>
                </div>
                <button
                  type="button"
                  disabled={!themeCustomized}
                  onClick={() => updatePolicy(() => getDocumentThemePatch(documentTheme.id))}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white/80 px-2 py-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw size={11} /> Reset
                </button>
              </div>
              <div className="mt-3 flex gap-1.5" aria-hidden="true">{[documentTheme.colors.primary, documentTheme.colors.soft, documentTheme.colors.paper, documentTheme.colors.accent].map((color) => <span key={color} className="h-2 flex-1 rounded-full border border-black/5" style={{ background: color }} />)}</div>
            </div>
            <p className="mt-3 text-[10.5px] text-[var(--color-muted)]">Change the design from Document Structure. Use the controls below for document-specific refinements.</p>
          </Panel>

          <details className="group overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] shadow-[var(--shadow-soft)]">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[12px] font-semibold text-[var(--color-ink)] marker:content-none">
              <SlidersHorizontal size={15} className="text-[var(--color-forest)]" />
              Advanced customization
              <span className="ml-auto text-[10px] font-normal text-[var(--color-muted)] group-open:hidden">Expand</span>
              <span className="ml-auto hidden text-[10px] font-normal text-[var(--color-muted)] group-open:inline">Collapse</span>
            </summary>
            <div className="space-y-6 border-t border-[var(--color-line)] px-5 py-5">
              <section>
                <div className="text-[11px] font-semibold text-[var(--color-ink)]">Data treatment</div>
                <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => updatePolicy(() => ({ visualStyle: "corporate" }))} className={`p-3 rounded-lg border text-left text-[12px] ${policy.visualStyle === "corporate" ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)] text-[var(--color-forest)]" : "border-[var(--color-line)]"}`}><b>Corporate</b><span className="block text-[10px] mt-1 opacity-75">Formal tables</span></button><button onClick={() => updatePolicy(() => ({ visualStyle: "modern" }))} className={`p-3 rounded-lg border text-left text-[12px] ${policy.visualStyle === "modern" ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)] text-[var(--color-forest)]" : "border-[var(--color-line)]"}`}><b>Modern</b><span className="block text-[10px] mt-1 opacity-75">Clean bullet points</span></button></div>
                <label className="mt-4 flex items-center justify-between text-[12px]"><span>Show table of contents</span><input type="checkbox" checked={policy.showTableOfContents !== false} onChange={(e) => updatePolicy(() => ({ showTableOfContents: e.target.checked }))}/></label><label className="mt-3 flex items-center justify-between text-[12px]"><span>Include acknowledgement</span><input type="checkbox" checked={policy.showAcknowledgement !== false} onChange={(e) => updatePolicy(() => ({ showAcknowledgement: e.target.checked }))}/></label><label className="mt-3 flex items-center justify-between text-[12px]"><span>Include revision history</span><input type="checkbox" checked={getSection(policy, "revision")?.enabled !== false} onChange={(e) => { const enabled = e.target.checked; updatePolicy((p) => ({ showRevisionHistory: enabled, sections: (p.sections || []).map((s) => s.kind === "revision" ? { ...s, enabled } : s) })); }}/></label>
                <div className="mt-4 text-[11px] text-[var(--color-muted)]">SDG appearance</div><div className="mt-2 flex gap-2"><button onClick={() => updatePolicy(() => ({ sdgDisplay: "tiles" }))} className={`text-[11px] px-2.5 py-1.5 rounded border ${policy.sdgDisplay === "tiles" ? "border-[var(--color-forest)] text-[var(--color-forest)]" : "border-[var(--color-line)]"}`}>Goal tiles</button><button onClick={() => updatePolicy(() => ({ sdgDisplay: "names" }))} className={`text-[11px] px-2.5 py-1.5 rounded border ${policy.sdgDisplay === "names" ? "border-[var(--color-forest)] text-[var(--color-forest)]" : "border-[var(--color-line)]"}`}>Names only</button></div>
                <div className="mt-4 text-[11px] text-[var(--color-muted)]">Company logo position</div><div className="mt-2 grid grid-cols-3 gap-1.5">{(["left", "center", "right"] as const).map((position) => <button key={position} onClick={() => updatePolicy(() => ({ logoPosition: position }))} className={`rounded border px-2 py-1.5 text-[11px] capitalize ${policy.logoPosition === position ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)] text-[var(--color-forest)]" : "border-[var(--color-line)] text-[var(--color-ink-2)]"}`}>{position}</button>)}</div>
              </section>
              <section className="border-t border-[var(--color-line)] pt-5">
                <div className="text-[11px] font-semibold text-[var(--color-ink)]">Typography</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-[11px]">
                  <label>Heading font<Select value={typography.headingFontFamily || typography.fontFamily} onChange={(e) => updatePolicy(() => ({ typography: { ...typography, headingFontFamily: e.target.value } }))} className="mt-1 h-8 text-[11px]">{FONT_FAMILY_OPTIONS.map((font) => <option key={font}>{font}</option>)}</Select></label>
                  <label>Body font<Select value={typography.fontFamily} onChange={(e) => updatePolicy(() => ({ typography: { ...typography, fontFamily: e.target.value } }))} className="mt-1 h-8 text-[11px]">{FONT_FAMILY_OPTIONS.map((font) => <option key={font}>{font}</option>)}</Select></label>
                  <label>Heading size<input type="number" min="10" max="24" step="1" value={typography.headingSize} onChange={(e) => updatePolicy(() => ({ typography: { ...typography, headingSize: Number(e.target.value) } }))} className="mt-1 h-8 w-full rounded border border-[var(--color-line-2)] px-2 text-[11px]"/></label>
                  <label>Subheading size<input type="number" min="9" max="20" step="0.5" value={typography.subheadingSize} onChange={(e) => updatePolicy(() => ({ typography: { ...typography, subheadingSize: Number(e.target.value) } }))} className="mt-1 h-8 w-full rounded border border-[var(--color-line-2)] px-2 text-[11px]"/></label>
                  <label>Paragraph size<input type="number" min="8" max="16" step="0.5" value={typography.paragraphSize} onChange={(e) => updatePolicy(() => ({ typography: { ...typography, paragraphSize: Number(e.target.value) } }))} className="mt-1 h-8 w-full rounded border border-[var(--color-line-2)] px-2 text-[11px]"/></label>
                  <label>Line spacing<Select value={String(typography.lineSpacing)} onChange={(e) => updatePolicy(() => ({ typography: { ...typography, lineSpacing: Number(e.target.value) } }))} className="mt-1 h-8 text-[11px]"><option value="1.15">1.15</option><option value="1.25">1.25</option><option value="1.35">1.35</option><option value="1.4">1.4</option><option value="1.5">1.5</option><option value="1.75">1.75</option><option value="2">2.0</option></Select></label>
                </div>
              </section>
            </div>
          </details>
          <Panel
            title="Export"
            description="Generate a print-ready PDF or an editable Word document."
            icon={<Download size={17} strokeWidth={1.8} />}
          >
            <div className="space-y-3">
              <button
                onClick={() => download("pdf")}
                disabled={exporting !== null}
                className="w-full group flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-line-2)] bg-[var(--color-paper)] hover:border-[var(--color-forest)] hover:bg-[var(--color-forest-soft)]/40 transition-all duration-200 text-left disabled:opacity-50"
              >
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-[#c43a3a] to-[#9b2929] text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <FileType size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[14.5px] font-semibold text-[var(--color-ink)]">PDF</div>
                  <div className="text-[11.5px] text-[var(--color-muted)] mt-0.5">Print-ready · A4</div>
                </div>
                {exporting === "pdf" ? (
                  <div className="w-4 h-4 border-2 border-[var(--color-forest)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download size={15} className="text-[var(--color-muted)] group-hover:text-[var(--color-forest)]" />
                )}
              </button>

              <button
                onClick={() => download("docx")}
                disabled={exporting !== null}
                className="w-full group flex items-center gap-3.5 p-4 rounded-xl border border-[var(--color-line-2)] bg-[var(--color-paper)] hover:border-[var(--color-forest)] hover:bg-[var(--color-forest-soft)]/40 transition-all duration-200 text-left disabled:opacity-50"
              >
                <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-[#1a4e8a] to-[#0f3a6e] text-white flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                  <BookOpen size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[14.5px] font-semibold text-[var(--color-ink)]">Word</div>
                  <div className="text-[11.5px] text-[var(--color-muted)] mt-0.5">Editable .docx</div>
                </div>
                {exporting === "docx" ? (
                  <div className="w-4 h-4 border-2 border-[var(--color-forest)] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Download size={15} className="text-[var(--color-muted)] group-hover:text-[var(--color-forest)]" />
                )}
              </button>
            </div>
          </Panel>

          <Panel
            title="Document summary"
            description="At a glance"
            icon={<FileText size={17} strokeWidth={1.8} />}
          >
            <dl className="space-y-2.5 text-[12.5px]">
              <Row label="Company" value={co.name || "—"} />
              <Row label="Document No." value={co.docNum || "—"} mono />
              <Row label="Revision" value={co.revNum || "01"} mono />
              <Row label="Effective" value={co.effectiveDate || "—"} mono />
              <Row label="Next review" value={co.reviewDate || "—"} mono />
              <Row label="Focus areas" value={String(areas.length)} mono />
              <Row label="Quantitative targets" value={String(quantEntries.flatMap((q) => q.targets).filter((t) => t.target).length)} mono />
              <Row label="SDGs selected" value={String(policy.sdgs.length)} mono />
              <Row label="Responsibilities" value={String(policy.responsibilities.length)} mono />
            </dl>
          </Panel>

          {policy.standards.length > 0 && (
            <Panel title="Standards aligned" icon={<Sparkles size={17} strokeWidth={1.8} />}>
              <div className="flex flex-wrap gap-1.5">
                {policy.standards.map((s) => (
                  <Badge key={s} variant="forest">
                    {s}
                  </Badge>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--color-muted)]">{label}</dt>
      <dd className={`text-[var(--color-ink-2)] font-medium truncate ${mono ? "font-mono text-[12px]" : ""}`}>{value}</dd>
    </div>
  );
}
