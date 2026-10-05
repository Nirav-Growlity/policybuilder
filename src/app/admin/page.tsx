"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Mail, Pencil, Plus, RefreshCw, UserRound, UserRoundX, X } from "lucide-react";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import { Modal } from "@/components/ui/modal";

type AdminManagersResponse = { managers: PolicyCraftManagerSummary[]; organizations: PolicyCraftOrganization[] };
const statusLabel: Record<PolicyCraftManagerSummary["status"], string> = {
  active: "Active", disabled: "Disabled", pending: "Invitation pending", delivery_failed: "Invitation not sent",
};

function statusClass(status: PolicyCraftManagerSummary["status"]): string {
  if (status === "active") return "bg-emerald-50 text-emerald-800";
  if (status === "disabled" || status === "delivery_failed") return "bg-amber-50 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

function dateLabel(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(parsed);
}

export default function AdminManagersPage() {
  const router = useRouter();
  const [data, setData] = React.useState<AdminManagersResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");
  const [expiredInvitationIds, setExpiredInvitationIds] = React.useState<string[]>([]);
  const [managerToEdit, setManagerToEdit] = React.useState<PolicyCraftManagerSummary | null>(null);
  const [selectedOrganizations, setSelectedOrganizations] = React.useState<number[]>([]);
  const [organizationSearch, setOrganizationSearch] = React.useState("");
  const [cancelTarget, setCancelTarget] = React.useState<PolicyCraftManagerSummary | null>(null);
  const [cancelError, setCancelError] = React.useState("");

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
  }

  async function updateManager(managerId: string, patch: { organizationIds?: number[]; active?: boolean }) {
    const target = data?.managers.find((manager) => manager.id === managerId);
    setBusyId(managerId);
    setError("");
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
      setManagerToEdit(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this manager.");
    } finally {
      setBusyId(null);
    }
  }

  async function invitationAction(manager: PolicyCraftManagerSummary, action: "resend" | "cancel") {
    if (!manager.invitationId || busyId) return;
    if (action === "cancel") { setCancelError(""); setCancelTarget(manager); return; }
    setBusyId(manager.id);
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
    }
  }

  async function cancelInvitation(manager: PolicyCraftManagerSummary) {
    if (!manager.invitationId || busyId) return;
    setBusyId(manager.id);
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
    }
  }

  const organizations = data?.organizations ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Administration</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-pretty">Managers</h1><p className="mt-1 text-sm text-[var(--color-muted)]">Add manager access and control the organizations each manager can open.</p></div>
        <Link href="/admin/managers/new" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><Plus size={15} aria-hidden="true" />Add manager</Link>
      </div>

      {error ? <div className="mt-6 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><p>{error}</p><button type="button" onClick={() => void load()} className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 text-xs font-semibold hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"><RefreshCw size={13} aria-hidden="true" />Retry</button></div> : null}

      <section aria-label="Manager accounts" className="mt-7 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white">
        {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[var(--color-muted)]" aria-live="polite"><Loader2 size={17} className="animate-spin" aria-hidden="true" />Loading managers…</div> : data?.managers.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-[var(--color-cream-2)] text-[11px] uppercase tracking-wider text-[var(--color-muted)]"><tr><th scope="col" className="px-5 py-3 font-semibold">Manager</th><th scope="col" className="px-5 py-3 font-semibold">Organizations</th><th scope="col" className="px-5 py-3 text-right font-semibold">Policies</th><th scope="col" className="px-5 py-3 font-semibold">Status</th><th scope="col" className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead>
              <tbody className="divide-y divide-[var(--color-line)]">
                {data.managers.map((manager) => (
                  <tr key={manager.id}>
                    <th scope="row" className="max-w-64 px-5 py-4 font-medium"><span className="block truncate text-[var(--color-ink)]">{manager.name}</span><span className="mt-0.5 block truncate text-xs font-normal text-[var(--color-muted)]">{manager.email}</span></th>
                    <td className="max-w-[360px] px-5 py-4"><div className="flex flex-wrap gap-1.5">{manager.organizations.length ? manager.organizations.map((organization) => <span key={organization.id} title={organization.name} className={`max-w-52 truncate rounded-md px-2 py-1 text-[11px] ${organization.deleted ? "bg-slate-100 text-slate-600" : "bg-[var(--color-cream-2)] text-[var(--color-ink-2)]"}`}>{organization.name}{organization.deleted ? " · deleted" : ""}</span>) : <span className="text-xs text-[var(--color-muted)]">No organizations assigned</span>}</div>{manager.expiresAt ? <p className="mt-1 text-[10px] text-[var(--color-muted)]">{expiredInvitationIds.includes(manager.id) ? "Invitation expired" : "Invitation expires"} {dateLabel(manager.expiresAt)}</p> : null}</td>
                    <td className="px-5 py-4 text-right font-mono tabular-nums">{manager.policyCount}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(manager.status)}`}>{expiredInvitationIds.includes(manager.id) ? "Invitation expired" : statusLabel[manager.status]}</span></td>
                    <td className="px-5 py-4"><div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => startEdit(manager)} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--color-line-2)] px-2.5 text-[11px] font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><Pencil size={12} aria-hidden="true" />Assignments</button>
                      {(manager.status === "active" || manager.status === "disabled") ? <button type="button" disabled={busyId === manager.id} onClick={() => void updateManager(manager.id, { active: manager.status !== "active" })} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50">{manager.status === "active" ? <><UserRoundX size={13} aria-hidden="true" />Disable</> : <><UserRound size={13} aria-hidden="true" />Enable</>}</button> : null}
                      {manager.invitationId ? <><button type="button" disabled={busyId === manager.id} onClick={() => void invitationAction(manager, "resend")} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50"><Mail size={13} aria-hidden="true" />Resend</button><button type="button" disabled={busyId === manager.id} onClick={() => void invitationAction(manager, "cancel")} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-50"><X size={13} aria-hidden="true" />Cancel invite</button></> : null}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="px-6 py-16 text-center"><UsersIcon /><h2 className="mt-4 font-display text-xl font-semibold">No managers yet</h2><p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">Add an existing account or invite someone new, then assign their organizations.</p><Link href="/admin/managers/new" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)]"><Plus size={15} aria-hidden="true" />Add manager</Link></div>}
      </section>

      <Modal open={Boolean(managerToEdit)} onClose={() => setManagerToEdit(null)} title="Assign organizations" description={`Choose the organizations ${managerToEdit?.name || "this manager"} can access.`} width={560}>
        {managerToEdit ? <form onSubmit={(event) => { event.preventDefault(); void updateManager(managerToEdit.id, { organizationIds: selectedOrganizations }); }}>
          <label className="mb-2 block text-[11px] font-semibold text-[var(--color-ink-2)]" htmlFor="assignment-org-search">Search organizations</label><input id="assignment-org-search" name="organizationSearch" autoComplete="off" type="search" value={organizationSearch} onChange={(event) => setOrganizationSearch(event.target.value)} placeholder="Search by organization name or code…" className="mb-3 h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-forest)]" />
          <fieldset><legend className="mb-3 text-[12px] font-semibold text-[var(--color-ink-2)]">Organizations</legend><div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-line)] p-2">{organizations.filter((organization) => `${organization.name} ${organization.code}`.toLowerCase().includes(organizationSearch.toLowerCase())).map((organization) => { const selected = selectedOrganizations.includes(organization.id); return <label key={organization.id} className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm ${selected || (!organization.deleted && !organization.expired) ? "cursor-pointer hover:bg-[var(--color-cream-2)]" : "cursor-not-allowed opacity-60"} focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-forest)]`}><input type="checkbox" checked={selected} disabled={(organization.deleted || organization.expired) && !selected} onChange={(event) => setSelectedOrganizations((current) => event.target.checked ? [...new Set([...current, organization.id])] : current.filter((id) => id !== organization.id))} className="h-4 w-4 accent-[var(--color-forest)]" /><span className="min-w-0 flex-1 truncate">{organization.name}</span>{organization.deleted ? <span className="text-[10px] text-[var(--color-muted)]">Deleted</span> : organization.expired ? <span className="text-[10px] text-amber-800">Expired</span> : null}</label>; })}{organizations.length === 0 ? <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">No organizations available.</p> : null}{organizations.length > 0 && !organizations.some((organization) => `${organization.name} ${organization.code}`.toLowerCase().includes(organizationSearch.toLowerCase())) ? <p className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">No matching organizations.</p> : null}</div></fieldset>
          <p className="mt-3 text-[11px] leading-5 text-[var(--color-muted)]">Removing an assignment does not remove policies already created for that organization.</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setManagerToEdit(null)} className="min-h-10 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-medium hover:bg-[var(--color-cream-2)]">Cancel</button><button type="submit" disabled={busyId === managerToEdit.id} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] disabled:opacity-60">{busyId === managerToEdit.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}Save assignments</button></div>
        </form> : null}
      </Modal>
      <Modal open={Boolean(cancelTarget)} onClose={() => { if (!busyId) { setCancelTarget(null); setCancelError(""); } }} title="Cancel manager invitation?" description={`The invitation for ${cancelTarget?.email || "this manager"} will stop working.`} width={480}>
        {cancelError ? <p role="alert" aria-live="polite" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{cancelError}</p> : null}
        <div className="flex justify-end gap-2"><button type="button" disabled={Boolean(busyId)} onClick={() => { setCancelTarget(null); setCancelError(""); }} className="min-h-10 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-medium hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60">Keep invitation</button><button type="button" disabled={Boolean(busyId) || !cancelTarget} onClick={() => { if (cancelTarget) void cancelInvitation(cancelTarget); }} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-60">{busyId ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" />Canceling…</> : "Cancel invitation"}</button></div>
      </Modal>
    </div>
  );
}

function UsersIcon() { return <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><UserRound size={20} aria-hidden="true" /></div>; }
