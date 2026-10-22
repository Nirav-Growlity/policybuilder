"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ArchiveRestore, ArrowRight, BookOpen, Building2, Check, FileText, House, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { SelectMenu } from "@/components/ui/select-menu";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { DelayedLoading, ListFooter, ListRegion, useProgressiveList } from "@/components/workspace/workspace-list";
import { SelectionPill, TiltCover, useRecordMotion, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { getSopManual, listSopManuals, saveSopManual, setSopManualArchived, deleteSopManual, type ManualSummary, type ManualView } from "@/lib/sop/client-api";
import { DEFAULT_SOP_TEMPLATE_ID, SOP_TEMPLATE_IDS } from "@/lib/sop/types";
import { manualSummaryLine } from "./manual-helpers";
import { DocumentTypeChooser } from "./document-type-chooser";
import styles from "@/app/dashboard/page.module.css";
import hub from "./documents-hub.module.css";

type TypeFilter = "all" | "sop" | "handbook";

const TYPE_LABEL: Record<ManualSummary["kind"], string> = { sop: "SOP manuals", handbook: "Employee handbooks" };

function templateCover(templateId: string | null) {
  const id = templateId && (SOP_TEMPLATE_IDS as readonly string[]).includes(templateId) ? templateId : DEFAULT_SOP_TEMPLATE_ID;
  return `/sop-templates/${id}/cover.webp`;
}

export function DocumentsHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { access } = usePolicyCraftWorkspace();
  const role = access.actor.role;
  const organizations = React.useMemo(
    () => access.organizations.filter((organization) => !organization.deleted && (role === "admin" || !organization.expired)),
    [access.organizations, role],
  );
  const requestedOrgId = Number(searchParams.get("orgId")) || null;
  const organization = organizations.find((item) => item.id === requestedOrgId) ?? organizations[0] ?? null;
  const orgId = organization?.id ?? null;

  const [view, setView] = React.useState<ManualView>("active");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [manuals, setManuals] = React.useState<ManualSummary[]>([]);
  const [loadedView, setLoadedView] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<ManualSummary | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ManualSummary | null>(null);
  const [now, setNow] = React.useState(() => Date.now());

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    if (!orgId) { setManuals([]); setLoading(false); return; }
    try {
      const next = await listSopManuals(orgId, view);
      setManuals(next);
      setLoadedView(`${orgId}:${view}`);
      setNow(Date.now());
    } catch (cause) {
      if (cause instanceof Error && "status" in cause && (cause as { status: number }).status === 401) {
        router.replace("/login?next=/documents");
        return;
      }
      setError("Could not load your documents.");
    } finally {
      setLoading(false);
    }
  }, [orgId, router, view]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  React.useEffect(() => {
    if (!renameTarget) return;
    const frame = window.requestAnimationFrame(() => window.document.getElementById("rename-manual-input")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [renameTarget]);

  const newManualHref = orgId ? `/documents/sop/new?orgId=${orgId}` : "#";
  const resumeHref = (manual: ManualSummary) => `/documents/sop/${encodeURIComponent(manual.id)}?orgId=${manual.organization?.id || orgId || ""}`;

  async function setArchived(manual: ManualSummary, archived: boolean) {
    if (actionId || !orgId) return;
    setActionId(manual.id);
    setError("");
    try {
      await setSopManualArchived(manual.organization?.id || orgId, manual.id, archived);
      await load();
    } catch {
      setError(archived ? "Could not archive that manual." : "Could not restore that manual.");
    } finally {
      setActionId(null);
    }
  }

  async function confirmDelete() {
    const manual = deleteTarget;
    if (!manual || actionId || !orgId) return;
    setActionId(manual.id);
    setError("");
    try {
      await deleteSopManual(manual.organization?.id || orgId, manual.id);
      setDeleteTarget(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete that manual.");
    } finally {
      setActionId(null);
    }
  }

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const manual = renameTarget;
    const title = renameTitle.trim();
    if (!manual || !title || renaming || !orgId) return;
    setRenaming(true);
    setError("");
    try {
      // The save route takes the whole manual, so rename loads the latest copy first.
      const scopeId = manual.organization?.id || orgId;
      const stored = await getSopManual(scopeId, manual.id);
      await saveSopManual(scopeId, manual.id, { title, stage: stored.currentStage, manual: stored.manual, lockVersion: stored.lockVersion });
      setRenameTarget(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error && cause.name === "ManualConflictError" ? "That manual changed in another window. Refresh and try again." : "Could not rename that manual.");
    } finally {
      setRenaming(false);
    }
  }

  const isArchived = view === "archived";
  const filtered = typeFilter === "all" ? manuals : manuals.filter((manual) => manual.kind === typeFilter);
  const pager = useProgressiveList(filtered, `${loadedView}|${typeFilter}`);
  const visibleIds = new Set(pager.visible.map((manual) => manual.id));
  const groups = (["sop", "handbook"] as const)
    .map((kind) => ({ kind, manuals: filtered.filter((manual) => manual.kind === kind && visibleIds.has(manual.id)) }))
    .filter((group) => group.manuals.length > 0);
  const recordMotion = useRecordMotion();
  const waiting = loading && manuals.length === 0;
  const totalSops = manuals.reduce((sum, manual) => sum + manual.partCount, 0);
  const latestUpdate = manuals.reduce<Date | null>((latest, manual) => {
    const updated = new Date(manual.updatedAt);
    return Number.isNaN(updated.valueOf()) || (latest && latest >= updated) ? latest : updated;
  }, null);

  return (
    <ApplicationSurface data-pc-workspace="documents" className={styles.surface}>
      <section className={styles.page} aria-labelledby="documents-page-title">
        <WorkspaceHero
          titleId="documents-page-title"
          eyebrow={organization?.name || "No organization assigned"}
          eyebrowIcon={<Building2 size={14} />}
          title="Your documents"
          description="SOP manuals for your organization. Employee handbooks are on the way."
          stats={[
            { label: isArchived ? "Archived documents" : "Active documents", value: waiting ? null : manuals.length },
            { label: "SOPs across manuals", value: waiting ? null : totalSops },
            { label: "Last edited", value: waiting ? null : latestUpdate ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(latestUpdate) : "–" },
          ]}
          actions={<>
            <Link href="/" className={styles.homeLink}><House size={15} aria-hidden="true" />Home</Link>
            <button type="button" onClick={() => setChooserOpen(true)} disabled={!orgId} className={`${styles.newPolicy} ${orgId ? "" : styles.newPolicyDisabled}`}><Plus size={16} aria-hidden="true" />New document</button>
          </>}
        />

        <WorkspaceSheet className={styles.sheet}>
          <section className={styles.toolbar} aria-label="Document controls">
            <div className={styles.viewSegments} role="tablist" aria-label="Document views">
              <button type="button" role="tab" aria-selected={!isArchived} onClick={() => setView("active")} className={`${styles.segment} ${!isArchived ? styles.segmentSelected : ""}`}>{!isArchived ? <SelectionPill layoutId="documents-view" /> : null}<FileText size={15} aria-hidden="true" />Active</button>
              <button type="button" role="tab" aria-selected={isArchived} onClick={() => setView("archived")} className={`${styles.segment} ${isArchived ? styles.segmentSelected : ""}`}>{isArchived ? <SelectionPill layoutId="documents-view" /> : null}<Archive size={15} aria-hidden="true" />Archived</button>
            </div>
            <div className={hub.toolbarEnd}>
              <div className={styles.filters} role="group" aria-label="Filter documents by type">
                {(["all", "sop", "handbook"] as const).map((filter) => {
                  const count = filter === "all" ? manuals.length : manuals.filter((manual) => manual.kind === filter).length;
                  const selected = typeFilter === filter;
                  return <button key={filter} type="button" aria-pressed={selected} onClick={() => setTypeFilter(filter)} className={`${styles.filter} ${selected ? styles.filterSelected : ""}`}>{selected ? <SelectionPill layoutId="documents-filter" className={styles.filterPill} /> : null}{filter === "all" ? "All" : TYPE_LABEL[filter]} <span>{count}</span></button>;
                })}
              </div>
              {organizations.length > 1 ? (
                <SelectMenu
                  size="compact"
                  className={hub.orgPicker}
                  value={String(orgId ?? "")}
                  onValueChange={(value) => router.replace(`/documents?orgId=${value}`)}
                  options={organizations.map((item) => ({ value: String(item.id), label: item.name, description: item.code }))}
                  aria-label="Organization"
                />
              ) : null}
            </div>
          </section>

          <div className={styles.sheetBody}>
            <AnimatePresence>
              {error && !renameTarget && !deleteTarget ? <motion.div key="error" role="alert" className={styles.alert} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><span>{error}</span><button type="button" onClick={() => void load()} aria-label="Refresh documents" className={styles.iconButton}><RefreshCw size={16} aria-hidden="true" /></button></motion.div> : null}
            </AnimatePresence>

            {waiting ? (
              <DelayedLoading label="Loading documents…"><div className={styles.loadingRecords}>
                <div className={styles.loading} role="status" aria-live="polite" aria-busy="true"><Loader2 className={styles.spinner} size={20} aria-hidden="true" /><span>Loading documents…</span></div>
                <RecordSkeleton />
              </div></DelayedLoading>
            ) : error && manuals.length === 0 ? null : <ListRegion busy={loading} contentKey={loadedView || ""}>{filtered.length === 0 ? (
              <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: WS_EASE }}>
                <motion.span className={styles.emptyIcon} initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}>
                  {isArchived ? <Archive size={24} aria-hidden="true" /> : <BookOpen size={24} aria-hidden="true" />}
                </motion.span>
                <h2>{isArchived ? "No archived documents" : typeFilter === "handbook" ? "Employee handbooks are coming soon" : "Create your first SOP manual"}</h2>
                <p>{isArchived ? "Archived documents will appear here." : typeFilter === "handbook" ? "SOP manuals are ready to build today." : "Pick the procedures your teams follow and PolicyCraft writes each one, ready to review and export."}</p>
                {!isArchived && typeFilter !== "handbook" && orgId ? <Link href={newManualHref} className={`${styles.newPolicy} ${hub.emptyAction}`}><Plus size={16} aria-hidden="true" />New SOP manual</Link> : null}
              </motion.div>
            ) : (
              <div className={styles.groups}>
                {groups.map(({ kind, manuals: groupManuals }) => (
                  <section key={kind} aria-labelledby={`documents-${kind}`}>
                    <div className={styles.groupHeading}>
                      <h2 id={`documents-${kind}`} className={styles.groupTitle}>{TYPE_LABEL[kind]}</h2>
                      <span className={styles.groupCount}>{groupManuals.length} {groupManuals.length === 1 ? "document" : "documents"}</span>
                    </div>
                    <div className={styles.recordList}>
                      <AnimatePresence>
                        {groupManuals.map((manual, index) => (
                          <motion.article key={manual.id} className={styles.record} data-ws-row="" {...recordMotion(index)}>
                            <TiltCover label={`Cover preview for ${manual.title}`} className={styles.coverThumbnail} coverKey={`${manual.id}:${manual.templateId}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={templateCover(manual.templateId)} alt="" className={hub.coverImage} loading="lazy" />
                            </TiltCover>
                            <div className={styles.recordBody}>
                              <h3 className={styles.recordTitle}>{manual.title}</h3>
                              <p className={styles.recordMeta}><span className={styles.stepChip}>{manual.kind === "sop" ? "SOP manual" : "Handbook"}</span><span>{manualSummaryLine(manual, now)}</span></p>
                              {!isArchived ? <Link href={resumeHref(manual)} className={styles.resumeLink}>Resume<ArrowRight size={15} aria-hidden="true" /></Link> : <p className={styles.archivedLabel}><Archive size={14} aria-hidden="true" /> Archived</p>}
                            </div>
                            <div className={styles.recordActions}>
                              {!isArchived ? <button type="button" title="Rename manual" onClick={() => { setRenameTarget(manual); setRenameTitle(manual.title); setError(""); }} className={styles.textAction}><Pencil size={14} aria-hidden="true" /> Rename</button> : null}
                              <button type="button" title={isArchived ? "Restore manual" : "Archive manual"} onClick={() => void setArchived(manual, !isArchived)} disabled={actionId === manual.id} className={styles.textAction}>
                                {actionId === manual.id ? <Loader2 size={15} className={styles.spinner} aria-hidden="true" /> : isArchived ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
                                {isArchived ? "Restore" : "Archive"}
                              </button>
                              {isArchived ? <button type="button" title="Delete archived manual" onClick={() => setDeleteTarget(manual)} disabled={actionId === manual.id} className={`${styles.textAction} ${styles.dangerAction}`}><Trash2 size={14} aria-hidden="true" /> Delete</button> : null}
                            </div>
                          </motion.article>
                        ))}
                      </AnimatePresence>
                    </div>
                  </section>
                ))}
                <ListFooter shown={pager.shown} total={pager.total} hasMore={pager.hasMore} onMore={pager.showMore} noun="documents" />
              </div>
            )}</ListRegion>}
          </div>
        </WorkspaceSheet>
      </section>

      <DocumentTypeChooser open={chooserOpen} onClose={() => setChooserOpen(false)} onChoose={() => { setChooserOpen(false); router.push(newManualHref); }} />

      <Modal open={Boolean(renameTarget)} onClose={() => { if (!renaming) setRenameTarget(null); }} title="Rename manual" description="Choose a name for this document." width={460} hideClose={renaming}>
        <form className={styles.dialogForm} onSubmit={(event) => void submitRename(event)}>
          {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
          <ApplicationField id="rename-manual-input" label="Document name" className={styles.dialogField}>
            <ApplicationInput name="title" autoComplete="off" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} maxLength={255} />
          </ApplicationField>
          <div className={styles.dialogActions}>
            <ApplicationButton type="button" variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>Cancel</ApplicationButton>
            <ApplicationButton type="submit" variant="primary" className={styles.saveAction} busy={renaming} busyLabel="Saving…" leadingIcon={<Check size={15} aria-hidden="true" />} disabled={!renameTitle.trim()}>Save name</ApplicationButton>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteTarget)} onClose={() => { if (!actionId) setDeleteTarget(null); }} title="Delete archived manual?" description={deleteTarget ? `“${deleteTarget.title}” will be permanently deleted. This cannot be undone.` : undefined} width={460} hideClose={Boolean(actionId)}>
        {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
        <div className={styles.deleteIntro}><div className={styles.deleteIcon} aria-hidden="true"><Trash2 size={18} /></div></div>
        <div className={styles.dialogActions}>
          <ApplicationButton type="button" variant="outline" onClick={() => setDeleteTarget(null)} disabled={Boolean(actionId)}>Cancel</ApplicationButton>
          <ApplicationButton type="button" variant="danger" className={styles.deleteAction} onClick={() => void confirmDelete()} busy={Boolean(deleteTarget && actionId === deleteTarget.id)} busyLabel="Deleting…" leadingIcon={<Trash2 size={15} aria-hidden="true" />} disabled={!deleteTarget || Boolean(actionId)}>Delete permanently</ApplicationButton>
        </div>
      </Modal>
    </ApplicationSurface>
  );
}
