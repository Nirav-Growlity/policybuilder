"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Building2, Check, Loader2, Mail, Pencil, Plus, RefreshCw, Search, UserRound, UserRoundX, X } from "lucide-react";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import { Modal } from "@/components/ui/modal";
import { ApplicationButton, ApplicationInput, ApplicationStatus } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { ActionDisclosure, ActionDisclosureItem } from "@/components/ui/action-disclosure";
import { OrganizationSourceBadge, organizationSourceName } from "@/components/workspace/organization-source-label";
import { DelayedLoading, ListRegion } from "@/components/workspace/workspace-list";
import { Avatar, SelectionPill, useRecordMotion, WorkspaceHero, WorkspaceRouteFallback, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import styles from "./page.module.css";

type AdminManagersResponse = { managers: PolicyCraftManagerSummary[]; organizations: PolicyCraftOrganization[] };
const statusLabel: Record<PolicyCraftManagerSummary["status"], string> = {
  active: "Active", disabled: "Disabled", pending: "Invitation pending", delivery_failed: "Invitation not sent",
};

function dateLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

function AdminManagersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = React.useState<AdminManagersResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [busyAction, setBusyAction] = React.useState<"status" | "resend" | "cancel" | "assign" | null>(null);
  const [error, setError] = React.useState("");
  const [expiredInvitationIds, setExpiredInvitationIds] = React.useState<string[]>([]);
  const [managerToEdit, setManagerToEdit] = React.useState<PolicyCraftManagerSummary | null>(null);
  const [selectedOrganizations, setSelectedOrganizations] = React.useState<number[]>([]);
  const [organizationSearch, setOrganizationSearch] = React.useState("");
  const [cancelTarget, setCancelTarget] = React.useState<PolicyCraftManagerSummary | null>(null);
  const [cancelError, setCancelError] = React.useState("");
  const [statusTarget, setStatusTarget] = React.useState<PolicyCraftManagerSummary | null>(null);
  const [statusError, setStatusError] = React.useState("");
  const [assignmentError, setAssignmentError] = React.useState("");
  const [query, setQuery] = React.useState(searchParams.get("q") || "");
  const [statusFilter, setStatusFilter] = React.useState(searchParams.get("status") || "all");
  const searchUrlTimer = React.useRef<number | null>(null);
  const selfAuthoredSearches = React.useRef(new Set<string>());

  React.useEffect(() => {
    const current = searchParams.toString();
    if (selfAuthoredSearches.current.delete(current)) return;
    if (searchUrlTimer.current !== null) window.clearTimeout(searchUrlTimer.current);
    searchUrlTimer.current = null;
    const values = new URLSearchParams(current);
    setQuery(values.get("q") || "");
    setStatusFilter(values.get("status") || "all");
  }, [searchParams]);

  React.useEffect(() => {
    const syncFromHistory = () => {
      if (searchUrlTimer.current !== null) window.clearTimeout(searchUrlTimer.current);
      searchUrlTimer.current = null;
      selfAuthoredSearches.current.clear();
      const values = new URLSearchParams(window.location.search);
      setQuery(values.get("q") || "");
      setStatusFilter(values.get("status") || "all");
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
    searchUrlTimer.current = null;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    const next = params.toString();
    if (next === searchParams.toString()) return;
    selfAuthoredSearches.current.add(next);
    while (selfAuthoredSearches.current.size > 16) selfAuthoredSearches.current.delete(selfAuthoredSearches.current.values().next().value!);
    router.replace(next ? `/admin?${next}` : "/admin", { scroll: false });
    }, 250);
    searchUrlTimer.current = timer;
    return () => {
      window.clearTimeout(timer);
      if (searchUrlTimer.current === timer) searchUrlTimer.current = null;
    };
  }, [query, router, searchParams, statusFilter]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/policycraft/admin/managers", { cache: "no-store" });
      if (response.status === 401) { router.replace("/login?next=%2Fadmin"); return; }
      if (!response.ok) throw new Error("Could not load managers. Refresh to try again.");
      const result = await response.json() as AdminManagersResponse;
      setData(result);
      const now = Date.now();
      setExpiredInvitationIds(result.managers.filter((manager) => manager.invitationId && manager.expiresAt && new Date(manager.expiresAt).getTime() < now).map((manager) => manager.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load managers.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  React.useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  function startEdit(manager: PolicyCraftManagerSummary) {
    setManagerToEdit(manager);
    setSelectedOrganizations(manager.organizations.map((organization) => organization.id));
    setOrganizationSearch("");
    setAssignmentError("");
  }

  async function updateManager(managerId: string, patch: { organizationIds?: number[]; active?: boolean }) {
    const target = data?.managers.find((manager) => manager.id === managerId);
    setBusyId(managerId);
    setBusyAction(patch.organizationIds ? "assign" : "status");
    if (patch.organizationIds) setAssignmentError("");
    else if (patch.active === false) setStatusError("");
    else setError("");
    try {
      const response = target?.invitationId && patch.organizationIds
        ? await fetch(`/api/policycraft/admin/invitations/${encodeURIComponent(target.invitationId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "edit", name: target.name, email: target.email, organizationIds: patch.organizationIds }),
        })
        : await fetch(`/api/policycraft/admin/managers/${encodeURIComponent(managerId)}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
        });
      if (!response.ok) throw new Error(response.status === 404 ? "This manager is no longer available." : "Could not update this manager. Refresh and try again.");
      if (patch.active === false) setStatusTarget(null);
      if (patch.organizationIds) setManagerToEdit(null);
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not update this manager.";
      if (patch.organizationIds) setAssignmentError(message);
      else if (patch.active === false) setStatusError(message);
      else setError(message);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function invitationAction(manager: PolicyCraftManagerSummary, action: "resend" | "cancel") {
    if (!manager.invitationId || busyId) return;
    if (action === "cancel") { setCancelError(""); setCancelTarget(manager); return; }
    setBusyId(manager.id);
    setBusyAction("resend");
    setError("");
    try {
      const response = await fetch(`/api/policycraft/admin/invitations/${encodeURIComponent(manager.invitationId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `Could not ${action} this invitation.`);
      if (action === "resend" && result?.delivery?.sent === false) throw new Error("The invitation is still pending, but email delivery failed. Check the address or retry later.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} this invitation.`);
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  async function cancelInvitation(manager: PolicyCraftManagerSummary) {
    if (!manager.invitationId || busyId) return;
    setBusyId(manager.id);
    setBusyAction("cancel");
    setCancelError("");
    try {
      const response = await fetch(`/api/policycraft/admin/invitations/${encodeURIComponent(manager.invitationId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel" }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not cancel this invitation.");
      setCancelTarget(null);
      await load();
    } catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : "Could not cancel this invitation.");
    } finally {
      setBusyId(null);
      setBusyAction(null);
    }
  }

  const recordMotion = useRecordMotion();
  const organizations = data?.organizations ?? [];
  const managers = data?.managers ?? [];
  const filteredManagers = managers.filter((manager) => {
    const search = query.trim().toLowerCase();
    const matchesQuery = !search || `${manager.name} ${manager.email} ${manager.organizations.map((organization) => organization.name).join(" ")}`.toLowerCase().includes(search);
    return matchesQuery && (statusFilter === "all" || manager.status === statusFilter);
  });

  const renderManagerActions = (manager: PolicyCraftManagerSummary) => <div className={styles.actions}>
    <button type="button" disabled={Boolean(busyId)} onClick={() => startEdit(manager)} className={styles.assignButton}><Pencil size={14} aria-hidden="true" />Assignments</button>
    <ActionDisclosure label={`More actions for ${manager.name}`} disabled={Boolean(busyId)}>
      {(manager.status === "active" || manager.status === "disabled") ? <ActionDisclosureItem disabled={Boolean(busyId)} onClick={() => { if (manager.status === "active") { setStatusTarget(manager); setStatusError(""); } else void updateManager(manager.id, { active: true }); }}>{manager.status === "active" ? <UserRoundX size={15} aria-hidden="true" /> : <UserRound size={15} aria-hidden="true" />}{manager.status === "active" ? "Disable access" : "Enable access"}</ActionDisclosureItem> : null}
      {manager.invitationId ? <>
        <ActionDisclosureItem disabled={Boolean(busyId)} busy={busyId === manager.id && busyAction === "resend"} onClick={() => void invitationAction(manager, "resend")}><Mail size={15} aria-hidden="true" />{busyId === manager.id && busyAction === "resend" ? "Resending invitation…" : "Resend invitation"}</ActionDisclosureItem>
        <ActionDisclosureItem disabled={Boolean(busyId)} destructive onClick={() => void invitationAction(manager, "cancel")}><X size={15} aria-hidden="true" />Cancel invitation</ActionDisclosureItem>
      </> : null}
    </ActionDisclosure>
  </div>;

  const renderManagerStatus = (manager: PolicyCraftManagerSummary) => {
    const expired = expiredInvitationIds.includes(manager.id);
    const tone = expired || manager.status === "delivery_failed" ? "warning" : manager.status === "active" ? "success" : manager.status === "pending" ? "info" : "neutral";
    return <ApplicationStatus tone={tone}>{expired ? "Invitation expired" : statusLabel[manager.status]}</ApplicationStatus>;
  };

  const renderOrganizations = (manager: PolicyCraftManagerSummary) => {
    const nameCounts = new Map<string, number>();
    for (const organization of manager.organizations) nameCounts.set(organization.name, (nameCounts.get(organization.name) || 0) + 1);
    return manager.organizations.map((organization) => <span key={organization.id} title={`${organization.name} (${organization.code})`} className={`${styles.orgChip} ${organization.deleted ? styles.orgChipDeleted : ""}`}><Building2 size={12} aria-hidden="true" className={styles.orgChipIcon} /><span className="break-words">{organization.name}{nameCounts.get(organization.name)! > 1 ? <span className={styles.orgCode}>[{organization.code}]</span> : null}{organization.deleted ? " · deleted" : ""}</span><OrganizationSourceBadge organization={organization} /></span>);
  };

  const renderManagerIdentity = (manager: PolicyCraftManagerSummary) => <div className={styles.identity}><Avatar name={manager.name} seed={manager.email} size={40} /><div className="min-w-0"><h3 className={styles.managerName}>{manager.name}</h3><p className={styles.managerEmail}>{manager.email}</p>{busyId === manager.id ? <p role="status" aria-live="polite" className={styles.busyNote}><Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{busyAction === "resend" ? "Sending invitation…" : busyAction === "status" ? "Updating access…" : "Saving assignments…"}</p> : null}</div></div>;

  const policyCountLabel = (manager: PolicyCraftManagerSummary) => <><span className={styles.policyCount}>{manager.policyCount}</span> {manager.policyCount === 1 ? "policy" : "policies"}</>;
  const statusOptions = [["all", "All managers"], ["active", "Active"], ["disabled", "Disabled"], ["pending", "Invitation pending"], ["delivery_failed", "Invitation not sent"]] as const;
  const statusCount = (value: string) => value === "all" ? managers.length : managers.filter((manager) => manager.status === value).length;

  return (
    <ApplicationSurface className={styles.surface} data-pc-workspace="admin-managers">
      <WorkspaceHero
        title="Managers"
        description="Add manager access and control the organizations each manager can open."
        stats={[
          { label: "Managers", value: data ? managers.length : loading ? null : "–" },
          { label: "Active", value: data ? statusCount("active") : loading ? null : "–" },
          { label: "Awaiting invitation", value: data ? statusCount("pending") + statusCount("delivery_failed") : loading ? null : "–" },
          { label: "Organizations", value: data ? organizations.length : loading ? null : "–" },
        ]}
        actions={<Link href="/admin/managers/new" className={styles.primaryLink}><Plus size={16} aria-hidden="true" />Add manager</Link>}
      />

      <WorkspaceSheet as="section" aria-label="Manager accounts" className={styles.roster}>
        <div className={styles.filterBar}>
          <label className={styles.searchLabel}><span className={styles.visuallyHidden}>Search managers</span><span className={styles.searchField}><Search size={16} aria-hidden="true" className={styles.searchIcon} /><ApplicationInput type="search" name="managerSearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email or organization…" className={styles.searchInput} /></span></label>
          <div className={styles.statusFilters} role="group" aria-label="Filter managers by status">
            {statusOptions.map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)} className={`${styles.statusFilter} ${statusFilter === value ? styles.statusFilterSelected : ""}`}>{statusFilter === value ? <SelectionPill layoutId="manager-status-filter" className={styles.statusPill} /> : null}{label}{data ? <span>{statusCount(value)}</span> : null}</button>)}
          </div>
        </div>

        <AnimatePresence>
          {error && data ? <motion.div key="error" className={styles.alert} role="alert" aria-live="polite" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}><p>{error}</p><button type="button" onClick={() => void load()} className={styles.alertAction}><RefreshCw size={14} aria-hidden="true" />Retry</button></motion.div> : null}
        </AnimatePresence>

        {loading && !data ? <DelayedLoading label="Loading managers…"><div className={styles.initialLoading} role="status" aria-live="polite" aria-busy="true"><span className={styles.loadingStatus}><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading managers…</span><RecordSkeleton /></div></DelayedLoading> : !data ? (
          <div className={styles.emptyState} role="alert" aria-live="polite"><span className={styles.emptyIcon}><RefreshCw size={22} aria-hidden="true" /></span><h2>Managers could not be loaded</h2><p>{error || "Retry to load manager accounts and their organization assignments."}</p><ApplicationButton type="button" variant="outline" leadingIcon={<RefreshCw size={14} aria-hidden="true" />} onClick={() => void load()} className="mt-5">Retry</ApplicationButton></div>
        ) : <ListRegion busy={loading} contentKey="managers">{managers.length === 0 ? <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: WS_EASE }}><UsersIcon /><h2>No managers yet</h2><p>Add an existing account or invite someone new, then assign their organizations.</p><Link href="/admin/managers/new" className={`${styles.primaryLink} ${styles.emptyAction}`}><Plus size={15} aria-hidden="true" />Add manager</Link></motion.div> : filteredManagers.length ? (
          <>
            <div className={styles.tableWrap}><table className={styles.table}>
              <colgroup><col className="w-[30%]" /><col className="w-[38%]" /><col className="w-[14%]" /><col className="w-[18%]" /></colgroup>
              <thead><tr><th scope="col">Manager</th><th scope="col">Organizations</th><th scope="col">Access</th><th scope="col" className={styles.actionsHeading}>Actions</th></tr></thead>
              <tbody>
                <AnimatePresence>
                  {filteredManagers.map((manager, index) => <motion.tr key={manager.id} className={styles.row} {...recordMotion(index)}><th scope="row">{renderManagerIdentity(manager)}</th><td><div className={styles.orgList}>{manager.organizations.length ? renderOrganizations(manager) : <span className={styles.noOrgs}>No organizations assigned</span>}</div></td><td><div className={styles.accessCell}>{renderManagerStatus(manager)}<p className={styles.accessMeta}>{policyCountLabel(manager)}</p>{manager.expiresAt ? <p className={styles.expiry}>{expiredInvitationIds.includes(manager.id) ? "Invitation expired" : `Expires ${dateLabel(manager.expiresAt)}`}</p> : null}</div></td><td>{renderManagerActions(manager)}</td></motion.tr>)}
                </AnimatePresence>
              </tbody>
            </table></div>
            <div className={styles.cards}>
              <AnimatePresence>
                {filteredManagers.map((manager, index) => <motion.article key={manager.id} className={styles.card} {...recordMotion(index)}><div>{renderManagerIdentity(manager)}</div><div className={styles.cardMeta}>{renderManagerStatus(manager)}<span className={styles.accessMeta}>{policyCountLabel(manager)}</span>{manager.expiresAt ? <span className={styles.expiry}>{expiredInvitationIds.includes(manager.id) ? "Invitation expired" : `Expires ${dateLabel(manager.expiresAt)}`}</span> : null}</div><div className={styles.cardOrgs}><p className={styles.cardLabel}>Organizations</p><div className={styles.orgList}>{manager.organizations.length ? renderOrganizations(manager) : <span className={styles.noOrgs}>No organizations assigned</span>}</div></div><div className={styles.cardActions}>{renderManagerActions(manager)}</div></motion.article>)}
              </AnimatePresence>
            </div>
          </>
        ) : <motion.div className={styles.emptyState} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: WS_EASE }}><span className={styles.emptyIcon}><Search size={22} aria-hidden="true" /></span><h2>No managers match these filters</h2><p>Clear the search or choose another status to see manager accounts.</p><ApplicationButton type="button" variant="ghost" onClick={() => { setQuery(""); setStatusFilter("all"); }} className="mt-4">Clear filters</ApplicationButton></motion.div>}</ListRegion>}
      </WorkspaceSheet>

      <Modal open={Boolean(managerToEdit)} onClose={() => { if (!busyId) setManagerToEdit(null); }} hideClose={Boolean(busyId)} title="Assign organizations" description={`Choose the organizations ${managerToEdit?.name || "this manager"} can access.`} width={560}>
        {managerToEdit ? <ApplicationSurface className={styles.surface}><form onSubmit={(event) => { event.preventDefault(); void updateManager(managerToEdit.id, { organizationIds: selectedOrganizations }); }}>
          <label className="mb-2 block text-sm font-semibold text-[var(--color-ink-2)]" htmlFor="assignment-org-search">Search organizations</label><ApplicationInput id="assignment-org-search" name="organizationSearch" autoComplete="off" type="search" value={organizationSearch} onChange={(event) => setOrganizationSearch(event.target.value)} placeholder="Search by organization name or code…" className="mb-3" />
          <fieldset><legend className="mb-3 text-[12px] font-semibold text-[var(--color-ink-2)]">Organizations</legend><div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-line)] p-2">{organizations.filter((organization) => `${organization.name} ${organization.code} ${organizationSourceName(organization)}`.toLowerCase().includes(organizationSearch.toLowerCase())).map((organization) => { const selected = selectedOrganizations.includes(organization.id); return <label key={organization.id} className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${selected || (!organization.deleted && !organization.expired) ? "cursor-pointer hover:bg-[var(--color-cream-2)]" : "cursor-not-allowed opacity-60"} focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-forest)]`}><input type="checkbox" checked={selected} disabled={(organization.deleted || organization.expired) && !selected} onChange={(event) => setSelectedOrganizations((current) => event.target.checked ? [...new Set([...current, organization.id])] : current.filter((id) => id !== organization.id))} className="h-4 w-4 accent-[var(--color-forest)]" /><span className="min-w-0 flex-1 truncate">{organization.name}</span><OrganizationSourceBadge organization={organization} />{organization.deleted ? <span className="text-[10px] text-[var(--color-muted)]">Deleted</span> : organization.expired ? <span className="text-[10px] text-amber-800">Expired</span> : null}</label>; })}{organizations.length === 0 ? <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">No organizations available.</p> : null}{organizations.length > 0 && !organizations.some((organization) => `${organization.name} ${organization.code} ${organizationSourceName(organization)}`.toLowerCase().includes(organizationSearch.toLowerCase())) ? <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">No matching organizations.</p> : null}</div></fieldset>
          <p className="mt-3 text-xs leading-5 text-[var(--color-muted)]">Removing an assignment does not remove policies already created for that organization.</p>
          {assignmentError ? <p id="assignment-error" role="alert" aria-live="polite" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{assignmentError}</p> : null}
          <div className={`${styles.dialogActions} mt-5 flex flex-wrap justify-end gap-2`}><ApplicationButton type="button" variant="outline" disabled={Boolean(busyId)} onClick={() => setManagerToEdit(null)}>Cancel</ApplicationButton><ApplicationButton type="submit" variant="primary" disabled={busyId === managerToEdit.id} aria-describedby={assignmentError ? "assignment-error" : undefined} leadingIcon={busyId === managerToEdit.id ? undefined : <Check size={14} aria-hidden="true" />} busy={busyId === managerToEdit.id} busyLabel="Saving…">Save assignments</ApplicationButton></div>
        </form></ApplicationSurface> : null}
      </Modal>
      <Modal open={Boolean(statusTarget)} onClose={() => { if (!busyId) setStatusTarget(null); }} hideClose={Boolean(busyId)} title="Disable manager access?" description="This manager will no longer be able to open assigned organizations until access is enabled again." width={480}>
        <ApplicationSurface className={styles.surface}>
        <p className="break-all text-sm font-semibold">{statusTarget?.email}</p>{statusError ? <p role="alert" aria-live="polite" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{statusError}</p> : null}<div className={`${styles.dialogActions} mt-5 flex flex-wrap justify-end gap-2`}><ApplicationButton type="button" variant="outline" disabled={Boolean(busyId)} onClick={() => setStatusTarget(null)}>Keep access</ApplicationButton><ApplicationButton type="button" variant="danger" disabled={Boolean(busyId) || !statusTarget} onClick={() => { if (statusTarget) void updateManager(statusTarget.id, { active: false }); }} busy={Boolean(busyId)} busyLabel="Disabling…" leadingIcon={!busyId ? <UserRoundX size={14} aria-hidden="true" /> : undefined}>Disable access</ApplicationButton></div>
        </ApplicationSurface>
      </Modal>
      <Modal open={Boolean(cancelTarget)} onClose={() => { if (!busyId) { setCancelTarget(null); setCancelError(""); } }} title="Cancel manager invitation?" description={`The invitation for ${cancelTarget?.email || "this manager"} will stop working.`} hideClose={Boolean(busyId)} width={480}>
        <ApplicationSurface className={styles.surface}>
        {cancelError ? <p role="alert" aria-live="polite" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{cancelError}</p> : null}
        <div className={`${styles.dialogActions} flex flex-wrap justify-end gap-2`}><ApplicationButton type="button" variant="outline" disabled={Boolean(busyId)} onClick={() => { setCancelTarget(null); setCancelError(""); }}>Keep invitation</ApplicationButton><ApplicationButton type="button" variant="danger" disabled={Boolean(busyId) || !cancelTarget} onClick={() => { if (cancelTarget) void cancelInvitation(cancelTarget); }} busy={Boolean(busyId)} busyLabel="Canceling…">Cancel invitation</ApplicationButton></div>
        </ApplicationSurface>
      </Modal>
    </ApplicationSurface>
  );
}

function UsersIcon() { return <span className={styles.emptyIcon}><UserRound size={22} aria-hidden="true" /></span>; }

export default function AdminManagersPage() {
  return <React.Suspense fallback={<WorkspaceRouteFallback label="Loading managers" />}><AdminManagersContent /></React.Suspense>;
}
