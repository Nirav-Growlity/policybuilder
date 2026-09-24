"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import { CoverEditor } from "@/components/builder/cover-editor";
import { AICoverGenerationLoader } from "@/components/builder/ai-cover-generation-loader";
import { Leaf } from "lucide-react";
import type { CoverComposition } from "@/lib/types";
import { visibleQualitativeEntries, visibleQuantitativeAreas } from "@/lib/focus-area-catalog";
import { generateAndApplyAICover } from "@/components/builder/ai-cover-workflow";
import { saveAICoverToLibrary } from "@/lib/ai-cover-library";

export function StepExport({ onCoverEditingChange }: { onCoverEditingChange?: (editing: boolean) => void }) {
  const { policy, updatePolicy, coverEditorRequest, clearCoverEditorRequest, beginAICoverGeneration, endAICoverGeneration, isAICoverGenerating } = useBuilder();
  const [editingCover, setEditingCover] = React.useState<"manual" | "ai" | null>(null);
  const [aiCoverState, setAICoverState] = React.useState<"generating" | "ready" | "failed">(() => policy.aiCoverComposition ? "ready" : "generating");
  const [aiCoverError, setAICoverError] = React.useState("");
  const aiCoverGenerationStarted = React.useRef(false);
  const saveCoverDraft = React.useCallback((variant: "manual" | "ai", composition: CoverComposition) => {
    updatePolicy(() => variant === "ai"
      ? ({ aiCoverComposition: composition, activeCoverVariant: "ai" })
      : ({ coverComposition: composition }));
  }, [updatePolicy]);
  const applyAICover = React.useCallback((composition: CoverComposition) => {
    updatePolicy(() => ({ aiCoverComposition: composition, activeCoverVariant: "ai" }));
  }, [updatePolicy]);
  const startAICoverGeneration = React.useCallback(async () => {
    beginAICoverGeneration();
    setAICoverState("generating");
    setAICoverError("");
    try {
      const composition = await generateAndApplyAICover(policy, applyAICover);
      setAICoverState("ready");
      try {
        await saveAICoverToLibrary(composition, policy.policyType);
      } catch (cause) {
        setAICoverError(cause instanceof Error ? `AI cover is ready, but it could not be saved to the library: ${cause.message}` : "AI cover is ready, but it could not be saved to the library.");
      }
    } catch (cause) {
      setAICoverState("failed");
      setAICoverError(cause instanceof Error ? cause.message : "The AI cover could not be generated.");
    } finally {
      endAICoverGeneration();
    }
  }, [applyAICover, beginAICoverGeneration, endAICoverGeneration, policy]);

  React.useEffect(() => {
    if (policy.aiCoverComposition || aiCoverGenerationStarted.current) return;
    aiCoverGenerationStarted.current = true;
    void startAICoverGeneration();
  }, [policy.aiCoverComposition, startAICoverGeneration]);

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
      {aiCoverState !== "generating" ? <div className="flex items-start gap-4 rounded-xl border border-[var(--color-line)] bg-white px-5 py-4 shadow-[var(--shadow-soft)] sm:items-center">
        <div className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest)] sm:mt-0">
          <Leaf size={18} strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[13px] font-semibold text-[var(--color-ink)]">Policy readiness</p>
            <p className="text-[12px] text-[var(--color-muted)]"><span className="font-semibold tabular-nums text-[var(--color-ink-2)]">{completeness} of 9</span> sections complete</p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-forest-soft)]" role="progressbar" aria-label="Policy completeness" aria-valuemin={0} aria-valuemax={9} aria-valuenow={completeness} aria-valuetext={`${completeness} of 9 sections complete`}>
            <span className="block h-full rounded-full bg-[var(--color-forest)] transition-[width] duration-500" style={{ width: `${(completeness / 9) * 100}%` }} />
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[var(--color-muted)]">
            {completeness < 7 ? "Add more completed sections for a more comprehensive policy." : "Your policy is ready to export. You can still refine the cover."}
          </p>
        </div>
      </div> : null}

      {editingCover ? <CoverEditor
        initialComposition={editingCover === "ai" ? policy.aiCoverComposition : policy.coverComposition}
        policy={{ ...policy, activeCoverVariant: "manual", aiCoverComposition: undefined }}
        onDraftChange={(composition) => saveCoverDraft(editingCover, composition)}
        onSave={(composition) => { saveCoverDraft(editingCover, composition); setEditingCover(null); onCoverEditingChange?.(false); }}
        onCancel={() => { setEditingCover(null); onCoverEditingChange?.(false); }}
      /> : <div className="space-y-4">
        <div className="relative min-h-[clamp(520px,70vh,760px)]">
          {aiCoverState === "generating" || isAICoverGenerating ? <AICoverGenerationLoader /> : <>
          {aiCoverError ? <div className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-[12px] ${aiCoverState === "failed" ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"}`} role={aiCoverState === "failed" ? "alert" : "status"}><span>{aiCoverError}{aiCoverState === "failed" ? " The manual cover is shown below." : ""}</span>{aiCoverState === "failed" ? <button type="button" className="shrink-0 rounded-md bg-[var(--color-forest)] px-2.5 py-1.5 font-semibold text-white" onClick={() => void startAICoverGeneration()}>Retry</button> : null}</div> : null}
          <div className="min-h-0 flex-1 pr-1"><PdfPolicyPreview policy={policy} /></div>
          </>}
        </div>
      </div>}
    </div>
  );
}
