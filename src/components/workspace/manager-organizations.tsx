"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, BookOpen, Building2, House, PencilLine, Search } from "lucide-react";
import { ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { isStandaloneOrganization, OrganizationSourceLabel } from "@/components/workspace/organization-source-label";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { Avatar, useRecordMotion, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { listSopManuals } from "@/lib/sop/client-api";
import { policyCraftScopedUrl } from "@/lib/policycraft-scope-utils";
import type { PolicyDocumentSummary } from "@/lib/policycraft-types";
import styles from "@/app/dashboard/page.module.css";
import own from "./manager-organizations.module.css";

type Counts = { policies: number; manuals: number; updatedAt: number | null };

const SEARCH_FROM = 6;
const plural = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`;

/**
 * The organizations a manager is assigned to. Each row says how much is in it
 * and leads to its policies or documents; PolicyCraft organizations can also
 * have their details edited here.
 */
export function ManagerOrganizations() {
  const { access } = usePolicyCraftWorkspace();
  const organizations = React.useMemo(() => access.organizations.filter((item) => !item.deleted && !item.expired), [access.organizations]);
  const [counts, setCounts] = React.useState<Record<number, Counts | "failed">>({});
  const [query, setQuery] = React.useState("");
  const recordMotion = useRecordMotion();

  React.useEffect(() => {
    let active = true;
    for (const organization of organizations) {
      void Promise.all([
        fetch(policyCraftScopedUrl("/api/policycraft/documents?view=active", organization.id), { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) throw new Error("policies");
            return ((await response.json()) as { documents?: PolicyDocumentSummary[] }).documents ?? [];
          }),
        listSopManuals(organization.id, "active"),
      ]).then(([policies, manuals]) => {
        const updated = [...policies, ...manuals].map((item) => Date.parse(item.updatedAt)).filter(Number.isFinite);
        if (active) setCounts((current) => ({ ...current, [organization.id]: { policies: policies.length, manuals: manuals.length, updatedAt: updated.length ? Math.max(...updated) : null } }));
      }).catch(() => {
        if (active) setCounts((current) => ({ ...current, [organization.id]: "failed" }));
      });
    }
    return () => { active = false; };
  }, [organizations]);

  const loaded = Object.values(counts).filter((value): value is Counts => value !== "failed");
  const allLoaded = Object.keys(counts).length === organizations.length;
  const normalized = query.trim().toLocaleLowerCase();
  const visible = normalized ? organizations.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase().includes(normalized)) : organizations;
  const date = (value: number) => new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(value);

  return (
    <ApplicationSurface data-pc-workspace="manager-organizations" className={styles.surface}>
      <section className={styles.page} aria-labelledby="manager-organizations-title">
        <WorkspaceHero
          titleId="manager-organizations-title"
          title="Organizations"
          description={organizations.length ? "The organizations your administrator assigned to you. Open one to work on its policies or documents." : "Your administrator assigns the organizations you can open."}
          stats={organizations.length ? [
            { label: organizations.length === 1 ? "Organization" : "Organizations", value: organizations.length },
            { label: "Active policies", value: allLoaded ? loaded.reduce((sum, item) => sum + item.policies, 0) : null },
            { label: "SOP manuals", value: allLoaded ? loaded.reduce((sum, item) => sum + item.manuals, 0) : null },
          ] : undefined}
          actions={<Link href="/" className={styles.homeLink}><House size={15} aria-hidden="true" />Home</Link>}
        />

        <WorkspaceSheet className={styles.sheet}>
          {organizations.length >= SEARCH_FROM ? (
            <div className={own.toolbar}>
              <label htmlFor="manager-organization-search" className={own.search}>
                <Search size={15} aria-hidden="true" className={own.searchIcon} />
                <ApplicationInput id="manager-organization-search" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or code" className={own.searchInput} aria-label="Search organizations" />
              </label>
            </div>
          ) : null}
          <div className={styles.sheetBody}>
            {!organizations.length ? (
              <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: WS_EASE }}>
                <span className={styles.emptyIcon}><Building2 size={24} aria-hidden="true" /></span>
                <h2>No organizations assigned</h2>
                <p>Ask your PolicyCraft administrator to assign one. Its policies and documents appear here once access is ready.</p>
              </motion.div>
            ) : !visible.length ? (
              <div className={styles.emptyState}>
                <h2>No matching organizations</h2>
                <p>Try another name or code.</p>
              </div>
            ) : (
              <div className={styles.recordList}>
                {visible.map((organization, index) => {
                  const count = counts[organization.id];
                  return (
                    <motion.article key={organization.id} className={styles.record} data-ws-row="" {...recordMotion(index)}>
                      <Avatar name={organization.name} seed={String(organization.id)} size={44} className={own.mark} />
                      <div className={styles.recordBody}>
                        <h2 className={styles.recordTitle}>{organization.name}</h2>
                        <p className={styles.recordMeta}>
                          <span className={styles.stepChip}><OrganizationSourceLabel organization={organization} className={own.source} /></span>
                          {organization.code ? <span>{organization.code}</span> : null}
                        </p>
                        <p className={own.counts} aria-live="polite">
                          {count === undefined ? <span className={own.pending}>Counting policies and documents…</span>
                            : count === "failed" ? <span>Counts are not available right now.</span>
                              : <>
                                <span>{plural(count.policies, "active policy", "active policies")}</span>
                                <span>{plural(count.manuals, "SOP manual")}</span>
                                {count.updatedAt ? <span>Last edited {date(count.updatedAt)}</span> : null}
                              </>}
                        </p>
                      </div>
                      <div className={own.actions}>
                        {isStandaloneOrganization(organization) ? <Link href={`/manager/organizations/${organization.id}`} className={styles.textAction}><PencilLine size={14} aria-hidden="true" />Edit details</Link> : null}
                        <Link href={`/documents?orgId=${organization.id}`} className={styles.textAction}><BookOpen size={14} aria-hidden="true" />Documents</Link>
                        <Link href={`/manager/policies?orgId=${organization.id}`} className={own.primary}>Policies<ArrowRight size={14} aria-hidden="true" /></Link>
                      </div>
                    </motion.article>
                  );
                })}
              </div>
            )}
          </div>
        </WorkspaceSheet>
      </section>
    </ApplicationSurface>
  );
}
