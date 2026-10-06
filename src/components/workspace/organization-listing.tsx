"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { OrganizationManagerAssignment } from "@/components/workspace/organization-manager-assignment";
import { OrganizationSourceBadge, organizationSourceName } from "@/components/workspace/organization-source-label";
import type { PolicyCraftOrganization } from "@/lib/policycraft-access-types";

type OrganizationSummary = PolicyCraftOrganization;
type OrganizationSource = PolicyCraftOrganization["source"];

export function OrganizationListing({ source }: { source: OrganizationSource }) {
  const router = useRouter();
  const [organizations, setOrganizations] = React.useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [createdOrganizationId, setCreatedOrganizationId] = React.useState<number | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/policycraft/admin/organizations", { cache: "no-store" });
      if (response.status === 401) {
        const next = source === "standalone" ? "/admin/organizations/policycraft" : "/admin/organizations";
        router.replace(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Organizations could not be loaded. Retry to continue.");
      const loaded = Array.isArray(result?.organizations) ? result.organizations as OrganizationSummary[] : [];
      setOrganizations(loaded);
      const createdId = Number(new URLSearchParams(window.location.search).get("created"));
      const sourceOrganizations = loaded.filter((organization) => organization.source === source);
      setCreatedOrganizationId(source === "standalone" && Number.isSafeInteger(createdId) && sourceOrganizations.some((organization) => organization.id === createdId) ? createdId : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Organizations could not be loaded."); }
    finally { setLoading(false); }
  }, [router, source]);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const sourceOrganizations = organizations.filter((organization) => organization.source === source);
  const createdOrganization = source === "standalone" ? sourceOrganizations.find((organization) => organization.id === createdOrganizationId) || null : null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleOrganizations = sourceOrganizations.filter((organization) => `${organization.name} ${organization.code} ${organizationSourceName(organization)}`.toLocaleLowerCase().includes(normalizedQuery));
  const policyCraft = source === "standalone";

  return <div>
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Admin workspace</p><h1 className="mt-1 text-pretty font-display text-3xl font-semibold tracking-tight sm:text-[34px]">{policyCraft ? "PolicyCraft organizations" : "Organizations"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">{policyCraft ? "Manage PolicyCraft company profiles and assign managers." : "Manage ESG organizations and assign PolicyCraft managers."}</p></div>{policyCraft ? <Link href="/admin/organizations/new" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={15} aria-hidden="true" />Create organization</Link> : null}</div>

    {error ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><span>{error}</span><button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800"><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}
    {createdOrganization ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status" aria-live="polite"><span>{createdOrganization.name} is ready. Assign a manager to grant access.</span><div className="flex flex-wrap items-center gap-2"><OrganizationManagerAssignment organization={createdOrganization} label="Assign existing manager" /><Link href={`/admin/managers/new?organizationId=${createdOrganization.id}`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-emerald-900 underline hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">Add new manager</Link></div></div> : null}

    {loading ? <div className="mt-8 flex min-h-40 items-center justify-center gap-3 text-sm text-[var(--color-muted)]" role="status" aria-live="polite" aria-busy="true"><Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading organizations…</div> : error ? null : <>
      <section className="mt-7 flex flex-col gap-2 rounded-xl border border-[var(--color-line)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5" aria-label={`Search ${policyCraft ? "PolicyCraft" : "ESG"} organizations`}>
        <label className="block min-w-0 flex-1 text-xs font-semibold text-[var(--color-ink-2)]"><span className="sr-only">Search {policyCraft ? "PolicyCraft" : "ESG"} organizations by name, code, or source</span><span className="relative block"><Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" /><input type="search" name="organizationSearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, code, or source…" className="h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white pl-9 pr-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]" /></span></label>
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-[var(--color-muted)]" aria-live="polite">Showing <span className="font-semibold tabular-nums text-[var(--color-ink)]">{visibleOrganizations.length}</span> of <span className="font-semibold tabular-nums text-[var(--color-ink)]">{sourceOrganizations.length}</span> organizations</p>{query ? <button type="button" onClick={() => setQuery("")} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><X size={13} aria-hidden="true" />Clear</button> : null}</div>
      </section>
      {visibleOrganizations.length ? <div className="mt-3 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white"><div className="hidden grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--color-line)] bg-[var(--color-cream-2)]/60 px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] md:grid"><span>Organization</span><span className="text-right">Action</span></div><ul className="divide-y divide-[var(--color-line)]">{visibleOrganizations.map((organization) => <OrganizationRow key={organization.id} organization={organization} />)}</ul></div> : <OrganizationEmptyState source={source} hasOrganizations={sourceOrganizations.length > 0} onClear={() => setQuery("")} />}
    </>}
  </div>;
}

function OrganizationRow({ organization }: { organization: OrganizationSummary }) {
  return <li className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold">{organization.name}</h2><OrganizationSourceBadge organization={organization} /></div><p className="mt-1 text-xs text-[var(--color-muted)]">{organization.code || `ID ${organization.id}`}{organization.deleted ? " · deleted" : organization.expired ? " · expired" : ""}</p></div><div className="flex flex-wrap gap-2 md:justify-end">{organization.source === "standalone" ? <Link href={`/admin/organizations/${organization.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-[var(--color-line-2)] px-3 text-xs font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Edit details</Link> : <span className="inline-flex min-h-10 items-center px-3 text-xs text-[var(--color-muted)]">Managed in ESG</span>}<OrganizationManagerAssignment organization={organization} /><Link href={`/admin/managers/new?organizationId=${organization.id}`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Add new manager</Link></div></li>;
}

function OrganizationEmptyState({ source, hasOrganizations, onClear }: { source: OrganizationSource; hasOrganizations: boolean; onClear: () => void }) {
  const policyCraft = source === "standalone";
  const sourceLabel = policyCraft ? "PolicyCraft" : "ESG";
  if (hasOrganizations) return <section className="mt-3 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-6 py-12 text-center" aria-live="polite"><h2 className="font-display text-lg font-semibold">No {sourceLabel} organizations match your search</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Try another name, code, or source.</p><button type="button" onClick={onClear} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><X size={14} aria-hidden="true" />Clear search</button></section>;

  return <section className="mt-8 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-6 py-14 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><Building2 size={20} aria-hidden="true" /></div><h2 className="mt-4 font-display text-xl font-semibold">{policyCraft ? "No PolicyCraft organizations yet" : "No ESG organizations available"}</h2><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--color-muted)]">{policyCraft ? "Create a PolicyCraft organization to set up its company profile, then assign managers." : "Organizations managed in ESG will appear here when available."}</p>{policyCraft ? <Link href="/admin/organizations/new" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={14} aria-hidden="true" />Create organization</Link> : null}</section>;
}
