"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { OrganizationManagerAssignment } from "@/components/workspace/organization-manager-assignment";
import { OrganizationSourceBadge, organizationSourceName } from "@/components/workspace/organization-source-label";
import type { PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import styles from "./organization-listing.module.css";

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

  return <ApplicationSurface className={styles.listing} data-pc-workspace="organizations">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Admin workspace</p><h1 className={`${styles.pageTitle} mt-1 text-pretty font-semibold tracking-tight`}>{policyCraft ? "PolicyCraft organizations" : "Organizations"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">{policyCraft ? "Manage PolicyCraft company profiles and assign managers." : "Manage ESG organizations and assign PolicyCraft managers."}</p></div>{policyCraft ? <Link href="/admin/organizations/new" className={`${styles.actionLink} ${styles.primaryAction}`}><Plus size={15} aria-hidden="true" />Create organization</Link> : null}</div>

    {error ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><span>{error}</span><ApplicationButton type="button" variant="ghost" size="sm" onClick={() => void load()} leadingIcon={<RefreshCw size={14} aria-hidden="true" />}>Retry</ApplicationButton></div> : null}
    {createdOrganization ? <div className={`${styles.createdNotice} mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm`} role="status" aria-live="polite"><span>{createdOrganization.name} is ready. Assign a manager to grant access.</span><div className="flex flex-wrap items-center gap-2"><OrganizationManagerAssignment organization={createdOrganization} label="Assign existing manager" /><Link href={`/admin/managers/new?organizationId=${createdOrganization.id}`} className={styles.actionLink}>Add new manager</Link></div></div> : null}

    {loading && organizations.length === 0 ? <div className={styles.initialLoading} role="status" aria-live="polite" aria-busy="true"><span className={styles.loadingStatus}><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading organizations…</span><RecordSkeleton /></div> : loading ? <div className="mt-8 flex min-h-24 items-center justify-center gap-3 text-sm text-[var(--color-muted)]" role="status" aria-live="polite" aria-busy="true"><Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Refreshing organizations…</div> : error ? null : <>
      <section className={`${styles.searchPanel} mt-7 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5`} aria-label={`Search ${policyCraft ? "PolicyCraft" : "ESG"} organizations`}>
        <label className="block min-w-0 flex-1 text-xs font-semibold text-[var(--color-ink-2)]"><span className="sr-only">Search {policyCraft ? "PolicyCraft" : "ESG"} organizations by name, code, or source</span><span className={styles.searchField}><Search size={16} aria-hidden="true" className={styles.searchIcon} /><ApplicationInput type="search" name="organizationSearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, code, or source…" className={styles.searchInput} /></span></label>
        <div className="flex items-center justify-between gap-3"><p className="text-xs text-[var(--color-muted)]" aria-live="polite">Showing <span className="font-semibold tabular-nums text-[var(--color-ink)]">{visibleOrganizations.length}</span> of <span className="font-semibold tabular-nums text-[var(--color-ink)]">{sourceOrganizations.length}</span> organizations</p>{query ? <ApplicationButton type="button" variant="ghost" size="sm" leadingIcon={<X size={13} aria-hidden="true" />} onClick={() => setQuery("")}>Clear</ApplicationButton> : null}</div>
      </section>
      {visibleOrganizations.length ? <div className={`${styles.organizationList} mt-3 overflow-hidden rounded-xl border bg-white`}><div className={`${styles.listHeading} hidden grid-cols-[minmax(0,1fr)_auto] gap-4 border-b px-5 py-3 text-[10px] font-semibold uppercase tracking-wide md:grid`}><span>Organization</span><span className="text-right">Action</span></div><ul className="divide-y divide-[var(--color-line)]">{visibleOrganizations.map((organization) => <OrganizationRow key={organization.id} organization={organization} />)}</ul></div> : <OrganizationEmptyState source={source} hasOrganizations={sourceOrganizations.length > 0} onClear={() => setQuery("")} />}
    </>}
  </ApplicationSurface>;
}

function OrganizationRow({ organization }: { organization: OrganizationSummary }) {
  return <li className={styles.organizationRow}><div className={styles.rowDetails}><div className="flex flex-wrap items-center gap-2"><h2 className={styles.organizationName}>{organization.name}</h2><OrganizationSourceBadge organization={organization} className={styles.sourceBadge} /></div><p className={styles.organizationCode}>{organization.code || `ID ${organization.id}`}{organization.deleted ? " · deleted" : organization.expired ? " · expired" : ""}</p></div><div className={styles.rowActions}>{organization.source === "standalone" ? <Link href={`/admin/organizations/${organization.id}`} className={`${styles.actionLink} ${styles.outlineAction}`}>Edit details</Link> : <span className={styles.managedLabel}>Managed in ESG</span>}<OrganizationManagerAssignment organization={organization} /><Link href={`/admin/managers/new?organizationId=${organization.id}`} className={styles.actionLink}>Add new manager</Link></div></li>;
}

function OrganizationEmptyState({ source, hasOrganizations, onClear }: { source: OrganizationSource; hasOrganizations: boolean; onClear: () => void }) {
  const policyCraft = source === "standalone";
  const sourceLabel = policyCraft ? "PolicyCraft" : "ESG";
  if (hasOrganizations) return <section className={`${styles.emptyState} mt-3 rounded-xl border border-dashed bg-white px-6 py-12 text-center`} aria-live="polite"><h2 className="text-lg font-semibold">No {sourceLabel} organizations match your search</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Try another name, code, or source.</p><ApplicationButton type="button" variant="ghost" leadingIcon={<X size={14} aria-hidden="true" />} onClick={onClear} className="mt-3">Clear search</ApplicationButton></section>;

  return <section className={`${styles.emptyState} mt-8 rounded-xl border border-dashed bg-white px-6 py-14 text-center`}><div className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><Building2 size={20} aria-hidden="true" /></div><h2 className="mt-4 text-xl font-semibold">{policyCraft ? "No PolicyCraft organizations yet" : "No ESG organizations available"}</h2><p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[var(--color-muted)]">{policyCraft ? "Create a PolicyCraft organization to set up its company profile, then assign managers." : "Organizations managed in ESG will appear here when available."}</p>{policyCraft ? <Link href="/admin/organizations/new" className={`${styles.actionLink} ${styles.primaryAction} mt-5`}><Plus size={14} aria-hidden="true" />Create organization</Link> : null}</section>;
}
