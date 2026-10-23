"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, BookUser, RefreshCw } from "lucide-react";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createDraftAutosave } from "@/lib/policycraft-autosave";
import { registerNavigationFlush } from "@/lib/policycraft-navigation-flush";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { isAiUnavailable } from "@/lib/sop/ai-client";
import type { GenerationQueueHandle } from "@/lib/sop/generation-queue";
import { downloadSopManual, fetchAccess } from "@/lib/sop/client-api";
import { getHandbook, saveHandbook, ManualConflictError } from "@/lib/handbook/client-api";
import { startHandbookGeneration } from "@/lib/handbook/ai-client";
import { applyChapterResult, applyHandbookFrontMatterResult } from "@/lib/handbook/apply-ai-result";
import { useHandbookBuilder, type HandbookRailSelection } from "@/lib/handbook/store";
import type { HandbookChapter, HandbookManual } from "@/lib/handbook/types";
import type { SopCover } from "@/lib/sop/types";
import { chapterOrder, handbookProgress, isChapterWritten } from "@/components/documents/handbook-helpers";
import { Group, Segmented } from "@/components/builder/design-studio/controls";
import studio from "@/components/builder/design-studio/design-studio.module.css";
import type { BuilderMode } from "@/components/documents/builder/builder-context";
import { UndoToast } from "@/components/documents/builder/builder-dialogs";
import { ManualDesignStudio, useAiCover } from "@/components/documents/builder/design-mode";
import { BuilderFrame, useNarrowViewport, type WriteHeading } from "@/components/documents/builder/sop-builder-shell";
import { SopPdfPreview } from "@/components/documents/builder/sop-pdf-preview";
import styles from "@/components/documents/builder/builder.module.css";
import { HandbookBuilderContext, useHandbookBuilderActions, type HandbookBuilderActions } from "./handbook-builder-context";
import { HandbookRail, HandbookRailMini, HandbookSummary, handbookSelectionKey } from "./handbook-rail";
import { HandbookProgressPill } from "./handbook-progress-pill";
import { HandbookReviewMode } from "./handbook-review-mode";
import { ChapterWriter } from "./chapter-writer";
import { ClosingWriter, OpeningWriter } from "./handbook-part-writers";
import { AddChapterModal, HandbookDetailsModal } from "./handbook-dialogs";

type SavePayload = { manual: HandbookManual; title: string; stage: BuilderMode };
const MODES: readonly BuilderMode[] = ["write", "design", "review"];
const AI_MISSING = /not wired up/i;

function generationError(cause: unknown) {
  if (isAiUnavailable(cause)) return "Handbook AI is not wired up yet.";
  return cause instanceof Error ? cause.message : "AI writing failed.";
}

const getHandbookManual = () => useHandbookBuilder.getState().manual;
const applyHandbookCover = (cover: SopCover) => useHandbookBuilder.getState().setManual((current) => ({ ...current, cover }));

export function HandbookBuilder({ manualId }: { manualId: string }) {
  const searchParams = useSearchParams();
  const requestedOrgId = Number(searchParams.get("orgId")) || null;
  return (
    <ApplicationSurface className="h-dvh overflow-hidden">
      <HandbookBuilderWorkspace key={`${manualId}:${requestedOrgId ?? "auto"}`} manualId={manualId} requestedOrgId={requestedOrgId} />
    </ApplicationSurface>
  );
}

function HandbookBuilderWorkspace({ manualId, requestedOrgId }: { manualId: string; requestedOrgId: number | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { push } = useToast();
  const setScope = usePolicyCraftScope((state) => state.setScope);
  const manual = useHandbookBuilder((state) => state.manual);
  const title = useHandbookBuilder((state) => state.title);
  const selection = useHandbookBuilder((state) => state.selection);
  const saveStatus = useHandbookBuilder((state) => state.saveStatus);
  const orgId = useHandbookBuilder((state) => state.orgId);

  const [phase, setPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState("");
  const [workspaceHref, setWorkspaceHref] = React.useState("/documents");
  const [mode, setModeState] = React.useState<BuilderMode>("write");
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [undo, setUndo] = React.useState<{ message: string; restore: () => void } | null>(null);
  const [exporting, setExporting] = React.useState<"pdf" | "docx" | null>(null);
  const [coverRequested, setCoverRequested] = React.useState(false);
  const autosave = React.useRef(createDraftAutosave<SavePayload>());
  const lastSaved = React.useRef("");
  const queues = React.useRef(new Set<{ handle: GenerationQueueHandle; sopIds: Set<string> }>());

  // Load the handbook and bind the organization scope (logo and cover URLs read it).
  React.useEffect(() => {
    let active = true;
    // A fresh saver per mount: cleanup cancels the previous one for good, and
    // React mounts effects twice in development.
    autosave.current = createDraftAutosave<SavePayload>();
    const store = useHandbookBuilder.getState();
    store.reset();
    async function load() {
      try {
        const access = await fetchAccess();
        const stored = await getHandbook(requestedOrgId, manualId);
        const organizationId = stored.organization?.id ?? requestedOrgId;
        const organization = access.organizations.find((item) => item.id === organizationId);
        if (!organizationId || !organization) throw new Error("This handbook’s organization is not assigned to your account.");
        if (!active) return;
        setScope({ userId: access.actor.id, role: access.actor.role, organizationId, organizationName: organization.name, documentId: stored.id });
        setWorkspaceHref(`/documents?orgId=${organizationId}`);
        useHandbookBuilder.getState().load(stored, organizationId);
        // The opened copy is the saved baseline, so opening an older handbook does not save it.
        lastSaved.current = JSON.stringify({ manual: useHandbookBuilder.getState().manual, title: stored.title, stage: MODES.includes(stored.currentStage as BuilderMode) ? stored.currentStage : "write" });
        setModeState(MODES.includes(stored.currentStage as BuilderMode) ? stored.currentStage as BuilderMode : "write");
        // The wizard asks for an AI cover with ?cover=ai; it is drawn once the builder is open.
        if (new URLSearchParams(window.location.search).get("cover") === "ai") setCoverRequested(true);
        setPhase("ready");
      } catch (cause) {
        if (cause instanceof Error && "status" in cause && (cause as { status: number }).status === 401) {
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        if (active) { setError(cause instanceof Error ? cause.message : "Could not open this handbook."); setPhase("error"); }
      }
    }
    void load();
    const queueSet = queues.current;
    const saver = autosave.current;
    return () => {
      active = false;
      queueSet.forEach((queue) => { try { queue.handle.cancel(); } catch { /* stub */ } });
      queueSet.clear();
      saver.cancel();
    };
  }, [manualId, requestedOrgId, router, setScope]);

  const save = React.useCallback(async (payload: SavePayload) => {
    const state = useHandbookBuilder.getState();
    if (!state.orgId || !state.manualId) throw new Error("The handbook is not ready to save.");
    state.setSaveStatus("saving");
    try {
      const saved = await saveHandbook(state.orgId, state.manualId, { title: payload.title, stage: payload.stage, manual: payload.manual, lockVersion: state.lockVersion });
      // A save that lands after the builder moved to another handbook must not hand it this lock version.
      if (useHandbookBuilder.getState().manualId !== state.manualId) return;
      useHandbookBuilder.getState().setLockVersion(saved.lockVersion);
      lastSaved.current = JSON.stringify(payload);
      useHandbookBuilder.getState().setSaveStatus("saved");
    } catch (cause) {
      if (cause instanceof ManualConflictError) {
        useHandbookBuilder.getState().setSaveStatus("conflict");
        push("This handbook changed in another window. Reload it before continuing.", "error");
      } else {
        useHandbookBuilder.getState().setSaveStatus("offline");
      }
      throw cause;
    }
  }, [push]);

  // Autosave every change, the same way the policy builder does.
  React.useEffect(() => {
    if (phase !== "ready" || !manual) return;
    const payload: SavePayload = { manual, title, stage: mode };
    if (JSON.stringify(payload) === lastSaved.current) return;
    if (useHandbookBuilder.getState().saveStatus === "conflict") return;
    autosave.current.schedule(payload, save);
  }, [manual, mode, phase, save, title]);

  const flush = React.useCallback(async () => {
    if (useHandbookBuilder.getState().saveStatus === "conflict") throw new Error("This handbook changed in another window. Reload it before continuing.");
    const saver = autosave.current;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const state = useHandbookBuilder.getState();
      if (!state.manual) return;
      const payload: SavePayload = { manual: state.manual, title: state.title, stage: mode };
      if (JSON.stringify(payload) !== lastSaved.current || saver.hasPending() || saver.isSaving()) {
        saver.schedule(payload, save);
        await saver.flush();
      }
      const latest = useHandbookBuilder.getState();
      if (latest.manual && JSON.stringify({ manual: latest.manual, title: latest.title, stage: mode }) === lastSaved.current && !saver.hasPending() && !saver.isSaving()) return;
    }
    throw new Error("The handbook is still changing. Wait for the save indicator, then try again.");
  }, [mode, save]);

  // Leaving the builder waits for the last save, like the policy builder.
  React.useEffect(() => {
    if (phase !== "ready") return;
    const saver = autosave.current;
    const unsaved = () => {
      const state = useHandbookBuilder.getState();
      return Boolean(state.manual) && (JSON.stringify({ manual: state.manual, title: state.title, stage: mode }) !== lastSaved.current || saver.hasPending() || saver.isSaving() || state.saveStatus === "offline" || state.saveStatus === "conflict");
    };
    const unregister = registerNavigationFlush(flush);
    const beforeUnload = (event: BeforeUnloadEvent) => { if (unsaved()) { event.preventDefault(); event.returnValue = ""; } };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname || !unsaved()) return;
      event.preventDefault();
      void flush().then(() => router.push(`${url.pathname}${url.search}${url.hash}`)).catch((cause) => push(cause instanceof Error ? cause.message : "Could not save this handbook. Stay here and retry.", "error"));
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", onClick, true); };
  }, [flush, mode, phase, push, router]);

  const generate = React.useCallback((chapterIds: string[], options: { includeFrontMatter?: boolean } = {}) => {
    const state = useHandbookBuilder.getState();
    if (!state.manual || !state.orgId || !state.manualId) return;
    const busy = new Set(Object.values(state.generation).filter((item) => item.status === "queued" || item.status === "writing").map((item) => item.sopId));
    const ids = chapterIds.filter((id) => !busy.has(id) && state.manual!.chapters.some((chapter) => chapter.id === id && chapter.enabled));
    if (!ids.length && !options.includeFrontMatter) return;
    ids.forEach((chapterId) => state.setGeneration({ sopId: chapterId, status: "queued" }));
    try {
      const entry = { handle: null as unknown as GenerationQueueHandle, sopIds: new Set(ids) };
      entry.handle = startHandbookGeneration({
        orgId: state.orgId,
        manualId: state.manualId,
        getManual: () => useHandbookBuilder.getState().manual!,
        chapterIds: ids,
        includeFrontMatter: Boolean(options.includeFrontMatter),
        concurrency: 4,
        onState: (next) => {
          if (next.status === "done") useHandbookBuilder.getState().clearGeneration(next.sopId);
          else useHandbookBuilder.getState().setGeneration(next.status === "failed" ? { ...next, error: generationError(new Error(next.error ?? "")) } : next);
          const live = Object.values(useHandbookBuilder.getState().generation).some((item) => entry.sopIds.has(item.sopId) && (item.status === "queued" || item.status === "writing"));
          if (!live) queues.current.delete(entry);
        },
        onChapterDone: (chapterId, result) => {
          const store = useHandbookBuilder.getState();
          store.updateChapter(chapterId, (chapter) => applyChapterResult(chapter, result.chapter));
          store.clearGeneration(chapterId);
        },
        onFrontMatterDone: (result) => useHandbookBuilder.getState().setManual((current) => applyHandbookFrontMatterResult(current, result.frontMatter)),
      });
      queues.current.add(entry);
    } catch (cause) {
      const message = generationError(cause);
      ids.forEach((chapterId) => useHandbookBuilder.getState().setGeneration({ sopId: chapterId, status: "failed", error: message }));
      if (ids.length) push(AI_MISSING.test(message) ? "AI writing is not available yet. Your chapters are ready to write by hand, and Retry works once it is." : `Could not start writing: ${message}`, "error");
    }
  }, [push]);

  const retry = React.useCallback((chapterId: string) => {
    const queue = [...queues.current].find((entry) => entry.sopIds.has(chapterId));
    if (queue) {
      try { useHandbookBuilder.getState().setGeneration({ sopId: chapterId, status: "queued" }); queue.handle.retry(chapterId); return; }
      catch { queues.current.delete(queue); }
    }
    useHandbookBuilder.getState().clearGeneration(chapterId);
    generate([chapterId]);
  }, [generate]);

  const cancelGeneration = React.useCallback(() => {
    queues.current.forEach((queue) => { try { queue.handle.cancel(); } catch { /* already stopped */ } });
    queues.current.clear();
    const state = useHandbookBuilder.getState();
    Object.values(state.generation).forEach((item) => { if (item.status === "queued" || item.status === "writing") state.clearGeneration(item.sopId); });
  }, []);

  const setMode = React.useCallback((next: BuilderMode) => setModeState(next), []);
  const actions = React.useMemo<HandbookBuilderActions | null>(() => (orgId ? {
    orgId,
    manualId,
    workspaceHref,
    generate,
    retry,
    cancelGeneration,
    flush,
    openDetails: () => setDetailsOpen(true),
    setMode,
  } : null), [cancelGeneration, flush, generate, manualId, orgId, retry, setMode, workspaceHref]);

  // The wizard hands over with ?generate=1 (write the new chapters) and ?cover=ai.
  const handedOver = React.useRef(false);
  React.useEffect(() => {
    if (phase !== "ready" || !actions || handedOver.current) return;
    const wantsGeneration = searchParams.get("generate") === "1";
    const wantsCover = searchParams.get("cover") === "ai";
    if (!wantsGeneration && !wantsCover) return;
    handedOver.current = true;
    const state = useHandbookBuilder.getState();
    if (wantsGeneration && state.manual) {
      const empty = state.manual.chapters.filter((chapter) => chapter.enabled && !isChapterWritten(chapter)).map((chapter) => chapter.id);
      generate(empty, { includeFrontMatter: true });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("generate");
    params.delete("cover");
    router.replace(`/documents/handbook/${encodeURIComponent(manualId)}?${params}`, { scroll: false });
  }, [actions, generate, manualId, phase, router, searchParams]);

  const deleteChapter = React.useCallback((chapterId: string) => {
    const removed = useHandbookBuilder.getState().removeChapter(chapterId);
    if (!removed) return;
    queues.current.forEach((queue) => queue.sopIds.delete(chapterId));
    setUndo({
      message: `“${removed.chapter.title || "Untitled chapter"}” deleted.`,
      restore: () => {
        const store = useHandbookBuilder.getState();
        store.restoreChapter(removed);
        store.select({ kind: "chapter", chapterId: removed.chapter.id });
      },
    });
  }, []);

  const addChapters = React.useCallback((chapters: HandbookChapter[], write: boolean) => {
    const store = useHandbookBuilder.getState();
    store.addChapters(chapters);
    if (chapters[0]) store.select({ kind: "chapter", chapterId: chapters[0].id });
    setAddOpen(false);
    if (write) generate(chapters.map((chapter) => chapter.id));
  }, [generate]);

  const download = React.useCallback(async (format: "pdf" | "docx") => {
    const state = useHandbookBuilder.getState();
    if (!state.orgId || exporting) return;
    setExporting(format);
    try {
      await flush();
      const result = await downloadSopManual(state.orgId, manualId, format, state.title);
      if (result.status === "unavailable") push("Word export for handbooks is coming soon. The PDF is ready now.", "info");
    } catch (cause) {
      push(cause instanceof Error ? cause.message : "Could not download the handbook.", "error");
    } finally {
      setExporting(null);
    }
  }, [exporting, flush, manualId, push]);

  if (phase === "loading") return <AppTransitionScreen title="Opening your employee handbook" detail="Loading the latest saved version." />;
  if (phase === "error" || !manual || !orgId) {
    return (
      <main className="pc-builder-authoring mx-auto grid min-h-screen max-w-xl content-center px-5 text-center">
        <h1 className="font-display text-2xl font-semibold">Handbook unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]" role="alert">{error}</p>
        <Link href={workspaceHref} className="mx-auto mt-5 inline-flex min-h-10 items-center rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-[var(--pc-primary-text)] hover:bg-[var(--color-forest-deep)]">Return to documents</Link>
      </main>
    );
  }

  return (
    <HandbookBuilderContext.Provider value={actions!}>
      <HandbookBody
        mode={mode}
        selection={selection}
        saveStatus={saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "conflict" ? "Conflict" : saveStatus === "offline" ? "Offline" : ""}
        exporting={exporting}
        onDownload={(format) => void download(format)}
        onAddChapter={() => setAddOpen(true)}
        onDeleteChapter={deleteChapter}
        coverRequested={coverRequested}
        onCoverStarted={() => setCoverRequested(false)}
      />
      <AddChapterModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addChapters} />
      <HandbookDetailsModal open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <UndoToast message={undo?.message ?? null} onUndo={() => { undo?.restore(); setUndo(null); }} onDismiss={() => setUndo(null)} />
    </HandbookBuilderContext.Provider>
  );
}

function headingFor(manual: HandbookManual, selection: HandbookRailSelection, select: (selection: HandbookRailSelection) => void): WriteHeading {
  const order = chapterOrder(manual);
  const items: { selection: HandbookRailSelection; label: string }[] = [
    { selection: { kind: "front" }, label: "Opening pages" },
    ...order.map((chapter) => ({ selection: { kind: "chapter", chapterId: chapter.id } as HandbookRailSelection, label: chapter.title || "Untitled chapter" })),
    { selection: { kind: "closing" }, label: "Closing and acknowledgement" },
  ];
  const index = Math.max(0, items.findIndex((item) => (item.selection.kind === "chapter" ? selection.kind === "chapter" && item.selection.chapterId === selection.chapterId : item.selection.kind === selection.kind)));
  const prev = items[index - 1];
  const next = items[index + 1];
  const nav = { prev: prev ? { label: `Back: ${prev.label}`, onSelect: () => select(prev.selection) } : undefined, next: next ? { label: next.label, onSelect: () => select(next.selection) } : undefined };
  if (selection.kind === "front") return { title: "Opening pages", subtitle: "Welcome, about the company, vision, values, sites and how to use the handbook.", position: "Before the chapters", ...nav };
  if (selection.kind === "closing") return { title: "Closing and acknowledgement", subtitle: "Review mechanism, revision history, the approval page and the employee acknowledgement.", position: "After the chapters", ...nav };
  const chapter = order.find((item) => item.id === selection.chapterId);
  const position = chapter ? order.indexOf(chapter) + 1 : 0;
  return {
    title: chapter?.title || "Untitled chapter",
    position: `Chapter ${position} of ${order.length}`,
    ...nav,
  };
}

/** Design's Layout panel for a handbook: how chapters are grouped. */
function HandbookLayoutPanel() {
  const manual = useHandbookBuilder((state) => state.manual!);
  const setManual = useHandbookBuilder((state) => state.setManual);
  return (
    <>
      <Group title="Group chapters by">
        <Segmented<HandbookManual["grouping"]> label="Group chapters by" value={manual.grouping} onChange={(grouping) => setManual((current) => ({ ...current, grouping }))} options={[{ value: "part", label: "By part" }, { value: "none", label: "None" }]} />
        <p className={studio.muted}>{manual.grouping === "part" ? "Chapters under their handbook part, in part order." : "One list of chapters in outline order."}</p>
      </Group>
    </>
  );
}

/** Design mode for a handbook: the shared studio with the handbook layout options, beside the whole handbook. */
function HandbookDesignMode({ mobile, onClose, aiCover }: { mobile: boolean; onClose: () => void; aiCover: ReturnType<typeof useAiCover> }) {
  const manual = useHandbookBuilder((state) => state.manual!);
  const setManual = useHandbookBuilder((state) => state.setManual);
  const { orgId, manualId } = useHandbookBuilderActions();
  return (
    <ManualDesignStudio
      kind="handbook"
      mobile={mobile}
      onClose={onClose}
      aiCover={aiCover}
      orgId={orgId}
      manual={manual}
      setManual={setManual as unknown as Parameters<typeof ManualDesignStudio>[0]["setManual"]}
      layout={<HandbookLayoutPanel />}
      label="Handbook"
      preview={<SopPdfPreview orgId={orgId} manualId={manualId} manual={manual} debounceMs={800} itemLabel="chapter" documentLabel="handbook" />}
    />
  );
}

function HandbookBody({ mode, selection, saveStatus, exporting, onDownload, onAddChapter, onDeleteChapter, coverRequested, onCoverStarted }: {
  mode: BuilderMode;
  selection: HandbookRailSelection;
  saveStatus: string;
  exporting: "pdf" | "docx" | null;
  onDownload: (format: "pdf" | "docx") => void;
  onAddChapter: () => void;
  onDeleteChapter: (chapterId: string) => void;
  coverRequested: boolean;
  onCoverStarted: () => void;
}) {
  const narrow = useNarrowViewport();
  const manual = useHandbookBuilder((state) => state.manual!);
  const select = useHandbookBuilder((state) => state.select);
  const conflict = useHandbookBuilder((state) => state.saveStatus === "conflict");
  const { orgId, manualId, setMode, workspaceHref, openDetails } = useHandbookBuilderActions();
  const aiCover = useAiCover({ orgId, manualId, getManual: getHandbookManual, applyCover: applyHandbookCover });
  const chapter = selection.kind === "chapter" ? manual.chapters.find((item) => item.id === selection.chapterId) ?? null : null;
  const progress = handbookProgress(manual);
  const title = useHandbookBuilder((state) => state.title);
  // The AI cover the wizard asked for is drawn once the builder is open.
  const generateCover = aiCover.generate;
  React.useEffect(() => {
    if (!coverRequested) return;
    onCoverStarted();
    void generateCover();
  }, [coverRequested, generateCover, onCoverStarted]);

  const heading = headingFor(manual, selection, select);
  return (
    <BuilderFrame
      mode={mode}
      saveStatus={saveStatus || null}
      heading={heading}
      exporting={exporting}
      onDownload={onDownload}
      workspaceHref={workspaceHref}
      setMode={setMode}
      openDetails={openDetails}
      title={title}
      documentLabel="Employee handbook"
      selectionKey={selection.kind === "chapter" ? handbookSelectionKey(selection) : selection.kind}
      progress={progress}
      kindIcon={<BookUser size={15} aria-hidden="true" />}
      railSummary={<HandbookSummary title={manual.company.name || title || "Employee handbook"} />}
      rail={<HandbookRail onAddChapter={onAddChapter} onDeleteChapter={onDeleteChapter} />}
      railMini={<HandbookRailMini />}
      progressPill={<HandbookProgressPill />}
      design={<HandbookDesignMode mobile={narrow} onClose={() => setMode("write")} aiCover={aiCover} />}
      review={<HandbookReviewMode />}
      preview={<SopPdfPreview orgId={orgId} manualId={manualId} manual={manual} sopId={chapter?.id} itemLabel="chapter" documentLabel="handbook" />}
    >
      {conflict ? (
        <div className={styles.conflict} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>This handbook changed in another window. Your latest edits are not saved. Reload to continue from the newest version.</span>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} aria-hidden="true" />} onClick={() => window.location.reload()}>Reload</Button>
        </div>
      ) : null}
      <div key={selection.kind === "chapter" ? selection.chapterId : selection.kind}>
        {selection.kind === "front" ? <OpeningWriter /> : selection.kind === "closing" ? <ClosingWriter /> : chapter ? <ChapterWriter chapter={chapter} /> : <p className={styles.emptyWrite}>Choose a chapter in the outline, or add one.</p>}
      </div>
    </BuilderFrame>
  );
}

