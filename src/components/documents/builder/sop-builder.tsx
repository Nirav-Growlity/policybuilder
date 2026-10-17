"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createDraftAutosave } from "@/lib/policycraft-autosave";
import { registerNavigationFlush } from "@/lib/policycraft-navigation-flush";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { startManualGeneration, type GenerationQueueHandle } from "@/lib/sop/ai-client";
import { downloadSopManual, fetchAccess, getSopManual, ManualConflictError, saveSopManual } from "@/lib/sop/client-api";
import { useSopBuilder, type RailSelection } from "@/lib/sop/store";
import type { Sop, SopManual } from "@/lib/sop/types";
import { isSopWritten, mergeGeneratedSections, outlineOrder } from "../manual-helpers";
import { SopBuilderContext, type BuilderMode, type SopBuilderActions } from "./builder-context";
import { AddSopModal, ManualDetailsModal, UndoToast } from "./builder-dialogs";
import { DesignMode, useAiCover } from "./design-mode";
import { ClosingWriter, FrontMatterWriter } from "./manual-part-writers";
import { ReviewMode } from "./review-mode";
import { SopBuilderShell, useNarrowViewport, type WriteHeading } from "./sop-builder-shell";
import { SopPdfPreview } from "./sop-pdf-preview";
import { SopWriter } from "./sop-writer";
import styles from "./builder.module.css";

type SavePayload = { manual: SopManual; title: string; stage: BuilderMode };
const MODES: readonly BuilderMode[] = ["write", "design", "review"];
const AI_MISSING = /not wired up/i;

function generationError(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "AI writing failed.";
  return AI_MISSING.test(message) ? "SOP AI is not wired up yet." : message;
}

export function SopBuilder({ manualId }: { manualId: string }) {
  const searchParams = useSearchParams();
  const requestedOrgId = Number(searchParams.get("orgId")) || null;
  return (
    <ApplicationSurface className="h-dvh overflow-hidden">
      <SopBuilderWorkspace key={`${manualId}:${requestedOrgId ?? "auto"}`} manualId={manualId} requestedOrgId={requestedOrgId} />
    </ApplicationSurface>
  );
}

function SopBuilderWorkspace({ manualId, requestedOrgId }: { manualId: string; requestedOrgId: number | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { push } = useToast();
  const setScope = usePolicyCraftScope((state) => state.setScope);
  const manual = useSopBuilder((state) => state.manual);
  const title = useSopBuilder((state) => state.title);
  const selection = useSopBuilder((state) => state.selection);
  const saveStatus = useSopBuilder((state) => state.saveStatus);
  const orgId = useSopBuilder((state) => state.orgId);
  const narrow = useNarrowViewport();

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

  // Load the manual and bind the organization scope (logo and cover URLs read it).
  React.useEffect(() => {
    let active = true;
    // A fresh saver per mount: cleanup cancels the previous one for good, and
    // React mounts effects twice in development.
    autosave.current = createDraftAutosave<SavePayload>();
    const store = useSopBuilder.getState();
    store.reset();
    async function load() {
      try {
        const access = await fetchAccess();
        const stored = await getSopManual(requestedOrgId, manualId);
        const organizationId = stored.organization?.id ?? requestedOrgId;
        const organization = access.organizations.find((item) => item.id === organizationId);
        if (!organizationId || !organization) throw new Error("This manual’s organization is not assigned to your account.");
        if (!active) return;
        setScope({ userId: access.actor.id, role: access.actor.role, organizationId, organizationName: organization.name, documentId: stored.id });
        setWorkspaceHref(`/documents?orgId=${organizationId}`);
        useSopBuilder.getState().load(stored, organizationId);
        lastSaved.current = JSON.stringify({ manual: stored.manual, title: stored.title, stage: MODES.includes(stored.currentStage as BuilderMode) ? stored.currentStage : "write" });
        setModeState(MODES.includes(stored.currentStage as BuilderMode) ? stored.currentStage as BuilderMode : "write");
        // The wizard asks for an AI cover with ?cover=ai; it is drawn once the builder is open.
        if (new URLSearchParams(window.location.search).get("cover") === "ai") setCoverRequested(true);
        setPhase("ready");
      } catch (cause) {
        if (cause instanceof Error && "status" in cause && (cause as { status: number }).status === 401) {
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        if (active) { setError(cause instanceof Error ? cause.message : "Could not open this manual."); setPhase("error"); }
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
    const state = useSopBuilder.getState();
    if (!state.orgId || !state.manualId) throw new Error("The manual is not ready to save.");
    state.setSaveStatus("saving");
    try {
      const saved = await saveSopManual(state.orgId, state.manualId, { title: payload.title, stage: payload.stage, manual: payload.manual, lockVersion: state.lockVersion });
      useSopBuilder.getState().setLockVersion(saved.lockVersion);
      lastSaved.current = JSON.stringify(payload);
      useSopBuilder.getState().setSaveStatus("saved");
    } catch (cause) {
      if (cause instanceof ManualConflictError) {
        useSopBuilder.getState().setSaveStatus("conflict");
        push("This manual changed in another window. Reload it before continuing.", "error");
      } else {
        useSopBuilder.getState().setSaveStatus("offline");
      }
      throw cause;
    }
  }, [push]);

  // Autosave every change, the same way the policy builder does.
  React.useEffect(() => {
    if (phase !== "ready" || !manual) return;
    const payload: SavePayload = { manual, title, stage: mode };
    if (JSON.stringify(payload) === lastSaved.current) return;
    if (useSopBuilder.getState().saveStatus === "conflict") return;
    autosave.current.schedule(payload, save);
  }, [manual, mode, phase, save, title]);

  const flush = React.useCallback(async () => {
    if (useSopBuilder.getState().saveStatus === "conflict") throw new Error("This manual changed in another window. Reload it before continuing.");
    const saver = autosave.current;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const state = useSopBuilder.getState();
      if (!state.manual) return;
      const payload: SavePayload = { manual: state.manual, title: state.title, stage: mode };
      if (JSON.stringify(payload) !== lastSaved.current || saver.hasPending() || saver.isSaving()) {
        saver.schedule(payload, save);
        await saver.flush();
      }
      const latest = useSopBuilder.getState();
      if (latest.manual && JSON.stringify({ manual: latest.manual, title: latest.title, stage: mode }) === lastSaved.current && !saver.hasPending() && !saver.isSaving()) return;
    }
    throw new Error("The manual is still changing. Wait for the save indicator, then try again.");
  }, [mode, save]);

  // Leaving the builder waits for the last save, like the policy builder.
  React.useEffect(() => {
    if (phase !== "ready") return;
    const saver = autosave.current;
    const unsaved = () => {
      const state = useSopBuilder.getState();
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
      void flush().then(() => router.push(`${url.pathname}${url.search}${url.hash}`)).catch((cause) => push(cause instanceof Error ? cause.message : "Could not save this manual. Stay here and retry.", "error"));
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => { unregister(); window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", onClick, true); };
  }, [flush, mode, phase, push, router]);

  const generate = React.useCallback((sopIds: string[], options: { includeFrontMatter?: boolean } = {}) => {
    const state = useSopBuilder.getState();
    if (!state.manual || !state.orgId || !state.manualId) return;
    const busy = new Set(Object.values(state.generation).filter((item) => item.status === "queued" || item.status === "writing").map((item) => item.sopId));
    const ids = sopIds.filter((id) => !busy.has(id) && state.manual!.sops.some((sop) => sop.id === id && sop.enabled));
    if (!ids.length && !options.includeFrontMatter) return;
    ids.forEach((sopId) => state.setGeneration({ sopId, status: "queued" }));
    try {
      const entry = { handle: null as unknown as GenerationQueueHandle, sopIds: new Set(ids) };
      entry.handle = startManualGeneration({
        orgId: state.orgId,
        manualId: state.manualId,
        getManual: () => useSopBuilder.getState().manual!,
        sopIds: ids,
        includeFrontMatter: Boolean(options.includeFrontMatter),
        concurrency: 4,
        onState: (next) => {
          if (next.status === "done") useSopBuilder.getState().clearGeneration(next.sopId);
          else useSopBuilder.getState().setGeneration(next.status === "failed" ? { ...next, error: generationError(new Error(next.error ?? "")) } : next);
          const live = Object.values(useSopBuilder.getState().generation).some((item) => entry.sopIds.has(item.sopId) && (item.status === "queued" || item.status === "writing"));
          if (!live) queues.current.delete(entry);
        },
        onSopDone: (sopId, result) => {
          const store = useSopBuilder.getState();
          store.updateSop(sopId, (sop) => ({
            ...sop,
            status: "draft",
            department: sop.department || result.sop.department || "",
            owner: sop.owner || result.sop.owner || "",
            sections: mergeGeneratedSections(sop.sections, result.sop.sections),
          }));
          store.clearGeneration(sopId);
        },
        onFrontMatterDone: (result) => useSopBuilder.getState().setManual((current) => ({ ...current, frontMatter: { ...current.frontMatter, ...result.frontMatter } })),
      });
      queues.current.add(entry);
    } catch (cause) {
      const message = generationError(cause);
      ids.forEach((sopId) => useSopBuilder.getState().setGeneration({ sopId, status: "failed", error: message }));
      if (ids.length) push(AI_MISSING.test(message) ? "AI writing is not available yet. Your SOPs are ready to write by hand, and Retry works once it is." : `Could not start writing: ${message}`, "error");
    }
  }, [push]);

  const retry = React.useCallback((sopId: string) => {
    const queue = [...queues.current].find((entry) => entry.sopIds.has(sopId));
    if (queue) {
      try { useSopBuilder.getState().setGeneration({ sopId, status: "queued" }); queue.handle.retry(sopId); return; }
      catch { queues.current.delete(queue); }
    }
    useSopBuilder.getState().clearGeneration(sopId);
    generate([sopId]);
  }, [generate]);

  const cancelGeneration = React.useCallback(() => {
    queues.current.forEach((queue) => { try { queue.handle.cancel(); } catch { /* already stopped */ } });
    queues.current.clear();
    const state = useSopBuilder.getState();
    Object.values(state.generation).forEach((item) => { if (item.status === "queued" || item.status === "writing") state.clearGeneration(item.sopId); });
  }, []);

  const setMode = React.useCallback((next: BuilderMode) => setModeState(next), []);
  const actions = React.useMemo<SopBuilderActions | null>(() => (orgId ? {
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

  // The wizard hands over with ?generate=1 (write the new SOPs) and ?cover=ai.
  const handedOver = React.useRef(false);
  React.useEffect(() => {
    if (phase !== "ready" || !actions || handedOver.current) return;
    const wantsGeneration = searchParams.get("generate") === "1";
    const wantsCover = searchParams.get("cover") === "ai";
    if (!wantsGeneration && !wantsCover) return;
    handedOver.current = true;
    const state = useSopBuilder.getState();
    if (wantsGeneration && state.manual) {
      const empty = state.manual.sops.filter((sop) => sop.enabled && !isSopWritten(sop)).map((sop) => sop.id);
      generate(empty, { includeFrontMatter: true });
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete("generate");
    params.delete("cover");
    router.replace(`/documents/sop/${encodeURIComponent(manualId)}?${params}`, { scroll: false });
  }, [actions, generate, manualId, phase, router, searchParams]);

  const deleteSop = React.useCallback((sopId: string) => {
    const removed = useSopBuilder.getState().removeSop(sopId);
    if (!removed) return;
    queues.current.forEach((queue) => queue.sopIds.delete(sopId));
    setUndo({ message: `“${removed.sop.title || "Untitled SOP"}” deleted.`, restore: () => { useSopBuilder.getState().restoreSop(removed); useSopBuilder.getState().select({ kind: "sop", sopId: removed.sop.id }); } });
  }, []);

  const addSops = React.useCallback((sops: Sop[], write: boolean) => {
    const store = useSopBuilder.getState();
    store.addSops(sops);
    if (sops[0]) store.select({ kind: "sop", sopId: sops[0].id });
    setAddOpen(false);
    if (write) generate(sops.map((sop) => sop.id));
  }, [generate]);

  const download = React.useCallback(async (format: "pdf" | "docx") => {
    const state = useSopBuilder.getState();
    if (!state.orgId || exporting) return;
    setExporting(format);
    try {
      await flush();
      const result = await downloadSopManual(state.orgId, manualId, format, state.title);
      if (result.status === "unavailable") push("Word export for SOP manuals is coming soon. The PDF is ready now.", "info");
    } catch (cause) {
      push(cause instanceof Error ? cause.message : "Could not download the manual.", "error");
    } finally {
      setExporting(null);
    }
  }, [exporting, flush, manualId, push]);

  if (phase === "loading") return <AppTransitionScreen title="Opening your SOP manual" detail="Loading the latest saved version." />;
  if (phase === "error" || !manual || !orgId) {
    return (
      <main className="pc-builder-authoring mx-auto grid min-h-screen max-w-xl content-center px-5 text-center">
        <h1 className="font-display text-2xl font-semibold">Manual unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]" role="alert">{error}</p>
        <Link href={workspaceHref} className="mx-auto mt-5 inline-flex min-h-10 items-center rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-[var(--pc-primary-text)] hover:bg-[var(--color-forest-deep)]">Return to documents</Link>
      </main>
    );
  }

  return (
    <SopBuilderContext.Provider value={actions!}>
      <BuilderBody
        mode={mode}
        narrow={narrow}
        selection={selection}
        saveStatus={saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "conflict" ? "Conflict" : saveStatus === "offline" ? "Offline" : ""}
        exporting={exporting}
        onDownload={(format) => void download(format)}
        onAddSop={() => setAddOpen(true)}
        onDeleteSop={deleteSop}
        coverRequested={coverRequested}
        onCoverStarted={() => setCoverRequested(false)}
      />
      <AddSopModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addSops} />
      <ManualDetailsModal open={detailsOpen} onClose={() => setDetailsOpen(false)} />
      <UndoToast message={undo?.message ?? null} onUndo={() => { undo?.restore(); setUndo(null); }} onDismiss={() => setUndo(null)} />
    </SopBuilderContext.Provider>
  );
}

function headingFor(manual: SopManual, selection: RailSelection, select: (selection: RailSelection) => void): WriteHeading {
  const order = outlineOrder(manual);
  const items: { selection: RailSelection; label: string }[] = [
    { selection: { kind: "front" }, label: "Front matter" },
    ...order.map((sop) => ({ selection: { kind: "sop", sopId: sop.id } as RailSelection, label: sop.title || "Untitled SOP" })),
    { selection: { kind: "closing" }, label: "Closing" },
  ];
  const index = Math.max(0, items.findIndex((item) => (item.selection.kind === "sop" ? selection.kind === "sop" && item.selection.sopId === selection.sopId : item.selection.kind === selection.kind)));
  const prev = items[index - 1];
  const next = items[index + 1];
  const nav = { prev: prev ? { label: `Back: ${prev.label}`, onSelect: () => select(prev.selection) } : undefined, next: next ? { label: next.label, onSelect: () => select(next.selection) } : undefined };
  if (selection.kind === "front") return { title: "Front matter", subtitle: "Introduction, objective, sites, core values and how to use the manual.", position: "Before the SOPs", ...nav };
  if (selection.kind === "closing") return { title: "Closing and approval", subtitle: "Review mechanism, revision history and the approval page.", position: "After the SOPs", ...nav };
  const sop = order.find((item) => item.id === selection.sopId);
  const position = sop ? order.indexOf(sop) + 1 : 0;
  return {
    title: sop?.title || "Untitled SOP",
    position: `SOP ${position} of ${order.length}`,
    ...nav,
  };
}

function BuilderBody({ mode, narrow, selection, saveStatus, exporting, onDownload, onAddSop, onDeleteSop, coverRequested, onCoverStarted }: {
  mode: BuilderMode;
  narrow: boolean;
  selection: RailSelection;
  saveStatus: string;
  exporting: "pdf" | "docx" | null;
  onDownload: (format: "pdf" | "docx") => void;
  onAddSop: () => void;
  onDeleteSop: (sopId: string) => void;
  coverRequested: boolean;
  onCoverStarted: () => void;
}) {
  const manual = useSopBuilder((state) => state.manual!);
  const select = useSopBuilder((state) => state.select);
  const conflict = useSopBuilder((state) => state.saveStatus === "conflict");
  const { orgId, manualId, setMode } = React.useContext(SopBuilderContext)!;
  const aiCover = useAiCover();
  const sop = selection.kind === "sop" ? manual.sops.find((item) => item.id === selection.sopId) ?? null : null;

  // The AI cover the wizard asked for is drawn once the builder is open.
  const generateCover = aiCover.generate;
  React.useEffect(() => {
    if (!coverRequested) return;
    onCoverStarted();
    void generateCover();
  }, [coverRequested, generateCover, onCoverStarted]);

  const heading = headingFor(manual, selection, select);
  return (
    <SopBuilderShell
      mode={mode}
      saveStatus={saveStatus || null}
      heading={heading}
      exporting={exporting}
      onDownload={onDownload}
      onAddSop={onAddSop}
      onDeleteSop={onDeleteSop}
      design={<DesignMode mobile={narrow} onClose={() => setMode("write")} aiCover={aiCover} />}
      review={<ReviewMode />}
      preview={<SopPdfPreview orgId={orgId} manualId={manualId} manual={manual} sopId={sop?.id} />}
    >
      {conflict ? (
        <div className={styles.conflict} role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>This manual changed in another window. Your latest edits are not saved. Reload to continue from the newest version.</span>
          <Button variant="secondary" size="sm" icon={<RefreshCw size={13} aria-hidden="true" />} onClick={() => window.location.reload()}>Reload</Button>
        </div>
      ) : null}
      <div key={selection.kind === "sop" ? selection.sopId : selection.kind}>
        {selection.kind === "front" ? <FrontMatterWriter /> : selection.kind === "closing" ? <ClosingWriter /> : sop ? <SopWriter sop={sop} /> : <p className={styles.emptyWrite}>Choose an SOP in the outline, or add one.</p>}
      </div>
    </SopBuilderShell>
  );
}
