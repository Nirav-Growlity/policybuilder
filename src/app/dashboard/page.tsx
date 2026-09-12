"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, FileText, Leaf, Loader2, LogOut, Plus, RefreshCw } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { PolicyDocumentSummary } from "@/lib/policycraft-types";

function label(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const router = useRouter();
  const [organization, setOrganization] = React.useState<{ name: string } | null>(null);
  const [documents, setDocuments] = React.useState<PolicyDocumentSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    const [bootstrapResponse, documentsResponse] = await Promise.all([fetch("/api/policycraft/bootstrap"), fetch("/api/policycraft/documents")]);
    if (bootstrapResponse.status === 401 || documentsResponse.status === 401) {
      router.replace("/login?next=/dashboard");
      return;
    }
    if (!bootstrapResponse.ok || !documentsResponse.ok) {
      setError("Could not load your PolicyCraft workspace.");
      setLoading(false);
      return;
    }
    const bootstrap = await bootstrapResponse.json();
    const documentData = await documentsResponse.json();
    setOrganization(bootstrap.organization);
    setDocuments(documentData.documents || []);
    setLoading(false);
  }, [router]);

  React.useEffect(() => {
    let active = true;
    void (async () => {
      await load();
      if (!active) return;
    })();
    return () => { active = false; };
  }, [load]);

  async function archive(id: string) {
    const response = await fetch(`/api/policycraft/documents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: true }) });
    if (response.ok) setDocuments((current) => current.filter((document) => document.id !== id));
  }

  async function rename(document: PolicyDocumentSummary) {
    const title = window.prompt("Draft name", document.title)?.trim();
    if (!title || title === document.title) return;
    const response = await fetch(`/api/policycraft/documents/${document.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, lockVersion: document.lockVersion }) });
    if (response.status === 409) {
      setError("That draft changed in another window. Refresh and try again.");
      return;
    }
    if (response.ok) {
      const data = await response.json();
      setDocuments((current) => current.map((item) => item.id === document.id ? { ...item, title: data.document.title, lockVersion: data.document.lockVersion, updatedAt: data.document.updatedAt } : item));
    }
  }

  async function logout() {
    await signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-12">
        <div className="flex items-center gap-2.5"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-forest)] text-white"><Leaf size={18} /></div><div><div className="font-display font-semibold">PolicyCraft</div><div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Workspace</div></div></div>
        <button type="button" onClick={logout} className="inline-flex items-center gap-2 text-sm text-[var(--color-ink-2)] hover:text-[var(--color-forest)]"><LogOut size={15} /> Sign out</button>
      </header>
      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-forest)]">Organization workspace</p><h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Your policy drafts</h1><p className="mt-2 text-sm text-[var(--color-ink-2)]">{organization?.name || "Loading organization…"}</p></div>
          <button type="button" onClick={() => router.push("/builder?new=1")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-forest)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)]"><Plus size={16} /> New policy</button>
        </div>
        {error ? <div className="mt-8 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void load()}><RefreshCw size={15} /></button></div> : null}
        {loading ? <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[var(--color-forest)]" /></div> : documents.length === 0 ? <div className="mt-10 rounded-2xl border border-dashed border-[var(--color-line-2)] bg-white p-12 text-center"><FileText className="mx-auto text-[var(--color-forest)]" size={28} /><h2 className="mt-4 font-display text-xl font-semibold">No saved drafts yet</h2><p className="mt-2 text-sm text-[var(--color-muted)]">Start a policy and it will appear here automatically.</p></div> : <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{documents.map((document) => <article key={document.id} className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><FileText size={17} /></div><div className="flex items-center gap-2"><button type="button" title="Rename draft" onClick={() => void rename(document)} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)]">Rename</button><button type="button" title="Archive draft" onClick={() => void archive(document.id)} className="text-[var(--color-muted)] hover:text-red-600"><Archive size={16} /></button></div></div><h2 className="mt-5 truncate font-display text-lg font-semibold">{document.title}</h2><p className="mt-1 text-xs uppercase tracking-wider text-[var(--color-muted)]">{label(document.policyType)} · {label(document.currentStep)}</p><p className="mt-4 text-xs text-[var(--color-muted)]">Updated {new Date(document.updatedAt).toLocaleString()}</p><button type="button" onClick={() => router.push(`/builder?draft=${encodeURIComponent(document.id)}`)} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-forest)]">Resume <ArrowRight size={15} /></button></article>)}</div>}
      </section>
    </main>
  );
}
