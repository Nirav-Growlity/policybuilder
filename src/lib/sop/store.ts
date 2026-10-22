/**
 * Client state for the SOP manual builder (/documents/sop/[id]). The saved
 * manual lives on the server; this store holds the open copy, what is
 * selected in the outline, per-SOP generation progress and the save state.
 */
import { create } from "zustand";
import type { SopGenerationState } from "./ai-contract";
import type { StoredSopManual } from "./client-api";
import { withManualSkeleton } from "./initial-manual";
import type { Sop, SopManual, SopSection } from "./types";

export type RailSelection = { kind: "front" } | { kind: "closing" } | { kind: "sop"; sopId: string };
export type ManualSaveStatus = "idle" | "saving" | "saved" | "offline" | "conflict";

export type RemovedSop = { sop: Sop; index: number };

type SopBuilderState = {
  orgId: number | null;
  manualId: string | null;
  title: string;
  stage: string;
  lockVersion: number;
  manual: SopManual | null;
  selection: RailSelection;
  generation: Record<string, SopGenerationState>;
  saveStatus: ManualSaveStatus;

  load(stored: StoredSopManual, orgId: number): void;
  reset(): void;
  setManual(updater: (manual: SopManual) => SopManual): void;
  updateSop(sopId: string, updater: (sop: Sop) => Sop): void;
  updateSection<S extends SopSection>(sopId: string, sectionId: string, updater: (section: S) => S): void;
  addSops(sops: Sop[]): void;
  removeSop(sopId: string): RemovedSop | null;
  restoreSop(removed: RemovedSop): void;
  setSops(sops: Sop[]): void;
  select(selection: RailSelection): void;
  setGeneration(state: SopGenerationState): void;
  clearGeneration(sopId?: string): void;
  setTitle(title: string): void;
  setStage(stage: string): void;
  setSaveStatus(status: ManualSaveStatus): void;
  setLockVersion(lockVersion: number): void;
};

function firstSelection(manual: SopManual): RailSelection {
  const sop = manual.sops.find((item) => item.enabled) ?? manual.sops[0];
  return sop ? { kind: "sop", sopId: sop.id } : { kind: "front" };
}

const empty = {
  orgId: null,
  manualId: null,
  title: "",
  stage: "write",
  lockVersion: 1,
  manual: null,
  selection: { kind: "front" } as RailSelection,
  generation: {},
  saveStatus: "idle" as ManualSaveStatus,
};

export const useSopBuilder = create<SopBuilderState>()((set, get) => {
  const mapManual = (updater: (manual: SopManual) => SopManual) => set((state) => (state.manual ? { manual: updater(state.manual) } : {}));
  return {
    ...empty,

    load(stored, orgId) {
      // Manuals saved before a section kind existed get it, switched off.
      const manual = withManualSkeleton(stored.manual);
      set({
        ...empty,
        orgId,
        manualId: stored.id,
        title: stored.title,
        stage: stored.currentStage || "write",
        lockVersion: stored.lockVersion,
        manual,
        selection: firstSelection(manual),
      });
    },
    reset: () => set(empty),
    setManual: mapManual,
    updateSop(sopId, updater) {
      mapManual((manual) => ({ ...manual, sops: manual.sops.map((sop) => (sop.id === sopId ? updater(sop) : sop)) }));
    },
    updateSection(sopId, sectionId, updater) {
      get().updateSop(sopId, (sop) => ({
        ...sop,
        sections: sop.sections.map((section) => (section.id === sectionId ? updater(section as never) : section)),
      }));
    },
    addSops(sops) {
      if (!sops.length) return;
      mapManual((manual) => ({ ...manual, sops: [...manual.sops, ...sops] }));
    },
    removeSop(sopId) {
      const manual = get().manual;
      const index = manual?.sops.findIndex((sop) => sop.id === sopId) ?? -1;
      if (!manual || index < 0) return null;
      const removed = { sop: manual.sops[index], index };
      const sops = manual.sops.filter((sop) => sop.id !== sopId);
      const selection = get().selection;
      const nextSelection: RailSelection = selection.kind === "sop" && selection.sopId === sopId
        ? (sops[Math.min(index, sops.length - 1)] ? { kind: "sop", sopId: sops[Math.min(index, sops.length - 1)].id } : { kind: "front" })
        : selection;
      set({ manual: { ...manual, sops }, selection: nextSelection });
      get().clearGeneration(sopId);
      return removed;
    },
    restoreSop({ sop, index }) {
      mapManual((manual) => {
        if (manual.sops.some((item) => item.id === sop.id)) return manual;
        const sops = [...manual.sops];
        sops.splice(Math.min(index, sops.length), 0, sop);
        return { ...manual, sops };
      });
    },
    setSops(sops) {
      mapManual((manual) => ({ ...manual, sops }));
    },
    select: (selection) => set({ selection }),
    setGeneration(state) {
      set((current) => ({ generation: { ...current.generation, [state.sopId]: state } }));
    },
    clearGeneration(sopId) {
      if (!sopId) { set({ generation: {} }); return; }
      set((current) => {
        if (!(sopId in current.generation)) return {};
        const generation = { ...current.generation };
        delete generation[sopId];
        return { generation };
      });
    },
    setTitle: (title) => set({ title }),
    setStage: (stage) => set({ stage }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setLockVersion: (lockVersion) => set({ lockVersion }),
  };
});

/** The SOP the outline has selected, if any. */
export function selectedSop(state: Pick<SopBuilderState, "manual" | "selection">): Sop | null {
  const selection = state.selection;
  if (selection.kind !== "sop" || !state.manual) return null;
  return state.manual.sops.find((sop) => sop.id === selection.sopId) ?? null;
}
