"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Loader2, Mail, Pencil, Plus, RefreshCw, Search, UserRound, UserRoundX, X } from "lucide-react";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import { Modal } from "@/components/ui/modal";
import { ApplicationButton, ApplicationInput, ApplicationStatus } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { RecordSkeleton } from "@/components/ui/record-skeleton";
import { ActionDisclosure, ActionDisclosureItem } from "@/components/ui/action-disclosure";
import { OrganizationSourceBadge, organizationSourceName } from "@/components/workspace/organization-source-label";
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

  const organizations = data?.organizations ?? [];
  const managers = data?.managers ?? [];
  const filteredManagers = managers.filter((manager) => {
    const search = query.trim().toLowerCase();
    const matchesQuery = !search || `${manager.name} ${manager.email} ${manager.organizations.map((organization) => organization.name).join(" ")}`.toLowerCase().includes(search);
    return matchesQuery && (statusFilter === "all" || manager.status === statusFilter);
  });

  const renderManagerActions = (manager: PolicyCraftManagerSummary) => <div className="flex items-center justify-start gap-2 xl:justify-end">
    <button type="button" disabled={Boolean(busyId)} onClick={() => startEdit(manager)} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50"><Pencil size={14} aria-hidden="true" />Assignments</button>
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
    return manager.organizations.map((organization) => <span key={organization.id} title={`${organization.name} (${organization.code})`} className={`inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] leading-4 ${organization.deleted ? "bg-slate-100 text-slate-600" : "bg-[var(--color-cream-2)] text-[var(--color-ink-2)]"}`}><span className="break-words">{organization.name}{nameCounts.get(organization.name)! > 1 ? <span className="ml-1 text-[10px] text-[var(--color-muted)]">[{organization.code}]</span> : null}{organization.deleted ? " · deleted" : ""}</span><OrganizationSourceBadge organization={organization} /></span>);
  };

  const renderManagerIdentity = (manager: PolicyCraftManagerSummary) => <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-forest-soft)] text-xs font-semibold text-[var(--color-forest)]">{manager.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?"}</span><div className="min-w-0"><h3 className="break-words font-display text-base font-semibold leading-snug text-[var(--color-ink)]">{manager.name}</h3><p className="mt-0.5 break-all text-xs text-[var(--color-muted)]">{manager.email}</p>{busyId === manager.id ? <p role="status" aria-live="polite" className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-forest)]"><Loader2 size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />{busyAction === "resend" ? "Sending invitation…" : busyAction === "status" ? "Updating access…" : "Saving assignments…"}</p> : null}</div></div>;

  return (
    <ApplicationSurface className={styles.surface} data-pc-workspace="admin-managers">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Administration</p><h1 className={`${styles.pageTitle} mt-1 text-pretty font-semibold tracking-tight`}>Managers</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">Add manager access and control the organizations each manager can open.</p></div>
        <Link href="/admin/managers/new" className={styles.primaryLink}><Plus size={15} aria-hidden="true" />Add manager</Link>
      </div>

      {error && data ? <div className="mt-6 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><p>{error}</p><button type="button" onClick={() => void load()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : null}

      <section aria-label="Manager accounts" className={`${styles.roster} relative mt-7 rounded-xl border bg-white`}>
        <div className="grid items-end gap-3 border-b border-[var(--color-line)] bg-[var(--color-cream-2)]/55 p-4 sm:grid-cols-[minmax(220px,1fr)_minmax(190px,240px)] sm:p-5">
          <label className="block text-xs font-semibold text-[var(--color-muted)]"><span className="mb-1 block">Search managers</span><span className={styles.searchField}><Search size={16} aria-hidden="true" className={styles.searchIcon} /><ApplicationInput type="search" name="managerSearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email or organization…" className={styles.searchInput} /></span></label>
          <label className="text-xs font-semibold text-[var(--color-muted)]">Status<select name="managerStatus" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${styles.statusSelect} mt-1 block h-11 w-full rounded-lg border bg-white px-3 text-sm font-normal`}><option value="all">All managers</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="pending">Invitation pending</option><option value="delivery_failed">Invitation not sent</option></select></label>
        </div>
        {loading && !data ? <div className={styles.initialLoading} role="status" aria-live="polite" aria-busy="true"><span className={styles.loadingStatus}><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading managers…</span><RecordSkeleton /></div> : loading ? <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-[var(--color-muted)]" role="status" aria-live="polite" aria-busy="true"><Loader2 size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Refreshing managers…</div> : !data ? (
          <div className="px-6 py-12 text-center" role="alert" aria-live="polite"><h2 className="text-xl font-semibold">Managers could not be loaded</h2><p className="mt-2 text-sm text-[var(--color-muted)]">{error || "Retry to load manager accounts and their organization assignments."}</p><ApplicationButton type="button" variant="outline" leadingIcon={<RefreshCw size={14} aria-hidden="true" />} onClick={() => void load()} className="mt-5">Retry</ApplicationButton></div>
        ) : managers.length === 0 ? <div className="px-6 py-16 text-center"><UsersIcon /><h2 className="mt-4 text-xl font-semibold">No managers yet</h2><p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">Add an existing account or invite someone new, then assign their organizations.</p><Link href="/admin/managers/new" className={`${styles.primaryLink} mt-5`}><Plus size={15} aria-hidden="true" />Add manager</Link></div> : filteredManagers.length ? (
          <>
            <div className="hidden xl:block"><table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup><col className="w-[28%]" /><col className="w-[40%]" /><col className="w-[12%]" /><col className="w-[20%]" /></colgroup>
              <thead className="bg-[var(--color-cream-2)]/65 text-[11px] text-[var(--color-muted)]"><tr><th scope="col" className="border-r border-[var(--color-line)] px-5 py-4 font-semibold">Manager</th><th scope="col" className="border-r border-[var(--color-line)] px-4 py-4 font-semibold">Organizations</th><th scope="col" className="border-r border-[var(--color-line)] px-4 py-4 font-semibold">Access</th><th scope="col" className="px-4 py-4 font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--color-line)]">{filteredManagers.map((manager) => <tr key={manager.id} className="align-top"><th scope="row" className="px-5 py-4 font-medium">{renderManagerIdentity(manager)}</th><td className="px-4 py-4 align-top"><div className="flex flex-wrap content-start gap-1.5">{manager.organizations.length ? renderOrganizations(manager) : <span className="text-xs text-[var(--color-muted)]">No organizations assigned</span>}</div></td><td className="px-4 py-4 align-top"><div className="space-y-2">{renderManagerStatus(manager)}<p className="whitespace-nowrap text-xs text-[var(--color-muted)]"><span className="font-mono tabular-nums">{manager.policyCount}</span> {manager.policyCount === 1 ? "policy" : "policies"}</p>{manager.expiresAt ? <p className="text-[10px] leading-4 text-[var(--color-muted)]">{expiredInvitationIds.includes(manager.id) ? "Invitation expired" : `Expires ${dateLabel(manager.expiresAt)}`}</p> : null}</div></td><td className="px-4 py-4 align-top">{renderManagerActions(manager)}</td></tr>)}</tbody>
            </table></div>
            <div className="divide-y divide-[var(--color-line)] xl:hidden">{filteredManagers.map((manager) => <article key={manager.id} className="px-4 py-5 sm:px-6"><div>{renderManagerIdentity(manager)}</div><div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">{renderManagerStatus(manager)}<span className="text-sm text-[var(--color-muted)]"><span className="font-mono tabular-nums">{manager.policyCount}</span> {manager.policyCount === 1 ? "policy" : "policies"}</span>{manager.expiresAt ? <span className="text-xs text-[var(--color-muted)]">{expiredInvitationIds.includes(manager.id) ? "Invitation expired" : `Expires ${dateLabel(manager.expiresAt)}`}</span> : null}</div><div className="mt-4"><p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">Organizations</p><div className="mt-2 flex flex-wrap gap-1.5">{manager.organizations.length ? renderOrganizations(manager) : <span className="text-sm text-[var(--color-muted)]">No organizations assigned</span>}</div></div><div className="mt-4 border-t border-[var(--color-line)] pt-3">{renderManagerActions(manager)}</div></article>)}</div>
          </>
        ) : <div className="px-6 py-12 text-center"><h2 className="text-xl font-semibold">No managers match these filters</h2><p className="mt-2 text-sm text-[var(--color-muted)]">Clear the search or choose another status to see manager accounts.</p><ApplicationButton type="button" variant="ghost" onClick={() => { setQuery(""); setStatusFilter("all"); }} className="mt-4">Clear filters</ApplicationButton></div>}
      </section>

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

function UsersIcon() { return <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><UserRound size={20} aria-hidden="true" /></div>; }

export default function AdminManagersPage() {
  return <React.Suspense fallback={<div className="min-h-48" aria-busy="true" aria-label="Loading manager filters" />}><AdminManagersContent /></React.Suspense>;
}
