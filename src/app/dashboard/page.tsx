"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ArchiveRestore, ArrowRight, Building2, Check, FileText, House, Loader2, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { POLICY_PROFILES } from "@/lib/constants";
import { getDraftDisplayTitles, groupDraftsByPolicyType } from "@/lib/policycraft-draft-view";
import { initialPolicy } from "@/lib/store";
import type { Policy, PolicyType } from "@/lib/types";
import type { PolicyDocumentSummary } from "@/lib/policycraft-types";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { DelayedLoading, ListFooter, ListRegion, useProgressiveList } from "@/components/workspace/workspace-list";
import { SelectionPill, TiltCover, useRecordMotion, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { policyCraftScopedUrl } from "@/lib/policycraft-scope-utils";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import styles from "./page.module.css";

type DocumentView = "active" | "archived";
type PolicyFilter = "all" | PolicyType;

const POLICY_TYPES = Object.keys(POLICY_PROFILES) as PolicyType[];

function label(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const router = useRouter();
  const { access } = usePolicyCraftWorkspace();
  const organization = access.organizations.find((item) => !item.deleted) || null;
  const scopeFor = React.useCallback((document?: PolicyDocumentSummary) => ({
    userId: access.actor.id,
    role: access.actor.role,
    organizationId: document?.organization?.id || organization?.id || 0,
    organizationName: document?.organization?.name || organization?.name || "",
    ...(document?.id ? { documentId: document.id } : {}),
  }), [access.actor.id, access.actor.role, organization]);
  const [view, setView] = React.useState<DocumentView>("active");
  const [policyFilter, setPolicyFilter] = React.useState<PolicyFilter>("all");
  const [documents, setDocuments] = React.useState<PolicyDocumentSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [renameDocument, setRenameDocument] = React.useState<PolicyDocumentSummary | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [deleteDocument, setDeleteDocument] = React.useState<PolicyDocumentSummary | null>(null);
  // The view whose drafts are on screen; they stay visible while the next view loads.
  const [loadedView, setLoadedView] = React.useState<DocumentView | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    if (!organization) { setDocuments([]); setLoading(false); return; }
    const documentsResponse = await fetch(policyCraftScopedUrl(`/api/policycraft/documents?view=${view}`, organization.id), { cache: "no-store" });
    if (documentsResponse.status === 401) {
      router.replace("/login?next=/drafts");
      return;
    }
    if (!documentsResponse.ok) {
      setError("Could not load your PolicyCraft workspace.");
      setLoading(false);
      return;
    }
    const documentData = await documentsResponse.json();
    setDocuments(documentData.documents || []);
    setLoadedView(view);
    setLoading(false);
  }, [organization, router, view]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  React.useEffect(() => {
    if (!renameDocument) return;
    // Let Modal capture the trigger before moving focus into the rename field.
    const frame = window.requestAnimationFrame(() => window.document.getElementById("rename-draft-input")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [renameDocument]);

  function openRename(document: PolicyDocumentSummary) {
    setRenameDocument(document);
    setRenameTitle(document.title);
    setError("");
  }

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const document = renameDocument;
    const title = renameTitle.trim();
    if (!document || !title || renaming) return;
    setRenaming(true);
    setError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${document.id}`, document.organization?.id || organization?.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, lockVersion: document.lockVersion }),
      });
      if (response.status === 409) {
        setError("That draft changed in another window. Refresh and try again.");
        return;
      }
      if (!response.ok) {
        setError("Could not rename that draft.");
        return;
      }
      setRenameDocument(null);
      setRenameTitle("");
      await load();
    } catch {
      setError("Could not rename that draft.");
    } finally {
      setRenaming(false);
    }
  }

  async function setArchived(id: string, archived: boolean) {
    if (actionId) return;
    setActionId(id);
    setError("");
    try {
      const document = documents.find((item) => item.id === id);
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${id}`, document?.organization?.id || organization?.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!response.ok) {
        setError(archived ? "Could not archive that draft." : "Could not restore that draft.");
        return;
      }
      await load();
    } catch {
      setError(archived ? "Could not archive that draft." : "Could not restore that draft.");
    } finally {
      setActionId(null);
    }
  }

  async function confirmDelete() {
    const document = deleteDocument;
    if (!document || actionId) return;
    setActionId(document.id);
    setError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${document.id}`, document.organization?.id || organization?.id), { method: "DELETE" });
      if (!response.ok) {
        setError(response.status === 404 ? "That archived draft is no longer available." : "Could not delete that draft.");
        return;
      }
      setDeleteDocument(null);
      await load();
    } catch {
      setError("Could not delete that draft.");
    } finally {
      setActionId(null);
    }
  }

  function previewPolicy(document: PolicyDocumentSummary): Policy {
    const base = initialPolicy(document.policyType);
    const snapshot = document.coverPreview;
    if (!snapshot) return base;
    return { ...base, ...snapshot, company: { ...base.company, ...snapshot.company }, sections: base.sections };
  }

  const isArchived = view === "archived";
  const filteredDocuments = policyFilter === "all" ? documents : documents.filter((document) => document.policyType === policyFilter);
  const displayTitles = React.useMemo(() => getDraftDisplayTitles(filteredDocuments), [filteredDocuments]);
  const pager = useProgressiveList(filteredDocuments, `${loadedView}|${policyFilter}`);
  // Group only the batch on screen so later batches extend the groups in place.
  const visibleIds = new Set(pager.visible.map((document) => document.id));
  const policyGroups = groupDraftsByPolicyType(filteredDocuments, policyFilter)
    .map((group) => ({ ...group, documents: group.documents.filter((document) => visibleIds.has(document.id)) }))
    .filter((group) => group.documents.length > 0);
  const recordMotion = useRecordMotion();
  const latestUpdate = documents.reduce<Date | null>((latest, document) => {
    const updated = new Date(document.updatedAt);
    return Number.isNaN(updated.valueOf()) || (latest && latest >= updated) ? latest : updated;
  }, null);

  return (
    <ApplicationSurface data-pc-workspace="drafts" className={styles.surface}>
      <section className={styles.page} aria-labelledby="drafts-page-title">
        <WorkspaceHero
          titleId="drafts-page-title"
          eyebrow={organization?.name || "Loading organization…"}
          eyebrowIcon={<Building2 size={14} />}
          title="Your policy drafts"
          description="Resume a draft where you left off, or start a new policy for your organization."
          stats={[
            { label: isArchived ? "Archived drafts" : "Active drafts", value: loading && documents.length === 0 ? null : documents.length },
            { label: "Policy types", value: loading && documents.length === 0 ? null : new Set(documents.map((document) => document.policyType)).size },
            { label: "Last edited", value: loading && documents.length === 0 ? null : latestUpdate ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(latestUpdate) : "–" },
          ]}
          actions={<>
            <Link href="/" className={styles.homeLink}><House size={15} aria-hidden="true" />Home</Link>
            <Link href={organization ? `/builder?orgId=${organization.id}` : "#"} aria-disabled={!organization} tabIndex={organization ? undefined : -1} className={`${styles.newPolicy} ${organization ? "" : styles.newPolicyDisabled}`}><Plus size={16} aria-hidden="true" />New policy</Link>
          </>}
        />

        <WorkspaceSheet className={styles.sheet}>
          <section className={styles.toolbar} aria-label="Draft controls">
            <div className={styles.viewSegments} role="tablist" aria-label="Draft views">
              <button type="button" role="tab" aria-selected={!isArchived} onClick={() => setView("active")} className={`${styles.segment} ${!isArchived ? styles.segmentSelected : ""}`}>{!isArchived ? <SelectionPill layoutId="drafts-view" /> : null}<FileText size={15} aria-hidden="true" />Active drafts</button>
              <button type="button" role="tab" aria-selected={isArchived} onClick={() => setView("archived")} className={`${styles.segment} ${isArchived ? styles.segmentSelected : ""}`}>{isArchived ? <SelectionPill layoutId="drafts-view" /> : null}<Archive size={15} aria-hidden="true" />Archived</button>
            </div>
            <div className={styles.filters} role="group" aria-label="Filter drafts by policy type">
              <button type="button" aria-pressed={policyFilter === "all"} onClick={() => setPolicyFilter("all")} className={`${styles.filter} ${policyFilter === "all" ? styles.filterSelected : ""}`}>{policyFilter === "all" ? <SelectionPill layoutId="drafts-filter" className={styles.filterPill} /> : null}All <span>{documents.length}</span></button>
              {POLICY_TYPES.map((policyType) => {
                const count = documents.filter((document) => document.policyType === policyType).length;
                return <button key={policyType} type="button" aria-pressed={policyFilter === policyType} onClick={() => setPolicyFilter(policyType)} className={`${styles.filter} ${policyFilter === policyType ? styles.filterSelected : ""}`}>{policyFilter === policyType ? <SelectionPill layoutId="drafts-filter" className={styles.filterPill} /> : null}{POLICY_PROFILES[policyType].short} <span>{count}</span></button>;
              })}
            </div>
          </section>

          <div className={styles.sheetBody}>
            <AnimatePresence>
              {error && !renameDocument && !deleteDocument ? <motion.div key="error" role="alert" className={styles.alert} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><span>{error}</span><button type="button" onClick={() => void load()} aria-label="Refresh drafts" className={styles.iconButton}><RefreshCw size={16} aria-hidden="true" /></button></motion.div> : null}
            </AnimatePresence>

            {loading && documents.length === 0 ? (
              <DelayedLoading label="Loading drafts…"><div className={styles.loadingRecords}>
                <div className={styles.loading} role="status" aria-live="polite" aria-busy="true"><Loader2 className={styles.spinner} size={20} aria-hidden="true" /><span>Loading drafts…</span></div>
                <RecordSkeleton />
              </div></DelayedLoading>
            )
            : error && documents.length === 0 ? null : <ListRegion busy={loading} contentKey={loadedView || ""}>{filteredDocuments.length === 0 ? (
              <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: WS_EASE }}>
                <motion.span className={styles.emptyIcon} initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}>
                  {isArchived ? <Archive size={24} aria-hidden="true" /> : <FileText size={24} aria-hidden="true" />}
                </motion.span>
                <h2>{policyFilter !== "all" ? `No ${POLICY_PROFILES[policyFilter].label.toLowerCase()} drafts here` : isArchived ? "No archived drafts" : "No saved drafts yet"}</h2>
                <p>{isArchived ? "Archived drafts will appear here." : "Start a policy and it will appear here automatically."}</p>
              </motion.div>
            ) : (
              <div className={styles.groups}>
                {policyGroups.map(({ policyType, documents: groupDocuments }) => (
                  <section key={policyType} aria-labelledby={`drafts-${policyType}`}>
                      <div className={styles.groupHeading}>
                        <h2 id={`drafts-${policyType}`} className={styles.groupTitle}>{POLICY_PROFILES[policyType].label}</h2>
                        <span className={styles.groupCount}>{groupDocuments.length} {groupDocuments.length === 1 ? "draft" : "drafts"}</span>
                      </div>
                      <div className={styles.recordList}>
                        <AnimatePresence>
                          {groupDocuments.map((document, index) => (
                            <motion.article key={document.id} className={styles.record} data-ws-row="" style={{ "--ws-type": POLICY_PROFILES[document.policyType]?.accent } as React.CSSProperties} {...recordMotion(index)}>
                              <TiltCover label={`Cover preview for ${displayTitles.get(document.id) || document.title}`} className={styles.coverThumbnail} coverKey={`${document.id}:${document.updatedAt}`}>
                                <span className={styles.coverPage} aria-hidden="true"><PolicyCoverPreview policy={previewPolicy(document)} assetScope={scopeFor(document)} /></span>
                              </TiltCover>
                              <div className={styles.recordBody}>
                                <h3 className={styles.recordTitle}>{displayTitles.get(document.id) || document.title}</h3>
                                <p className={styles.recordMeta}><span className={styles.stepChip}>{label(document.currentStep)}</span><span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(document.updatedAt))}</span></p>
                                {!isArchived ? <Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${document.organization?.id || organization?.id || ""}`} className={styles.resumeLink}>Resume<ArrowRight size={15} aria-hidden="true" /></Link> : <p className={styles.archivedLabel}><Archive size={14} aria-hidden="true" /> Archived</p>}
                              </div>
                              <div className={styles.recordActions}>
                                {!isArchived ? <button type="button" title="Rename draft" onClick={() => openRename(document)} className={styles.textAction}><Pencil size={14} aria-hidden="true" /> Rename</button> : null}
                                <button type="button" title={isArchived ? "Restore draft" : "Archive draft"} onClick={() => void setArchived(document.id, isArchived ? false : true)} disabled={actionId === document.id} className={styles.textAction}>
                                  {actionId === document.id ? <Loader2 size={15} className={styles.spinner} aria-hidden="true" /> : isArchived ? <ArchiveRestore size={15} aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}
                                  {isArchived ? "Restore" : "Archive"}
                                </button>
                                {isArchived ? <button type="button" title="Delete archived draft" onClick={() => setDeleteDocument(document)} disabled={actionId === document.id} className={`${styles.textAction} ${styles.dangerAction}`}><Trash2 size={14} aria-hidden="true" /> Delete</button> : null}
                              </div>
                            </motion.article>
                          ))}
                        </AnimatePresence>
                      </div>
                  </section>
                ))}
                <ListFooter shown={pager.shown} total={pager.total} hasMore={pager.hasMore} onMore={pager.showMore} noun="drafts" />
              </div>
            )}</ListRegion>}
          </div>
        </WorkspaceSheet>
      </section>
      <Modal open={Boolean(renameDocument)} onClose={() => { if (!renaming) setRenameDocument(null); }} title="Rename draft" description="Choose a name for this policy draft." width={460} hideClose={renaming}>
        <form className={styles.dialogForm} onSubmit={(event) => void submitRename(event)}>
          {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
          <ApplicationField id="rename-draft-input" label="Draft name" className={styles.dialogField}>
            <ApplicationInput name="title" autoComplete="off" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} maxLength={255} />
          </ApplicationField>
          <div className={styles.dialogActions}>
            <ApplicationButton type="button" variant="outline" onClick={() => setRenameDocument(null)} disabled={renaming}>Cancel</ApplicationButton>
            <ApplicationButton type="submit" variant="primary" className={styles.saveAction} busy={renaming} busyLabel="Saving…" leadingIcon={<Check size={15} aria-hidden="true" />} disabled={!renameTitle.trim()}>Save name</ApplicationButton>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(deleteDocument)} onClose={() => { if (!actionId) setDeleteDocument(null); }} title="Delete archived draft?" description={deleteDocument ? `“${displayTitles.get(deleteDocument.id) || deleteDocument.title}” will be permanently deleted. This cannot be undone.` : undefined} width={460} hideClose={Boolean(actionId)}>
        {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
        <div className={styles.deleteIntro}><div className={styles.deleteIcon} aria-hidden="true"><Trash2 size={18} /></div></div>
        <div className={styles.dialogActions}>
          <ApplicationButton type="button" variant="outline" onClick={() => setDeleteDocument(null)} disabled={Boolean(actionId)}>Cancel</ApplicationButton>
          <ApplicationButton type="button" variant="danger" className={styles.deleteAction} onClick={() => void confirmDelete()} busy={Boolean(deleteDocument && actionId === deleteDocument.id)} busyLabel="Deleting…" leadingIcon={<Trash2 size={15} aria-hidden="true" />} disabled={!deleteDocument || Boolean(actionId)}>Delete permanently</ApplicationButton>
        </div>
      </Modal>
    </ApplicationSurface>
  );
}
