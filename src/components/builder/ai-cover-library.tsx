"use client";

import * as React from "react";
import { Edit3, RefreshCw, Trash2, WandSparkles } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { archiveAICover, coverCompositionsEqual, fetchAICoverLibrary, persistCoverArtwork, saveAICoverToLibrary } from "@/lib/ai-cover-library";
import { policyCraftScopeKey, usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { useBuilder } from "@/lib/store";
import type { CoverLibraryItem } from "@/lib/types";

function activeItem(item: CoverLibraryItem, activeComposition: CoverLibraryItem["composition"] | undefined, activeVariant: "manual" | "ai" | undefined): boolean {
  return activeVariant === "ai" && coverCompositionsEqual(activeComposition, item.composition);
}

export function AICoverLibraryPanel() {
  const { policy, updatePolicy, setStep, requestCoverEdit } = useBuilder();
  const scope = usePolicyCraftScope((state) => state.scope);
  const scopeKey = policyCraftScopeKey(scope);
  const [items, setItems] = React.useState<CoverLibraryItem[]>([]);
  const [itemsScopeKey, setItemsScopeKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const backfillAttempt = React.useRef("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextItems = await fetchAICoverLibrary(policy.policyType, scope);
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === scopeKey) {
        setItems(nextItems);
        setItemsScopeKey(scopeKey);
      }
    } catch (cause) {
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === scopeKey) setError(cause instanceof Error ? cause.message : "The AI cover library could not be loaded.");
    } finally {
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === scopeKey) setLoading(false);
    }
  }, [policy.policyType, scope, scopeKey]);
  const scopedItems = React.useMemo(() => itemsScopeKey === scopeKey ? items : [], [items, itemsScopeKey, scopeKey]);
  const scopedLoading = loading || itemsScopeKey !== scopeKey;

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(() => void load());
    return () => window.cancelAnimationFrame(frame);
  }, [load]);

  React.useEffect(() => {
    const composition = policy.aiCoverComposition;
    if (scopedLoading || !composition || composition.sourceTemplateId !== "ai-generated") return;
    const key = JSON.stringify({ scopeKey, composition });
    if (backfillAttempt.current === key || scopedItems.some((item) => coverCompositionsEqual(item.composition, composition))) return;
    backfillAttempt.current = key;
    const backfillScope = scope;
    const backfillScopeKey = scopeKey;
    let active = true;
    void (async () => {
      setBusyId("backfill");
      try {
        const persisted = await persistCoverArtwork(composition, backfillScope);
        if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== backfillScopeKey) return;
        if (!active) return;
        if (!coverCompositionsEqual(persisted, composition)) updatePolicy(() => ({ aiCoverComposition: persisted }));
        await saveAICoverToLibrary(persisted, policy.policyType, "Recovered AI cover", backfillScope);
        if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== backfillScopeKey) return;
        if (active) await load();
      } catch (cause) {
        if (active && policyCraftScopeKey(usePolicyCraftScope.getState().scope) === backfillScopeKey) setError(cause instanceof Error ? `Current AI cover could not be added to the library: ${cause.message}` : "Current AI cover could not be added to the library.");
      } finally {
        if (active && policyCraftScopeKey(usePolicyCraftScope.getState().scope) === backfillScopeKey) setBusyId(null);
      }
    })();
    return () => { active = false; };
  }, [load, policy.aiCoverComposition, policy.policyType, scope, scopeKey, scopedItems, scopedLoading, updatePolicy]);

  const applyCover = (item: CoverLibraryItem) => updatePolicy(() => ({ aiCoverComposition: item.composition, activeCoverVariant: "ai" }));

  const editCover = (item: CoverLibraryItem) => {
    applyCover(item);
    requestCoverEdit("ai", item.composition);
    setStep("export");
  };

  const deleteCover = async (item: CoverLibraryItem) => {
    if (activeItem(item, policy.aiCoverComposition, policy.activeCoverVariant)) {
      setError("Select Manual or another AI cover before deleting the active cover.");
      return;
    }
    if (!item.canDelete || !window.confirm(`Delete “${item.name}” from the AI cover library?`)) return;
    setBusyId(item.id);
    setError("");
    try {
      await archiveAICover(item.id, scope);
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === scopeKey) setItems((current) => current.filter((candidate) => candidate.id !== item.id));
    } catch (cause) {
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === scopeKey) setError(cause instanceof Error ? cause.message : "The AI cover could not be deleted.");
    } finally {
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === scopeKey) setBusyId(null);
    }
  };

  return <section aria-label="AI cover library" className="flex h-full min-h-0 flex-col">
    <div className="flex items-start justify-between gap-2 border-b border-[var(--color-line)] pb-3">
      <div>
        <div className="flex items-center gap-2"><WandSparkles size={15} className="text-[var(--color-forest)]" /><h3 className="text-[15px] font-semibold text-[var(--color-ink)]">AI Covers</h3></div>
        <p className="mt-1 text-[12px] leading-5 text-[var(--color-muted)]">Saved generations stay here until you remove them.</p>
      </div>
      <button type="button" aria-label="Refresh AI cover library" onClick={() => void load()} disabled={loading || busyId === "backfill"} className="rounded-md p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
    </div>
    {error ? <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-5 text-red-800">{error}</p> : null}
    <div className="min-h-0 flex-1 overflow-y-auto py-3 scrollbar-thin">
      {scopedLoading ? <p className="py-8 text-center text-[12px] text-[var(--color-muted)]">Loading saved AI covers…</p> : scopedItems.length ? <div className="grid grid-cols-2 gap-3">
        {scopedItems.map((item) => {
          const active = activeItem(item, policy.aiCoverComposition, policy.activeCoverVariant);
          const busy = busyId === item.id;
          return <article key={item.id} className={`overflow-hidden rounded-lg border ${active ? "border-[var(--color-forest)] ring-1 ring-[var(--color-forest)]" : "border-[var(--color-line)]"}`}>
            <div className="h-[156px] overflow-hidden bg-[#f3f4f2]">
              <PolicyCoverPreview policy={{ ...policy, aiCoverComposition: item.composition, activeCoverVariant: "ai" }} assetScope={scope} />
            </div>
            <div className="p-2">
              <p className="truncate text-[11px] font-semibold text-[var(--color-ink)]" title={item.name}>{item.name}</p>
              <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">{active ? "Active" : new Date(item.createdAt).toLocaleDateString()}</p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button type="button" onClick={() => applyCover(item)} disabled={active || busy} className="rounded-md bg-[var(--color-forest)] px-1.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45">{active ? "Using" : "Use"}</button>
                <button type="button" onClick={() => editCover(item)} disabled={busy} className="inline-flex items-center justify-center gap-1 rounded-md border border-[var(--color-line-2)] px-1.5 py-1.5 text-[11px] font-semibold text-[var(--color-ink-2)] disabled:opacity-45"><Edit3 size={11} /> Edit</button>
              </div>
              <button type="button" onClick={() => void deleteCover(item)} disabled={busy || !item.canDelete} title={active ? "Select another cover before deleting the active cover" : !item.canDelete ? "Only the creator can delete this cover" : "Delete cover"} className="mt-1.5 inline-flex w-full items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={11} /> {active ? "Switch before deleting" : "Delete"}</button>
            </div>
          </article>;
        })}
      </div> : <div className="rounded-lg bg-[var(--color-cream-2)] px-3 py-6 text-center"><WandSparkles size={18} className="mx-auto text-[var(--color-muted)]" /><p className="mt-2 text-[12px] font-semibold text-[var(--color-ink-2)]">No saved AI covers</p><p className="mt-1 text-[11px] leading-5 text-[var(--color-muted)]">Generate a cover from the Export step and it will appear here.</p></div>}
    </div>
  </section>;
}
