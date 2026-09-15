"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { InfoBar } from "@/components/ui/panel";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import { CoverEditor } from "@/components/builder/cover-editor";
import { Check, AlertTriangle } from "lucide-react";
import type { CoverComposition } from "@/lib/types";

export function StepExport({ onCoverEditingChange }: { onCoverEditingChange?: (editing: boolean) => void }) {
  const { policy, updatePolicy } = useBuilder();
  const [editingCover, setEditingCover] = React.useState(false);
  const autosaveCover = React.useCallback((composition: CoverComposition) => {
    updatePolicy(() => ({ coverComposition: composition }));
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

      {editingCover ? <CoverEditor initialComposition={policy.coverComposition} policy={policy} onDraftChange={autosaveCover} onSave={(composition) => { updatePolicy(() => ({ coverComposition: composition })); setEditingCover(false); onCoverEditingChange?.(false); }} onCancel={() => { setEditingCover(false); onCoverEditingChange?.(false); }} /> : <div className="space-y-3 bg-[#f3f4f2] p-3 lg:p-5">
        <button type="button" onClick={() => { setEditingCover(true); onCoverEditingChange?.(true); }} className="inline-flex min-h-10 items-center rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white shadow-sm">Edit cover</button>
        <div key={policy.documentTheme || "governance-manual"} className="min-h-0 flex-1 pr-1"><PdfPolicyPreview policy={policy} shareDownload /></div>
      </div>}
    </div>
  );
}
