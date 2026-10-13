"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Archive, Building2, CalendarX2, Check, Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { OrganizationManagerAssignment } from "@/components/workspace/organization-manager-assignment";
import { OrganizationSectionNavigation } from "@/components/workspace/organization-section-navigation";
import { organizationSourceName } from "@/components/workspace/organization-source-label";
import { Avatar, useRecordMotion, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { DelayedLoading, ListRegion, Pagination, usePagination } from "@/components/workspace/workspace-list";
import type { PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import styles from "./organization-listing.module.css";

type OrganizationSummary = PolicyCraftOrganization;
type OrganizationSource = PolicyCraftOrganization["source"];

export function OrganizationListing({ source }: { source: OrganizationSource }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const recordMotion = useRecordMotion();
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
  const activeCount = sourceOrganizations.filter((organization) => !organization.deleted && !organization.expired).length;
  const policyCraft = source === "standalone";
  const hasNoData = organizations.length === 0;
  // Twenty organizations per page keeps long lists light to render and scroll.
  const pager = usePagination(visibleOrganizations, `${source}|${normalizedQuery}`, 20);

  return <ApplicationSurface data-pc-workspace="organizations" className={styles.surface}>
    <section className={styles.page} aria-labelledby="organizations-page-title">
      <WorkspaceHero
        titleId="organizations-page-title"
        title={policyCraft ? "PolicyCraft organizations" : "Organizations"}
        description={policyCraft ? "Manage PolicyCraft company profiles and assign managers." : "Manage ESG organizations and assign PolicyCraft managers."}
        stats={[
          { label: "Organizations", value: loading && hasNoData ? null : error && hasNoData ? "–" : sourceOrganizations.length },
          { label: "Active", value: loading && hasNoData ? null : error && hasNoData ? "–" : activeCount },
        ]}
        actions={policyCraft ? <Link href="/admin/organizations/new" className={`${styles.actionLink} ${styles.primaryAction}`}><Plus size={15} aria-hidden="true" />Create organization</Link> : undefined}
      >
        <OrganizationSectionNavigation />
      </WorkspaceHero>

      <WorkspaceSheet className={styles.sheet}>
        {error ? <motion.div role="alert" aria-live="polite" className={styles.alert} initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: WS_EASE }}>
          <span>{error}</span>
          <ApplicationButton type="button" variant="ghost" size="sm" onClick={() => void load()} leadingIcon={<RefreshCw size={14} aria-hidden="true" />}>Retry</ApplicationButton>
        </motion.div> : null}

        {createdOrganization ? <motion.div role="status" aria-live="polite" className={styles.createdNotice} initial={reduced ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: WS_EASE }}>
          <span className={styles.createdText}><Check size={16} aria-hidden="true" />{createdOrganization.name} is ready. Assign a manager to grant access.</span>
          <div className={styles.createdActions}><OrganizationManagerAssignment organization={createdOrganization} label="Assign existing manager" /><Link href={`/admin/managers/new?organizationId=${createdOrganization.id}`} className={styles.actionLink}>Add new manager</Link></div>
        </motion.div> : null}

        {loading && hasNoData ? <DelayedLoading label="Loading organizations…"><div className={styles.initialLoading} role="status" aria-live="polite" aria-busy="true">
          <span className={styles.loadingStatus}><Loader2 size={16} className={styles.spinner} aria-hidden="true" />Loading organizations…</span>
          <RecordSkeleton />
        </div></DelayedLoading> : error ? null : <ListRegion busy={loading} contentKey={`organizations|${pager.page}`}>
          <section className={styles.toolbar} aria-label={`Search ${policyCraft ? "PolicyCraft" : "ESG"} organizations`}>
            <label className={styles.searchLabel}>
              <span className={styles.visuallyHidden}>Search {policyCraft ? "PolicyCraft" : "ESG"} organizations by name, code, or source</span>
              <span className={styles.searchField}><Search size={16} aria-hidden="true" className={styles.searchIcon} /><ApplicationInput type="search" name="organizationSearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, code, or source…" className={styles.searchInput} /></span>
            </label>
            <div className={styles.toolbarMeta}>
              <p className={styles.count} aria-live="polite">Showing <span>{visibleOrganizations.length}</span> of <span>{sourceOrganizations.length}</span> organizations</p>
              {query ? <ApplicationButton type="button" variant="ghost" size="sm" leadingIcon={<X size={13} aria-hidden="true" />} onClick={() => setQuery("")}>Clear</ApplicationButton> : null}
            </div>
          </section>

          {visibleOrganizations.length ? <div id="organization-list" className={styles.list}>
            <div className={styles.listHeading}><span>Organization</span><span>Action</span></div>
            <ul className={styles.items}>
              <AnimatePresence initial={false}>
                {pager.visible.map((organization, index) => <motion.li key={organization.id} className={styles.organizationRow} {...recordMotion(index)}>
                  <OrganizationRowContent organization={organization} />
                </motion.li>)}
              </AnimatePresence>
            </ul>
            <Pagination page={pager.page} pageCount={pager.pageCount} first={pager.first} last={pager.last} total={pager.total} noun="organizations" onChange={pager.setPage} anchorId="organization-list" />
          </div> : <OrganizationEmptyState source={source} hasOrganizations={sourceOrganizations.length > 0} onClear={() => setQuery("")} />}
        </ListRegion>}
      </WorkspaceSheet>
    </section>
  </ApplicationSurface>;
}

function OrganizationRowContent({ organization }: { organization: OrganizationSummary }) {
  return <>
    <div className={styles.identity}>
      <Avatar name={organization.name} seed={`organization-${organization.id}`} size={40} />
      <div className={styles.rowDetails}>
        <h2 className={styles.organizationName}>{organization.name}</h2>
        <p className={styles.organizationMeta}>
          <span>{organization.code || `ID ${organization.id}`}</span>
          {organization.deleted ? <span className={`${styles.organizationState} ${styles.stateDeleted}`}><Archive size={13} aria-hidden="true" />Deleted</span> : organization.expired ? <span className={`${styles.organizationState} ${styles.stateExpired}`}><CalendarX2 size={13} aria-hidden="true" />Subscription expired</span> : null}
        </p>
      </div>
    </div>
    <div className={styles.rowActions}>
      {organization.source === "standalone" ? <Link href={`/admin/organizations/${organization.id}`} className={`${styles.actionLink} ${styles.outlineAction}`}>Edit details</Link> : <span className={styles.managedLabel}>Managed in ESG</span>}
      <OrganizationManagerAssignment organization={organization} />
      <Link href={`/admin/managers/new?organizationId=${organization.id}`} className={styles.actionLink}>Add new manager</Link>
    </div>
  </>;
}

function OrganizationEmptyState({ source, hasOrganizations, onClear }: { source: OrganizationSource; hasOrganizations: boolean; onClear: () => void }) {
  const reduced = useReducedMotion();
  const policyCraft = source === "standalone";
  const sourceLabel = policyCraft ? "PolicyCraft" : "ESG";
  if (hasOrganizations) return <section className={styles.emptyState} aria-live="polite">
    <h2 className={styles.emptyTitle}>No {sourceLabel} organizations match your search</h2>
    <p className={styles.emptyText}>Try another name, code, or source.</p>
    <ApplicationButton type="button" variant="ghost" leadingIcon={<X size={14} aria-hidden="true" />} onClick={onClear}>Clear search</ApplicationButton>
  </section>;

  return <section className={styles.emptyState}>
    <motion.span className={styles.emptyIcon} initial={reduced ? false : { scale: 0.6, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}>
      <Building2 size={22} aria-hidden="true" />
    </motion.span>
    <h2 className={styles.emptyTitle}>{policyCraft ? "No PolicyCraft organizations yet" : "No ESG organizations available"}</h2>
    <p className={styles.emptyText}>{policyCraft ? "Create a PolicyCraft organization to set up its company profile, then assign managers." : "Organizations managed in ESG will appear here when available."}</p>
    {policyCraft ? <Link href="/admin/organizations/new" className={`${styles.actionLink} ${styles.primaryAction}`}><Plus size={14} aria-hidden="true" />Create organization</Link> : null}
  </section>;
}
