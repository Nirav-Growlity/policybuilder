"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { InfoBar } from "@/components/ui/panel";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import { CoverEditor } from "@/components/builder/cover-editor";
import { AICoverWorkflow } from "@/components/builder/ai-cover-workflow";
import { Check, AlertTriangle } from "lucide-react";
import type { CoverComposition } from "@/lib/types";

export function StepExport({ onCoverEditingChange }: { onCoverEditingChange?: (editing: boolean) => void }) {
  const { policy, updatePolicy, coverEditorRequest, clearCoverEditorRequest } = useBuilder();
  const [editingCover, setEditingCover] = React.useState<"manual" | "ai" | null>(null);
  const saveCoverDraft = React.useCallback((variant: "manual" | "ai", composition: CoverComposition) => {
    updatePolicy(() => variant === "ai"
      ? ({ aiCoverComposition: composition, activeCoverVariant: "ai" })
      : ({ coverComposition: composition }));
  }, [updatePolicy]);

  React.useEffect(() => {
    if (!coverEditorRequest) return;
    const frame = window.requestAnimationFrame(() => {
      if (coverEditorRequest.variant === "ai" && coverEditorRequest.composition) {
        updatePolicy(() => ({ aiCoverComposition: coverEditorRequest.composition, activeCoverVariant: "ai" }));
      }
      setEditingCover(coverEditorRequest.variant);
      onCoverEditingChange?.(true);
      clearCoverEditorRequest();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [clearCoverEditorRequest, coverEditorRequest, onCoverEditingChange, updatePolicy]);

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

  return (
    <div className="space-y-6">
      <InfoBar variant={completeness >= 7 ? "info" : "warn"} icon={completeness >= 7 ? <Check size={16} /> : <AlertTriangle size={16} />}>
        <div>
          <strong>Policy completeness:</strong> {completeness} / 9 sections filled.
          {completeness < 7 ? " Consider filling more sections for a comprehensive policy." : " Your policy is ready to export. Open the cover editor when you are ready to refine page one."}
        </div>
      </InfoBar>

      {editingCover ? <CoverEditor
        initialComposition={editingCover === "ai" ? policy.aiCoverComposition : policy.coverComposition}
        policy={{ ...policy, activeCoverVariant: "manual", aiCoverComposition: undefined }}
        onDraftChange={(composition) => saveCoverDraft(editingCover, composition)}
        onSave={(composition) => { saveCoverDraft(editingCover, composition); setEditingCover(null); onCoverEditingChange?.(false); }}
        onCancel={() => { setEditingCover(null); onCoverEditingChange?.(false); }}
      /> : <div className="space-y-4">
        <section aria-label="Cover chooser" className="rounded-xl border border-[var(--color-line)] bg-white p-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Active cover">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-muted)]">Cover</span>
            <button type="button" aria-pressed={policy.activeCoverVariant !== "ai"} onClick={() => updatePolicy(() => ({ activeCoverVariant: "manual" }))} className={`rounded-lg px-3 py-2 text-[12px] font-semibold ${policy.activeCoverVariant !== "ai" ? "bg-[var(--color-forest)] text-white" : "border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)]"}`}>Manual</button>
            <button type="button" disabled={!policy.aiCoverComposition} aria-pressed={policy.activeCoverVariant === "ai"} onClick={() => updatePolicy(() => ({ activeCoverVariant: "ai" }))} className={`rounded-lg px-3 py-2 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${policy.activeCoverVariant === "ai" ? "bg-[var(--color-forest)] text-white" : "border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)]"}`}>AI</button>
            <span className="ml-auto text-[12px] text-[var(--color-muted)]">{policy.activeCoverVariant === "ai" ? "AI cover active" : "Manual cover active"}</span>
            <button type="button" onClick={() => { const variant = policy.activeCoverVariant === "ai" ? "ai" : "manual"; setEditingCover(variant); onCoverEditingChange?.(true); }} className="rounded-lg border border-[var(--color-line-2)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--color-ink-2)]">Edit active cover</button>
          </div>
          <div className="mt-3"><AICoverWorkflow policy={policy} onApply={(composition) => updatePolicy(() => ({ aiCoverComposition: composition, activeCoverVariant: "ai" }))} onEdit={(composition) => { updatePolicy(() => ({ aiCoverComposition: composition, activeCoverVariant: "ai" })); setEditingCover("ai"); onCoverEditingChange?.(true); }} /></div>
        </section>
        <div key={`${policy.documentTheme || "governance-manual"}-${policy.activeCoverVariant || "manual"}`} className="min-h-0 flex-1 pr-1"><PdfPolicyPreview policy={policy} shareDownload /></div>
      </div>}
    </div>
  );
}
