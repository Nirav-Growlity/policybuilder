"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpRight, FileText, Loader2, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { PolicyCoverPreview } from "@/components/policy/policy-preview";
import { Modal } from "@/components/ui/modal";
import { POLICY_PROFILES } from "@/lib/constants";
import { initialPolicy } from "@/lib/store";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { policyCraftExportContext } from "@/lib/policycraft-client-scope";
import type { PolicyCraftDocumentState, PolicyDocumentSummary } from "@/lib/policycraft-types";
import type { Policy, PolicyType } from "@/lib/types";

type Creator = { id: string; name: string; email: string };
type OrganizationLabel = { id: number; name: string; code?: string; deleted?: boolean; expired?: boolean };
type AdminPolicy = PolicyDocumentSummary & { organization: OrganizationLabel; createdBy: Creator; state?: PolicyCraftDocumentState };
type AdminDocumentResponse = { documents: AdminPolicy[]; creators?: Creator[] };

const POLICY_TYPES = Object.keys(POLICY_PROFILES) as PolicyType[];
type View = "active" | "archived";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function label(value: string) { return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function policyFromSummary(document: AdminPolicy): Policy {
  const base = initialPolicy(document.policyType);
  const snapshot = document.coverPreview;
  if (!snapshot) return base;
  return { ...base, ...snapshot, company: { ...base.company, ...snapshot.company }, sections: base.sections };
}

function filenameFromResponse(response: Response, fallback: string) {
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"/g, "")) : fallback;
}

function AdminPoliciesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { access } = usePolicyCraftWorkspace();
  const organizations = access.organizations;
  const [creators, setCreators] = React.useState<Creator[]>([]);
  const [documents, setDocuments] = React.useState<AdminPolicy[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [actionId, setActionId] = React.useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AdminPolicy | null>(null);
  const [query, setQuery] = React.useState(searchParams.get("q") || "");
  const [orgId, setOrgId] = React.useState(searchParams.get("orgId") || "all");
  const [creatorId, setCreatorId] = React.useState(searchParams.get("creatorId") || "all");
  const [policyType, setPolicyType] = React.useState(searchParams.get("policyType") || "all");
  const [view, setView] = React.useState<View>(searchParams.get("view") === "archived" ? "archived" : "active");

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      const values = new URLSearchParams(searchParams.toString());
      setQuery(values.get("q") || "");
      setOrgId(values.get("orgId") || "all");
      setCreatorId(values.get("creatorId") || "all");
      setPolicyType(values.get("policyType") || "all");
      setView(values.get("view") === "archived" ? "archived" : "active");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const queryKey = `${orgId}|${creatorId}|${policyType}|${view}`;
  React.useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ view });
    if (orgId !== "all") params.set("orgId", orgId);
    if (creatorId !== "all") params.set("creatorId", creatorId);
    if (policyType !== "all") params.set("policyType", policyType);
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void fetch(`/api/policycraft/admin/documents?${params}`, { cache: "no-store" }).then(async (documentsResponse) => {
      if (documentsResponse.status === 401) { router.replace("/login?next=%2Fadmin%2Fpolicies"); return null; }
      if (!documentsResponse.ok) throw new Error("Could not load policies. Refresh to try again.");
      const documentData = await documentsResponse.json() as AdminDocumentResponse;
      if (!active) return null;
      setDocuments(documentData.documents || []);
      setCreators(documentData.creators || []);
      setLoading(false);
      return true;
      }).catch((cause) => {
        if (active) { setError(cause instanceof Error ? cause.message : "Could not load policies."); setLoading(false); }
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [queryKey, router, orgId, creatorId, policyType, view]);

  React.useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (orgId !== "all") params.set("orgId", orgId);
    if (creatorId !== "all") params.set("creatorId", creatorId);
    if (policyType !== "all") params.set("policyType", policyType);
    if (view !== "active") params.set("view", view);
    const next = params.toString();
    router.replace(next ? `/admin/policies?${next}` : "/admin/policies", { scroll: false });
  }, [creatorId, orgId, policyType, query, router, view]);

  const filtered = React.useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return documents;
    return documents.filter((document) => [document.title, document.organization?.name, document.createdBy?.name, document.createdBy?.email, POLICY_PROFILES[document.policyType]?.label].some((value) => value?.toLowerCase().includes(search)));
  }, [documents, query]);

  async function setArchived(document: AdminPolicy, archived: boolean) {
    if (actionId) return;
    setActionId(document.id);
    setError("");
    try {
      const response = await fetch(`/api/policycraft/documents/${encodeURIComponent(document.id)}?orgId=${document.organization.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived, lockVersion: document.lockVersion }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `Could not ${archived ? "archive" : "restore"} this policy.`);
      await refreshDocuments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this policy."); }
    finally { setActionId(null); }
  }

  async function refreshDocuments() {
    const params = new URLSearchParams({ view });
    if (orgId !== "all") params.set("orgId", orgId);
    if (creatorId !== "all") params.set("creatorId", creatorId);
    if (policyType !== "all") params.set("policyType", policyType);
    const response = await fetch(`/api/policycraft/admin/documents?${params}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Action completed, but the policy list could not refresh.");
    const result = await response.json() as AdminDocumentResponse;
    setDocuments(result.documents || []);
  }

  async function removeDocument() {
    const document = deleteTarget;
    if (!document || actionId) return;
    setActionId(document.id);
    setError("");
    try {
      const response = await fetch(`/api/policycraft/documents/${encodeURIComponent(document.id)}?orgId=${document.organization.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not delete this policy.");
      setDeleteTarget(null);
      await refreshDocuments();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete this policy."); }
    finally { setActionId(null); }
  }

  async function exportDocument(document: AdminPolicy, format: "pdf" | "docx") {
    if (actionId) return;
    setActionId(document.id);
    setError("");
    try {
      const getResponse = await fetch(`/api/policycraft/documents/${encodeURIComponent(document.id)}?orgId=${document.organization.id}`, { cache: "no-store" });
      if (!getResponse.ok) throw new Error("Could not load the policy for export.");
      const detail = await getResponse.json();
      const policy = detail.document?.state?.policy as Policy | undefined;
      if (!policy) throw new Error("This policy has no saved content to export.");
      const response = await fetch(`/api/export/${format}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, ...policyCraftExportContext({ userId: access.actor.id, role: "admin", organizationId: document.organization.id, organizationName: document.organization.name, documentId: document.id, readOnly: !!document.organization.deleted }) }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || `Could not export this ${format.toUpperCase()}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = filenameFromResponse(response, `${document.title || "policy"}.${format}`);
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Could not export this ${format.toUpperCase()}.`); }
    finally { setActionId(null); }
  }

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Administration</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-pretty">All policies</h1><p className="mt-1 text-sm text-[var(--color-muted)]">Browse, edit, archive, restore, delete, and export policies across organizations.</p></div><div className="flex flex-wrap gap-2"><Link href="/admin" className="inline-flex min-h-10 items-center rounded-lg border border-[var(--color-line-2)] px-3 text-[12px] font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]">Manage managers</Link><Link href="/builder" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-[12px] font-semibold text-white hover:bg-[var(--color-forest-deep)]"><Plus size={14} aria-hidden="true" />New policy</Link></div></div>
    {error ? <div className="mt-6 flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert" aria-live="polite"><p>{error}</p><button type="button" onClick={() => router.refresh()} aria-label="Refresh policies" className="rounded p-1 hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"><RefreshCw size={14} aria-hidden="true" /></button></div> : null}

    <div className="mt-7 grid gap-3 md:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(150px,.7fr))]">
      <label className="relative block"><span className="sr-only">Search policies</span><Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" /><input name="policySearch" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search policies…" className="h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white pl-9 pr-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]" /></label>
      <label className="text-[11px] font-semibold text-[var(--color-muted)]">Organization<select value={orgId} onChange={(event) => setOrgId(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-[13px] font-normal text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><option value="all">All organizations</option>{organizations.map((organization) => <option key={organization.id} value={String(organization.id)}>{organization.name}{organization.deleted ? " · deleted" : ""}</option>)}</select></label>
      <label className="text-[11px] font-semibold text-[var(--color-muted)]">Creator<select value={creatorId} onChange={(event) => setCreatorId(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-[13px] font-normal text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><option value="all">All creators</option>{creatorId !== "all" && !creators.some((creator) => creator.id === creatorId) ? <option value={creatorId}>Selected creator</option> : null}{creators.map((creator) => <option key={creator.id} value={creator.id}>{creator.name || creator.email}</option>)}</select></label>
      <label className="text-[11px] font-semibold text-[var(--color-muted)]">Policy type<select value={policyType} onChange={(event) => setPolicyType(event.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-[13px] font-normal text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><option value="all">All policy types</option>{POLICY_TYPES.map((type) => <option key={type} value={type}>{POLICY_PROFILES[type].label}</option>)}</select></label>
    </div>
    <div className="mt-4 flex items-center justify-between gap-4"><div className="inline-flex rounded-lg border border-[var(--color-line)] bg-white p-1" role="group" aria-label="Policy status"><button type="button" aria-pressed={view === "active"} onClick={() => setView("active")} className={`min-h-8 rounded-md px-3 text-xs font-semibold ${view === "active" ? "bg-[var(--color-forest)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>Active</button><button type="button" aria-pressed={view === "archived"} onClick={() => setView("archived")} className={`min-h-8 rounded-md px-3 text-xs font-semibold ${view === "archived" ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>Archived</button></div><p className="text-xs text-[var(--color-muted)]" aria-live="polite">{loading ? "Loading policies…" : `${filtered.length} ${filtered.length === 1 ? "policy" : "policies"}`}</p></div>

    {loading ? <div className="grid min-h-48 place-items-center text-[var(--color-muted)]"><Loader2 size={19} className="animate-spin" aria-label="Loading policies" /></div> : filtered.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-6 py-16 text-center"><FileText size={25} className="mx-auto text-[var(--color-forest)]" aria-hidden="true" /><h2 className="mt-3 font-display text-xl font-semibold">No policies match these filters</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Clear a filter or create a new policy for an organization.</p></div> : (
      <section aria-label="Policies" className="mt-5 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[940px] border-collapse text-left text-sm"><thead className="bg-[var(--color-cream-2)] text-[10px] uppercase tracking-wider text-[var(--color-muted)]"><tr><th scope="col" className="px-4 py-3 font-semibold">Policy</th><th scope="col" className="px-4 py-3 font-semibold">Organization</th><th scope="col" className="px-4 py-3 font-semibold">Created by</th><th scope="col" className="px-4 py-3 font-semibold">Updated</th><th scope="col" className="px-4 py-3 font-semibold">State</th><th scope="col" className="px-4 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-[var(--color-line)]">{filtered.map((document) => {
        const deletedOrg = !!document.organization?.deleted;
        const scope = { userId: access.actor.id, role: "admin" as const, organizationId: document.organization.id, organizationName: document.organization.name, documentId: document.id, readOnly: deletedOrg };
        return <tr key={document.id} className={deletedOrg ? "bg-slate-50/70" : undefined}>
          <th scope="row" className="max-w-[300px] px-4 py-3 font-medium"><div className="flex min-w-0 items-center gap-3"><div role="img" aria-label={`Cover for ${document.title}`} className="relative h-[58px] w-[42px] shrink-0 overflow-hidden border border-[var(--color-line)] bg-[var(--color-cream-2)]"><div className="absolute left-0 top-0 origin-top-left" style={{ width: "210mm", height: "297mm", transform: "scale(.052)" }} aria-hidden="true"><PolicyCoverPreview policy={policyFromSummary(document)} assetScope={scope} /></div></div><div className="min-w-0"><span className="block truncate text-[var(--color-ink)]" title={document.title}>{document.title}</span><span className="mt-0.5 block text-[10px] font-normal uppercase tracking-wide text-[var(--color-muted)]">{POLICY_PROFILES[document.policyType]?.label || label(document.policyType)}</span></div></div></th>
          <td className="max-w-52 px-4 py-3"><span className="block truncate font-medium" title={document.organization?.name}>{document.organization?.name || "Unknown organization"}</span>{document.organization?.deleted ? <span className="mt-0.5 block text-[10px] text-slate-600">Deleted · read only</span> : document.organization?.expired ? <span className="mt-0.5 block text-[10px] text-amber-800">Expired · admin editing allowed</span> : null}</td>
          <td className="max-w-52 px-4 py-3"><span className="block truncate" title={document.createdBy?.name}>{document.createdBy?.name || "Unknown"}</span><span className="mt-0.5 block truncate text-[10px] text-[var(--color-muted)]">{document.createdBy?.email || ""}</span></td>
          <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--color-ink-2)]">{formatDate(document.updatedAt)}</td>
          <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold ${document.archivedAt ? "bg-slate-100 text-slate-700" : "bg-emerald-50 text-emerald-800"}`}>{document.archivedAt ? "Archived" : label(document.currentStep)}</span></td>
          <td className="px-4 py-3"><div className="flex justify-end gap-1"><Link href={`/builder?draft=${encodeURIComponent(document.id)}&orgId=${document.organization.id}`} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)]"><ArrowUpRight size={13} aria-hidden="true" />{deletedOrg ? "View" : "Edit"}</Link>
            <button type="button" onClick={() => void exportDocument(document, "pdf")} disabled={actionId === document.id} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50"><ArrowDownToLine size={13} aria-hidden="true" />PDF</button>
            <button type="button" onClick={() => void exportDocument(document, "docx")} disabled={actionId === document.id} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50">Word</button>
            {view === "active" ? <button type="button" onClick={() => void setArchived(document, true)} disabled={actionId === document.id || deletedOrg} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50"><Archive size={13} aria-hidden="true" />Archive</button> : <><button type="button" onClick={() => void setArchived(document, false)} disabled={actionId === document.id || deletedOrg} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-50"><ArchiveRestore size={13} aria-hidden="true" />Restore</button><button type="button" onClick={() => setDeleteTarget(document)} disabled={actionId === document.id || deletedOrg} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 disabled:opacity-50"><Trash2 size={13} aria-hidden="true" />Delete</button></>}
          </div></td>
        </tr>;
      })}</tbody></table></div></section>
    )}

    <Modal open={Boolean(deleteTarget)} onClose={() => setDeleteTarget(null)} title="Delete archived policy?" description="This permanently deletes the selected archived policy and its saved content." width={480}>
      <p className="break-words text-sm text-[var(--color-ink-2)]">{deleteTarget?.title}</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteTarget(null)} className="min-h-10 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-medium hover:bg-[var(--color-cream-2)]">Cancel</button><button type="button" onClick={() => void removeDocument()} disabled={actionId === deleteTarget?.id} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"><Trash2 size={14} aria-hidden="true" />Delete permanently</button></div>
    </Modal>
  </div>;
}

export default function AdminPoliciesPage() {
  return <React.Suspense fallback={<div className="min-h-48" aria-busy="true" />}><AdminPoliciesContent /></React.Suspense>;
}
