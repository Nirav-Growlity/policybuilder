"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";
import { CoverEditor } from "@/components/builder/cover-editor";
import { AICoverGenerationLoader } from "@/components/builder/ai-cover-generation-loader";
import type { CoverComposition } from "@/lib/types";
import { getPolicyProfile } from "@/lib/constants";
import { generateAndApplyAICover } from "@/components/builder/ai-cover-workflow";
import { saveAICoverToLibrary } from "@/lib/ai-cover-library";
import { policyCraftScopeKey, usePolicyCraftScope } from "@/lib/policycraft-client-scope";

export function StepExport({ onCoverEditingChange }: { onCoverEditingChange?: (editing: boolean) => void }) {
  const { policy, updatePolicy, coverEditorRequest, clearCoverEditorRequest, beginAICoverGeneration, endAICoverGeneration, isAICoverGenerating, includeAuthorSignature, authorSignatureDate, authorSignatureUpdatedAt } = useBuilder();
  const scope = usePolicyCraftScope((state) => state.scope);
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
      const scopeKey = policyCraftScopeKey(scope);
      const composition = await generateAndApplyAICover(policy, applyAICover, scope);
      setAICoverState("ready");
      try {
        if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== scopeKey) throw new Error("The workspace changed before the cover could be saved. Please retry.");
        await saveAICoverToLibrary(composition, policy.policyType, undefined, scope);
        if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== scopeKey) throw new Error("The workspace changed while the cover was being saved. Please retry.");
      } catch (cause) {
        setAICoverError(cause instanceof Error ? `AI cover is ready, but it could not be saved to the library: ${cause.message}` : "AI cover is ready, but it could not be saved to the library.");
      }
    } catch (cause) {
      setAICoverState("failed");
      setAICoverError(cause instanceof Error ? cause.message : "The AI cover could not be generated.");
    } finally {
      endAICoverGeneration();
    }
  }, [applyAICover, beginAICoverGeneration, endAICoverGeneration, policy, scope]);

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

  return (
    <div className="space-y-6">
      {editingCover ? <CoverEditor
        initialComposition={editingCover === "ai" ? policy.aiCoverComposition : policy.coverComposition}
        policy={{ ...policy, activeCoverVariant: "manual", aiCoverComposition: undefined }}
        onDraftChange={(composition) => saveCoverDraft(editingCover, composition)}
        onSave={(composition) => { saveCoverDraft(editingCover, composition); setEditingCover(null); onCoverEditingChange?.(false); }}
        onCancel={() => { setEditingCover(null); onCoverEditingChange?.(false); }}
      /> : <div className="space-y-4">
        <div className="relative min-h-[clamp(520px,70vh,760px)]">
          {aiCoverState === "generating" || isAICoverGenerating ? <AICoverGenerationLoader title={getPolicyProfile(policy.policyType).label} company={policy.company.name} accent={getPolicyProfile(policy.policyType).accent} /> : <>
          {aiCoverError ? <div className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-[13px] ${aiCoverState === "failed" ? "border-[var(--pc-divider)] bg-[var(--pc-error-surface)] text-[var(--pc-error)]" : "border-[var(--pc-divider)] bg-[var(--pc-warning-surface)] text-[var(--pc-warning)]"}`} role={aiCoverState === "failed" ? "alert" : "status"}><span>{aiCoverError}{aiCoverState === "failed" ? " The manual cover is shown below." : ""}</span>{aiCoverState === "failed" ? <button data-cover-action="primary" type="button" className="shrink-0 min-h-10 rounded-lg px-3 font-semibold" onClick={() => void startAICoverGeneration()}>Retry</button> : null}</div> : null}
          <div className="min-h-0 flex-1 pr-1"><PdfPolicyPreview policy={policy} includeAuthorSignature={includeAuthorSignature} authorSignatureDate={authorSignatureDate ?? ""} signatureUpdatedAt={authorSignatureUpdatedAt} /></div>
          </>}
        </div>
      </div>}
    </div>
  );
}
