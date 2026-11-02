"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ArchiveRestore, ArrowRight, BookOpen, Building2, Check, FileText, House, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { SelectMenu } from "@/components/ui/select-menu";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { DelayedLoading, ListFooter, ListRegion, useProgressiveList } from "@/components/workspace/workspace-list";
import { SelectionPill, TiltCover, useRecordMotion, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { getSopManual, listManuals, saveSopManual, setSopManualArchived, deleteSopManual, type ManualSummary, type ManualView } from "@/lib/sop/client-api";
import { DEFAULT_SOP_TEMPLATE_ID, SOP_TEMPLATE_IDS } from "@/lib/sop/types";
import { manualSummaryLine } from "./manual-helpers";
import { handbookSummaryLine } from "./handbook-helpers";
import { DocumentTypeChooser } from "./document-type-chooser";
import styles from "@/app/dashboard/page.module.css";
import filterStyles from "@/app/admin/policies/page.module.css";
import { organizationSelectOptions } from "@/components/workspace/organization-source-label";
import hub from "./documents-hub.module.css";

type TypeFilter = "all" | "sop" | "handbook";

const TYPE_LABEL: Record<ManualSummary["kind"], string> = { sop: "SOP manuals", handbook: "Employee handbooks" };

/** "manual" or "handbook", for button titles and dialogs. */
const noun = (manual: Pick<ManualSummary, "kind">) => (manual.kind === "handbook" ? "handbook" : "manual");

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
  // Like the policy lists: every organization at once unless one is picked.
  const organization = organizations.find((item) => item.id === requestedOrgId) ?? (organizations.length === 1 ? organizations[0] : null);
  const orgId = organization?.id ?? null;

  const [view, setView] = React.useState<ManualView>("active");
  const [query, setQuery] = React.useState("");
  const [creatorId, setCreatorId] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
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

  const generation = React.useRef(0);
  const load = React.useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    try {
      let next: ManualSummary[];
      if (orgId) next = await listManuals(orgId, view);
      // Admins get every organization in one request; others load each assigned organization.
      else if (role === "admin") next = await listManuals(null, view);
      else {
        const lists = await Promise.all(organizations.map((item) => listManuals(item.id, view)));
        next = lists.flat().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
      }
      if (current !== generation.current) return;
      setManuals(next);
      setLoadedView(`${orgId ?? "all"}:${view}`);
      setNow(Date.now());
    } catch (cause) {
      if (current !== generation.current) return;
      if (cause instanceof Error && "status" in cause && (cause as { status: number }).status === 401) {
        router.replace("/login?next=/documents");
        return;
      }
      setError("Could not load your documents.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [orgId, organizations, role, router, view]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [load]);

  React.useEffect(() => {
    if (!renameTarget) return;
    const frame = window.requestAnimationFrame(() => window.document.getElementById("rename-manual-input")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [renameTarget]);

  const newHref = (kind: ManualSummary["kind"], scopeId: number) => `/documents/${kind}/new?orgId=${scopeId}`;
  const scopeOf = (manual: ManualSummary) => manual.organization?.id || orgId;
  const resumeHref = (manual: ManualSummary) => `/documents/${manual.kind === "handbook" ? "handbook" : "sop"}/${encodeURIComponent(manual.id)}?orgId=${manual.organization?.id || orgId || ""}`;

  async function setArchived(manual: ManualSummary, archived: boolean) {
    const scopeId = scopeOf(manual);
    if (actionId || !scopeId) return;
    setActionId(manual.id);
    setError("");
    try {
      await setSopManualArchived(scopeId, manual.id, archived);
      await load();
    } catch {
      setError(archived ? "Could not archive that manual." : "Could not restore that manual.");
    } finally {
      setActionId(null);
    }
  }

  async function confirmDelete() {
    const manual = deleteTarget;
    const scopeId = manual ? scopeOf(manual) : null;
    if (!manual || actionId || !scopeId) return;
    setActionId(manual.id);
    setError("");
    try {
      await deleteSopManual(scopeId, manual.id);
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
    const scopeId = manual ? scopeOf(manual) : null;
    if (!manual || !title || renaming || !scopeId) return;
    setRenaming(true);
    setError("");
    try {
      // The save route takes the whole manual, so rename loads the latest copy first.
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
  const creators = React.useMemo(() => {
    const byId = new Map<string, NonNullable<ManualSummary["createdBy"]>>();
    for (const manual of manuals) if (manual.createdBy) byId.set(manual.createdBy.id, manual.createdBy);
    return [...byId.values()].sort((left, right) => (left.name || left.email).localeCompare(right.name || right.email));
  }, [manuals]);
  const search = query.trim().toLowerCase();
  const filtered = React.useMemo(() => manuals.filter((manual) =>
    (typeFilter === "all" || manual.kind === typeFilter)
    && (creatorId === "all" || manual.createdBy?.id === creatorId)
    && (!search || [manual.title, manual.organization?.name, manual.createdBy?.name, manual.createdBy?.email, TYPE_LABEL[manual.kind]].some((value) => value?.toLowerCase().includes(search)))),
  [creatorId, manuals, search, typeFilter]);
  const hasFilters = Boolean(search) || creatorId !== "all" || typeFilter !== "all" || (organizations.length > 1 && orgId !== null);
  const clearFilters = () => { setQuery(""); setCreatorId("all"); setTypeFilter("all"); if (searchParams.has("orgId")) router.replace("/documents"); };
  const pager = useProgressiveList(filtered, `${loadedView}|${typeFilter}|${creatorId}|${search}`);
  const visibleIds = new Set(pager.visible.map((manual) => manual.id));
  const groups = (["sop", "handbook"] as const)
    .map((kind) => ({ kind, manuals: filtered.filter((manual) => manual.kind === kind && visibleIds.has(manual.id)) }))
    .filter((group) => group.manuals.length > 0);
  const recordMotion = useRecordMotion();
  const waiting = loading && manuals.length === 0;
  const totalParts = manuals.reduce((sum, manual) => sum + manual.partCount, 0);
  const latestUpdate = manuals.reduce<Date | null>((latest, manual) => {
    const updated = new Date(manual.updatedAt);
    return Number.isNaN(updated.valueOf()) || (latest && latest >= updated) ? latest : updated;
  }, null);

  return (
    <ApplicationSurface data-pc-workspace="documents" className={styles.surface}>
      <section className={styles.page} aria-labelledby="documents-page-title">
        <WorkspaceHero
          titleId="documents-page-title"
          eyebrow={organization?.name || (organizations.length ? "All organizations" : "No organization assigned")}
          eyebrowIcon={<Building2 size={14} />}
          title="Your documents"
          description="SOP manuals and employee handbooks for your organization."
          stats={[
            { label: isArchived ? "Archived documents" : "Active documents", value: waiting ? null : manuals.length },
            { label: "SOPs and chapters", value: waiting ? null : totalParts },
            { label: "Last edited", value: waiting ? null : latestUpdate ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(latestUpdate) : "–" },
          ]}
          actions={<>
            <Link href="/" className={styles.homeLink}><House size={15} aria-hidden="true" />Home</Link>
            <button type="button" onClick={() => setChooserOpen(true)} disabled={!organizations.length} className={`${styles.newPolicy} ${organizations.length ? "" : styles.newPolicyDisabled}`}><Plus size={16} aria-hidden="true" />New document</button>
          </>}
        />

        <WorkspaceSheet className={styles.sheet}>
          <section className={styles.toolbar} aria-label="Document controls">
            <div className={styles.viewSegments} role="tablist" aria-label="Document views">
              <button type="button" role="tab" aria-selected={!isArchived} onClick={() => setView("active")} className={`${styles.segment} ${!isArchived ? styles.segmentSelected : ""}`}>{!isArchived ? <SelectionPill layoutId="documents-view" /> : null}<FileText size={15} aria-hidden="true" />Active</button>
              <button type="button" role="tab" aria-selected={isArchived} onClick={() => setView("archived")} className={`${styles.segment} ${isArchived ? styles.segmentSelected : ""}`}>{isArchived ? <SelectionPill layoutId="documents-view" /> : null}<Archive size={15} aria-hidden="true" />Archived</button>
            </div>
            <p className={filterStyles.recordCount} aria-live="polite">{waiting ? "Loading documents…" : `${filtered.length} ${filtered.length === 1 ? "document" : "documents"}`}</p>
          </section>
          {/* The same filters as the policy library: search, organization, creator, type. */}
          <div className={filterStyles.filterBar}>
            <div className={filterStyles.searchAndToggle}><label className={filterStyles.searchField}><span className="sr-only">Search documents</span><Search size={15} aria-hidden="true" className={filterStyles.searchIcon} /><input name="documentSearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search documents…" className={filterStyles.filterInput} /></label><button type="button" aria-expanded={filtersOpen} aria-controls="document-filter-options" onClick={() => setFiltersOpen((open) => !open)} className={filterStyles.filterToggle}>Filters</button></div>
            <div id="document-filter-options" className={`${filterStyles.filterFields} ${filtersOpen ? filterStyles.filterFieldsOpen : filterStyles.filterFieldsClosed}`}>
              <label className={filterStyles.filterLabel}>Organization<SelectMenu name="organizationFilter" value={orgId ? String(orgId) : "all"} onValueChange={(value) => router.replace(value === "all" ? "/documents" : `/documents?orgId=${value}`)} options={[...(organizations.length > 1 ? [{ value: "all", label: "All organizations" }] : []), ...organizationSelectOptions(organizations)]} searchPlaceholder="Search organizations…" className={filterStyles.filterMenu} /></label>
              <label className={filterStyles.filterLabel}>Creator<SelectMenu name="creatorFilter" value={creatorId} onValueChange={setCreatorId} options={[{ value: "all", label: "All creators" }, ...(creatorId !== "all" && !creators.some((creator) => creator.id === creatorId) ? [{ value: creatorId, label: "Selected creator" }] : []), ...creators.map((creator) => ({ value: creator.id, label: creator.name || creator.email, description: creator.name ? creator.email : undefined }))]} searchPlaceholder="Search creators…" className={filterStyles.filterMenu} /></label>
              <label className={filterStyles.filterLabel}>Document type<SelectMenu name="documentTypeFilter" value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)} options={[{ value: "all", label: "All document types" }, ...(["sop", "handbook"] as const).map((kind) => ({ value: kind, label: TYPE_LABEL[kind] }))]} className={filterStyles.filterMenu} /></label>
            </div>
          </div>

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
                <h2>{hasFilters ? "No documents match these filters" : isArchived ? "No archived documents" : "Create your first document"}</h2>
                <p>{hasFilters ? "Try another search or clear your filters." : isArchived ? "Archived documents will appear here." : "Pick the procedures your teams follow, or the chapters of an employee handbook. PolicyCraft writes each one, ready to review and export."}</p>
                {hasFilters ? <button type="button" onClick={clearFilters} className={`${filterStyles.clearFilters} ${hub.emptyAction}`}>Clear filters</button> : null}
                {!hasFilters && !isArchived && organizations.length ? <button type="button" onClick={() => setChooserOpen(true)} className={`${styles.newPolicy} ${hub.emptyAction}`}><Plus size={16} aria-hidden="true" />New document</button> : null}
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
                              <p className={styles.recordMeta}><span className={styles.stepChip}>{manual.kind === "sop" ? "SOP manual" : "Handbook"}</span><span>{manual.kind === "handbook" ? handbookSummaryLine(manual, now) : manualSummaryLine(manual, now)}</span>{!orgId && manual.organization?.name ? <span>{manual.organization.name}</span> : null}{manual.createdBy ? <span>{manual.createdBy.name || manual.createdBy.email}</span> : null}</p>
                              {!isArchived ? <Link href={resumeHref(manual)} className={styles.resumeLink}>Resume<ArrowRight size={15} aria-hidden="true" /></Link> : <p className={styles.archivedLabel}><Archive size={14} aria-hidden="true" /> Archived</p>}
                            </div>
                            <div className={styles.recordActions}>
                              {!isArchived ? <button type="button" title={`Rename ${noun(manual)}`} onClick={() => { setRenameTarget(manual); setRenameTitle(manual.title); setError(""); }} className={styles.textAction}><Pencil size={14} aria-hidden="true" /> Rename</button> : null}
                              <button type="button" title={`${isArchived ? "Restore" : "Archive"} ${noun(manual)}`} onClick={() => void setArchived(manual, !isArchived)} disabled={actionId === manual.id} className={styles.textAction}>
                                {actionId === manual.id ? <Loader2 size={15} className={styles.spinner} aria-hidden="true" /> : isArchived ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
                                {isArchived ? "Restore" : "Archive"}
                              </button>
                              {isArchived ? <button type="button" title={`Delete archived ${noun(manual)}`} onClick={() => setDeleteTarget(manual)} disabled={actionId === manual.id} className={`${styles.textAction} ${styles.dangerAction}`}><Trash2 size={14} aria-hidden="true" /> Delete</button> : null}
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

      <DocumentTypeChooser
        open={chooserOpen}
        organizations={orgId ? undefined : organizationSelectOptions(organizations)}
        onClose={() => setChooserOpen(false)}
        onChoose={(type, chosenOrgId) => { const scopeId = chosenOrgId ?? orgId; if (!scopeId) return; setChooserOpen(false); router.push(newHref(type, scopeId)); }}
      />

      <Modal open={Boolean(renameTarget)} onClose={() => { if (!renaming) setRenameTarget(null); }} title={renameTarget ? `Rename ${noun(renameTarget)}` : "Rename document"} description="Choose a name for this document." width={460} hideClose={renaming}>
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

      <Modal open={Boolean(deleteTarget)} onClose={() => { if (!actionId) setDeleteTarget(null); }} title={deleteTarget ? `Delete archived ${noun(deleteTarget)}?` : "Delete archived document?"} description={deleteTarget ? `“${deleteTarget.title}” will be permanently deleted. This cannot be undone.` : undefined} width={460} hideClose={Boolean(actionId)}>
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
