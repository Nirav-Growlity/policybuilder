"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Edit3, Trash2 } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { Modal } from "@/components/ui/modal";
import { archiveAICover, coverCompositionsEqual, fetchAICoverLibrary, persistCoverArtwork, saveAICoverToLibrary } from "@/lib/ai-cover-library";
import { policyCraftScopeKey, usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { useBuilder } from "@/lib/store";
import type { CoverLibraryItem } from "@/lib/types";
import styles from "./design-studio/design-studio.module.css";

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

  return <div aria-label="Saved AI covers" role="region" aria-busy={scopedLoading || Boolean(busyId)} className={styles.coverLibrary}>
    {error && !pendingDelete ? <p role="alert" className={styles.notice} data-tone="warning">{error}</p> : null}
    {scopedLoading && error ? null : scopedLoading ? <div role="status" aria-label="Loading saved AI covers" className={styles.coverGrid}>
      {[0, 1].map((index) => <span key={index} className={styles.coverSkeleton} />)}
    </div> : scopedItems.length ? <motion.ul layout className={styles.coverGrid}>
      <AnimatePresence initial={false}>
        {scopedItems.map((item, index) => {
          const active = activeItem(item, policy.aiCoverComposition, policy.activeCoverVariant);
          const busy = busyId === item.id;
          return <motion.li layout key={item.id} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.16 } }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: Math.min(index, 6) * 0.04 }} data-cover-selected={active ? "true" : "false"} className={styles.coverCard}>
            <button type="button" onClick={() => applyCover(item)} disabled={active || busy} aria-pressed={active} aria-label={active ? `${item.name}, in use` : `Use ${item.name}`} className={styles.coverThumb}>
              <span data-ai-cover-preview className={styles.coverPreview}>
                <PolicyCoverPreview policy={{ ...policy, aiCoverComposition: item.composition, activeCoverVariant: "ai" }} assetScope={scope} />
              </span>
              {active ? <motion.span layoutId="ai-cover-in-use" className={styles.coverRing} transition={{ type: "spring", stiffness: 520, damping: 38 }} /> : null}
            </button>
            <div className={styles.coverMeta}>
              <span className={styles.coverDate}>{active ? "In use" : new Date(item.createdAt).toLocaleDateString()}</span>
              <span className={styles.iconActions}>
                <button type="button" onClick={() => editCover(item)} disabled={busy} aria-label={`Edit ${item.name}`} title="Edit" className={styles.iconAction}><Edit3 size={14} aria-hidden="true" /></button>
                <button data-cover-action="danger-text" type="button" onClick={() => requestDelete(item)} disabled={busy || active || !item.canDelete} aria-label={`Delete ${item.name}`} title={active ? "Switch to another cover before deleting this one" : !item.canDelete ? "Only the person who made this cover can delete it" : "Delete"} className={styles.iconAction} data-danger><Trash2 size={14} aria-hidden="true" /></button>
              </span>
            </div>
          </motion.li>;
        })}
      </AnimatePresence>
    </motion.ul> : <p className={styles.muted}>Covers you generate are kept here so you can switch between them.</p>}
    {pendingDeleteItem ? <Modal open onClose={() => { if (!busyId) setPendingDelete(null); }} title="Delete AI cover?" description={`Delete “${pendingDeleteItem.name}” from the AI cover library?`} width={460}><div data-cover-dialog>{error ? <p role="alert" className="mb-4 rounded-lg border border-[var(--pc-divider)] bg-[var(--pc-error-surface)] px-3 py-2 text-[13px] text-[var(--pc-error)]">{error}</p> : null}<div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setPendingDelete(null)} disabled={busyId === pendingDeleteItem.id} className="min-h-10 w-full rounded-lg px-3 text-[13px] sm:w-auto">Cancel</button><button data-cover-action="danger" type="button" onClick={() => void deleteCover()} disabled={busyId === pendingDeleteItem.id} className="min-h-10 w-full rounded-lg bg-[var(--pc-error)] px-3 text-[13px] font-semibold text-[var(--pc-error-text)] disabled:opacity-50 sm:w-auto">{busyId === pendingDeleteItem.id ? "Deleting…" : "Delete cover"}</button></div></div></Modal> : null}
  </div>;
}
