"use client";

import * as React from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import type { CoverComposition, Policy } from "@/lib/types";

type AICoverResponse = { composition?: CoverComposition; error?: string };
type AICoverHandler = (composition: CoverComposition) => void | Promise<void>;

async function persistGeneratedArtwork(composition: CoverComposition): Promise<CoverComposition> {
  const assetId = composition.background.assetId;
  if (!assetId?.startsWith("data:image/")) return composition;
  try {
    const image = await fetch(assetId);
    const blob = await image.blob();
    const form = new FormData();
    form.append("file", new File([blob], "ai-cover.png", { type: "image/png" }));
    const response = await fetch("/api/policycraft/cover-assets", { method: "POST", body: form });
    const body = await response.json().catch(() => ({})) as { asset?: { id?: string } };
    const storedId = body.asset?.id;
    return response.ok && storedId
      ? { ...composition, background: { ...composition.background, assetId: storedId } }
      : composition;
  } catch {
    return composition;
  }
}

export function AICoverWorkflow({
  policy,
  onApply,
  onEdit,
}: {
  policy: Policy;
  onApply: AICoverHandler;
  onEdit: AICoverHandler;
}) {
  const [generated, setGenerated] = React.useState<CoverComposition | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const saved = policy.aiCoverComposition;
  const previewComposition = generated || saved;

  const apply = React.useCallback(async (action: AICoverHandler) => {
    if (!previewComposition) return;
    setBusy(true);
    try {
      const persisted = await persistGeneratedArtwork(previewComposition);
      setGenerated(persisted);
      await action(persisted);
    } finally {
      setBusy(false);
    }
  }, [previewComposition]);

  const generate = React.useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/policycraft/ai-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy }),
      });
      const body = await response.json().catch(() => ({})) as AICoverResponse;
      if (!response.ok || !body.composition) throw new Error(body.error || "The AI cover could not be generated.");
      setGenerated(body.composition);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI cover could not be generated.");
    } finally {
      setBusy(false);
    }
  }, [policy]);

  return <section aria-label="AI cover workflow" className="rounded-xl border border-[var(--color-line)] bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[var(--color-muted)]">AI Cover</p>
        <h2 className="mt-1 font-display text-xl font-semibold text-[var(--color-ink)]">Generate a visual first page</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-5 text-[var(--color-muted)]">AI creates the artwork only. PolicyCraft keeps your logo, policy details, and document control fields as editable overlays.</p>
      </div>
      <button type="button" disabled={busy} onClick={() => void generate()} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white shadow-sm disabled:cursor-wait disabled:opacity-60">
        {busy ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {saved || generated ? "Regenerate AI cover" : "Generate AI cover"}
      </button>
    </div>
    {error ? <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">{error}</p> : null}
    {previewComposition ? <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,240px)_1fr]">
      <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[#f3f4f2] p-2">
        <PolicyCoverPreview policy={{ ...policy, aiCoverComposition: previewComposition, activeCoverVariant: "ai" }} />
      </div>
      <div className="flex flex-col justify-between gap-3 rounded-lg bg-[#f3f4f2] p-4">
        <div>
          <p className="text-sm font-semibold text-[var(--color-ink)]">{generated ? "New AI result ready" : "Saved AI cover"}</p>
          <p className="mt-1 text-[13px] leading-5 text-[var(--color-muted)]">Apply it to make it active. Your Manual Cover stays stored separately and can be selected again at any time.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void apply(onApply)} className="rounded-lg bg-[var(--color-forest)] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50">{generated ? "Apply AI cover" : "Use AI cover"}</button>
          <button type="button" disabled={busy} onClick={() => void apply(onEdit)} className="rounded-lg border border-[var(--color-line-2)] bg-white px-3 py-2 text-[13px] font-semibold text-[var(--color-ink-2)] disabled:opacity-50">Edit AI cover</button>
          {generated ? <button type="button" onClick={() => setGenerated(null)} className="rounded-lg px-3 py-2 text-[13px] font-medium text-[var(--color-muted)] hover:bg-white">Cancel result</button> : null}
        </div>
      </div>
    </div> : <p className="mt-4 rounded-lg bg-[#f3f4f2] px-3 py-3 text-[13px] text-[var(--color-muted)]">No AI cover has been applied yet. Generating one will not change your manual cover.</p>}
  </section>;
}
