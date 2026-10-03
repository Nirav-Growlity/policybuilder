"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { Modal } from "@/components/ui/modal";
import { signOut } from "@/lib/auth-client";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";

type Recipient = { id: string; name: string; email: string; role: "admin" | "manager" | "user" };
const endpoint = "/api/policycraft/admin/administrator";
const focusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]";

export default function AdministrationPage() {
  const { access } = usePolicyCraftWorkspace();
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [recipient, setRecipient] = React.useState<Recipient | null>(null);
  const [lookupError, setLookupError] = React.useState("");
  const [lookingUp, setLookingUp] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [transferError, setTransferError] = React.useState("");
  const [transferring, setTransferring] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const lookupGeneration = React.useRef(0);
  const lookupController = React.useRef<AbortController | null>(null);
  const transferStarted = React.useRef(false);
  const transferCompleted = React.useRef(false);
  const emailInput = React.useRef<HTMLInputElement>(null);
  const passwordInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => () => {
    lookupGeneration.current += 1;
    lookupController.current?.abort();
  }, []);

  function changeEmail(value: string) {
    lookupGeneration.current += 1;
    lookupController.current?.abort();
    setLookingUp(false);
    setEmail(value);
    setRecipient(null);
    setLookupError("");
    setTransferError("");
    setPassword("");
  }

  async function findAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lookingUp || transferStarted.current || transferCompleted.current) return;
    const generation = ++lookupGeneration.current;
    const controller = new AbortController();
    lookupController.current?.abort();
    lookupController.current = controller;
    setLookingUp(true);
    setRecipient(null);
    setLookupError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", email: email.trim() }), signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not find this account. Check the email and try again.");
      if (generation !== lookupGeneration.current) return;
      if (!result?.recipient?.id || !result.recipient.email) throw new Error("Could not verify the account. Try again.");
      setRecipient(result.recipient);
    } catch (cause) {
      if (generation !== lookupGeneration.current || controller.signal.aborted) return;
      setLookupError(cause instanceof Error ? cause.message : "Could not find this account. Try again.");
      emailInput.current?.focus();
    } finally {
      if (generation === lookupGeneration.current) setLookingUp(false);
    }
  }

  const closeConfirmation = React.useCallback(() => {
    if (transferStarted.current) return;
    setConfirming(false);
    setPassword("");
    setTransferError("");
  }, []);

  async function transfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recipient || !password || transferStarted.current || transferCompleted.current) return;
    transferStarted.current = true;
    setTransferring(true);
    setTransferError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "transfer", email: recipient.email, recipientId: recipient.id, password, confirmed: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Could not transfer administrator access. Refresh to verify your access before retrying.");
      if (result?.transferred !== true) throw new Error("The transfer result could not be confirmed. Refresh before retrying.");
      transferCompleted.current = true;
      setCompleted(true);
      setConfirming(false);
      setPassword("");
      usePolicyCraftScope.getState().setScope(null);
      policyCraftBuilderStorage.clearScope();
      try { await signOut(); } catch { /* The server has already revoked this account's PolicyCraft access. */ }
      router.replace("/login?adminTransferred=1");
      router.refresh();
    } catch (cause) {
      if (transferCompleted.current) return;
      setTransferError(cause instanceof Error ? cause.message : "The transfer result could not be confirmed. Refresh before retrying.");
      setPassword("");
      passwordInput.current?.focus();
    } finally {
      transferStarted.current = false;
      if (!transferCompleted.current) setTransferring(false);
    }
  }

  if (completed) return <section role="status" className="mx-auto max-w-2xl py-12"><ShieldCheck size={28} className="text-[var(--color-forest)]" aria-hidden="true" /><h1 className="mt-4 font-display text-3xl font-semibold">Admin access transferred</h1><p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">The new administrator can sign in with their existing account. Returning you to sign in…</p></section>;

  return <section className="max-w-3xl">
    <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Administration</p>
    <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">Administration</h1>
    <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-muted)]">Hand over PolicyCraft administration to another person using their existing account.</p>

    <div className="mt-8 border-y border-[var(--color-line)] py-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">Your administrator account</h2>
      <p className="mt-3 font-semibold">{access.actor.name || "Administrator"}</p>
      <p className="mt-1 break-all text-sm text-[var(--color-muted)]">{access.actor.email}</p>
    </div>

    <form onSubmit={findAccount} className="mt-7">
      <label htmlFor="admin-recipient-email" className="text-sm font-semibold">New administrator email</label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <input ref={emailInput} id="admin-recipient-email" name="recipientEmail" type="email" required maxLength={254} autoComplete="off" spellCheck={false} value={email} onChange={(event) => changeEmail(event.target.value)} disabled={transferring} aria-invalid={!!lookupError} aria-describedby={lookupError ? "admin-lookup-error" : "admin-recipient-help"} placeholder="person@company.com…" className={`h-11 min-w-0 flex-1 rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm disabled:opacity-60 ${focusClass}`} />
        <button type="submit" disabled={lookingUp || transferring} className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-5 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] disabled:opacity-60 ${focusClass}`}>{lookingUp ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />}{lookingUp ? "Finding account…" : "Find account"}</button>
      </div>
      <p id="admin-recipient-help" className="mt-3 text-xs leading-5 text-[var(--color-muted)]">The person needs an active account with a working password login. For someone new, <Link href="/admin/managers/new" className={`rounded font-semibold text-[var(--color-forest)] underline underline-offset-4 ${focusClass}`}>invite them as a manager</Link> and wait for them to accept first.</p>
      {lookupError ? <p id="admin-lookup-error" role="alert" className="mt-3 text-sm text-red-800">{lookupError}</p> : null}
    </form>

    <div aria-live="polite" aria-atomic="true">
      {recipient ? <section className="mt-7 border-t border-[var(--color-line)] pt-6" aria-labelledby="admin-recipient-title">
        <h2 id="admin-recipient-title" className="text-sm font-semibold">Review new administrator</h2>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[var(--color-line)] bg-white p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><UserRound size={19} aria-hidden="true" /></span>
          <div className="min-w-0"><p className="break-words font-semibold">{recipient.name || "Account holder"}</p><p className="mt-1 break-all text-sm text-[var(--color-muted)]">{recipient.email}</p><p className="mt-2 text-xs text-[var(--color-muted)]">Current PolicyCraft role: <span className="capitalize">{recipient.role === "user" ? "Client user" : recipient.role}</span></p></div>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--color-ink-2)]">This person will receive full administrator access. Your PolicyCraft access will be removed, and you will be signed out. Both shared ESG accounts keep their existing email and password.</p>
        <p className="mt-2 text-xs leading-5 text-[var(--color-muted)]">The new administrator will need to resend any pending manager invitations you sent.</p>
        <button type="button" onClick={() => { setTransferError(""); setPassword(""); setConfirming(true); }} className={`mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--color-forest)] px-4 text-sm font-semibold text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] ${focusClass}`}>Transfer admin access <ArrowRight size={15} aria-hidden="true" /></button>
      </section> : null}
    </div>

    <Modal open={confirming} onClose={closeConfirmation} title="Transfer admin access?" description="Confirm the recipient and enter your password to complete the handover." hideClose={transferring} width={500}>
      <form onSubmit={transfer}>
        <p className="break-all text-sm font-semibold">{recipient?.email}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">Your PolicyCraft access will be removed immediately after the transfer. The new administrator can sign in with their existing password.</p>
        <label htmlFor="admin-transfer-password" className="mt-5 block text-sm font-semibold">Your password</label>
        <input ref={passwordInput} id="admin-transfer-password" type="password" name="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} disabled={transferring} aria-invalid={!!transferError} aria-describedby={transferError ? "admin-transfer-error" : undefined} className={`mt-2 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm disabled:opacity-60 ${focusClass}`} />
        {transferError ? <p id="admin-transfer-error" role="alert" className="mt-3 text-sm text-red-800">{transferError}</p> : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" onClick={closeConfirmation} disabled={transferring} className={`min-h-11 rounded-lg border border-[var(--color-line-2)] px-4 text-sm font-semibold hover:bg-[var(--color-cream-2)] disabled:opacity-60 ${focusClass}`}>Cancel</button><button type="submit" disabled={transferring} className={`inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] disabled:opacity-60 ${focusClass}`}>{transferring ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}{transferring ? "Transferring…" : "Confirm transfer"}</button></div>
      </form>
    </Modal>
  </section>;
}
