"use client";

import * as React from "react";
import { policyPreviewKey, usePdfPreviewState } from "@/lib/pdf-preview-state";
import { getPolicyProfile } from "@/lib/constants";
import { useBuilder } from "@/lib/store";
import { Panel, Badge } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { getSection } from "@/lib/sections";
import { Download, FileText, Sparkles, FileType, BookOpen } from "lucide-react";

export function usePolicyDownload() {
  const { policy } = useBuilder();
  const { push } = useToast();
  const preview = usePdfPreviewState();
  const pdfReady = preview.key === policyPreviewKey(policy) && !!preview.blob;
  const [exporting, setExporting] = React.useState<"pdf" | "docx" | null>(null);

  const download = async (kind: "pdf" | "docx") => {
    setExporting(kind);
    try {
      const fileBase = (policy.company.name || "Policy").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      const url = kind === "pdf" ? "/api/export/pdf" : "/api/export/docx";
      if (kind === "pdf" && !pdfReady) throw new Error("Wait for the current preview.");
      const res = kind === "pdf" ? null : await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      if (res && !res.ok) throw new Error("Export failed");
      const blob = kind === "pdf" ? preview.blob! : await res!.blob();
      if (blob.size === 0) throw new Error("Export returned an empty file");
      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = `${getPolicyProfile(policy.policyType).exportName}_${fileBase}.${kind}`;
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

  return { exporting, download, pdfReady };
}

export function DockOptionsPanel() {
  const { policy, updatePolicy } = useBuilder();
  return (
    <Panel title="Document options" description="Choose which supporting pages appear." icon={<FileText size={17} strokeWidth={1.8} />}>
      <label className="flex items-center justify-between text-[12px]"><span>Show table of contents</span><input type="checkbox" checked={policy.showTableOfContents !== false} onChange={(event) => updatePolicy(() => ({ showTableOfContents: event.target.checked }))} /></label>
      <label className="mt-3 flex items-center justify-between text-[12px]"><span>Include acknowledgement</span><input type="checkbox" checked={policy.showAcknowledgement !== false} onChange={(event) => updatePolicy(() => ({ showAcknowledgement: event.target.checked }))} /></label>
      <label className="mt-3 flex items-center justify-between text-[12px]"><span>Include revision history</span><input type="checkbox" checked={getSection(policy, "revision")?.enabled !== false} onChange={(event) => { const enabled = event.target.checked; updatePolicy((current) => ({ showRevisionHistory: enabled, sections: (current.sections || []).map((section) => section.kind === "revision" ? { ...section, enabled } : section) })); }} /></label>
    </Panel>
  );
}

export function DockExportPanel() {
  const { exporting, download } = usePolicyDownload();
  return (
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
  );
}

export function DockSummaryPanel() {
  const { policy } = useBuilder();
  const co = policy.company;
  const areas = policy.focusAreas.filter(Boolean);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));
  return (
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
      {policy.standards.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold"><Sparkles size={12} /> Standards aligned</div>
          <div className="flex flex-wrap gap-1.5">
            {policy.standards.map((s) => (
              <Badge key={s} variant="forest">
                {s}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Panel>
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
