"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Leaf, Loader2, LockKeyhole, Mail } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";

type Invitation = { mode: "new" | "existing"; email: string; name: string; expiresAt: string };

function AcceptInvitationContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [invitation, setInvitation] = React.useState<Invitation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!token) { setError("This invitation link is missing its token. Ask your administrator to resend it."); setLoading(false); return; }
      void fetch(`/api/invitations/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || "This invitation is unavailable. Ask your administrator to send a new link.");
        return body as Invitation;
      })
      .then((data) => { if (active) { setInvitation(data); setEmail(data.email); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "This invitation is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [token]);

  async function finishSignIn(acceptedInvite: boolean) {
    if (!acceptedInvite) return;
    const accessResponse = await fetch("/api/policycraft/access", { cache: "no-store" });
    if (!accessResponse.ok) {
      setAccepted(true);
      setError("Your invitation was accepted. Sign in to open your workspace.");
      return;
    }
    const access = await accessResponse.json() as PolicyCraftAccess;
    const href = access.homeHref.startsWith("/") && !access.homeHref.startsWith("//") ? access.homeHref : "/";
    router.replace(href);
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation || submitting) return;
    setError("");
    if (invitation.mode === "new" && password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (invitation.mode === "new" && password.length < 8) { setError("Use a password with at least 8 characters."); return; }
    setSubmitting(true);
    try {
      if (invitation.mode === "existing") {
        const signInResult = await signIn.email({ email: email.trim(), password });
        if (signInResult.error) throw new Error(signInResult.error.message || "Email or password is incorrect.");
      }
      const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invitation.mode === "new" ? { password } : {}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not accept this invitation. Contact your administrator.");
      setAccepted(true);
      await finishSignIn(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept this invitation.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[var(--color-cream)] px-5 py-10 text-[var(--color-ink)]">
    <section className="w-full max-w-md rounded-2xl border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-lift)] sm:p-9">
      <div className="mb-7 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-forest)] text-white"><Leaf size={19} aria-hidden="true" /></span><span><span className="block font-display text-lg font-semibold">PolicyCraft</span><span className="block text-[10px] uppercase tracking-[.15em] text-[var(--color-muted)]">Manager invitation</span></span></div>
      {loading ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-[var(--color-muted)]" aria-live="polite"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Checking invitation…</div> : accepted ? <><span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-800"><Check size={19} aria-hidden="true" /></span><h1 className="mt-4 font-display text-2xl font-semibold">Invitation accepted</h1><p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">Your manager access is ready. Opening your workspace…</p>{error ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">{error}</p> : null}</> : !invitation ? <><h1 className="font-display text-2xl font-semibold">Invitation unavailable</h1><p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">{error || "Ask your administrator to send a new link."}</p></> : <>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Accept your invitation</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">{invitation.mode === "new" ? "Create your PolicyCraft manager account. You will choose your own password." : "Sign in to the existing ESG account linked to this invitation. Its password and organization details will stay unchanged."}</p>
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--color-cream-2)] px-3 py-2.5 text-[12px] text-[var(--color-ink-2)]"><Mail size={14} aria-hidden="true" /><span className="min-w-0 truncate font-medium">{invitation.email}</span>{invitation.name ? <span className="ml-auto max-w-32 truncate text-[var(--color-muted)]">{invitation.name}</span> : null}</div>
        <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
          {invitation.mode === "existing" ? <><label className="block text-[12px] font-semibold">Email<input name="email" type="email" autoComplete="username" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label><label className="block text-[12px] font-semibold">Existing password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label></> : <><label className="block text-[12px] font-semibold">Create password<input name="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label><label className="block text-[12px] font-semibold">Confirm password<input name="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label></>}
          {error ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert" aria-live="polite">{error}</p> : null}
          <button type="submit" disabled={submitting} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-wait disabled:opacity-60">{submitting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <LockKeyhole size={15} aria-hidden="true" />}{submitting ? "Accepting invitation…" : invitation.mode === "new" ? "Create account & accept" : "Sign in & accept"}{!submitting ? <ArrowRight size={15} aria-hidden="true" /> : null}</button>
        </form>
      </>}
    </section>
  </main>;
}

export default function AcceptInvitationPage() {
  return <React.Suspense fallback={<main className="min-h-screen bg-[var(--color-cream)]" aria-busy="true" />}><AcceptInvitationContent /></React.Suspense>;
}
