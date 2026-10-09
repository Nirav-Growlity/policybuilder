"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpRight, FileText, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { ActionDisclosure, ActionDisclosureItem } from "@/components/ui/action-disclosure";
import { Modal } from "@/components/ui/modal";
import { ApplicationStatus } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { POLICY_PROFILES } from "@/lib/constants";
import { initialPolicy } from "@/lib/store";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { policyCraftExportContext } from "@/lib/policycraft-client-scope";
import { organizationSourceName } from "@/components/workspace/organization-source-label";
import type { PolicyCraftDocumentState, PolicyDocumentSummary } from "@/lib/policycraft-types";
import type { Policy, PolicyType } from "@/lib/types";
import styles from "./page.module.css";

type Creator = { id: string; name: string; email: string };
type OrganizationLabel = { id: number; name: string; code?: string; deleted?: boolean; expired?: boolean; source?: "esg" | "standalone" };
type AdminPolicy = PolicyDocumentSummary & { organization: OrganizationLabel; createdBy: Creator; state?: PolicyCraftDocumentState };
type AdminDocumentResponse = { documents: AdminPolicy[]; creators?: Creator[] };

const PolicyCoverThumbnail = React.memo(function PolicyCoverThumbnail({ document, userId }: { document: AdminPolicy; userId: string }) {
  const policy = React.useMemo(() => policyFromSummary(document), [document]);
  const assetScope = React.useMemo(() => ({ userId, role: "admin" as const, organizationId: document.organization.id, organizationName: document.organization.name, documentId: document.id, readOnly: !!document.organization.deleted }), [document, userId]);
  return <div role="img" aria-label={`Cover preview for ${document.title || "Untitled policy"}`} className={styles.coverThumbnail}><div className="absolute left-1/2 top-1/2 origin-center [transform:translate(-50%,-50%)_scale(.055)] sm:[transform:translate(-50%,-50%)_scale(.06)]" style={{ width: "210mm", height: "297mm" }} aria-hidden="true"><PolicyCoverPreview policy={policy} assetScope={assetScope} /></div></div>;
});

const POLICY_TYPES = Object.keys(POLICY_PROFILES) as PolicyType[];
type View = "active" | "archived";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function label(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function policyFromSummary(document: AdminPolicy): Policy {
  const base = initialPolicy(document.policyType);
  const snapshot = document.coverPreview;
  return snapshot ? { ...base, ...snapshot, company: { ...base.company, ...snapshot.company }, sections: base.sections } : base;
}

function filenameFromResponse(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"/g, "")) : fallback;
}

function AdminPoliciesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { access } = usePolicyCraftWorkspace();
  const organizations = access.organizations;
  const [creators, setCreators] = React.useState<Creator[]>([]);
  const [documents, setDocuments] = React.useState<AdminPolicy[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [loadError, setLoadError] = React.useState("");
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [actionLabel, setActionLabel] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<AdminPolicy | null>(null);
  const [deleteError, setDeleteError] = React.useState("");
  const [archiveTarget, setArchiveTarget] = React.useState<{ document: AdminPolicy; archived: boolean } | null>(null);
  const [archiveError, setArchiveError] = React.useState("");
  const [query, setQuery] = React.useState(searchParams.get("q") || "");
  const [orgId, setOrgId] = React.useState(searchParams.get("orgId") || "all");
  const [creatorId, setCreatorId] = React.useState(searchParams.get("creatorId") || "all");
  const [policyType, setPolicyType] = React.useState(searchParams.get("policyType") || "all");
  const [view, setView] = React.useState<View>(searchParams.get("view") === "archived" ? "archived" : "active");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const searchUrlTimer = React.useRef<number | null>(null);
  const selfAuthoredSearches = React.useRef(new Set<string>());

  React.useEffect(() => {
    const current = searchParams.toString();
    if (selfAuthoredSearches.current.delete(current)) return;
    const values = new URLSearchParams(current);
    setQuery(values.get("q") || "");
    setOrgId(values.get("orgId") || "all");
    setCreatorId(values.get("creatorId") || "all");
    setPolicyType(values.get("policyType") || "all");
    setView(values.get("view") === "archived" ? "archived" : "active");
  }, [searchParams]);

  React.useEffect(() => {
    const syncFromHistory = () => {
      if (searchUrlTimer.current !== null) window.clearTimeout(searchUrlTimer.current);
      searchUrlTimer.current = null;
      selfAuthoredSearches.current.clear();
      const values = new URLSearchParams(window.location.search);
      setQuery(values.get("q") || "");
      setOrgId(values.get("orgId") || "all");
      setCreatorId(values.get("creatorId") || "all");
      setPolicyType(values.get("policyType") || "all");
      setView(values.get("view") === "archived" ? "archived" : "active");
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const queryKey = `${orgId}|${creatorId}|${policyType}|${view}`;
  React.useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ view });
    if (orgId !== "all") params.set("orgId", orgId);
    if (creatorId !== "all") params.set("creatorId", creatorId);
    if (policyType !== "all") params.set("policyType", policyType);
    const timer = window.setTimeout(() => {
      setLoading(true);
      setLoadError("");
      void fetch(`/api/policycraft/admin/documents?${params}`, { cache: "no-store" }).then(async (documentsResponse) => {
      if (documentsResponse.status === 401) { router.replace("/login?next=%2Fadmin%2Fpolicies"); return null; }
      if (!documentsResponse.ok) throw new Error("Could not load policies. Refresh to try again.");
      const documentData = await documentsResponse.json() as AdminDocumentResponse;
      if (!active) return null;
      setDocuments(documentData.documents || []);
      setCreators(documentData.creators || []);
      setLoading(false);
      return true;
      }).catch((cause) => {
        if (active) { setLoadError(cause instanceof Error ? cause.message : "Could not load policies."); setLoading(false); }
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [queryKey, router, orgId, creatorId, policyType, view]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
    searchUrlTimer.current = null;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (orgId !== "all") params.set("orgId", orgId);
    if (creatorId !== "all") params.set("creatorId", creatorId);
    if (policyType !== "all") params.set("policyType", policyType);
    if (view !== "active") params.set("view", view);
    const next = params.toString();
    if (next === searchParams.toString()) return;
    selfAuthoredSearches.current.add(next);
    while (selfAuthoredSearches.current.size > 16) selfAuthoredSearches.current.delete(selfAuthoredSearches.current.values().next().value!);
    router.replace(next ? `/admin/policies?${next}` : "/admin/policies", { scroll: false });
    }, 250);
    searchUrlTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (searchUrlTimer.current === timer) searchUrlTimer.current = null;
    };
  }, [creatorId, orgId, policyType, query, router, searchParams, view]);

  const filtered = React.useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return documents;
    return documents.filter((document) => [document.title, document.organization?.name, document.createdBy?.name, document.createdBy?.email, POLICY_PROFILES[document.policyType]?.label].some((value) => value?.toLowerCase().includes(search)));
  }, [documents, query]);
  const hasFilters = Boolean(query.trim()) || orgId !== "all" || creatorId !== "all" || policyType !== "all";

  async function setArchived(document: AdminPolicy, archived: boolean) {
    if (actionId) return;
    setActionId(document.id);
    setActionLabel(archived ? "Archiving…" : "Restoring…");
    setArchiveError("");
    try {
      const response = await fetch(`/api/policycraft/documents/${encodeURIComponent(document.id)}?orgId=${document.organization.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived, lockVersion: document.lockVersion }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `Could not ${archived ? "archive" : "restore"} this policy.`);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      setArchiveTarget(null);
      try { await refreshDocuments(); }
      catch { setError("The policy was updated, but the list could not refresh. Retry to check the current state."); }
    } catch (cause) { setArchiveError(cause instanceof Error ? cause.message : "Could not update this policy."); }
    finally { setActionId(null); setActionLabel(""); }
  }

  async function refreshDocuments() {
    const params = new URLSearchParams({ view });
    if (orgId !== "all") params.set("orgId", orgId);
    if (creatorId !== "all") params.set("creatorId", creatorId);
    if (policyType !== "all") params.set("policyType", policyType);
    const response = await fetch(`/api/policycraft/admin/documents?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Action completed, but the policy list could not refresh.");
    const result = await response.json() as AdminDocumentResponse;
    setDocuments(result.documents || []);
  }

  async function retryLoad() {
    setLoading(true);
    setLoadError("");
    setError("");
    const params = new URLSearchParams({ view });
    if (orgId !== "all") params.set("orgId", orgId);
    if (creatorId !== "all") params.set("creatorId", creatorId);
    if (policyType !== "all") params.set("policyType", policyType);
    try {
      const response = await fetch(`/api/policycraft/admin/documents?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load policies. Retry to try again.");
      const result = await response.json() as AdminDocumentResponse;
      setDocuments(result.documents || []);
      setCreators(result.creators || []);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load policies.");
    } finally {
      setLoading(false);
    }
  }

  async function removeDocument() {
    const document = deleteTarget;
    if (!document || actionId) return;
    setActionId(document.id);
    setActionLabel("Deleting…");
    setDeleteError("");
    try {
      const response = await fetch(`/api/policycraft/documents/${encodeURIComponent(document.id)}?orgId=${document.organization.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not delete this policy.");
      setDeleteTarget(null);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
      try { await refreshDocuments(); }
      catch { setError("The policy was deleted, but the list could not refresh. Retry to check the current state."); }
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Could not delete this policy."); }
    finally { setActionId(null); setActionLabel(""); }
  }

  async function exportDocument(document: AdminPolicy, format: "pdf" | "docx") {
    if (actionId) return;
    setActionId(document.id);
    setActionLabel("Preparing export…");
    setError("");
    try {
      const getResponse = await fetch(`/api/policycraft/documents/${encodeURIComponent(document.id)}?orgId=${document.organization.id}`, { cache: "no-store" });
      if (!getResponse.ok) throw new Error("Could not load the policy for export.");
      const detail = await getResponse.json();
      const policy = detail.document?.state?.policy as Policy | undefined;
      if (!policy) throw new Error("This policy has no saved content to export.");
      const response = await fetch(`/api/export/${format}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, ...policyCraftExportContext({ userId: access.actor.id, role: "admin", organizationId: document.organization.id, organizationName: document.organization.name, documentId: document.id, readOnly: !!document.organization.deleted }) }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `Could not export this ${format.toUpperCase()}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = filenameFromResponse(response, `${document.title || "policy"}.${format}`);
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not export this ${format.toUpperCase()}.`); }
    finally { setActionId(null); setActionLabel(""); }
  }

  const renderPolicyActions = (document: AdminPolicy) => {
    const deletedOrg = !!document.organization?.deleted;
    const editLabel = deletedOrg ? "View" : "Edit";
    return <div className={styles.actionRow}>
      <Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${document.organization.id}`} className={styles.editLink}><ArrowUpRight size={15} aria-hidden="true" />{editLabel}</Link>
      <ActionDisclosure label={`More actions for ${document.title}`} disabled={Boolean(actionId) || Boolean(deleteTarget) || Boolean(archiveTarget)}>
        <ActionDisclosureItem disabled={Boolean(actionId)} busy={actionId === document.id && actionLabel === "Preparing export…"} onClick={() => void exportDocument(document, "pdf")}><ArrowDownToLine size={15} aria-hidden="true" />{actionId === document.id && actionLabel === "Preparing export…" ? actionLabel : "Download PDF"}</ActionDisclosureItem>
        <ActionDisclosureItem disabled={Boolean(actionId)} onClick={() => void exportDocument(document, "docx")}><FileText size={15} aria-hidden="true" />Download Word</ActionDisclosureItem>
        {view === "active" ? <ActionDisclosureItem disabled={Boolean(actionId) || deletedOrg} onClick={() => { setArchiveError(""); setArchiveTarget({ document, archived: true }); }}><Archive size={15} aria-hidden="true" />Archive policy</ActionDisclosureItem> : <>
          <ActionDisclosureItem disabled={Boolean(actionId) || deletedOrg} onClick={() => { setArchiveError(""); setArchiveTarget({ document, archived: false }); }}><ArchiveRestore size={15} aria-hidden="true" />Restore policy</ActionDisclosureItem>
          <ActionDisclosureItem disabled={Boolean(actionId) || deletedOrg} destructive onClick={() => { setDeleteError(""); setDeleteTarget(document); }}><Trash2 size={15} aria-hidden="true" />Delete permanently</ActionDisclosureItem>
        </>}
      </ActionDisclosure>
    </div>;
  };

  const renderPolicyIdentity = (document: AdminPolicy) => {
    return <div className={styles.policyIdentity}>
      <PolicyCoverThumbnail document={document} userId={access.actor.id} />
      <div className={styles.identityText}><h3 className={styles.policyTitle}>{document.title || "Untitled policy"}</h3><p className={styles.policyMeta}><span>{POLICY_PROFILES[document.policyType]?.label || label(document.policyType)}</span><span aria-hidden="true">·</span><ApplicationStatus tone="neutral" icon={<FileText size={14} aria-hidden="true" />}>{document.archivedAt ? "Archived" : label(document.currentStep)}</ApplicationStatus></p>{actionId === document.id ? <p className={styles.actionStatus} role="status" aria-live="polite"><Loader2 size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{actionLabel}</p> : null}</div>
  </div>;
  };

  return <ApplicationSurface className={styles.surface} data-pc-pilot="inventory"><div className={styles.page}>
    <header className={styles.header}><div><p className={styles.eyebrow}>Administration</p><h1 className={styles.pageTitle}>All policies</h1><p className={styles.description}>Browse, manage, and export policies across organizations.</p></div><div className={styles.headerActions}><Link href="/builder" className={styles.newPolicy}><Plus size={16} aria-hidden="true" />New policy</Link></div></header>
    {error ? <div className={styles.alert} role="alert" aria-live="polite"><p>{error}</p><button type="button" onClick={() => void retryLoad()} aria-label="Retry loading policies" className={styles.alertAction}><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}
    {loadError ? <div className={styles.alert} role="alert" aria-live="polite"><p>{loadError}</p><button type="button" onClick={() => void retryLoad()} className={styles.alertAction}><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}

    <section aria-label="Policy library" className={styles.panel}>
    <div className={styles.viewBar}><div className={styles.segments} role="group" aria-label="Policy status"><button type="button" aria-pressed={view === "active"} onClick={() => setView("active")} className={`${styles.segment} ${view === "active" ? styles.segmentSelected : ""}`}>Active</button><button type="button" aria-pressed={view === "archived"} onClick={() => setView("archived")} className={`${styles.segment} ${view === "archived" ? styles.segmentSelected : ""}`}>Archived</button></div><p className={styles.recordCount} aria-live="polite">{loading ? "Loading policies…" : `${filtered.length} ${filtered.length === 1 ? "policy" : "policies"}`}</p></div>
    <div className={styles.filterBar}>
      <div className={styles.searchAndToggle}><label className={styles.searchField}><span className="sr-only">Search policies</span><Search size={15} aria-hidden="true" className={styles.searchIcon} /><input name="policySearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search policies…" className={styles.filterInput} /></label><button type="button" aria-expanded={filtersOpen} aria-controls="policy-filter-options" onClick={() => setFiltersOpen((open) => !open)} className={styles.filterToggle}>Filters</button></div>
      <div id="policy-filter-options" className={`${styles.filterFields} ${filtersOpen ? styles.filterFieldsOpen : styles.filterFieldsClosed}`}>
        <label className={styles.filterLabel}>Organization<select name="organizationFilter" value={orgId} onChange={(event) => setOrgId(event.target.value)} className={styles.filterSelect}><option value="all">All organizations</option>{organizations.map((organization) => <option key={organization.id} value={String(organization.id)}>{organization.name} · {organizationSourceName(organization)}{organization.deleted ? " · deleted" : ""}</option>)}</select></label>
        <label className={styles.filterLabel}>Creator<select name="creatorFilter" value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className={styles.filterSelect}><option value="all">All creators</option>{creatorId !== "all" && !creators.some((creator) => creator.id === creatorId) ? <option value={creatorId}>Selected creator</option> : null}{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name || creator.email}</option>)}</select></label>
        <label className={styles.filterLabel}>Policy type<select name="policyTypeFilter" value={policyType} onChange={(event) => setPolicyType(event.target.value)} className={styles.filterSelect}><option value="all">All policy types</option>{POLICY_TYPES.map((type) => <option key={type} value={type}>{POLICY_PROFILES[type].label}</option>)}</select></label>
      </div>
    </div>

    {loading ? <div className={styles.loadingState} aria-live="polite"><Loader2 size={19} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading policies…</div> : loadError ? <div className={styles.emptyState} role="status"><FileText size={25} className={styles.emptyIcon} aria-hidden="true" /><h2>Policies could not be loaded</h2><p>The policy list will appear after the request succeeds.</p></div> : filtered.length === 0 ? <div className={styles.emptyState}><FileText size={25} className={styles.emptyIcon} aria-hidden="true" /><h2>{hasFilters ? "No policies match these filters" : view === "archived" ? "No archived policies" : "No policies yet"}</h2><p>{hasFilters ? "Try another search or clear your filters." : view === "archived" ? "Archived policies will appear here." : "Create a new policy for an organization to get started."}</p>{hasFilters ? <button type="button" onClick={() => { setQuery(""); setOrgId("all"); setCreatorId("all"); setPolicyType("all"); setView("active"); }} className={styles.clearFilters}>Clear filters</button> : null}</div> : <>
      <div className={styles.tableScroll}><table className={styles.table}><colgroup><col className="w-[42%]" /><col className="w-[22%]" /><col className="w-[18%]" /><col className="w-[18%]" /></colgroup><thead className="text-[11px] uppercase tracking-wider text-[var(--pc-muted)]"><tr><th scope="col" className="px-6 py-3 font-semibold">Policy</th><th scope="col" className="px-4 py-3 font-semibold">Organization</th><th scope="col" className="px-4 py-3 font-semibold">Owner / updated</th><th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-[var(--pc-divider)]">{filtered.map((document) => <tr key={document.id} className={document.organization?.deleted ? styles.tableRowDeleted : undefined}><th scope="row" className="px-6 py-4 font-medium">{renderPolicyIdentity(document)}</th><td className="px-4 py-4"><span className="block break-words font-medium text-[var(--pc-text)]">{document.organization?.name || "Unknown organization"}</span><span className="mt-1 block text-[10px] text-[var(--pc-muted)]">{organizationSourceName(document.organization || { id: 0, name: "" })}</span>{document.organization?.deleted ? <span className="mt-1 block"><ApplicationStatus tone="info">Deleted · read only</ApplicationStatus></span> : document.organization?.expired ? <span className="mt-1 block"><ApplicationStatus tone="warning">Expired · admin editing allowed</ApplicationStatus></span> : null}</td><td className="px-4 py-4"><span className="block break-words font-medium">{document.createdBy?.name || "Unknown"}</span><span className="mt-1 block break-all text-xs text-[var(--pc-muted)]">{document.createdBy?.email || ""}</span><span className="mt-1 block text-xs text-[var(--pc-muted)]">Updated {formatDate(document.updatedAt)}</span></td><td className="px-3 py-4">{renderPolicyActions(document)}</td></tr>)}</tbody></table></div>
      <div className={styles.mobileRecords}>{filtered.map((document) => <article key={document.id} className={styles.mobileRecord}><div className={styles.mobileRecordHeader}><div className="min-w-0 w-full">{renderPolicyIdentity(document)}</div><div className={styles.mobileRecordActions}>{renderPolicyActions(document)}</div></div><dl className={styles.mobileDetails}><div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--pc-muted)]">Organization</dt><dd className="mt-1 break-words font-medium">{document.organization?.name || "Unknown organization"}<span className="block text-xs font-normal text-[var(--pc-muted)]">{organizationSourceName(document.organization || { id: 0, name: "" })}</span>{document.organization?.deleted ? <span className="block mt-1"><ApplicationStatus tone="info">Deleted · read only</ApplicationStatus></span> : document.organization?.expired ? <span className="block mt-1"><ApplicationStatus tone="warning">Expired · admin editing allowed</ApplicationStatus></span> : null}</dd></div><div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--pc-muted)]">Owner</dt><dd className="mt-1 break-words">{document.createdBy?.name || "Unknown"}<span className="block break-all text-xs text-[var(--pc-muted)]">{document.createdBy?.email || ""}</span></dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--pc-muted)]">Updated</dt><dd className="mt-1">{formatDate(document.updatedAt)}</dd></div></dl></article>)}</div>
    </>}
    </section>

    <Modal open={Boolean(deleteTarget)} onClose={() => { if (!actionId) setDeleteTarget(null); }} title="Delete archived policy?" description="This permanently deletes the selected archived policy and its saved content." hideClose={Boolean(actionId)} width={480}>
      <p className="break-words text-sm text-[var(--pc-muted)]">{deleteTarget?.title}</p>{deleteError ? <p role="alert" aria-live="polite" className={styles.inlineError}>{deleteError}</p> : null}<div className={styles.dialogActions}><button type="button" disabled={Boolean(actionId)} onClick={() => setDeleteTarget(null)} className={styles.cancelAction}>Cancel</button><button type="button" onClick={() => void removeDocument()} disabled={Boolean(actionId)} className={styles.confirmAction + " " + styles.confirmDanger}>{actionId ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}{actionId ? actionLabel : "Delete permanently"}</button></div>
    </Modal>
    <Modal open={Boolean(archiveTarget)} onClose={() => { if (!actionId) setArchiveTarget(null); }} title={archiveTarget?.archived ? "Archive this policy?" : "Restore this policy?"} description={archiveTarget?.archived ? "The policy will move to the archived list and can be restored later." : "The policy will return to the active policies list."} hideClose={Boolean(actionId)} width={480}>
      <p className="break-words text-sm text-[var(--pc-muted)]">{archiveTarget?.document.title}</p>{archiveError ? <p role="alert" aria-live="polite" className={styles.inlineError}>{archiveError}</p> : null}<div className={styles.dialogActions}><button type="button" disabled={Boolean(actionId)} onClick={() => setArchiveTarget(null)} className={styles.cancelAction}>Cancel</button><button type="button" disabled={Boolean(actionId) || !archiveTarget} onClick={() => { if (archiveTarget) void setArchived(archiveTarget.document, archiveTarget.archived); }} className={styles.confirmAction}>{actionId ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : archiveTarget?.archived ? <Archive size={14} aria-hidden="true" /> : <ArchiveRestore size={14} aria-hidden="true" />}{actionId ? actionLabel : archiveTarget?.archived ? "Archive policy" : "Restore policy"}</button></div>
    </Modal>
  </div></ApplicationSurface>;
}

export default function AdminPoliciesPage() {
  return <React.Suspense fallback={<div className="min-h-48" aria-busy="true" />}><AdminPoliciesContent /></React.Suspense>;
}
