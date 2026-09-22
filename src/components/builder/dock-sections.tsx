"use client";

import * as React from "react";
import { getPolicyProfile } from "@/lib/constants";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { getSection } from "@/lib/sections";
import { Download, FileText, FileType, BookOpen, Palette } from "lucide-react";
import { preparePolicyForDocxExport } from "@/lib/docx/export-assets";
import { AICoverWorkflow } from "@/components/builder/ai-cover-workflow";
import { ListStyleToggle } from "@/components/builder/list-style-toggle";
import { resolvePolicyListFormatting } from "@/lib/list-formatting";

export function usePolicyDownload() {
  const { policy } = useBuilder();
  const { push } = useToast();
  const [exporting, setExporting] = React.useState<"pdf" | "docx" | null>(null);

  const download = async (kind: "pdf" | "docx") => {
    setExporting(kind);
    try {
      const fileBase = (policy.company.name || "Policy").replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
      const url = kind === "pdf" ? "/api/export/pdf" : "/api/export/docx";
      const exportPolicy = kind === "docx" ? await preparePolicyForDocxExport(policy) : policy;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: exportPolicy }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
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

  return { exporting, download };
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

export function DockDocumentDesignPanel() {
  const { policy, updatePolicy, setStep, requestCoverEdit } = useBuilder();
  const listFormatting = resolvePolicyListFormatting(policy);
  const activeCover = policy.activeCoverVariant === "ai" ? "ai" : "manual";

  return (
    <>
      <Panel title="Cover" description="Choose and refine the first page." icon={<Palette size={17} strokeWidth={1.8} />}>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Active cover">
          <button type="button" aria-pressed={activeCover === "manual"} onClick={() => updatePolicy(() => ({ activeCoverVariant: "manual" }))} className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${activeCover === "manual" ? "bg-[var(--color-forest)] text-white" : "border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)]"}`}>Manual</button>
          <button type="button" disabled={!policy.aiCoverComposition} aria-pressed={activeCover === "ai"} onClick={() => updatePolicy(() => ({ activeCoverVariant: "ai" }))} className={`rounded-lg px-3 py-2 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${activeCover === "ai" ? "bg-[var(--color-forest)] text-white" : "border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)]"}`}>AI</button>
          <span className="text-[11px] text-[var(--color-muted)]">{activeCover === "ai" ? "AI active" : "Manual active"}</span>
          <button type="button" onClick={() => { requestCoverEdit(activeCover, activeCover === "ai" ? policy.aiCoverComposition : undefined); setStep("export"); }} className="w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--color-ink-2)]">Edit active cover</button>
        </div>
        <div className="mt-3">
          <AICoverWorkflow
            policy={policy}
            onApply={(composition) => updatePolicy(() => ({ aiCoverComposition: composition, activeCoverVariant: "ai" }))}
          />
        </div>
      </Panel>

      <Panel title="List markers" description="Choose how lists appear in the preview and exports." icon={<FileText size={17} strokeWidth={1.8} />}>
        <div className="space-y-2.5">
          <ListStyleToggle label="Sections" value={listFormatting.outline} onChange={(value) => updatePolicy((p) => ({ listFormatting: { ...p.listFormatting, outline: value } }))} />
          <ListStyleToggle label="Focus areas" value={listFormatting.focusAreas} onChange={(value) => updatePolicy((p) => ({ listFormatting: { ...p.listFormatting, focusAreas: value } }))} />
          <ListStyleToggle label="Qual. areas" value={listFormatting.qualitativeGroups} onChange={(value) => updatePolicy((p) => ({ listFormatting: { ...p.listFormatting, qualitativeGroups: value } }))} />
          <ListStyleToggle label="Objectives" value={listFormatting.qualitativeItems} onChange={(value) => updatePolicy((p) => ({ listFormatting: { ...p.listFormatting, qualitativeItems: value } }))} />
          <ListStyleToggle label="Quant. areas" value={listFormatting.quantitativeGroups} onChange={(value) => updatePolicy((p) => ({ listFormatting: { ...p.listFormatting, quantitativeGroups: value } }))} />
          <ListStyleToggle label="Targets" value={listFormatting.quantitativeItems} onChange={(value) => updatePolicy((p) => ({ listFormatting: { ...p.listFormatting, quantitativeItems: value } }))} />
          <ListStyleToggle label="Responsibilities" value={listFormatting.responsibilities} onChange={(value) => updatePolicy((p) => ({ listFormatting: { ...p.listFormatting, responsibilities: value } }))} />
        </div>
      </Panel>
    </>
  );
}
