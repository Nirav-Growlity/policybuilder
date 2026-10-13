"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, RefreshCw, Search, UserPlus } from "lucide-react";
import styles from "./organization-manager-assignment.module.css";
import { Modal } from "@/components/ui/modal";
import { Avatar } from "@/components/workspace/workspace-motion";
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
    <button type="button" onClick={showPicker} disabled={disabled || Boolean(unavailableReason)} title={unavailableReason || undefined} aria-label={unavailableReason ? `Assignments unavailable. ${unavailableReason}` : undefined} className={styles.trigger}>
      {disabled ? <Loader2 size={14} className={styles.spinner} aria-hidden="true" /> : unavailableReason ? null : <UserPlus size={14} aria-hidden="true" />}
      {disabled ? "Loading managers…" : unavailableReason ? "Unavailable" : label}
    </button>
    <Modal open={open} onClose={() => { if (!savingId) setOpen(false); }} title={`Assign a manager to ${organization.name}`} description="Search active PolicyCraft managers by name or email." width={560} hideClose={Boolean(savingId)}>
      <label htmlFor={`manager-search-${organization.id}`} className={styles.label}>Search managers</label>
      <span className={styles.search}>
        <Search size={15} aria-hidden="true" className={styles.searchIcon} />
        <input id={`manager-search-${organization.id}`} name="managerSearch" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or email…" disabled={loading || Boolean(loadError)} className={styles.input} />
      </span>
      {notice ? <p role="status" aria-live="polite" className={styles.success}><Check size={15} aria-hidden="true" />{notice}</p> : null}
      {saveError ? <p role="alert" aria-live="polite" className={styles.error}>{saveError}</p> : null}
      <div className={styles.list} aria-busy={loading}>
        {loading ? <p role="status" aria-live="polite" className={styles.loading}><Loader2 size={15} className={styles.spinner} aria-hidden="true" />Loading active managers…</p> : loadError ? <div role="alert" className={styles.errorState}><p className={styles.errorText}>{loadError}</p><button type="button" onClick={() => void loadManagers()} className={styles.retry}><RefreshCw size={14} aria-hidden="true" />Retry</button></div> : activeManagers.length === 0 ? <p className={styles.empty}>No active PolicyCraft managers are available. Add a manager to continue.</p> : matchingManagers.length === 0 ? <p className={styles.empty}>No active managers match your search.</p> : matchingManagers.map((manager) => {
          const alreadyAssigned = manager.organizations.some((item) => item.id === organization.id);
          const saving = savingId === manager.id;
          return <div key={manager.id} className={styles.row}>
            <Avatar name={manager.name || manager.email} seed={manager.email} size={36} />
            <div className={styles.identity}><p className={styles.name}>{manager.name || manager.email}</p><p className={styles.email}>{manager.email}</p></div>
            {alreadyAssigned ? <span className={styles.assigned}><Check size={13} aria-hidden="true" />Already assigned</span> : <button type="button" onClick={() => void assign(manager)} disabled={Boolean(savingId)} className={styles.assign}>{saving ? <Loader2 size={14} className={styles.spinner} aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />}{saving ? "Saving…" : "Assign"}</button>}
          </div>;
        })}
      </div>
      <div className={styles.footer}>
        <button type="button" disabled={Boolean(savingId)} onClick={() => setOpen(false)} className={styles.close}>Close</button>
        <Link href={`/admin/managers/new?organizationId=${organization.id}`} aria-disabled={Boolean(savingId)} tabIndex={savingId ? -1 : undefined} onClick={(event) => { if (savingId) { event.preventDefault(); return; } setOpen(false); }} className={styles.newManager}><UserPlus size={14} aria-hidden="true" />Add new manager</Link>
      </div>
    </Modal>
  </>;
}
