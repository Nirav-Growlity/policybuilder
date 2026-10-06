"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus, RefreshCw } from "lucide-react";
import { OrganizationSourceBadge } from "@/components/workspace/organization-source-label";
import type { PolicyCraftOrganization } from "@/lib/policycraft-access-types";

type OrganizationSummary = PolicyCraftOrganization & { source?: "esg" | "standalone" };

export default function AdminOrganizationsPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = React.useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [createdOrganization, setCreatedOrganization] = React.useState<OrganizationSummary | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/policycraft/admin/organizations", { cache: "no-store" });
      if (response.status === 401) { router.replace("/login?next=%2Fadmin%2Forganizations"); return; }
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Organizations could not be loaded. Retry to continue.");
      const loaded = Array.isArray(result?.organizations) ? result.organizations as OrganizationSummary[] : [];
      setOrganizations(loaded);
      const createdId = Number(new URLSearchParams(window.location.search).get("created"));
      setCreatedOrganization(Number.isSafeInteger(createdId) ? loaded.find((organization) => organization.id === createdId) || null : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Organizations could not be loaded."); }
    finally { setLoading(false); }
  }, [router]);

  React.useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  return <div className="mx-auto max-w-6xl">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Admin workspace</p><h1 className="mt-1 text-pretty font-display text-3xl font-semibold tracking-tight sm:text-[34px]">Organizations</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">Manage company profiles and assign managers to PolicyCraft organizations.</p></div><Link href="/admin/organizations/new" className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={15} aria-hidden="true" />Create organization</Link></div>
    {error ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><span>{error}</span><button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-2 rounded-md px-3 font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-800"><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}
    {createdOrganization ? <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status" aria-live="polite"><span>{createdOrganization.name} is ready. Assign a manager to grant access.</span><Link href={`/admin/managers/new?organizationId=${createdOrganization.id}`} className="inline-flex min-h-9 items-center rounded-md px-3 text-xs font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-800">Assign manager</Link></div> : null}
    {loading ? <div className="mt-8 flex min-h-40 items-center justify-center gap-3 text-sm text-[var(--color-muted)]" aria-live="polite" aria-busy="true"><Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading organizations…</div> : error ? null : organizations.length ? <div className="mt-7 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white"><div className="hidden grid-cols-[minmax(0,1fr)_auto] gap-4 border-b border-[var(--color-line)] bg-[var(--color-cream-2)]/60 px-5 py-3 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] md:grid"><span>Organization</span><span className="text-right">Action</span></div><ul className="divide-y divide-[var(--color-line)]">{organizations.map((organization) => <li key={organization.id} className="grid gap-3 px-4 py-4 sm:px-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-sm font-semibold">{organization.name}</h2><OrganizationSourceBadge organization={organization} /></div><p className="mt-1 text-xs text-[var(--color-muted)]">{organization.code || `ID ${organization.id}`}{organization.deleted ? " · deleted" : organization.expired ? " · expired" : ""}</p></div><div className="flex flex-wrap gap-2 md:justify-end">{organization.source === "standalone" ? <Link href={`/admin/organizations/${organization.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-[var(--color-line-2)] px-3 text-xs font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Edit details</Link> : <span className="inline-flex min-h-10 items-center px-3 text-xs text-[var(--color-muted)]">Managed in ESG</span>}<Link href={`/admin/managers/new?organizationId=${organization.id}`} className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Assign manager</Link></div></li>)}</ul></div> : <section className="mt-8 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-6 py-14 text-center"><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><Building2 size={20} aria-hidden="true" /></div><h2 className="mt-4 font-display text-xl font-semibold">No organizations found</h2><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--color-muted)]">Create a PolicyCraft organization to set up its company profile, then assign managers from the manager workflow.</p><Link href="/admin/organizations/new" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={14} aria-hidden="true" />Create organization</Link></section>}
  </div>;
}
