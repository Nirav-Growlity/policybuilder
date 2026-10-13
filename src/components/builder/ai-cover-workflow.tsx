"use client";

import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { persistCoverArtwork, saveAICoverToLibrary } from "@/lib/ai-cover-library";
import { policyCraftScopeKey, policyCraftUrl, usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { useBuilder } from "@/lib/store";
import type { PolicyCraftWorkspaceScope } from "@/lib/policycraft-access-types";
import type { CoverComposition, Policy } from "@/lib/types";

type AICoverResponse = { composition?: CoverComposition; error?: string };
type AICoverHandler = (composition: CoverComposition) => void | Promise<void>;

const pendingAICoverGenerations = new Map<string, Promise<CoverComposition>>();

function aiCoverGenerationKey(policy: Policy, scope: PolicyCraftWorkspaceScope | null): string {
  return JSON.stringify({ scope: policyCraftScopeKey(scope), policy: { ...policy, aiCoverComposition: undefined, activeCoverVariant: undefined } });
}

async function requestAICoverComposition(policy: Policy, scope: PolicyCraftWorkspaceScope | null): Promise<CoverComposition> {
  const response = await fetch(policyCraftUrl("/api/policycraft/ai-cover", scope), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policy }),
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as AICoverResponse;
  if (!response.ok || !body.composition) throw new Error(body.error || "The AI cover could not be generated.");
  return persistCoverArtwork(body.composition, scope);
}

export function generateAICoverComposition(policy: Policy, scope = usePolicyCraftScope.getState().scope): Promise<CoverComposition> {
  const key = aiCoverGenerationKey(policy, scope);
  const pending = pendingAICoverGenerations.get(key);
  if (pending) return pending;
  const request = requestAICoverComposition(policy, scope).finally(() => pendingAICoverGenerations.delete(key));
  pendingAICoverGenerations.set(key, request);
  return request;
}

export async function generateAndApplyAICover(policy: Policy, onApply: AICoverHandler, scope = usePolicyCraftScope.getState().scope): Promise<CoverComposition> {
  const capturedScopeKey = policyCraftScopeKey(scope);
  const composition = await generateAICoverComposition(policy, scope);
  if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== capturedScopeKey) throw new Error("The workspace changed while the cover was being generated. Please retry.");
  await onApply(composition);
  return composition;
}

export async function persistAndApplyGeneratedCover(
  composition: CoverComposition,
  onApply: AICoverHandler,
  scope = usePolicyCraftScope.getState().scope,
): Promise<CoverComposition> {
  const capturedScopeKey = policyCraftScopeKey(scope);
  const persisted = await persistCoverArtwork(composition, scope);
  if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== capturedScopeKey) throw new Error("The workspace changed while the cover was being saved. Please retry.");
  await onApply(persisted);
  return persisted;
}

export function AICoverWorkflow({
  policy,
  onApply,
}: {
  policy: Policy;
  onApply: AICoverHandler;
}) {
  const beginAICoverGeneration = useBuilder((state) => state.beginAICoverGeneration);
  const endAICoverGeneration = useBuilder((state) => state.endAICoverGeneration);
  const scope = usePolicyCraftScope((state) => state.scope);
  const [generated, setGenerated] = React.useState<CoverComposition | null>(null);
  const [generatedLibraryId, setGeneratedLibraryId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [savingLibrary, setSavingLibrary] = React.useState(false);
  const [error, setError] = React.useState("");
  const saved = policy.aiCoverComposition;
  const generatedNeedsSaving = Boolean(generated && !generatedLibraryId);

  const saveGenerated = React.useCallback(async (composition: CoverComposition) => {
    setSavingLibrary(true);
    try {
      const scopeKey = policyCraftScopeKey(scope);
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== scopeKey) throw new Error("The workspace changed before the cover could be saved. Please retry.");
      const item = await saveAICoverToLibrary(composition, policy.policyType, undefined, scope);
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== scopeKey) throw new Error("The workspace changed while the cover was being saved. Please retry.");
      setGeneratedLibraryId(item.id);
      setError("");
    } finally {
      setSavingLibrary(false);
    }
  }, [policy.policyType, scope]);

  const generate = React.useCallback(async () => {
    setBusy(true);
    setError("");
    setGenerated(null);
    setGeneratedLibraryId(null);
    beginAICoverGeneration();
    try {
      const persisted = await generateAndApplyAICover(policy, onApply, scope);
      setGenerated(persisted);
      try {
        await saveGenerated(persisted);
      } catch (cause) {
        setError(cause instanceof Error ? `${cause.message} Use Retry save to preserve this result.` : "The AI cover was generated but could not be saved to the library. Use Retry save to preserve this result.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI cover could not be generated.");
    } finally {
      setBusy(false);
      endAICoverGeneration();
    }
  }, [beginAICoverGeneration, endAICoverGeneration, onApply, policy, saveGenerated, scope]);

  const retrySave = React.useCallback(async () => {
    if (!generated) return;
    setError("");
    try {
      await saveGenerated(generated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI cover could not be added to the library.");
    }
  }, [generated, saveGenerated]);

  return <section aria-label="AI cover workflow" className="pc-ai-cover-workflow rounded-[14px] border border-[var(--pc-divider)] bg-[var(--pc-panel)] p-4" aria-busy={busy || savingLibrary}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-semibold uppercase tracking-[.1em] text-[var(--pc-muted)]">AI cover</p>
      </div>
      <button data-cover-action="primary" type="button" disabled={busy || savingLibrary || generatedNeedsSaving} onClick={() => void generate()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--pc-primary)] px-3 text-[13px] font-semibold text-[var(--pc-primary-text)] disabled:cursor-wait disabled:opacity-60">
        {busy || savingLibrary ? <RefreshCw size={14} aria-hidden="true" className="animate-spin" /> : <Sparkles size={14} aria-hidden="true" />}
        {saved || generated ? "Regenerate" : "Generate AI cover"}
      </button>
    </div>
    {error ? <p role="alert" className="mt-3 rounded-lg border border-[var(--pc-divider)] bg-[var(--pc-warning-surface)] px-3 py-2 text-[13px] leading-5 text-[var(--pc-warning)]">{error}</p> : null}
    {generatedNeedsSaving ? <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--pc-inset)] px-3 py-2">
      <p className="text-[13px] leading-5 text-[var(--pc-muted)]">Cover applied but not saved to the library yet.</p>
      <button data-cover-action="primary" type="button" disabled={busy || savingLibrary} onClick={() => void retrySave()} className="shrink-0 min-h-10 rounded-lg bg-[var(--pc-primary)] px-3 text-[13px] font-semibold text-[var(--pc-primary-text)] disabled:opacity-50">Retry save</button>
    </div> : null}
  </section>;
}
