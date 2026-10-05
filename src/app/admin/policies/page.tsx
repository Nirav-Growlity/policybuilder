"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpRight, FileText, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { ActionDisclosure, ActionDisclosureItem } from "@/components/ui/action-disclosure";
import { Modal } from "@/components/ui/modal";
import { POLICY_PROFILES } from "@/lib/constants";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { policyCraftExportContext } from "@/lib/policycraft-client-scope";
import type { PolicyCraftDocumentState, PolicyDocumentSummary } from "@/lib/policycraft-types";
import type { Policy, PolicyType } from "@/lib/types";

type Creator = { id: string; name: string; email: string };
type OrganizationLabel = { id: number; name: string; code?: string; deleted?: boolean; expired?: boolean };
type AdminPolicy = PolicyDocumentSummary & { organization: OrganizationLabel; createdBy: Creator; state?: PolicyCraftDocumentState };
type AdminDocumentResponse = { documents: AdminPolicy[]; creators?: Creator[] };

const POLICY_TYPES = Object.keys(POLICY_PROFILES) as PolicyType[];
type View = "active" | "archived";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function label(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

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
    return <div className="flex items-center justify-start gap-2 lg:justify-end">
      <Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${document.organization.id}`} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><ArrowUpRight size={15} aria-hidden="true" />{editLabel}</Link>
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

  const renderPolicyIdentity = (document: AdminPolicy) => <div className="flex min-w-0 items-start gap-3">
    <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><FileText size={18} aria-hidden="true" /></span>
    <div className="min-w-0"><h3 className="break-words font-display text-[16px] font-semibold leading-snug text-[var(--color-ink)]">{document.title || "Untitled policy"}</h3><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-muted)]"><span>{POLICY_PROFILES[document.policyType]?.label || label(document.policyType)}</span><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${document.archivedAt ? "bg-slate-400" : "bg-emerald-600"}`} aria-hidden="true" />{document.archivedAt ? "Archived" : label(document.currentStep)}</span></p>{actionId === document.id ? <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-forest)]" role="status" aria-live="polite"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{actionLabel}</p> : null}</div>
  </div>;

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Administration</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-pretty sm:text-[34px]">All policies</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">Browse, manage, and export policies across organizations.</p></div><Link href="/builder" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={15} aria-hidden="true" />New policy</Link></div>
    {error ? <div className="mt-6 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><p>{error}</p><button type="button" onClick={() => void retryLoad()} aria-label="Retry loading policies" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}
    {loadError ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><p>{loadError}</p><button type="button" onClick={() => void retryLoad()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}

    <section aria-label="Policy library" className="relative mt-7 rounded-2xl border border-[var(--color-line)] bg-white shadow-[0_12px_36px_rgba(29,45,36,.045)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3 sm:px-6"><div className="inline-flex gap-1" role="group" aria-label="Policy status"><button type="button" aria-pressed={view === "active"} onClick={() => setView("active")} className={`min-h-11 rounded-lg px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] ${view === "active" ? "bg-[var(--color-forest)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-ink)]"}`}>Active</button><button type="button" aria-pressed={view === "archived"} onClick={() => setView("archived")} className={`min-h-11 rounded-lg px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] ${view === "archived" ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-ink)]"}`}>Archived</button></div><p className="text-sm text-[var(--color-muted)]" aria-live="polite">{loading ? "Loading policies…" : `${filtered.length} ${filtered.length === 1 ? "policy" : "policies"}`}</p></div>
    <div className="grid items-end gap-3 border-b border-[var(--color-line)] bg-[var(--color-cream-2)]/55 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[minmax(240px,1.35fr)_repeat(3,minmax(140px,.75fr))]">
      <div className="col-span-full flex items-end gap-2 lg:contents"><label className="relative block min-w-0 flex-1 lg:flex-none"><span className="sr-only">Search policies</span><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" /><input name="policySearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search policies…" className="h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white pl-9 pr-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]" /></label><button type="button" aria-expanded={filtersOpen} aria-controls="policy-filter-options" onClick={() => setFiltersOpen((open) => !open)} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] lg:hidden">Filters</button></div>
      <div id="policy-filter-options" className={`${filtersOpen ? "grid" : "hidden"} col-span-full grid-cols-1 gap-3 sm:grid-cols-2 lg:contents`}>
        <label className="text-xs font-semibold text-[var(--color-muted)]">Organization<select name="organizationFilter" value={orgId} onChange={(event) => setOrgId(event.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><option value="all">All organizations</option>{organizations.map((organization) => <option key={organization.id} value={String(organization.id)}>{organization.name}{organization.deleted ? " · deleted" : ""}</option>)}</select></label>
        <label className="text-xs font-semibold text-[var(--color-muted)]">Creator<select name="creatorFilter" value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><option value="all">All creators</option>{creatorId !== "all" && !creators.some((creator) => creator.id === creatorId) ? <option value={creatorId}>Selected creator</option> : null}{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name || creator.email}</option>)}</select></label>
        <label className="text-xs font-semibold text-[var(--color-muted)]">Policy type<select name="policyTypeFilter" value={policyType} onChange={(event) => setPolicyType(event.target.value)} className="mt-1 block h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><option value="all">All policy types</option>{POLICY_TYPES.map((type) => <option key={type} value={type}>{POLICY_PROFILES[type].label}</option>)}</select></label>
      </div>
    </div>

    {loading ? <div className="grid min-h-56 place-items-center gap-2 text-sm text-[var(--color-muted)]" aria-live="polite"><Loader2 size={19} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading policies…</div> : loadError ? <div className="px-6 py-12 text-center" role="status"><FileText size={25} className="mx-auto text-[var(--color-muted)]" aria-hidden="true" /><h2 className="mt-3 font-display text-xl font-semibold">Policies could not be loaded</h2><p className="mt-1 text-sm text-[var(--color-muted)]">The policy list will appear after the request succeeds.</p></div> : filtered.length === 0 ? <div className="px-6 py-16 text-center"><FileText size={25} className="mx-auto text-[var(--color-forest)]" aria-hidden="true" /><h2 className="mt-3 font-display text-xl font-semibold">{hasFilters ? "No policies match these filters" : view === "archived" ? "No archived policies" : "No policies yet"}</h2><p className="mt-1 text-sm text-[var(--color-muted)]">{hasFilters ? "Try another search or clear your filters." : view === "archived" ? "Archived policies will appear here." : "Create a new policy for an organization to get started."}</p>{hasFilters ? <button type="button" onClick={() => { setQuery(""); setOrgId("all"); setCreatorId("all"); setPolicyType("all"); setView("active"); }} className="mt-4 min-h-11 rounded-lg px-4 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]">Clear filters</button> : null}</div> : <>
      <div className="hidden lg:block"><table className="w-full table-fixed border-collapse text-left text-sm"><colgroup><col className="w-[42%]" /><col className="w-[22%]" /><col className="w-[18%]" /><col className="w-[18%]" /></colgroup><thead className="text-[11px] uppercase tracking-wider text-[var(--color-muted)]"><tr><th scope="col" className="px-6 py-3 font-semibold">Policy</th><th scope="col" className="px-4 py-3 font-semibold">Organization</th><th scope="col" className="px-4 py-3 font-semibold">Owner / updated</th><th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-line)]">{filtered.map((document) => <tr key={document.id} className={document.organization?.deleted ? "bg-slate-50/70" : undefined}><th scope="row" className="px-6 py-4 font-medium">{renderPolicyIdentity(document)}</th><td className="px-4 py-4"><span className="block break-words font-medium text-[var(--color-ink)]">{document.organization?.name || "Unknown organization"}</span>{document.organization?.deleted ? <span className="mt-1 block text-xs text-slate-600">Deleted · read only</span> : document.organization?.expired ? <span className="mt-1 block text-xs text-amber-800">Expired · admin editing allowed</span> : null}</td><td className="px-4 py-4"><span className="block break-words font-medium">{document.createdBy?.name || "Unknown"}</span><span className="mt-1 block break-all text-xs text-[var(--color-muted)]">{document.createdBy?.email || ""}</span><span className="mt-1 block text-xs text-[var(--color-muted)]">Updated {formatDate(document.updatedAt)}</span></td><td className="px-3 py-4">{renderPolicyActions(document)}</td></tr>)}</tbody></table></div>
      <div className="divide-y divide-[var(--color-line)] lg:hidden">{filtered.map((document) => <article key={document.id} className="px-4 py-5 sm:px-6"><div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 w-full sm:flex-1">{renderPolicyIdentity(document)}</div><div className="w-full sm:w-auto sm:shrink-0">{renderPolicyActions(document)}</div></div><dl className="mt-4 grid gap-x-5 gap-y-3 border-t border-[var(--color-line)] pt-4 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Organization</dt><dd className="mt-1 break-words font-medium">{document.organization?.name || "Unknown organization"}{document.organization?.deleted ? <span className="block text-xs font-normal text-slate-600">Deleted · read only</span> : document.organization?.expired ? <span className="block text-xs font-normal text-amber-800">Expired · admin editing allowed</span> : null}</dd></div><div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Owner</dt><dd className="mt-1 break-words">{document.createdBy?.name || "Unknown"}<span className="block break-all text-xs text-[var(--color-muted)]">{document.createdBy?.email || ""}</span></dd></div><div><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Updated</dt><dd className="mt-1">{formatDate(document.updatedAt)}</dd></div></dl></article>)}</div>
    </>}
    </section>

    <Modal open={Boolean(deleteTarget)} onClose={() => { if (!actionId) setDeleteTarget(null); }} title="Delete archived policy?" description="This permanently deletes the selected archived policy and its saved content." hideClose={Boolean(actionId)} width={480}>
      <p className="break-words text-sm text-[var(--color-ink-2)]">{deleteTarget?.title}</p>{deleteError ? <p role="alert" aria-live="polite" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{deleteError}</p> : null}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(actionId)} onClick={() => setDeleteTarget(null)} className="min-h-11 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-medium hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60">Cancel</button><button type="button" onClick={() => void removeDocument()} disabled={Boolean(actionId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-60">{actionId ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}{actionId ? actionLabel : "Delete permanently"}</button></div>
    </Modal>
    <Modal open={Boolean(archiveTarget)} onClose={() => { if (!actionId) setArchiveTarget(null); }} title={archiveTarget?.archived ? "Archive this policy?" : "Restore this policy?"} description={archiveTarget?.archived ? "The policy will move to the archived list and can be restored later." : "The policy will return to the active policies list."} hideClose={Boolean(actionId)} width={480}>
      <p className="break-words text-sm text-[var(--color-ink-2)]">{archiveTarget?.document.title}</p>{archiveError ? <p role="alert" aria-live="polite" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{archiveError}</p> : null}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(actionId)} onClick={() => setArchiveTarget(null)} className="min-h-11 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-medium hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60">Cancel</button><button type="button" disabled={Boolean(actionId) || !archiveTarget} onClick={() => { if (archiveTarget) void setArchived(archiveTarget.document, archiveTarget.archived); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60">{actionId ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : archiveTarget?.archived ? <Archive size={14} aria-hidden="true" /> : <ArchiveRestore size={14} aria-hidden="true" />}{actionId ? actionLabel : archiveTarget?.archived ? "Archive policy" : "Restore policy"}</button></div>
    </Modal>
  </div>;
}

export default function AdminPoliciesPage() {
  return <React.Suspense fallback={<div className="min-h-48" aria-busy="true" />}><AdminPoliciesContent /></React.Suspense>;
}
