"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowRight, Check, FileText, Leaf, Loader2, Pencil, Plus, RefreshCw, X } from "lucide-react";
import type { PolicyDocumentSummary } from "@/lib/policycraft-types";

type DocumentView = "active" | "archived";

function label(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function DashboardPage() {
  const router = useRouter();
  const [view, setView] = React.useState<DocumentView>("active");
  const [organization, setOrganization] = React.useState<{ name: string } | null>(null);
  const [documents, setDocuments] = React.useState<PolicyDocumentSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [renameDocument, setRenameDocument] = React.useState<PolicyDocumentSummary | null>(null);
  const [renameTitle, setRenameTitle] = React.useState("");
  const [renaming, setRenaming] = React.useState(false);
  const [actionId, setActionId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError("");
    const [bootstrapResponse, documentsResponse] = await Promise.all([
      fetch("/api/policycraft/bootstrap"),
      fetch(`/api/policycraft/documents?view=${view}`),
    ]);
    if (bootstrapResponse.status === 401 || documentsResponse.status === 401) {
      router.replace("/login?next=/drafts");
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
  }, [router, view]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function openRename(document: PolicyDocumentSummary) {
    setRenameDocument(document);
    setRenameTitle(document.title);
    setError("");
  }

  async function submitRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const document = renameDocument;
    const title = renameTitle.trim();
    if (!document || !title || renaming) return;
    setRenaming(true);
    setError("");
    try {
      const response = await fetch(`/api/policycraft/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, lockVersion: document.lockVersion }),
      });
      if (response.status === 409) {
        setError("That draft changed in another window. Refresh and try again.");
        return;
      }
      if (!response.ok) {
        setError("Could not rename that draft.");
        return;
      }
      setRenameDocument(null);
      setRenameTitle("");
      await load();
    } catch {
      setError("Could not rename that draft.");
    } finally {
      setRenaming(false);
    }
  }

  async function setArchived(id: string, archived: boolean) {
    if (actionId) return;
    setActionId(id);
    setError("");
    try {
      const response = await fetch(`/api/policycraft/documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!response.ok) {
        setError(archived ? "Could not archive that draft." : "Could not restore that draft.");
        return;
      }
      await load();
    } catch {
      setError(archived ? "Could not archive that draft." : "Could not restore that draft.");
    } finally {
      setActionId(null);
    }
  }

  const isArchived = view === "archived";

  return (
    <main className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--color-forest)] text-white"><Leaf size={18} /></div>
          <div><div className="font-display font-semibold">PolicyCraft</div><div className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-muted)]">Workspace</div></div>
        </Link>
        <Link href="/" className="text-sm text-[var(--color-ink-2)] hover:text-[var(--color-forest)]">Home</Link>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-10 lg:px-12">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-forest)]">Organization workspace</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">Your policy drafts</h1>
            <p className="mt-2 text-sm text-[var(--color-ink-2)]">{organization?.name || "Loading organization…"}</p>
          </div>
          <button type="button" onClick={() => router.push("/builder?new=1")} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-forest)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)]"><Plus size={16} /> New policy</button>
        </div>

        <div className="mt-8 inline-flex rounded-xl border border-[var(--color-line)] bg-white p-1" role="tablist" aria-label="Draft views">
          <button type="button" role="tab" aria-selected={!isArchived} onClick={() => setView("active")} className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${!isArchived ? "bg-[var(--color-forest)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}>Active drafts</button>
          <button type="button" role="tab" aria-selected={isArchived} onClick={() => setView("archived")} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${isArchived ? "bg-[var(--color-ink)] text-white" : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"}`}><Archive size={15} /> Archived</button>
        </div>

        {error ? <div className="mt-8 flex items-center justify-between rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"><span>{error}</span><button type="button" onClick={() => void load()} aria-label="Refresh drafts"><RefreshCw size={15} /></button></div> : null}

        {loading ? (
          <div className="flex justify-center py-24"><Loader2 className="animate-spin text-[var(--color-forest)]" /></div>
        ) : documents.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-[var(--color-line-2)] bg-white p-12 text-center">
            {isArchived ? <Archive className="mx-auto text-[var(--color-muted)]" size={28} /> : <FileText className="mx-auto text-[var(--color-forest)]" size={28} />}
            <h2 className="mt-4 font-display text-xl font-semibold">{isArchived ? "No archived drafts" : "No saved drafts yet"}</h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">{isArchived ? "Archived drafts will appear here." : "Start a policy and it will appear here automatically."}</p>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((document) => (
              <article key={document.id} className="rounded-2xl border border-[var(--color-line)] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><FileText size={17} /></div>
                  <div className="flex items-center gap-2">
                    {!isArchived ? <button type="button" title="Rename draft" onClick={() => openRename(document)} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)]"><Pencil size={13} /> Rename</button> : null}
                    <button type="button" title={isArchived ? "Restore draft" : "Archive draft"} onClick={() => void setArchived(document.id, isArchived ? false : true)} disabled={actionId === document.id} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)] disabled:opacity-50">
                      {actionId === document.id ? <Loader2 size={14} className="animate-spin" /> : isArchived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                      {isArchived ? "Restore" : "Archive"}
                    </button>
                  </div>
                </div>
                <h2 className="mt-5 truncate font-display text-lg font-semibold">{document.title}</h2>
                <p className="mt-1 text-xs uppercase tracking-wider text-[var(--color-muted)]">{label(document.policyType)} · {label(document.currentStep)}</p>
                <p className="mt-4 text-xs text-[var(--color-muted)]">Updated {new Date(document.updatedAt).toLocaleString()}</p>
                {!isArchived ? <button type="button" onClick={() => router.push(`/builder?draft=${encodeURIComponent(document.id)}`)} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-forest)]">Resume <ArrowRight size={15} /></button> : <p className="mt-5 inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-muted)]"><Archive size={14} /> Archived</p>}
              </article>
            ))}
          </div>
        )}
      </section>

      {renameDocument ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !renaming) setRenameDocument(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="rename-draft-title" className="w-full max-w-md rounded-2xl border border-[var(--color-line)] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><h2 id="rename-draft-title" className="font-display text-xl font-semibold">Rename draft</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Choose a name for this policy draft.</p></div>
              <button type="button" onClick={() => setRenameDocument(null)} disabled={renaming} aria-label="Close rename dialog" className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] disabled:opacity-50"><X size={17} /></button>
            </div>
            <form className="mt-6" onSubmit={(event) => void submitRename(event)}>
              <label htmlFor="rename-draft-input" className="block text-sm font-semibold">Draft name</label>
              <input id="rename-draft-input" autoFocus value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} maxLength={255} className="mt-2 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm outline-none focus:border-[var(--color-forest)]" />
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setRenameDocument(null)} disabled={renaming} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={renaming || !renameTitle.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] disabled:opacity-50">{renaming ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save name</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
