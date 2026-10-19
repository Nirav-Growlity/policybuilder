"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ArrowRight, Building2, Check, FileText, House, Loader2, Pencil, Plus, RefreshCw, Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { SelectMenu } from "@/components/ui/select-menu";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { organizationSelectOptions, OrganizationSourceLabel } from "@/components/workspace/organization-source-label";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { DelayedLoading, ListFooter, ListRegion, useProgressiveList } from "@/components/workspace/workspace-list";
import { SelectionPill, TiltCover, useRecordMotion, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { POLICY_PROFILES } from "@/lib/constants";
import { getDraftDisplayTitles, groupDraftsByPolicyType } from "@/lib/policycraft-draft-view";
import { policyCraftScopedUrl } from "@/lib/policycraft-scope-utils";
import { initialPolicy } from "@/lib/store";
import type { PolicyDocumentSummary } from "@/lib/policycraft-types";
import type { Policy, PolicyType } from "@/lib/types";
import styles from "@/app/dashboard/page.module.css";
import hub from "@/components/documents/documents-hub.module.css";
import own from "./manager-policies.module.css";

type View = "active" | "archived";
type TypeFilter = "all" | PolicyType;
type ManagerPolicy = PolicyDocumentSummary & { organizationId: number; organizationName: string; organizationSource: "esg" | "standalone" };

const POLICY_TYPES = Object.keys(POLICY_PROFILES) as PolicyType[];
const recordKey = (document: ManagerPolicy) => `${document.organizationId}:${document.id}`;
const label = (value: string) => value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

function previewPolicy(document: PolicyDocumentSummary): Policy {
  const base = initialPolicy(document.policyType);
  const snapshot = document.coverPreview;
  return snapshot ? { ...base, ...snapshot, company: { ...base.company, ...snapshot.company }, sections: base.sections } : base;
}

/**
 * The manager's policies, laid out like Documents: every assigned organization
 * at once or one of them, grouped by policy type. Managers can rename and
 * archive; restoring or deleting an archived policy stays with administrators.
 */
export function ManagerPolicies() {
  const router = useRouter();
  const search = useSearchParams();
  const { access } = usePolicyCraftWorkspace();
  const organizations = React.useMemo(() => access.organizations.filter((item) => !item.deleted && !item.expired), [access.organizations]);
  const requestedOrgId = Number(search.get("orgId")) || null;
  const organization = organizations.find((item) => item.id === requestedOrgId) ?? null;
  const scoped = organization ? [organization] : organizations;
  const scopeKey = scoped.map((item) => item.id).join(",");

  const [view, setView] = React.useState<View>("active");
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("all");
  const [query, setQuery] = React.useState("");
  const [documents, setDocuments] = React.useState<ManagerPolicy[]>([]);
  const [loadedKey, setLoadedKey] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<ManagerPolicy | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [archiveTarget, setArchiveTarget] = React.useState<ManagerPolicy | null>(null);
  const [chooserOpen, setChooserOpen] = React.useState(false);
  const [chosenOrgId, setChosenOrgId] = React.useState("");
  const generation = React.useRef(0);

  const load = React.useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    setError("");
    const targets = organizations.filter((item) => scopeKey.split(",").includes(String(item.id)));
    if (!targets.length) { setDocuments([]); setLoading(false); return; }
    try {
      const results = await Promise.all(targets.map(async (target) => {
        const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents?view=${view}`, target.id), { cache: "no-store" });
        if (response.status === 401) { router.replace("/login?next=/manager/policies"); throw new Error("Your session has expired. Sign in again to continue."); }
        if (!response.ok) throw new Error(`Could not load the policies for ${target.name}.`);
        const data = await response.json() as { documents?: PolicyDocumentSummary[] };
        return (data.documents || []).map((document) => ({ ...document, organizationId: target.id, organizationName: target.name, organizationSource: target.source }));
      }));
      if (current !== generation.current) return;
      setDocuments(results.flat().sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)));
      setLoadedKey(`${scopeKey}:${view}`);
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : "Could not load your policies.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [organizations, router, scopeKey, view]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); generation.current += 1; };
  }, [load]);

  React.useEffect(() => {
    if (!renameTarget) return;
    const frame = window.requestAnimationFrame(() => window.document.getElementById("rename-policy-input")?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [renameTarget]);

  function selectOrganization(value: string) {
    setNotice("");
    router.replace(value === "all" ? "/manager/policies" : `/manager/policies?orgId=${value}`, { scroll: false });
  }

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const document = renameTarget;
    const title = renameTitle.trim();
    if (!document || !title || renaming) return;
    setRenaming(true);
    setError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${encodeURIComponent(document.id)}`, document.organizationId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, lockVersion: document.lockVersion }),
      });
      if (response.status === 409) { setError("That policy changed in another window. Refresh and try again."); return; }
      if (!response.ok) { setError("Could not rename that policy."); return; }
      setRenameTarget(null);
      await load();
    } catch {
      setError("Could not rename that policy.");
    } finally {
      setRenaming(false);
    }
  }

  async function confirmArchive() {
    const document = archiveTarget;
    if (!document || actionId) return;
    setActionId(recordKey(document));
    setError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${encodeURIComponent(document.id)}`, document.organizationId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", lockVersion: document.lockVersion }),
      });
      if (!response.ok) { setError("Could not archive that policy."); return; }
      setArchiveTarget(null);
      setNotice(`${document.title} was archived.`);
      await load();
    } catch {
      setError("Could not archive that policy.");
    } finally {
      setActionId(null);
    }
  }

  const isArchived = view === "archived";
  const allOrganizations = !organization;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const typed = typeFilter === "all" ? documents : documents.filter((document) => document.policyType === typeFilter);
  const filtered = normalizedQuery ? typed.filter((document) => document.title.toLocaleLowerCase().includes(normalizedQuery)) : typed;
  const displayTitles = React.useMemo(() => getDraftDisplayTitles(filtered), [filtered]);
  const pager = useProgressiveList(filtered, `${loadedKey}|${typeFilter}|${normalizedQuery}`);
  const visible = new Set(pager.visible.map(recordKey));
  const groups = groupDraftsByPolicyType(filtered, typeFilter)
    .map((group) => ({ ...group, documents: (group.documents as ManagerPolicy[]).filter((document) => visible.has(recordKey(document))) }))
    .filter((group) => group.documents.length > 0);
  const recordMotion = useRecordMotion();
  const waiting = loading && documents.length === 0;
  const latestUpdate = documents.reduce<Date | null>((latest, document) => {
    const updated = new Date(document.updatedAt);
    return Number.isNaN(updated.valueOf()) || (latest && latest >= updated) ? latest : updated;
  }, null);
  const scopeFor = (document: ManagerPolicy) => ({ userId: access.actor.id, role: access.actor.role, organizationId: document.organizationId, organizationName: document.organizationName });
  const newPolicy = organization
    ? <Link href={`/builder?orgId=${organization.id}`} className={styles.newPolicy}><Plus size={16} aria-hidden="true" />New policy</Link>
    : <button type="button" disabled={!organizations.length} onClick={() => { setChosenOrgId(String(organizations[0]?.id ?? "")); setChooserOpen(true); }} className={`${styles.newPolicy} ${organizations.length ? "" : styles.newPolicyDisabled}`}><Plus size={16} aria-hidden="true" />New policy</button>;

  return (
    <ApplicationSurface data-pc-workspace="manager-policies" className={styles.surface}>
      <section className={styles.page} aria-labelledby="manager-policies-title">
        <WorkspaceHero
          titleId="manager-policies-title"
          eyebrow={organization?.name || (organizations.length ? `All ${organizations.length} organizations` : "No organization assigned")}
          eyebrowIcon={<Building2 size={14} />}
          title="Your policies"
          description="Sustainability policies across the organizations you manage. Pick one organization to focus on it."
          stats={[
            { label: isArchived ? "Archived policies" : "Active policies", value: waiting ? null : documents.length },
            { label: "Policy types", value: waiting ? null : new Set(documents.map((document) => document.policyType)).size },
            { label: "Last edited", value: waiting ? null : latestUpdate ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(latestUpdate) : "–" },
          ]}
          actions={<>
            <Link href="/" className={styles.homeLink}><House size={15} aria-hidden="true" />Home</Link>
            {newPolicy}
          </>}
        />

        <WorkspaceSheet className={styles.sheet}>
          <section className={styles.toolbar} aria-label="Policy controls">
            <div className={styles.viewSegments} role="tablist" aria-label="Policy views">
              {(["active", "archived"] as const).map((item) => (
                <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => { setNotice(""); setView(item); }} className={`${styles.segment} ${view === item ? styles.segmentSelected : ""}`}>
                  {view === item ? <SelectionPill layoutId="manager-policies-view" /> : null}
                  {item === "active" ? <><FileText size={15} aria-hidden="true" />Active</> : <><Archive size={15} aria-hidden="true" />Archived</>}
                </button>
              ))}
            </div>
            <div className={hub.toolbarEnd}>
              <div className={styles.filters} role="group" aria-label="Filter policies by type">
                {(["all", ...POLICY_TYPES] as const).map((type) => {
                  const count = type === "all" ? documents.length : documents.filter((document) => document.policyType === type).length;
                  const selected = typeFilter === type;
                  return <button key={type} type="button" aria-pressed={selected} onClick={() => setTypeFilter(type)} className={`${styles.filter} ${selected ? styles.filterSelected : ""}`}>{selected ? <SelectionPill layoutId="manager-policies-filter" className={styles.filterPill} /> : null}{type === "all" ? "All" : POLICY_PROFILES[type].short} <span>{count}</span></button>;
                })}
              </div>
            </div>
          </section>
          <div className={own.scopeBar}>
            {organizations.length > 1 ? (
              <SelectMenu
                size="compact"
                className={own.picker}
                value={organization ? String(organization.id) : "all"}
                onValueChange={selectOrganization}
                options={[{ value: "all", label: "All organizations" }, ...organizationSelectOptions(organizations)]}
                searchPlaceholder="Search organizations…"
                aria-label="Organization"
              />
            ) : null}
            <label htmlFor="manager-policy-search" className={own.search}>
              <Search size={15} aria-hidden="true" className={own.searchIcon} />
              <ApplicationInput id="manager-policy-search" name="q" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search policies by title" className={own.searchInput} aria-label="Search policies by title" />
            </label>
          </div>

          <div className={styles.sheetBody}>
            <AnimatePresence>
              {error && !renameTarget && !archiveTarget ? <motion.div key="error" role="alert" className={styles.alert} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><span>{error}</span><button type="button" onClick={() => void load()} aria-label="Retry loading policies" className={styles.iconButton}><RefreshCw size={16} aria-hidden="true" /></button></motion.div> : null}
              {notice ? <motion.p key="notice" role="status" aria-live="polite" className={own.notice} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><Check size={15} aria-hidden="true" />{notice}</motion.p> : null}
            </AnimatePresence>

            {waiting ? (
              <DelayedLoading label="Loading policies…"><div className={styles.loadingRecords}>
                <div className={styles.loading} role="status" aria-live="polite" aria-busy="true"><Loader2 className={styles.spinner} size={20} aria-hidden="true" /><span>Loading policies…</span></div>
                <RecordSkeleton />
              </div></DelayedLoading>
            ) : error && documents.length === 0 ? null : <ListRegion busy={loading} contentKey={loadedKey || ""}>{filtered.length === 0 ? (
              <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: WS_EASE }}>
                <motion.span className={styles.emptyIcon} initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}>
                  {isArchived ? <Archive size={24} aria-hidden="true" /> : <FileText size={24} aria-hidden="true" />}
                </motion.span>
                <h2>{documents.length && (normalizedQuery || typeFilter !== "all") ? "No matching policies" : isArchived ? "No archived policies" : "Start your first policy"}</h2>
                <p>{documents.length && (normalizedQuery || typeFilter !== "all") ? "Try another title or policy type." : isArchived ? "Archived policies appear here. An administrator can restore them." : "Pick a policy type and PolicyCraft drafts each section from your company profile."}</p>
                {documents.length && (normalizedQuery || typeFilter !== "all") ? <button type="button" className={own.clear} onClick={() => { setQuery(""); setTypeFilter("all"); }}>Clear filters</button> : null}
              </motion.div>
            ) : (
              <div className={styles.groups}>
                {groups.map(({ policyType, documents: groupDocuments }) => (
                  <section key={policyType} aria-labelledby={`manager-policies-${policyType}`}>
                    <div className={styles.groupHeading}>
                      <h2 id={`manager-policies-${policyType}`} className={styles.groupTitle}>{POLICY_PROFILES[policyType].label}</h2>
                      <span className={styles.groupCount}>{groupDocuments.length} {groupDocuments.length === 1 ? "policy" : "policies"}</span>
                    </div>
                    <div className={styles.recordList}>
                      <AnimatePresence>
                        {groupDocuments.map((document, index) => {
                          const title = displayTitles.get(document.id) || document.title;
                          return (
                            <motion.article key={recordKey(document)} className={styles.record} data-ws-row="" style={{ "--ws-type": POLICY_PROFILES[document.policyType]?.accent } as React.CSSProperties} {...recordMotion(index)}>
                              <TiltCover label={`Cover preview for ${title}`} className={styles.coverThumbnail} coverKey={`${recordKey(document)}:${document.updatedAt}`}>
                                <span className={styles.coverPage} aria-hidden="true"><PolicyCoverPreview policy={previewPolicy(document)} assetScope={scopeFor(document)} /></span>
                              </TiltCover>
                              <div className={styles.recordBody}>
                                <h3 className={styles.recordTitle}>{title}</h3>
                                <p className={styles.recordMeta}>
                                  <span className={styles.stepChip}>{label(document.currentStep)}</span>
                                  <span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(document.updatedAt))}</span>
                                  {document.createdBy?.name || document.createdBy?.email ? <span>by {document.createdBy.name || document.createdBy.email}</span> : null}
                                </p>
                                {allOrganizations ? <p className={own.orgLine}><Building2 size={13} aria-hidden="true" />{document.organizationName}<OrganizationSourceLabel organization={{ id: document.organizationId, name: document.organizationName, source: document.organizationSource }} /></p> : null}
                                {!isArchived ? <Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${document.organizationId}`} className={styles.resumeLink}>Resume<ArrowRight size={15} aria-hidden="true" /></Link> : <p className={styles.archivedLabel}><Archive size={14} aria-hidden="true" /> Archived</p>}
                              </div>
                              {!isArchived ? (
                                <div className={styles.recordActions}>
                                  <button type="button" title="Rename policy" onClick={() => { setRenameTarget(document); setRenameTitle(document.title); setError(""); }} className={styles.textAction}><Pencil size={14} aria-hidden="true" /> Rename</button>
                                  <button type="button" title="Archive policy" onClick={() => { setNotice(""); setError(""); setArchiveTarget(document); }} disabled={actionId === recordKey(document)} className={styles.textAction}><Archive size={15} aria-hidden="true" /> Archive</button>
                                </div>
                              ) : null}
                            </motion.article>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  </section>
                ))}
                <ListFooter shown={pager.shown} total={pager.total} hasMore={pager.hasMore} onMore={pager.showMore} noun="policies" />
              </div>
            )}</ListRegion>}
          </div>
        </WorkspaceSheet>
      </section>

      <Modal open={chooserOpen} onClose={() => setChooserOpen(false)} title="Choose an organization" description="The builder opens with this organization selected." width={460}>
        <label htmlFor="new-policy-organization" className={own.modalLabel}>Organization</label>
        <SelectMenu id="new-policy-organization" value={chosenOrgId} onValueChange={setChosenOrgId} options={organizationSelectOptions(organizations)} placeholder="Choose organization" searchPlaceholder="Search organizations…" />
        <div className={styles.dialogActions}>
          <ApplicationButton type="button" variant="outline" onClick={() => setChooserOpen(false)}>Cancel</ApplicationButton>
          <ApplicationButton type="button" variant="primary" leadingIcon={<Plus size={15} aria-hidden="true" />} disabled={!chosenOrgId} onClick={() => router.push(`/builder?orgId=${chosenOrgId}`)}>Continue to builder</ApplicationButton>
        </div>
      </Modal>

      <Modal open={Boolean(renameTarget)} onClose={() => { if (!renaming) setRenameTarget(null); }} title="Rename policy" description="Choose a name for this policy." width={460} hideClose={renaming}>
        <form className={styles.dialogForm} onSubmit={(event) => void submitRename(event)}>
          {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
          <ApplicationField id="rename-policy-input" label="Policy name" className={styles.dialogField}>
            <ApplicationInput name="title" autoComplete="off" value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} maxLength={255} />
          </ApplicationField>
          <div className={styles.dialogActions}>
            <ApplicationButton type="button" variant="outline" onClick={() => setRenameTarget(null)} disabled={renaming}>Cancel</ApplicationButton>
            <ApplicationButton type="submit" variant="primary" className={styles.saveAction} busy={renaming} busyLabel="Saving…" leadingIcon={<Check size={15} aria-hidden="true" />} disabled={!renameTitle.trim()}>Save name</ApplicationButton>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(archiveTarget)} onClose={() => { if (!actionId) setArchiveTarget(null); }} title="Archive this policy?" description={archiveTarget ? `“${archiveTarget.title}” from ${archiveTarget.organizationName} moves to Archived. Only an administrator can restore it.` : undefined} width={460} hideClose={Boolean(actionId)}>
        {error ? <p role="alert" className={styles.inlineError}>{error}</p> : null}
        <div className={styles.dialogActions}>
          <ApplicationButton type="button" variant="outline" disabled={Boolean(actionId)} onClick={() => setArchiveTarget(null)}>Cancel</ApplicationButton>
          <ApplicationButton type="button" variant="primary" busy={Boolean(actionId)} busyLabel="Archiving…" leadingIcon={<Archive size={15} aria-hidden="true" />} disabled={!archiveTarget} onClick={() => void confirmArchive()}>Archive policy</ApplicationButton>
        </div>
      </Modal>
    </ApplicationSurface>
  );
}
