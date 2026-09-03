"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { PolicyPreview } from "@/components/policy/policy-preview";
import { ThemeInspector } from "@/components/builder/theme-inspector";
import { Download, FileText, Sparkles, Check, AlertTriangle, FileType, BookOpen } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { getSection } from "@/lib/sections";

export function StepExport() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [exporting, setExporting] = React.useState<"pdf" | "docx" | null>(null);

  const co = policy.company;
  const areas = policy.focusAreas.filter(Boolean);
  const qualEntries = Object.entries(policy.qualitative).filter(([, v]) => v && v.length);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));

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
      if (blob.size === 0) throw new Error("Export returned an empty file");
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `Environmental-Policy_${fileBase}.${kind}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
          <div key={policy.documentTheme || "governance-manual"} className="min-h-0 flex-1 pr-1">
            <PolicyPreview policy={policy} />
          </div>
        </div>

        <div className="space-y-4 sticky top-6 self-start">
          <ThemeInspector />
          <Panel title="Document options" description="Choose which supporting pages appear." icon={<FileText size={17} strokeWidth={1.8} />}>
            <label className="flex items-center justify-between text-[12px]"><span>Show table of contents</span><input type="checkbox" checked={policy.showTableOfContents !== false} onChange={(event) => updatePolicy(() => ({ showTableOfContents: event.target.checked }))} /></label>
            <label className="mt-3 flex items-center justify-between text-[12px]"><span>Include acknowledgement</span><input type="checkbox" checked={policy.showAcknowledgement !== false} onChange={(event) => updatePolicy(() => ({ showAcknowledgement: event.target.checked }))} /></label>
            <label className="mt-3 flex items-center justify-between text-[12px]"><span>Include revision history</span><input type="checkbox" checked={getSection(policy, "revision")?.enabled !== false} onChange={(event) => { const enabled = event.target.checked; updatePolicy((current) => ({ showRevisionHistory: enabled, sections: (current.sections || []).map((section) => section.kind === "revision" ? { ...section, enabled } : section) })); }} /></label>
          </Panel>
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
