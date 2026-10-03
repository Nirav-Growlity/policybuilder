"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArrowRight, Building2, FileText, Loader2, Plus, RefreshCw } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { POLICY_PROFILES } from "@/lib/constants";
import { initialPolicy } from "@/lib/store";
import { policyCraftScopedUrl } from "@/lib/policycraft-scope-utils";
import type { PolicyCraftAccess, PolicyCraftOrganization, PolicyCraftWorkspaceScope } from "@/lib/policycraft-access-types";
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
  const requestedOrg = search.get("orgId");
  const [access, setAccess] = React.useState<PolicyCraftAccess | null>(null);
  const [organization, setOrganization] = React.useState<PolicyCraftOrganization | null>(null);
  const [documents, setDocuments] = React.useState<PolicyDocumentSummary[]>([]);
  const [view, setView] = React.useState<View>(search.get("view") === "archived" ? "archived" : "active");
  const [filter, setFilter] = React.useState<Filter>((search.get("type") as Filter) || "all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [actionId, setActionId] = React.useState<string | null>(null);
  const requestGeneration = React.useRef(0);

  const organizations = React.useMemo(() => (access?.organizations || []).filter((item) => !item.deleted && !item.expired), [access]);
  const orgId = organization?.id;

  React.useEffect(() => {
    let active = true;
    void fetch("/api/policycraft/access", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { router.replace("/login?next=/manager"); return null; }
      if (!response.ok) throw new Error("Could not verify your assigned organizations.");
      return response.json() as Promise<PolicyCraftAccess>;
    }).then((result) => {
      if (!active || !result) return;
      if (result.actor.role !== "manager") { router.replace(result.homeHref); return; }
      setAccess(result);
      const choices = result.organizations.filter((item) => !item.deleted && !item.expired);
      const requestedId = requestedOrg ? Number(requestedOrg) : null;
      const selected = choices.find((item) => item.id === requestedId) || (choices.length === 1 ? choices[0] : null);
      setOrganization(selected);
      if (selected && requestedOrg !== String(selected.id)) router.replace(`/manager?orgId=${selected.id}`);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load workspace access."); });
    return () => { active = false; };
  }, [requestedOrg, router]);

  const load = React.useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!orgId) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents?view=${view}`, orgId), { cache: "no-store" });
      if (response.status === 401) { router.replace("/login?next=/manager"); return; }
      if (!response.ok) throw new Error("Could not load this organization’s policies.");
      const data = await response.json();
      if (generation !== requestGeneration.current) return;
      setDocuments(data.documents || []);
    } catch (cause) {
      if (generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : "Could not load this organization’s policies.");
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  }, [orgId, router, view]);

  React.useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);
  React.useEffect(() => {
    const params = new URLSearchParams(search.toString());
    if (organization) params.set("orgId", String(organization.id));
    if (view === "archived") params.set("view", view); else params.delete("view");
    if (filter === "all") params.delete("type"); else params.set("type", filter);
    const next = params.toString();
    if (next !== search.toString()) router.replace(`/manager${next ? `?${next}` : ""}`, { scroll: false });
  }, [filter, organization, router, search, view]);

  function selectOrganization(id: string) {
    const selected = organizations.find((item) => String(item.id) === id) || null;
    requestGeneration.current += 1;
    setOrganization(selected);
    setDocuments([]);
    setLoading(Boolean(selected));
    setError("");
    if (selected) router.push(`/manager?orgId=${selected.id}`);
  }

  async function mutateDocument(document: PolicyDocumentSummary, action: "archive") {
    if (!orgId || actionId) return;
    const generation = requestGeneration.current;
    setActionId(document.id);
    setError("");
    try {
      const response = await fetch(policyCraftScopedUrl(`/api/policycraft/documents/${encodeURIComponent(document.id)}`, orgId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, lockVersion: document.lockVersion }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not update this policy.");
      if (generation !== requestGeneration.current) return;
      await load();
    } catch (cause) {
      if (generation === requestGeneration.current) setError(cause instanceof Error ? cause.message : "Could not update this policy.");
    } finally { setActionId(null); }
  }

  const visibleDocuments = filter === "all" ? documents : documents.filter((document) => document.policyType === filter);
  const policyScope: PolicyCraftWorkspaceScope | null = access && organization ? {
    userId: access.actor.id, role: access.actor.role, organizationId: organization.id, organizationName: organization.name,
  } : null;

  if (!access && !error) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-[var(--color-muted)]"><Loader2 size={17} className="animate-spin" />Loading manager workspace…</div>;
  if (!organizations.length && access) return (
    <section className="mx-auto max-w-2xl py-12 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><Building2 size={22} /></div>
      <h1 className="mt-5 font-display text-2xl font-semibold">No organizations assigned</h1>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-muted)]">Ask your PolicyCraft administrator to assign an organization. Its shared policies will appear here when access is ready.</p>
    </section>
  );

  return <>
    <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Manager workspace</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Organizations & policies</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Policies are shared with every manager assigned to the organization.</p>
      </div>
      <div className="flex flex-col gap-2 sm:min-w-64">
        <label htmlFor="manager-organization" className="text-[11px] font-semibold text-[var(--color-ink-2)]">Organization</label>
        <select id="manager-organization" name="organizationId" value={organization ? String(organization.id) : ""} onChange={(event) => selectOrganization(event.target.value)} className="h-11 rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm text-[var(--color-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-forest)]">
          {organizations.length > 1 ? <option value="" disabled>Select organization</option> : null}
          {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>
    </div>

    {error ? <div role="alert" className="mt-6 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => void load()} aria-label="Retry loading policies" className="rounded p-2 hover:bg-red-100"><RefreshCw size={15} /></button></div> : null}

    {organization ? <>
      <div className="mt-7 flex flex-col justify-between gap-3 border-b border-[var(--color-line)] pb-4 sm:flex-row sm:items-end">
        <div><h2 className="font-display text-xl font-semibold">{organization.name}</h2><p className="mt-1 text-xs text-[var(--color-muted)]">{documents.length} {view === "archived" ? "archived" : "active"} {documents.length === 1 ? "policy" : "policies"}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--color-line)] bg-white p-1" aria-label="Policy status">
            {(["active", "archived"] as const).map((item) => <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`min-h-9 rounded-md px-3 text-xs font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] ${view === item ? "bg-[var(--color-forest)] text-white" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]"}`}>{item === "archived" ? <><Archive size={13} className="mr-1 inline" />Archived</> : "Active"}</button>)}
          </div>
          {view === "active" ? <Link href={`/builder?orgId=${organization.id}`} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={15} />New policy</Link> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter by policy type">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === "all" ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-white" : "border-[var(--color-line)] bg-white text-[var(--color-ink-2)] hover:border-[var(--color-forest)]"}`}>All</button>
        {TYPES.map((type) => <button key={type} type="button" aria-pressed={filter === type} onClick={() => setFilter(type)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === type ? "border-[var(--color-forest)] bg-[var(--color-forest)] text-white" : "border-[var(--color-line)] bg-white text-[var(--color-ink-2)] hover:border-[var(--color-forest)]"}`}>{POLICY_PROFILES[type].short}</button>)}
      </div>

      {loading ? <div className="flex justify-center py-20"><Loader2 size={20} className="animate-spin text-[var(--color-forest)]" aria-label="Loading policies" /></div> : visibleDocuments.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-6 py-14 text-center"><FileText size={24} className="mx-auto text-[var(--color-muted)]" /><h3 className="mt-3 font-display text-lg font-semibold">{view === "archived" ? "No archived policies" : "No policies yet"}</h3><p className="mx-auto mt-1 max-w-md text-sm text-[var(--color-muted)]">{view === "archived" ? "Archived policies will be listed here." : "Create a policy for this organization to start the shared workspace."}</p></div> : <div className="mt-6 divide-y divide-[var(--color-line)] overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        {visibleDocuments.map((document) => <article key={document.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-5">
          <div role="img" aria-label={`Cover preview for ${document.title}`} className="relative h-[88px] w-[64px] shrink-0 overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-cream-2)]"><div className="absolute left-0 top-0 origin-top-left" style={{ width: "210mm", height: "297mm", transform: "scale(.08)" }} aria-hidden="true"><PolicyCoverPreview policy={policyFromSummary(document)} assetScope={policyScope} /></div></div>
          <div className="min-w-0 flex-1"><h3 className="truncate font-display text-lg font-semibold" title={document.title}>{document.title}</h3><p className="mt-1 text-xs text-[var(--color-muted)]">{POLICY_PROFILES[document.policyType]?.label || readable(document.policyType)} · Updated {new Date(document.updatedAt).toLocaleDateString()}</p><p className="mt-2 text-xs text-[var(--color-ink-2)]">Created by <span className="font-semibold">{document.createdBy?.name || document.createdBy?.email || "Workspace member"}</span></p></div>
          <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
            {view === "active" ? <><button type="button" aria-label={`Archive ${document.title}`} disabled={!!actionId} onClick={() => void mutateDocument(document, "archive")} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50"><Archive size={13} />Archive</button><Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${organization.id}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]">Open <ArrowRight size={14} /></Link></> : <span className="text-xs text-[var(--color-muted)]">Archived · contact an administrator to restore</span>}
          </div>
        </article>)}
      </div>}
    </> : null}
  </>;
}
