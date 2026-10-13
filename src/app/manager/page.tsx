"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ArrowRight, Building2, CheckCircle2, FileText, Loader2, PencilLine, Plus, RefreshCw, Search } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { Modal } from "@/components/ui/modal";
import { isStandaloneOrganization, organizationSelectOptions, OrganizationSourceLabel } from "@/components/workspace/organization-source-label";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { SelectionPill, TiltCover, useRecordMotion, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { DelayedLoading, ListFooter, ListRegion, useProgressiveList } from "@/components/workspace/workspace-list";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { SelectMenu } from "@/components/ui/select-menu";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { POLICY_PROFILES } from "@/lib/constants";
import { initialPolicy } from "@/lib/store";
import { policyCraftScopedUrl } from "@/lib/policycraft-scope-utils";
import type { PolicyCraftWorkspaceScope } from "@/lib/policycraft-access-types";
import type { PolicyDocumentSummary } from "@/lib/policycraft-types";
import type { Policy, PolicyType } from "@/lib/types";
import styles from "./page.module.css";

type View = "active" | "archived";
type Filter = "all" | PolicyType;
type ManagerDocument = PolicyDocumentSummary & { organizationId: number; organizationName: string; organizationSource?: "esg" | "standalone" };
const TYPES = Object.keys(POLICY_PROFILES) as PolicyType[];

function policyFromSummary(document: PolicyDocumentSummary): Policy {
  const base = initialPolicy(document.policyType);
  const snapshot = document.coverPreview;
  return snapshot ? { ...base, ...snapshot, company: { ...base.company, ...snapshot.company }, sections: base.sections } : base;
}

function readable(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function ManagerWorkspacePage() {
  const router = useRouter();
  const search = useSearchParams();
  const queryString = search.toString();
  const { access } = usePolicyCraftWorkspace();
  const requestedOrg = search.get("orgId");
  const [documents, setDocuments] = React.useState<ManagerDocument[]>([]);
  const [loadedScope, setLoadedScope] = React.useState("");
  const view: View = search.get("view") === "archived" ? "archived" : "active";
  const requestedType = search.get("type");
  const filter: Filter = requestedType && TYPES.includes(requestedType as PolicyType) ? requestedType as PolicyType : "all";
  const titleQuery = search.get("q") || "";
  const [searchDraft, setSearchDraft] = React.useState(titleQuery);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<{ scopeKey: string; message: string } | null>(null);
  const [notice, setNotice] = React.useState<{ scopeKey: string; message: string } | null>(null);
  const [actionId, setActionId] = React.useState<{ id: string; scopeKey: string; generation: number } | null>(null);
  const [archiveTarget, setArchiveTarget] = React.useState<{ document: ManagerDocument; scopeKey: string; generation: number } | null>(null);
  const [archiveError, setArchiveError] = React.useState("");
  const [newPolicyOpen, setNewPolicyOpen] = React.useState(false);
  const [newPolicyOrgId, setNewPolicyOrgId] = React.useState("");
  const requestGeneration = React.useRef(0);
  const searchUrlTimer = React.useRef<number | null>(null);
  const [requestEpoch, setRequestEpoch] = React.useState(0);

  const organizations = React.useMemo(() => (access?.organizations || []).filter((item) => !item.deleted && !item.expired), [access]);
  const requestedOrganizationId = requestedOrg ? Number(requestedOrg) : null;
  const organization = organizations.find((item) => item.id === requestedOrganizationId) || null;
  const allOrganizationsSelected = !requestedOrg || !organization;
  const selectedOrganizationScope = allOrganizationsSelected
    ? `all:${organizations.map((item) => item.id).sort((left, right) => left - right).join(",")}`
    : String(organization.id);
  const scopeKey = `${selectedOrganizationScope}:${view}`;

  const [searchDraftLocation, setSearchDraftLocation] = React.useState(queryString);
  if (searchDraftLocation !== queryString) {
    setSearchDraftLocation(queryString);
    setSearchDraft(new URLSearchParams(queryString).get("q") || "");
  }

  React.useEffect(() => {
    if (requestedOrg && !organization) {
      const params = new URLSearchParams(queryString);
      params.delete("orgId");
      const next = params.toString();
      router.replace(`/manager${next ? `?${next}` : ""}`, { scroll: false });
    }
  }, [organization, queryString, requestedOrg, router]);

  const load = React.useCallback(async () => {
    const generation = ++requestGeneration.current;
    setRequestEpoch(generation);
    setLoading(true);
    setError(null);
    const currentScopeKey = `${selectedOrganizationScope}:${view}`;
    try {
      const requestedOrganizations = allOrganizationsSelected ? organizations : [organization];
      const results = await Promise.all(requestedOrganizations.map(async (requestedOrganization) => {
        const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents?view=${view}`, requestedOrganization.id), { cache: "no-store" });
        if (response.status === 401) {
          router.replace("/login?next=/manager");
          throw new Error("Your session has expired. Sign in again to continue.");
        }
        if (!response.ok) throw new Error(`Could not load policies for ${requestedOrganization.name}. Retry to load the complete list.`);
        const data = await response.json() as { documents?: PolicyDocumentSummary[] };
        return (data.documents || []).map((document) => ({
          ...document,
          organizationId: requestedOrganization.id,
          organizationName: requestedOrganization.name,
          organizationSource: (requestedOrganization as typeof requestedOrganization & { source?: "esg" | "standalone" }).source,
        }));
      }));
      if (generation !== requestGeneration.current) return;
      const aggregate = results.flat().sort((left, right) => {
        const updatedAtOrder = Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
        if (Number.isFinite(updatedAtOrder) && updatedAtOrder !== 0) return updatedAtOrder;
        return left.organizationId - right.organizationId || left.id.localeCompare(right.id);
      });
      setDocuments(aggregate);
      setLoadedScope(currentScopeKey);
    } catch (cause) {
      if (generation === requestGeneration.current) {
        setDocuments([]);
        setLoadedScope("");
        setError({ scopeKey: currentScopeKey, message: cause instanceof Error ? cause.message : "Could not load policies. Retry to load the complete list." });
      }
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [allOrganizationsSelected, organization, organizations, router, selectedOrganizationScope, view]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      requestGeneration.current += 1;
    };
  }, [load]);

  React.useEffect(() => {
    if (searchDraft === titleQuery) return;
    const timer = window.setTimeout(() => {
      searchUrlTimer.current = null;
      const params = new URLSearchParams(queryString);
      if (searchDraft) params.set("q", searchDraft); else params.delete("q");
      const next = params.toString();
      router.replace(`/manager${next ? `?${next}` : ""}`, { scroll: false });
    }, 250);
    searchUrlTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (searchUrlTimer.current === timer) searchUrlTimer.current = null;
    };
  }, [queryString, router, searchDraft, titleQuery]);

  function updateQuery(updates: { view?: View; type?: Filter; q?: string }, history: "push" | "replace" = "replace") {
    if (updates.view !== undefined || updates.type !== undefined) {
      if (searchUrlTimer.current !== null) window.clearTimeout(searchUrlTimer.current);
      searchUrlTimer.current = null;
    }
    const params = new URLSearchParams(queryString);
    if (updates.q === undefined) {
      if (searchDraft) params.set("q", searchDraft); else params.delete("q");
    }
    if (updates.view !== undefined) {
      if (updates.view === "active") params.delete("view"); else params.set("view", updates.view);
    }
    if (updates.type !== undefined) {
      if (updates.type === "all") params.delete("type"); else params.set("type", updates.type);
    }
    if (updates.q !== undefined) {
      if (updates.q) params.set("q", updates.q); else params.delete("q");
    }
    const next = params.toString();
    const href = `/manager${next ? `?${next}` : ""}`;
    if (history === "push") router.push(href, { scroll: false });
    else router.replace(href, { scroll: false });
  }

  function selectOrganization(id: string) {
    const selected = id === "all" ? null : organizations.find((item) => String(item.id) === id) || null;
    if (id !== "all" && !selected) return;
    if (searchUrlTimer.current !== null) window.clearTimeout(searchUrlTimer.current);
    searchUrlTimer.current = null;
    setNotice(null);
    const params = new URLSearchParams(queryString);
    if (selected) params.set("orgId", String(selected.id)); else params.delete("orgId");
    if (searchDraft) params.set("q", searchDraft); else params.delete("q");
    router.push(`/manager?${params.toString()}`, { scroll: false });
  }

  async function mutateDocument(document: ManagerDocument, action: "archive") {
    const documentActionId = `${document.organizationId}:${document.id}`;
    if (actionId?.scopeKey === scopeKey && actionId.generation === requestGeneration.current) return;
    const generation = requestGeneration.current;
    setActionId({ id: documentActionId, scopeKey, generation });
    setError(null);
    setArchiveError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${encodeURIComponent(document.id)}`, document.organizationId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, lockVersion: document.lockVersion }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not update this policy.");
      if (generation !== requestGeneration.current) return;
      setArchiveTarget(null);
      setNotice({ scopeKey, message: `${document.title} from ${document.organizationName} was archived.` });
      await load();
    } catch (cause) {
      if (generation === requestGeneration.current) setArchiveError(cause instanceof Error ? cause.message : "Could not update this policy.");
    } finally { if (generation === requestGeneration.current) setActionId(null); }
  }

  const filteredDocuments = filter === "all" ? documents : documents.filter((document) => document.policyType === filter);
  const scopedDocuments = loadedScope ? filteredDocuments : [];
  const normalizedQuery = searchDraft.trim().toLocaleLowerCase();
  const activeActionId = actionId?.scopeKey === scopeKey && actionId.generation === requestEpoch ? actionId.id : null;
  const activeArchiveTarget = archiveTarget?.scopeKey === scopeKey && archiveTarget.generation === requestEpoch ? archiveTarget.document : null;
  const visibleError = error?.scopeKey === scopeKey ? error.message : "";
  const visibleNotice = notice?.scopeKey === scopeKey ? notice.message : "";
  const isLoading = loading || (Boolean(scopeKey && loadedScope !== scopeKey) && !visibleError);
  const visibleDocuments = normalizedQuery
    ? scopedDocuments.filter((document) => document.title.toLocaleLowerCase().includes(normalizedQuery))
    : scopedDocuments;
  const policyScopeForDocument = (document: ManagerDocument): PolicyCraftWorkspaceScope | null => access ? {
    userId: access.actor.id, role: access.actor.role,
    organizationId: document.organizationId, organizationName: document.organizationName,
  } : null;

  const recordMotion = useRecordMotion();
  const pager = useProgressiveList(visibleDocuments, `${loadedScope}|${filter}|${normalizedQuery}`);
  const switchingScope = isLoading && documents.length > 0;

  if (!organizations.length) return (
    <ApplicationSurface data-pc-workspace="manager" className={styles.surface}>
      <section className={styles.page} aria-labelledby="manager-page-title">
        <WorkspaceHero titleId="manager-page-title" title="No organizations assigned" description="Your administrator assigns the organizations you can open." />
        <WorkspaceSheet className={styles.emptyOrganizations}>
          <motion.span className={styles.emptyIcon} initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.2 }}><Building2 size={22} aria-hidden="true" /></motion.span>
          <p>Ask your PolicyCraft administrator to assign an organization. Its shared policies will appear here when access is ready.</p>
        </WorkspaceSheet>
      </section>
    </ApplicationSurface>
  );

  return <ApplicationSurface data-pc-workspace="manager" className={styles.surface}>
    <section className={styles.page} aria-labelledby="manager-page-title">
      <WorkspaceHero
        titleId="manager-page-title"
        title="Organizations & policies"
        description="View shared policies across all assigned organizations or focus on one."
        stats={[
          { label: organizations.length === 1 ? "Organization" : "Organizations", value: organizations.length },
          { label: view === "archived" ? "Archived policies" : "Active policies", value: isLoading && !documents.length ? null : visibleError ? "–" : documents.length },
        ]}
        actions={<div className={styles.headerControls}>
          <label htmlFor="manager-organization" className={styles.filterLabel}>Organization</label>
          <SelectMenu id="manager-organization" name="organizationId" value={organization ? String(organization.id) : "all"} onValueChange={selectOrganization} options={[{ value: "all", label: "All organizations" }, ...organizationSelectOptions(organizations)]} searchPlaceholder="Search organizations…" />
        </div>}
      />

      <WorkspaceSheet as="section" className={styles.recordsSection} aria-label="Policy records">
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIdentity}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.h2 key={organization?.id ?? "all"} className={styles.organizationName} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: WS_EASE }}>{organization?.name || "All organizations"}{organization ? <OrganizationSourceLabel organization={organization} className={styles.sourceLabel} /> : null}</motion.h2>
            </AnimatePresence>
            <p className={styles.recordCount} aria-live="polite">{visibleDocuments.length} of {documents.length} {view === "archived" ? "archived" : "active"} {documents.length === 1 ? "policy" : "policies"}</p>
          </div>
          <div className={styles.headerActions}>
            <div className={styles.viewSegments} role="group" aria-label="Policy status">
              {(["active", "archived"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => { setNotice(null); updateQuery({ view: item }, "push"); }} className={`${styles.segment} ${view === item ? styles.segmentSelected : ""}`}>{view === item ? <SelectionPill layoutId="manager-view" /> : null}{item === "archived" ? <><Archive size={14} aria-hidden="true" />Archived</> : <><FileText size={14} aria-hidden="true" />Active</>}</button>)}
            </div>
            {view === "active" ? organization ? <>
              {isStandaloneOrganization(organization) ? <Link href={`/manager/organizations/${organization.id}`} className={styles.editLink}><PencilLine size={14} aria-hidden="true" />Edit organization details</Link> : null}
              <Link href={`/builder?orgId=${organization.id}`} className={styles.newPolicy}><Plus size={15} aria-hidden="true" />New policy</Link>
            </> : <ApplicationButton variant="primary" size="md" className={styles.newPolicyButton} leadingIcon={<Plus size={15} aria-hidden="true" />} onClick={() => { setNewPolicyOrgId(String(organizations[0]?.id || "")); setNewPolicyOpen(true); }}>New policy</ApplicationButton> : null}
          </div>
        </div>

        <div className={styles.filterBar}>
          <div className={styles.typeFilters} role="group" aria-label="Filter by policy type">
            {["all", ...TYPES].map((type) => <button key={type} type="button" aria-pressed={filter === type} onClick={() => updateQuery({ type: type as Filter }, "push")} className={`${styles.filter} ${filter === type ? styles.filterSelected : ""}`}>{filter === type ? <SelectionPill layoutId="manager-type-filter" className={styles.filterPill} /> : null}{type === "all" ? "All" : <>{POLICY_PROFILES[type as PolicyType].short}</>}</button>)}
          </div>
          <label htmlFor="manager-policy-search" className={styles.searchField}>
            <Search size={15} aria-hidden="true" className={styles.searchIcon} />
            <ApplicationInput id="manager-policy-search" name="q" type="search" autoComplete="off" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search policies…" className={styles.searchInput} />
            <span className={styles.visuallyHidden}>Search policies by title</span>
          </label>
        </div>

        <div className={styles.sheetBody}>
          <AnimatePresence>
            {visibleError ? <motion.div key="error" role="alert" className={styles.alert} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><span>{visibleError}</span><button type="button" onClick={() => void load()} aria-label="Retry loading policies" className={styles.alertAction}><RefreshCw size={15} aria-hidden="true" />Retry</button></motion.div> : null}
            {visibleNotice ? <motion.p key="notice" role="status" aria-live="polite" className={styles.notice} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><CheckCircle2 size={16} aria-hidden="true" />{visibleNotice}</motion.p> : null}
          </AnimatePresence>

          {isLoading && documents.length === 0 ? (
            <DelayedLoading label="Loading policies…"><div className={styles.loadingRecords}>
              <div className={styles.loading} role="status" aria-live="polite" aria-busy="true"><Loader2 size={20} className={styles.spinner} aria-hidden="true" /><span>Loading policies…</span></div>
              <RecordSkeleton />
            </div></DelayedLoading>
          ) : visibleError && !switchingScope ? null : <ListRegion busy={switchingScope} contentKey={loadedScope}>{visibleDocuments.length === 0 ? <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: WS_EASE }}><motion.span className={styles.emptyStateIcon} initial={{ scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}><FileText size={22} aria-hidden="true" /></motion.span><h2>{documents.length === 0 ? view === "archived" ? "No archived policies" : "No policies yet" : "No matching policies"}</h2><p>{documents.length === 0 ? view === "archived" ? "Archived policies will be listed here." : allOrganizationsSelected ? "Create a policy in an assigned organization to start the shared workspace." : "Create a policy for this organization to start the shared workspace." : "Try another title or policy type filter."}</p>{documents.length > 0 && (searchDraft || filter !== "all") ? <button type="button" onClick={() => { setSearchDraft(""); updateQuery({ q: "", type: "all" }, "push"); }} className={styles.clearFilters}>Clear filters</button> : null}</motion.div> : <div className={styles.records}>
            <AnimatePresence>
              {pager.visible.map((document, index) => <motion.article key={`${document.organizationId}:${document.id}`} className={styles.record} data-ws-row="" style={{ "--ws-type": POLICY_PROFILES[document.policyType]?.accent } as React.CSSProperties} {...recordMotion(index)}>
                <TiltCover label={`Cover preview for ${document.title}`} className={styles.coverThumbnail} coverKey={`${document.organizationId}:${document.id}:${document.updatedAt}`}><span className={styles.coverPage} aria-hidden="true"><PolicyCoverPreview policy={policyFromSummary(document)} assetScope={policyScopeForDocument(document)} /></span></TiltCover>
                <div className={styles.recordBody}>
                  <h3 className={styles.policyTitle} title={document.title}>{document.title}</h3>
                  <p className={styles.policyMeta}><span className={styles.typeLabel}>{POLICY_PROFILES[document.policyType]?.label || readable(document.policyType)}</span><span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(document.updatedAt))}</span></p>
                  <p className={styles.ownerLine}>
                    {allOrganizationsSelected ? <span className={styles.organizationMeta}><Building2 size={13} aria-hidden="true" />{document.organizationName} · {document.organizationSource === "standalone" ? "PolicyCraft organization" : "ESG organization"}</span> : null}
                    <span className={styles.ownerMeta}>Created by <span>{document.createdBy?.name || document.createdBy?.email || "Workspace member"}</span></span>
                  </p>
                </div>
                <div className={styles.actionRow}>
                  {view === "active" ? <><button type="button" aria-label={`Archive ${document.title}`} disabled={Boolean(activeActionId)} onClick={() => { setNotice(null); setArchiveError(""); setArchiveTarget({ document, scopeKey, generation: requestGeneration.current }); }} className={styles.textAction}><Archive size={14} aria-hidden="true" />Archive</button><Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${document.organizationId}`} className={styles.openLink}>Open<ArrowRight size={14} aria-hidden="true" /></Link></> : <span className={styles.archivedLabel}>Archived · contact an administrator to restore</span>}
                </div>
              </motion.article>)}
            </AnimatePresence>
          </div>}
          {visibleDocuments.length ? <ListFooter shown={pager.shown} total={pager.total} hasMore={pager.hasMore} onMore={pager.showMore} noun="policies" /> : null}
          </ListRegion>}
        </div>
      </WorkspaceSheet>

      <Modal open={newPolicyOpen} onClose={() => setNewPolicyOpen(false)} title="Choose an organization" description="Select where to create this policy. The builder will open with that organization selected." width={460}>
        <label htmlFor="new-policy-organization" className={styles.modalLabel}>Organization</label>
        <SelectMenu id="new-policy-organization" value={newPolicyOrgId} onValueChange={setNewPolicyOrgId} options={organizationSelectOptions(organizations)} placeholder="Choose organization" searchPlaceholder="Search organizations…" className={styles.modalSelect} />
        <div className={styles.dialogActions}>
          <ApplicationButton type="button" variant="outline" onClick={() => setNewPolicyOpen(false)}>Cancel</ApplicationButton>
          <ApplicationButton type="button" variant="primary" leadingIcon={<Plus size={15} aria-hidden="true" />} disabled={!newPolicyOrgId} onClick={() => { if (newPolicyOrgId && organizations.some((item) => String(item.id) === newPolicyOrgId)) router.push(`/builder?orgId=${newPolicyOrgId}`); }}>Continue to builder</ApplicationButton>
        </div>
      </Modal>
      <Modal open={Boolean(activeArchiveTarget)} onClose={() => { if (!activeActionId) setArchiveTarget(null); }} title="Archive this policy?" description={`“${activeArchiveTarget?.title || "This policy"}” from ${activeArchiveTarget?.organizationName || "this organization"} will move to Archived and remain available there.`} width={460}>
        {archiveError ? <p role="alert" className={styles.inlineError}>{archiveError}</p> : null}
        <div className={styles.dialogActions}>
          <ApplicationButton type="button" variant="outline" disabled={Boolean(activeActionId)} onClick={() => setArchiveTarget(null)}>Cancel</ApplicationButton>
          <ApplicationButton type="button" variant="primary" busy={Boolean(activeActionId)} busyLabel="Archiving…" leadingIcon={<Archive size={15} aria-hidden="true" />} disabled={!activeArchiveTarget} onClick={() => activeArchiveTarget && void mutateDocument(activeArchiveTarget, "archive")}>Archive policy</ApplicationButton>
        </div>
      </Modal>
    </section>
  </ApplicationSurface>;
}
