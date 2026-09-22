"use client";

import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { persistCoverArtwork, saveAICoverToLibrary } from "@/lib/ai-cover-library";
import type { CoverComposition, Policy } from "@/lib/types";

type AICoverResponse = { composition?: CoverComposition; error?: string };
type AICoverHandler = (composition: CoverComposition) => void | Promise<void>;

export async function persistAndApplyGeneratedCover(
  composition: CoverComposition,
  onApply: AICoverHandler,
): Promise<CoverComposition> {
  const persisted = await persistCoverArtwork(composition);
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
      const item = await saveAICoverToLibrary(composition, policy.policyType);
      setGeneratedLibraryId(item.id);
      setError("");
    } finally {
      setSavingLibrary(false);
    }
  }, [policy.policyType]);

  const generate = React.useCallback(async () => {
    setBusy(true);
    setError("");
    setGenerated(null);
    setGeneratedLibraryId(null);
    try {
      const response = await fetch("/api/policycraft/ai-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      const body = await response.json().catch(() => ({})) as AICoverResponse;
      if (!response.ok || !body.composition) throw new Error(body.error || "The AI cover could not be generated.");
      const persisted = await persistAndApplyGeneratedCover(body.composition, onApply);
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
    }
  }, [onApply, policy, saveGenerated]);

  const retrySave = React.useCallback(async () => {
    if (!generated) return;
    setError("");
    try {
      await saveGenerated(generated);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI cover could not be added to the library.");
    }
  }, [generated, saveGenerated]);

  return <section aria-label="AI cover workflow" className="rounded-xl border border-[var(--color-line)] bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-[var(--color-muted)]">AI cover</p>
        <p className="mt-1 text-[13px] leading-5 text-[var(--color-muted)]">Generate and apply an AI first page. Every saved result remains available in Document design and will not change your manual cover.</p>
      </div>
      <button type="button" disabled={busy || savingLibrary || generatedNeedsSaving} onClick={() => void generate()} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-3 text-[13px] font-semibold text-white shadow-sm disabled:cursor-wait disabled:opacity-60">
        {busy || savingLibrary ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {saved || generated ? "Regenerate" : "Generate AI cover"}
      </button>
    </div>
    {error ? <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-800">{error}</p> : null}
    {generatedNeedsSaving ? <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[#f3f4f2] px-3 py-2">
      <p className="text-[12px] leading-5 text-[var(--color-muted)]">AI cover applied; library save pending.</p>
      <button type="button" disabled={busy || savingLibrary} onClick={() => void retrySave()} className="shrink-0 rounded-md bg-[var(--color-forest)] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">Retry save</button>
    </div> : null}
  </section>;
}
