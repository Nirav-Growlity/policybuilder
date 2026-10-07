"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Leaf, Loader2, LockKeyhole, Mail } from "lucide-react";
import { signIn, signOut } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";

type Invitation = { mode: "new" | "existing"; email: string; name: string; expiresAt: string };
type InvitationResponse = { invitation?: Invitation; error?: string };

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
  const [newAccountAccepted, setNewAccountAccepted] = React.useState(false);
  const [signInRedirectError, setSignInRedirectError] = React.useState("");
  const [redirectingToSignIn, setRedirectingToSignIn] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const acceptanceStarted = React.useRef(false);
  const signInRedirectStarted = React.useRef(false);
  const newAccountAcceptedHeading = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    if (newAccountAccepted) newAccountAcceptedHeading.current?.focus();
  }, [newAccountAccepted]);

  React.useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!token) { setError("This invitation link is missing its token. Ask your administrator to resend it."); setLoading(false); return; }
      void fetch(`/api/invitations/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || "This invitation is unavailable. Ask your administrator to send a new link.");
        const invitation = (body as InvitationResponse | null)?.invitation;
        if (!invitation || (invitation.mode !== "new" && invitation.mode !== "existing") || !invitation.email) {
          throw new Error("This invitation could not be verified. Ask your administrator to send a new link.");
        }
        return invitation;
      })
      .then((data) => { if (active) { setInvitation(data); setEmail(data.email); } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "This invitation is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [retryCount, token]);

  function retryInvitationLookup() {
    setInvitation(null);
    setError("");
    setLoading(true);
    setRetryCount((attempt) => attempt + 1);
  }

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

  async function continueNewAccountToSignIn() {
    if (!invitation || signInRedirectStarted.current) return;
    signInRedirectStarted.current = true;
    setRedirectingToSignIn(true);
    setSignInRedirectError("");
    try {
      const result = await signOut();
      if (result.error) throw new Error(result.error.message || "Could not end the current session.");
      const loginParams = new URLSearchParams({ next: "/manager", email: invitation.email });
      window.location.assign(`/login?${loginParams.toString()}`);
    } catch {
      setSignInRedirectError("Your manager account was created, but we could not end the other session. Retry sign in to continue.");
    } finally {
      signInRedirectStarted.current = false;
      setRedirectingToSignIn(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation || submitting || accepted || newAccountAccepted || acceptanceStarted.current) return;
    setError("");
    if (invitation.mode === "new" && password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (invitation.mode === "new" && password.length < 8) { setError("Use a password with at least 8 characters."); return; }
    acceptanceStarted.current = true;
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
      if (result?.accepted !== true) throw new Error("The invitation could not be confirmed. Contact your administrator before trying again.");
      if (invitation.mode === "new") {
        setNewAccountAccepted(true);
        await continueNewAccountToSignIn();
        return;
      }
      setAccepted(true);
      await finishSignIn(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept this invitation.");
    } finally {
      acceptanceStarted.current = false;
      setSubmitting(false);
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[var(--color-cream)] px-5 py-10 text-[var(--color-ink)]">
    <section className="w-full max-w-md rounded-2xl border border-[var(--color-line)] bg-white p-7 shadow-[var(--shadow-lift)] sm:p-9">
      <div className="mb-7 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--color-forest)] text-white"><Leaf size={19} aria-hidden="true" /></span><span><span className="block font-display text-lg font-semibold">PolicyCraft</span><span className="block text-[10px] uppercase tracking-[.15em] text-[var(--color-muted)]">Manager invitation</span></span></div>
      {loading ? <div className="flex min-h-44 items-center justify-center gap-2 text-sm text-[var(--color-muted)]" aria-live="polite"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Checking invitation…</div> : newAccountAccepted ? <div role="status" aria-live="polite"><span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-800"><Check size={19} aria-hidden="true" /></span><h1 ref={newAccountAcceptedHeading} tabIndex={-1} className="mt-4 font-display text-2xl font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Manager account created</h1><p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">Your invitation was accepted. Sign in with the password you just created to open your manager workspace.</p>{signInRedirectError ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="alert">{signInRedirectError}</p> : null}<button type="button" onClick={() => void continueNewAccountToSignIn()} disabled={redirectingToSignIn} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-wait disabled:opacity-60">{redirectingToSignIn ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}{redirectingToSignIn ? "Signing out…" : signInRedirectError ? "Retry sign in" : "Continue to sign in"}</button></div> : accepted ? <><span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-800"><Check size={19} aria-hidden="true" /></span><h1 className="mt-4 font-display text-2xl font-semibold">Invitation accepted</h1><p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">Your manager access is ready. Opening your workspace…</p>{error ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">{error}</p> : null}</> : !invitation ? <><h1 className="font-display text-2xl font-semibold">Invitation unavailable</h1><p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]" role="alert">{error || "Ask your administrator to send a new link."}</p>{token ? <button type="button" onClick={retryInvitationLookup} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-semibold text-[var(--color-forest)] transition-colors hover:bg-[var(--color-forest-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><ArrowRight size={15} aria-hidden="true" />Try this link again</button> : null}</> : <>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Accept your invitation</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">{invitation.mode === "new" ? "Create your PolicyCraft manager account. You will choose your own password." : "Sign in to the existing ESG account linked to this invitation. Its password and organization details will stay unchanged."}</p>
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-[var(--color-cream-2)] px-3 py-2.5 text-[12px] text-[var(--color-ink-2)]"><Mail size={14} aria-hidden="true" /><span className="min-w-0 truncate font-medium">{invitation.email}</span>{invitation.name ? <span className="ml-auto max-w-32 truncate text-[var(--color-muted)]">{invitation.name}</span> : null}</div>
        <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
          {invitation.mode === "existing" ? <><label className="block text-[12px] font-semibold">Email<input name="email" type="email" autoComplete="username" spellCheck={false} required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label><label className="block text-[12px] font-semibold">Existing password<input name="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label></> : <><label className="block text-[12px] font-semibold">Email<input name="email" type="email" autoComplete="username" spellCheck={false} required readOnly value={invitation.email} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-[var(--color-cream-2)] px-3 text-sm font-normal text-[var(--color-ink-2)]" /></label><label className="block text-[12px] font-semibold">Create password<input name="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label><label className="block text-[12px] font-semibold">Confirm password<input name="confirm-password" type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)]" /></label></>}
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
