"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw, Search, UserPlus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";

type ManagerCollection = { managers: PolicyCraftManagerSummary[] };

export function OrganizationManagerAssignment({
  organization,
  disabled = false,
  label = "Assign existing manager",
}: {
  organization: PolicyCraftOrganization;
  disabled?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [managers, setManagers] = React.useState<PolicyCraftManagerSummary[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState("");
  const [notice, setNotice] = React.useState("");

  const loadManagers = React.useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setSaveError("");
    try {
      const response = await fetch("/api/policycraft/admin/managers", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/login?next=%2Fadmin%2Forganizations");
        return;
      }
      const result = await response.json().catch(() => null) as ManagerCollection | null;
      if (!response.ok) throw new Error((result as { error?: string } | null)?.error || "Could not load active managers. Retry to continue.");
      setManagers(Array.isArray(result?.managers) ? result.managers : []);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Could not load active managers.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  function showPicker() {
    setQuery("");
    setSaveError("");
    setNotice("");
    setOpen(true);
    void loadManagers();
  }

  async function assign(manager: PolicyCraftManagerSummary) {
    if (savingId || manager.status !== "active" || manager.organizations.some((item) => item.id === organization.id)) return;
    setSavingId(manager.id);
    setSaveError("");
    setNotice("");
    try {
      const response = await fetch(`/api/policycraft/admin/managers/${encodeURIComponent(manager.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addOrganizationId: organization.id }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not assign this manager. Retry to continue.");
      setManagers((current) => current.map((item) => item.id === manager.id
        ? { ...item, organizations: [...item.organizations, organization] }
        : item));
      setNotice(`${manager.name || manager.email} can now access ${organization.name}.`);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : "Could not assign this manager. Retry to continue.");
    } finally {
      setSavingId(null);
    }
  }

  const activeManagers = managers.filter((manager) => manager.status === "active");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingManagers = activeManagers.filter((manager) => `${manager.name} ${manager.email}`.toLocaleLowerCase().includes(normalizedQuery));
  const unavailableReason = organization.deleted ? "Deleted organizations cannot receive manager assignments." : organization.expired ? "Expired organizations cannot receive manager assignments." : "";

  return <>
    <button type="button" onClick={showPicker} disabled={disabled || Boolean(unavailableReason)} title={unavailableReason || undefined} aria-label={unavailableReason ? `Assignments unavailable. ${unavailableReason}` : undefined} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-line-2)] px-3 text-xs font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-55">{disabled ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : unavailableReason ? null : <UserPlus size={14} aria-hidden="true" />}{disabled ? "Loading managers…" : unavailableReason ? "Unavailable" : label}</button>
    <Modal open={open} onClose={() => { if (!savingId) setOpen(false); }} title={`Assign a manager to ${organization.name}`} description="Search active PolicyCraft managers by name or email." width={560} hideClose={Boolean(savingId)}>
      <label htmlFor={`manager-search-${organization.id}`} className="mb-2 block text-xs font-semibold text-[var(--color-ink-2)]">Search managers</label>
      <span className="relative block"><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" /><input id={`manager-search-${organization.id}`} name="managerSearch" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email…" disabled={loading || Boolean(loadError)} className="h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white pl-9 pr-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60" /></span>
      {notice ? <p role="status" aria-live="polite" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">{notice}</p> : null}
      {saveError ? <p role="alert" aria-live="polite" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">{saveError}</p> : null}
      <div className="mt-3 max-h-72 divide-y divide-[var(--color-line)] overflow-y-auto rounded-lg border border-[var(--color-line)] bg-white" aria-busy={loading}>
        {loading ? <p role="status" aria-live="polite" className="flex min-h-20 items-center justify-center gap-2 px-4 text-sm text-[var(--color-muted)]"><Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading active managers…</p> : loadError ? <div role="alert" className="px-4 py-7 text-center"><p className="text-sm text-red-900">{loadError}</p><button type="button" onClick={() => void loadManagers()} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : activeManagers.length === 0 ? <p className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">No active PolicyCraft managers are available. Add a manager to continue.</p> : matchingManagers.length === 0 ? <p className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">No active managers match your search.</p> : matchingManagers.map((manager) => {
          const alreadyAssigned = manager.organizations.some((item) => item.id === organization.id);
          const saving = savingId === manager.id;
          return <div key={manager.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0"><p className="break-words text-sm font-semibold text-[var(--color-ink)]">{manager.name || manager.email}</p><p className="break-all text-xs text-[var(--color-muted)]">{manager.email}</p></div>
            {alreadyAssigned ? <span className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-900"><Check size={13} aria-hidden="true" />Already assigned</span> : <button type="button" onClick={() => void assign(manager)} disabled={Boolean(savingId)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-3 text-xs font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-55">{saving ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />}{saving ? "Saving…" : "Assign"}</button>}
          </div>;
        })}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={Boolean(savingId)} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-55">Close</button><Link href={`/admin/managers/new?organizationId=${organization.id}`} aria-disabled={Boolean(savingId)} tabIndex={savingId ? -1 : undefined} onClick={(event) => { if (savingId) { event.preventDefault(); return; } setOpen(false); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] aria-disabled:cursor-not-allowed aria-disabled:opacity-55"><UserPlus size={14} aria-hidden="true" />Add new manager</Link></div>
    </Modal>
  </>;
}
