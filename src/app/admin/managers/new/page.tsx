"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, Loader2, Mail, ShieldCheck, UserPlus } from "lucide-react";
import type { PolicyCraftManagerSummary, PolicyCraftOrganization } from "@/lib/policycraft-access-types";

type AdminManagersResponse = { managers: PolicyCraftManagerSummary[]; organizations: PolicyCraftOrganization[] };
type ExistingAccount = { id: string; name: string; email: string };

export default function CreateManagerPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = React.useState<PolicyCraftOrganization[]>([]);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [organizationIds, setOrganizationIds] = React.useState<number[]>([]);
  const [organizationSearch, setOrganizationSearch] = React.useState("");
  const [existingAccount, setExistingAccount] = React.useState<ExistingAccount | null>(null);
  const [success, setSuccess] = React.useState<{ email: string; deliverySent: boolean } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let active = true;
    void fetch("/api/policycraft/admin/managers", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) { router.replace("/login?next=%2Fadmin%2Fmanagers%2Fnew"); return null; }
        if (!response.ok) throw new Error("Could not load organizations. Refresh to try again.");
        return response.json() as Promise<AdminManagersResponse>;
      })
      .then((data) => { if (active && data) setOrganizations(data.organizations); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load organizations."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [router]);

  async function createManager(linkExisting = false) {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/policycraft/admin/managers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), organizationIds, ...(linkExisting ? { linkExisting: true } : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (response.status === 409 && result?.code === "ACCOUNT_EXISTS" && result.existingAccount) {
        setExistingAccount(result.existingAccount as ExistingAccount);
        return;
      }
      if (!response.ok) throw new Error(result?.error || "Could not create this manager invitation.");
      setSuccess({ email: result.manager?.email || email.trim(), deliverySent: result.delivery?.sent !== false });
      setExistingAccount(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create this manager invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return <div className="mx-auto max-w-2xl">
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${success.deliverySent ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
        {success.deliverySent ? <Check size={20} aria-hidden="true" /> : <AlertTriangle size={20} aria-hidden="true" />}
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">{success.deliverySent ? "Invitation sent" : "Invitation created"}</h1>
      <p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">{success.deliverySent ? `An invitation link was sent to ${success.email}. They will choose their password when they accept.` : `The invitation for ${success.email} is ready, but the email could not be delivered. Resend it from the Managers list after checking the address.`}</p>
      <div className="mt-6 flex flex-wrap gap-3"><Link href="/admin" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)]"><ArrowLeft size={14} aria-hidden="true" />Back to managers</Link><Link href="/admin/policies" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]">View policies</Link></div>
    </div>;
  }

  return <div className="mx-auto max-w-3xl">
    <Link href="/admin" className="inline-flex min-h-9 items-center gap-1.5 text-[12px] font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><ArrowLeft size={14} aria-hidden="true" />Managers</Link>
    <div className="mt-5"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Manager access</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Invite a manager</h1><p className="mt-1 text-sm text-[var(--color-muted)]">Send a secure invitation. The manager will set a password after accepting.</p></div>

    {error ? <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite">{error}</p> : null}
    {existingAccount ? <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-labelledby="existing-account-title"><div className="flex items-start gap-3"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-800" aria-hidden="true" /><div className="min-w-0"><h2 id="existing-account-title" className="text-sm font-semibold text-amber-950">This email already has an ESG account</h2><p className="mt-1 text-sm text-amber-900">{existingAccount.name} · {existingAccount.email}</p><p className="mt-2 text-xs leading-5 text-amber-900">Linking sends an invitation to connect this existing account to PolicyCraft. Its password and organization details will stay unchanged.</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void createManager(true)} disabled={submitting} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-900 px-4 text-sm font-semibold text-white hover:bg-amber-950 disabled:opacity-60">{submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={14} aria-hidden="true" />}Link existing account</button><button type="button" onClick={() => setExistingAccount(null)} className="min-h-10 rounded-lg border border-amber-300 px-4 text-sm font-medium text-amber-950 hover:bg-amber-100">Use another email</button></div></div></div></section> : null}

    <form className="mt-6 space-y-7" onSubmit={(event) => { event.preventDefault(); void createManager(false); }}>
      <section className="border-y border-[var(--color-line)] py-6" aria-labelledby="manager-details-title"><h2 id="manager-details-title" className="text-sm font-semibold">Account details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-[12px] font-semibold text-[var(--color-ink-2)]">Full name<input name="name" autoComplete="name" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label>
        <label className="block text-[12px] font-semibold text-[var(--color-ink-2)]">Work email<input name="email" type="email" autoComplete="email" spellCheck={false} required maxLength={254} value={email} onChange={(event) => { setEmail(event.target.value); setExistingAccount(null); }} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label>
      </div><div className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--color-cream-2)] p-3 text-xs leading-5 text-[var(--color-ink-2)]"><Mail size={15} className="mt-0.5 shrink-0 text-[var(--color-forest)]" aria-hidden="true" /><p>The invitation expires automatically. Managers choose their own password; no password is displayed to or stored by this form.</p></div></section>

      <section aria-labelledby="organization-access-title"><div><h2 id="organization-access-title" className="text-sm font-semibold">Organization access</h2><p className="mt-1 text-xs text-[var(--color-muted)]">Choose the client organizations this manager can open. Policies in an assigned organization are shared with its users.</p></div>
        <label htmlFor="invite-org-search" className="mt-3 mb-2 block text-[11px] font-semibold text-[var(--color-ink-2)]">Search organizations</label><input id="invite-org-search" name="organizationSearch" autoComplete="off" type="search" value={organizationSearch} onChange={(event) => setOrganizationSearch(event.target.value)} placeholder="Search by organization name or code…" className="mb-3 h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-forest)]" />
        <fieldset><legend className="sr-only">Assigned organizations</legend><div className="max-h-72 divide-y divide-[var(--color-line)] overflow-y-auto rounded-xl border border-[var(--color-line)] bg-white">
          {loading ? <p className="flex min-h-16 items-center gap-2 px-4 text-sm text-[var(--color-muted)]" aria-live="polite"><Loader2 size={14} className="animate-spin" aria-hidden="true" />Loading organizations…</p> : organizations.filter((organization) => !organization.deleted && !organization.expired && `${organization.name} ${organization.code}`.toLowerCase().includes(organizationSearch.toLowerCase())).map((organization) => <label key={organization.id} className="flex min-h-12 cursor-pointer items-center gap-3 px-4 text-sm hover:bg-[var(--color-cream-2)] focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-forest)]"><input type="checkbox" checked={organizationIds.includes(organization.id)} onChange={(event) => setOrganizationIds((current) => event.target.checked ? [...new Set([...current, organization.id])] : current.filter((id) => id !== organization.id))} className="h-4 w-4 accent-[var(--color-forest)]" /><span className="min-w-0 flex-1 truncate">{organization.name}</span><span className="shrink-0 text-[10px] text-[var(--color-muted)]">{organization.code}</span></label>)}
          {!loading && !organizations.filter((organization) => !organization.deleted && !organization.expired).length ? <p className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">No active organizations are available to assign.</p> : null}
          {!loading && !organizations.length ? <p className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">No organizations are available to assign.</p> : null}
        </div></fieldset>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-5"><p className="text-xs text-[var(--color-muted)]">{organizationIds.length} organization{organizationIds.length === 1 ? "" : "s"} selected</p><div className="flex gap-2"><Link href="/admin" className="inline-flex min-h-10 items-center rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-medium hover:bg-[var(--color-cream-2)]">Cancel</Link><button type="submit" disabled={loading || submitting || !name.trim() || !email.trim() || organizationIds.length === 0} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] disabled:cursor-not-allowed disabled:opacity-55">{submitting ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <UserPlus size={14} aria-hidden="true" />}{submitting ? "Sending invitation…" : "Send invitation"}</button></div></div>
    </form>
  </div>;
}
