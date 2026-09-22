"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { InfoBar } from "@/components/ui/panel";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import { CoverEditor } from "@/components/builder/cover-editor";
import { Check, AlertTriangle } from "lucide-react";
import type { CoverComposition } from "@/lib/types";
import { visibleQualitativeEntries, visibleQuantitativeAreas } from "@/lib/focus-area-catalog";

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
  const qualEntries = visibleQualitativeEntries(policy).filter(([, v]) => v && v.length);
  const quantEntries = visibleQuantitativeAreas(policy).filter((q) => q.targets && q.targets.some((t) => t.target));

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
        <div key={`${policy.documentTheme || "governance-manual"}-${policy.activeCoverVariant || "manual"}`} className="min-h-0 flex-1 pr-1"><PdfPolicyPreview policy={policy} /></div>
      </div>}
    </div>
  );
}
