"use client";

import * as React from "react";
import { Edit3, RefreshCw, Trash2, WandSparkles } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { Modal } from "@/components/ui/modal";
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
  const [pendingDelete, setPendingDelete] = React.useState<{ item: CoverLibraryItem; scope: typeof scope; scopeKey: string } | null>(null);
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
  const pendingDeleteItem = pendingDelete?.scopeKey === scopeKey ? pendingDelete.item : null;

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

  const requestDelete = (item: CoverLibraryItem) => {
    if (activeItem(item, policy.aiCoverComposition, policy.activeCoverVariant)) {
      setError("Select Manual or another AI cover before deleting the active cover.");
      return;
    }
    if (!item.canDelete) return;
    setError("");
    setPendingDelete({ item, scope, scopeKey });
  };

  const deleteCover = async () => {
    const pending = pendingDelete;
    if (!pending) return;
    if (pending.scopeKey !== scopeKey || policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== pending.scopeKey) {
      setPendingDelete(null);
      return;
    }
    const item = pending.item;
    if (activeItem(item, policy.aiCoverComposition, policy.activeCoverVariant)) {
      setError("Select Manual or another AI cover before deleting the active cover.");
      setPendingDelete(null);
      return;
    }
    if (!item.canDelete) return;
    setBusyId(item.id);
    setError("");
    try {
      await archiveAICover(item.id, pending.scope);
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === pending.scopeKey) {
        setItems((current) => current.filter((candidate) => candidate.id !== item.id));
        setPendingDelete(null);
      }
    } catch (cause) {
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) === pending.scopeKey) setError(cause instanceof Error ? cause.message : "The AI cover could not be deleted.");
    } finally {
      setBusyId(null);
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== pending.scopeKey) setPendingDelete(null);
    }
  };

  return <section aria-label="AI cover library" aria-busy={scopedLoading || busyId === "backfill" || Boolean(busyId)} className="pc-ai-cover-library flex h-full min-h-0 flex-col">
    <div className="flex items-start justify-between gap-2 border-b border-[var(--color-line)] pb-3">
      <div>
        <div className="flex items-center gap-2"><WandSparkles size={16} aria-hidden="true" className="text-[var(--pc-ai)]" /><h3 className="text-[15px] font-semibold text-[var(--pc-text)]">Saved covers</h3></div>
      </div>
      <button type="button" aria-label="Refresh AI cover library" onClick={() => void load()} disabled={loading || busyId === "backfill"} className="min-h-10 min-w-10 rounded-lg p-2 text-[var(--pc-muted)] hover:bg-[var(--pc-inset)] disabled:opacity-50"><RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} /></button>
    </div>
    {error && !pendingDelete ? <p role="alert" className="mt-3 rounded-lg border border-[var(--pc-divider)] bg-[var(--pc-warning-surface)] px-3 py-2 text-[13px] leading-5 text-[var(--pc-warning)]">{error}</p> : null}
    <div className="min-h-0 flex-1 overflow-y-auto py-3 scrollbar-thin">
      {scopedLoading ? <p role="status" aria-live="polite" className="py-8 text-center text-[14px] text-[var(--pc-muted)]">Loading saved AI covers…</p> : scopedItems.length ? <div className="grid grid-cols-2 gap-3">
        {scopedItems.map((item) => {
          const active = activeItem(item, policy.aiCoverComposition, policy.activeCoverVariant);
          const busy = busyId === item.id;
          return <article data-cover-selected={active ? "true" : "false"} key={item.id} className={`overflow-hidden rounded-[10px] border ${active ? "border-[var(--pc-primary)] ring-1 ring-[var(--pc-primary)]" : "border-[var(--pc-divider)]"}`}>
            <div data-ai-cover-preview className="h-[156px] overflow-hidden bg-[#fff]">
              <PolicyCoverPreview policy={{ ...policy, aiCoverComposition: item.composition, activeCoverVariant: "ai" }} assetScope={scope} />
            </div>
            <div className="p-2">
              <p className="truncate text-[13px] font-semibold text-[var(--pc-text)]" title={item.name}>{item.name}</p>
              <p className="mt-0.5 text-[12px] text-[var(--pc-muted)]">{active ? "Active" : new Date(item.createdAt).toLocaleDateString()}</p>
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button data-cover-action="primary" type="button" onClick={() => applyCover(item)} disabled={active || busy} className="min-h-10 rounded-lg bg-[var(--pc-primary)] px-1.5 text-[13px] font-semibold text-[var(--pc-primary-text)] disabled:opacity-45">{active ? "Using" : "Use"}</button>
                <button type="button" onClick={() => editCover(item)} disabled={busy} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border border-[var(--pc-control)] px-1.5 text-[13px] font-semibold text-[var(--pc-text)] disabled:opacity-45"><Edit3 size={13} aria-hidden="true" /> Edit</button>
              </div>
              <button data-cover-action="danger-text" type="button" onClick={() => requestDelete(item)} disabled={busy || !item.canDelete} title={active ? "Select another cover before deleting the active cover" : !item.canDelete ? "Only the creator can delete this cover" : "Delete cover"} className="mt-1.5 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-lg px-1.5 text-[13px] font-medium text-[var(--pc-error)] hover:bg-[var(--pc-error-surface)] disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={13} aria-hidden="true" /> {active ? "Switch before deleting" : "Delete"}</button>
            </div>
          </article>;
        })}
      </div> : <div role="status" className="rounded-lg bg-[var(--pc-inset)] px-3 py-6 text-center"><WandSparkles size={18} aria-hidden="true" className="mx-auto text-[var(--pc-muted)]" /><p className="mt-2 text-[14px] font-semibold text-[var(--pc-text)]">No saved AI covers</p><p className="mt-1 text-[14px] leading-5 text-[var(--pc-muted)]">Generate one from the Document tab.</p></div>}
    </div>
    {pendingDeleteItem ? <Modal open onClose={() => { if (!busyId) setPendingDelete(null); }} title="Delete AI cover?" description={`Delete “${pendingDeleteItem.name}” from the AI cover library?`} width={460}><div data-cover-dialog>{error ? <p role="alert" className="mb-4 rounded-lg border border-[var(--pc-divider)] bg-[var(--pc-error-surface)] px-3 py-2 text-[13px] text-[var(--pc-error)]">{error}</p> : null}<div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPendingDelete(null)} disabled={busyId === pendingDeleteItem.id} className="min-h-10 w-full rounded-lg px-3 text-[13px] sm:w-auto">Cancel</button><button data-cover-action="danger" type="button" onClick={() => void deleteCover()} disabled={busyId === pendingDeleteItem.id} className="min-h-10 w-full rounded-lg bg-[var(--pc-error)] px-3 text-[13px] font-semibold text-[var(--pc-error-text)] disabled:opacity-50 sm:w-auto">{busyId === pendingDeleteItem.id ? "Deleting…" : "Delete cover"}</button></div></div></Modal> : null}
  </section>;
}
