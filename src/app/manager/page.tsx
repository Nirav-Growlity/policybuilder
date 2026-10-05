"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArrowRight, Building2, FileText, Loader2, Plus, RefreshCw, Search } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { Modal } from "@/components/ui/modal";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { POLICY_PROFILES } from "@/lib/constants";
import { initialPolicy } from "@/lib/store";
import { policyCraftScopedUrl } from "@/lib/policycraft-scope-utils";
import type { PolicyCraftWorkspaceScope } from "@/lib/policycraft-access-types";
import type { PolicyDocumentSummary } from "@/lib/policycraft-types";
import type { Policy, PolicyType } from "@/lib/types";

type View = "active" | "archived";
type Filter = "all" | PolicyType;
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
  const [documents, setDocuments] = React.useState<PolicyDocumentSummary[]>([]);
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
  const [archiveTarget, setArchiveTarget] = React.useState<{ document: PolicyDocumentSummary; scopeKey: string; generation: number } | null>(null);
  const [archiveError, setArchiveError] = React.useState("");
  const requestGeneration = React.useRef(0);
  const searchUrlTimer = React.useRef<number | null>(null);
  const [requestEpoch, setRequestEpoch] = React.useState(0);

  const organizations = React.useMemo(() => (access?.organizations || []).filter((item) => !item.deleted && !item.expired), [access]);
  const requestedOrganizationId = requestedOrg ? Number(requestedOrg) : null;
  const organization = organizations.find((item) => item.id === requestedOrganizationId) || (organizations.length === 1 ? organizations[0] : null);
  const orgId = organization?.id;
  const scopeKey = orgId ? `${orgId}:${view}` : "";

  const [searchDraftLocation, setSearchDraftLocation] = React.useState(queryString);
  if (searchDraftLocation !== queryString) {
    setSearchDraftLocation(queryString);
    setSearchDraft(new URLSearchParams(queryString).get("q") || "");
  }

  React.useEffect(() => {
    if (organization && requestedOrg !== String(organization.id)) {
      const params = new URLSearchParams(queryString);
      params.set("orgId", String(organization.id));
      router.replace(`/manager?${params.toString()}`, { scroll: false });
    }
  }, [organization, queryString, requestedOrg, router]);

  const load = React.useCallback(async () => {
    const generation = ++requestGeneration.current;
    setRequestEpoch(generation);
    if (!orgId) {
      setDocuments([]);
      setLoadedScope("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const currentScopeKey = `${orgId}:${view}`;
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents?view=${view}`, orgId), { cache: "no-store" });
      if (response.status === 401) { router.replace("/login?next=/manager"); return; }
      if (!response.ok) throw new Error("Could not load this organization’s policies.");
      const data = await response.json();
      if (generation !== requestGeneration.current) return;
      setDocuments(data.documents || []);
      setLoadedScope(currentScopeKey);
    } catch (cause) {
      if (generation === requestGeneration.current) setError({ scopeKey: currentScopeKey, message: cause instanceof Error ? cause.message : "Could not load this organization’s policies." });
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [orgId, router, view]);

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
    const selected = organizations.find((item) => String(item.id) === id) || null;
    if (!selected) return;
    if (searchUrlTimer.current !== null) window.clearTimeout(searchUrlTimer.current);
    searchUrlTimer.current = null;
    setNotice(null);
    const params = new URLSearchParams(queryString);
    params.set("orgId", String(selected.id));
    if (searchDraft) params.set("q", searchDraft); else params.delete("q");
    router.push(`/manager?${params.toString()}`, { scroll: false });
  }

  async function mutateDocument(document: PolicyDocumentSummary, action: "archive") {
    if (!orgId || (actionId?.scopeKey === scopeKey && actionId.generation === requestGeneration.current)) return;
    const generation = requestGeneration.current;
    setActionId({ id: document.id, scopeKey, generation });
    setError(null);
    setArchiveError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${encodeURIComponent(document.id)}`, orgId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, lockVersion: document.lockVersion }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not update this policy.");
      if (generation !== requestGeneration.current) return;
      setArchiveTarget(null);
      setNotice({ scopeKey, message: `${document.title} was archived.` });
      await load();
    } catch (cause) {
      if (generation === requestGeneration.current) setArchiveError(cause instanceof Error ? cause.message : "Could not update this policy.");
    } finally { if (generation === requestGeneration.current) setActionId(null); }
  }

  const filteredDocuments = filter === "all" ? documents : documents.filter((document) => document.policyType === filter);
  const scopedDocuments = loadedScope === scopeKey ? filteredDocuments : [];
  const normalizedQuery = searchDraft.trim().toLocaleLowerCase();
  const activeActionId = actionId?.scopeKey === scopeKey && actionId.generation === requestEpoch ? actionId.id : null;
  const activeArchiveTarget = archiveTarget?.scopeKey === scopeKey && archiveTarget.generation === requestEpoch ? archiveTarget.document : null;
  const visibleError = error?.scopeKey === scopeKey ? error.message : "";
  const visibleNotice = notice?.scopeKey === scopeKey ? notice.message : "";
  const isLoading = loading || Boolean(scopeKey && loadedScope !== scopeKey);
  const visibleDocuments = normalizedQuery
    ? scopedDocuments.filter((document) => document.title.toLocaleLowerCase().includes(normalizedQuery))
    : scopedDocuments;
  const policyScope: PolicyCraftWorkspaceScope | null = access && organization ? {
    userId: access.actor.id, role: access.actor.role, organizationId: organization.id, organizationName: organization.name,
  } : null;

  if (!organizations.length) return (
    <section className="mx-auto max-w-2xl py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><Building2 size={22} /></div>
      <h1 className="mt-5 font-display text-2xl font-semibold">No organizations assigned</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-ink-2)]">Ask your PolicyCraft administrator to assign an organization. Its shared policies will appear here when access is ready.</p>
    </section>
  );

  return <>
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Manager workspace</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-[34px]">Organizations & policies</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-2)]">Policies are shared with every manager assigned to the organization.</p>
      </div>
      <div className="flex flex-col gap-2 sm:min-w-64">
        <label htmlFor="manager-organization" className="text-[11px] font-semibold text-[var(--color-ink-2)]">Organization</label>
        <select id="manager-organization" name="organizationId" value={organization ? String(organization.id) : ""} onChange={(event) => selectOrganization(event.target.value)} className="h-11 rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]">
          {organizations.length > 1 ? <option value="" disabled>Select organization</option> : null}
          {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
    </div>

    {!organization ? <section className="mt-8 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-6 py-12 text-center"><Building2 size={22} className="mx-auto text-[var(--color-ink-2)]" aria-hidden="true" /><h2 className="mt-3 font-display text-lg font-semibold">Choose an organization</h2><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--color-ink-2)]">Select an organization above to view its shared policies.</p></section> : null}

    {visibleError ? <div role="alert" className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span className="min-w-0">{visibleError}</span><button type="button" onClick={() => void load()} aria-label="Retry loading policies" className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-2 text-xs font-semibold text-red-900 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-red-900"><RefreshCw size={15} aria-hidden="true" />Retry</button></div> : null}
    {visibleNotice ? <p role="status" aria-live="polite" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{visibleNotice}</p> : null}

    {organization ? <>
      <div className="mt-7 flex flex-col justify-between gap-3 border-b border-[var(--color-line)] pb-4 sm:flex-row sm:items-end">
        <div className="min-w-0"><h2 className="break-words font-display text-xl font-semibold">{organization.name}</h2><p className="mt-1 text-xs text-[var(--color-ink-2)]" aria-live="polite">{visibleDocuments.length} of {documents.length} {view === "archived" ? "archived" : "active"} {documents.length === 1 ? "policy" : "policies"}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--color-line)] bg-white p-1" aria-label="Policy status">
            {(["active", "archived"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => { setNotice(null); updateQuery({ view: item }, "push"); }} className={`min-h-9 rounded-md px-3 text-xs font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] ${view === item ? "bg-[var(--color-forest)] text-white" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]"}`}>{item === "archived" ? <><Archive size={13} className="mr-1 inline" aria-hidden="true" />Archived</> : "Active"}</button>)}
          </div>
          {view === "active" ? <Link href={`/builder?orgId=${organization.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={15} />New policy</Link> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by policy type">
          {["all", ...TYPES].map((type) => <button key={type} type="button" aria-pressed={filter === type} onClick={() => updateQuery({ type: type as Filter }, "push")} className={`min-h-9 rounded-full border px-3 py-1.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)] ${filter === type ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-white" : "border-[var(--color-line)] bg-white text-[var(--color-ink-2)] hover:border-[var(--color-forest)]"}`}>{type === "all" ? "All" : POLICY_PROFILES[type as PolicyType].short}</button>)}
        </div>
        <label htmlFor="manager-policy-search" className="relative block w-full sm:max-w-xs">
          <span className="sr-only">Search policies by title</span>
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-2)]" />
          <input id="manager-policy-search" name="q" type="search" autoComplete="off" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search policies…" className="h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white pl-9 pr-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" />
        </label>
    </div>

      {isLoading ? <div className="flex justify-center py-20" aria-live="polite" aria-busy="true"><Loader2 size={20} className="animate-spin text-[var(--color-forest)]" aria-hidden="true" /><span className="sr-only">Loading policies…</span></div> : visibleError ? null : visibleDocuments.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-6 py-14 text-center"><FileText size={24} className="mx-auto text-[var(--color-ink-2)]" aria-hidden="true" /><h3 className="mt-3 font-display text-lg font-semibold">{documents.length === 0 ? view === "archived" ? "No archived policies" : "No policies yet" : "No matching policies"}</h3><p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-ink-2)]">{documents.length === 0 ? view === "archived" ? "Archived policies will be listed here." : "Create a policy for this organization to start the shared workspace." : "Try another title or policy type filter."}</p>{documents.length > 0 && (searchDraft || filter !== "all") ? <button type="button" onClick={() => { setSearchDraft(""); updateQuery({ q: "", type: "all" }, "push"); }} className="mt-4 inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Clear filters</button> : null}</div> : <div className="mt-6 divide-y divide-[var(--color-line)] overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        {visibleDocuments.map((document) => <article key={document.id} className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
          <div role="img" aria-label={`Cover preview for ${document.title}`} className="relative h-[88px] w-[64px] shrink-0 overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-cream-2)]"><div className="absolute left-0 top-0 origin-top-left" style={{ width: "210mm", height: "297mm", transform: "scale(.08)" }} aria-hidden="true"><PolicyCoverPreview policy={policyFromSummary(document)} assetScope={policyScope} /></div></div>
          <div className="min-w-0 flex-1"><h3 className="truncate font-display text-lg font-semibold" title={document.title}>{document.title}</h3><p className="mt-1 text-xs text-[var(--color-ink-2)]">{POLICY_PROFILES[document.policyType]?.label || readable(document.policyType)} · Updated {new Date(document.updatedAt).toLocaleDateString()}</p><p className="mt-2 text-xs text-[var(--color-ink-2)]">Created by <span className="font-semibold">{document.createdBy?.name || document.createdBy?.email || "Workspace member"}</span></p></div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            {view === "active" ? <><button type="button" aria-label={`Archive ${document.title}`} disabled={Boolean(activeActionId)} onClick={() => { setNotice(null); setArchiveError(""); setArchiveTarget({ document, scopeKey, generation: requestGeneration.current }); }} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50"><Archive size={13} aria-hidden="true" />Archive</button><Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${organization.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]">Open <ArrowRight size={14} aria-hidden="true" /></Link></> : <span className="text-xs text-[var(--color-ink-2)]">Archived · contact an administrator to restore</span>}
          </div>
        </article>)}
      </div>}
    </> : null}
    <Modal open={Boolean(activeArchiveTarget)} onClose={() => { if (!activeActionId) setArchiveTarget(null); }} title="Archive this policy?" description={`“${activeArchiveTarget?.title || "This policy"}” will move to Archived and remain available there.`} width={460}>
      {archiveError ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{archiveError}</p> : null}
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
        <button type="button" disabled={Boolean(activeActionId)} onClick={() => setArchiveTarget(null)} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60">Cancel</button>
        <button type="button" disabled={!activeArchiveTarget || Boolean(activeActionId)} onClick={() => activeArchiveTarget && void mutateDocument(activeArchiveTarget, "archive")} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-wait disabled:opacity-60">{activeActionId ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Archive size={15} aria-hidden="true" />}{activeActionId ? "Archiving…" : "Archive policy"}</button>
      </div>
    </Modal>
  </>;
}
