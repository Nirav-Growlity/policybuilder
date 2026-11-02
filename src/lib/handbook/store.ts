/**
 * Client state for the handbook builder (/documents/handbook/[id]), the
 * counterpart of lib/sop/store.ts: the open copy of the handbook, what the
 * outline has selected, per-chapter generation progress and the save state.
 * Generation entries reuse the SOP queue's state shape; its `sopId` holds the
 * chapter id.
 */
import { migrateHandbook } from "./migrate-handbook";
import { create } from "zustand";
import type { StoredManual } from "../manual-repository";
import type { SopGenerationState } from "../sop/ai-contract";
import type { ManualSaveStatus } from "../sop/store";
import type { HandbookChapter, HandbookManual, HandbookSection } from "./types";

export type StoredHandbook = StoredManual<HandbookManual>;
export type HandbookRailSelection = { kind: "front" } | { kind: "closing" } | { kind: "chapter"; chapterId: string };
export type RemovedChapter = { chapter: HandbookChapter; index: number };

type HandbookBuilderState = {
  orgId: number | null;
  manualId: string | null;
  title: string;
  stage: string;
  lockVersion: number;
  manual: HandbookManual | null;
  selection: HandbookRailSelection;
  generation: Record<string, SopGenerationState>;
  saveStatus: ManualSaveStatus;

  load(stored: StoredHandbook, orgId: number): void;
  reset(): void;
  setManual(updater: (manual: HandbookManual) => HandbookManual): void;
  updateChapter(chapterId: string, updater: (chapter: HandbookChapter) => HandbookChapter): void;
  updateSection(chapterId: string, sectionId: string, updater: (section: HandbookSection) => HandbookSection): void;
  addChapters(chapters: HandbookChapter[]): void;
  removeChapter(chapterId: string): RemovedChapter | null;
  restoreChapter(removed: RemovedChapter): void;
  setChapters(chapters: HandbookChapter[]): void;
  select(selection: HandbookRailSelection): void;
  setGeneration(state: SopGenerationState): void;
  clearGeneration(chapterId?: string): void;
  setTitle(title: string): void;
  setSaveStatus(status: ManualSaveStatus): void;
  setLockVersion(lockVersion: number): void;
};

function firstSelection(manual: HandbookManual): HandbookRailSelection {
  const chapter = manual.chapters.find((item) => item.enabled) ?? manual.chapters[0];
  return chapter ? { kind: "chapter", chapterId: chapter.id } : { kind: "front" };
}

const empty = {
  orgId: null,
  manualId: null,
  title: "",
  stage: "write",
  lockVersion: 1,
  manual: null,
  selection: { kind: "front" } as HandbookRailSelection,
  generation: {},
  saveStatus: "idle" as ManualSaveStatus,
};

export const useHandbookBuilder = create<HandbookBuilderState>()((set, get) => {
  const mapManual = (updater: (manual: HandbookManual) => HandbookManual) => set((state) => (state.manual ? { manual: updater(state.manual) } : {}));
  return {
    ...empty,
    load(stored, orgId) {
      set({
        ...empty,
        orgId,
        manualId: stored.id,
        title: stored.title,
        stage: stored.currentStage || "write",
        lockVersion: stored.lockVersion,
        manual: migrateHandbook(stored.manual),
        selection: firstSelection(stored.manual),
      });
    },
    reset: () => set(empty),
    setManual: mapManual,
    updateChapter(chapterId, updater) {
      mapManual((manual) => ({ ...manual, chapters: manual.chapters.map((chapter) => (chapter.id === chapterId ? updater(chapter) : chapter)) }));
    },
    updateSection(chapterId, sectionId, updater) {
      get().updateChapter(chapterId, (chapter) => ({ ...chapter, sections: chapter.sections.map((section) => (section.id === sectionId ? updater(section) : section)) }));
    },
    addChapters(chapters) {
      if (!chapters.length) return;
      mapManual((manual) => ({ ...manual, chapters: [...manual.chapters, ...chapters] }));
    },
    removeChapter(chapterId) {
      const manual = get().manual;
      const index = manual?.chapters.findIndex((chapter) => chapter.id === chapterId) ?? -1;
      if (!manual || index < 0) return null;
      const removed = { chapter: manual.chapters[index], index };
      const chapters = manual.chapters.filter((chapter) => chapter.id !== chapterId);
      const selection = get().selection;
      const fallback = chapters[Math.min(index, chapters.length - 1)];
      const nextSelection: HandbookRailSelection = selection.kind === "chapter" && selection.chapterId === chapterId
        ? (fallback ? { kind: "chapter", chapterId: fallback.id } : { kind: "front" })
        : selection;
      set({ manual: { ...manual, chapters }, selection: nextSelection });
      get().clearGeneration(chapterId);
      return removed;
    },
    restoreChapter({ chapter, index }) {
      mapManual((manual) => {
        if (manual.chapters.some((item) => item.id === chapter.id)) return manual;
        const chapters = [...manual.chapters];
        chapters.splice(Math.min(index, chapters.length), 0, chapter);
        return { ...manual, chapters };
      });
    },
    setChapters(chapters) {
      mapManual((manual) => ({ ...manual, chapters }));
    },
    select: (selection) => set({ selection }),
    setGeneration(state) {
      set((current) => ({ generation: { ...current.generation, [state.sopId]: state } }));
    },
    clearGeneration(chapterId) {
      if (!chapterId) { set({ generation: {} }); return; }
      set((current) => {
        if (!(chapterId in current.generation)) return {};
        const generation = { ...current.generation };
        delete generation[chapterId];
        return { generation };
      });
    },
    setTitle: (title) => set({ title }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setLockVersion: (lockVersion) => set({ lockVersion }),
  };
});
