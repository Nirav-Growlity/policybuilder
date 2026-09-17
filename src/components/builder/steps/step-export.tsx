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
  const { policy, updatePolicy } = useBuilder();
  const [editingCover, setEditingCover] = React.useState<"manual" | "ai" | null>(null);
  const saveCoverDraft = React.useCallback((variant: "manual" | "ai", composition: CoverComposition) => {
    updatePolicy(() => variant === "ai"
      ? ({ aiCoverComposition: composition, activeCoverVariant: "ai" })
      : ({ coverComposition: composition }));
  }, [updatePolicy]);

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
      /> : <div className="space-y-4 bg-[#f3f4f2] p-3 lg:p-5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Active cover">
          <span className="mr-1 text-[12px] font-semibold uppercase tracking-[.12em] text-[var(--color-muted)]">Active cover</span>
          <button type="button" aria-pressed={policy.activeCoverVariant !== "ai"} onClick={() => updatePolicy(() => ({ activeCoverVariant: "manual" }))} className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${policy.activeCoverVariant !== "ai" ? "bg-[var(--color-forest)] text-white" : "border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)]"}`}>Manual Cover</button>
          <button type="button" disabled={!policy.aiCoverComposition} aria-pressed={policy.activeCoverVariant === "ai"} onClick={() => updatePolicy(() => ({ activeCoverVariant: "ai" }))} className={`rounded-lg px-3 py-2 text-[13px] font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${policy.activeCoverVariant === "ai" ? "bg-[var(--color-forest)] text-white" : "border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)]"}`}>AI Cover</button>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-xl border border-[var(--color-line)] bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-muted)]">Manual Cover</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">Edit your existing page one</h2>
            <p className="mt-1 text-[13px] leading-5 text-[var(--color-muted)]">Your current cover remains independent from any AI artwork.</p>
            <button type="button" onClick={() => { setEditingCover("manual"); onCoverEditingChange?.(true); }} className="mt-4 inline-flex min-h-9 items-center rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-[13px] font-semibold text-[var(--color-ink-2)]">Open manual editor</button>
          </section>
          <AICoverWorkflow policy={policy} onApply={(composition) => updatePolicy(() => ({ aiCoverComposition: composition, activeCoverVariant: "ai" }))} onEdit={(composition) => { if (!policy.aiCoverComposition || composition !== policy.aiCoverComposition) updatePolicy(() => ({ aiCoverComposition: composition, activeCoverVariant: "ai" })); setEditingCover("ai"); onCoverEditingChange?.(true); }} />
        </div>
        <div key={`${policy.documentTheme || "governance-manual"}-${policy.activeCoverVariant || "manual"}`} className="min-h-0 flex-1 pr-1"><PdfPolicyPreview policy={policy} shareDownload /></div>
      </div>}
    </div>
  );
}
