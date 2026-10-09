"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { Modal } from "@/components/ui/modal";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import styles from "./page.module.css";

type Recipient = { id: string; name: string; email: string; role: "admin" | "manager" | "user" };
const endpoint = "/api/policycraft/admin/administrator";
const focusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]";
const alreadyAdminMessage = "This account is already a PolicyCraft administrator. Search for another account to add.";
const lookupSchema = z.object({ email: z.string() });
const passwordSchema = z.object({ password: z.string() });

function apiError(result: { code?: string; error?: string } | null, fallback: string) {
  return result?.code === "ALREADY_ADMIN" ? alreadyAdminMessage : result?.error || fallback;
}

export default function AdministrationPage() {
  const { access } = usePolicyCraftWorkspace();
  const lookupForm = useForm<{ email: string }>({ resolver: zodResolver(lookupSchema), defaultValues: { email: "" } });
  const passwordForm = useForm<{ password: string }>({ resolver: zodResolver(passwordSchema), defaultValues: { password: "" } });
  const [recipient, setRecipient] = React.useState<Recipient | null>(null);
  const [lookupError, setLookupError] = React.useState("");
  const [lookingUp, setLookingUp] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [addError, setAddError] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [successMessage, setSuccessMessage] = React.useState("");
  const lookupGeneration = React.useRef(0);
  const lookupController = React.useRef<AbortController | null>(null);
  const addStarted = React.useRef(false);
  const emailInput = React.useRef<HTMLInputElement>(null);
  const passwordInput = React.useRef<HTMLInputElement>(null);
  const passwordRegistration = passwordForm.register("password", { required: true });

  React.useEffect(() => () => {
    lookupGeneration.current += 1;
    lookupController.current?.abort();
  }, []);

  React.useEffect(() => {
    if (successMessage && !adding && !confirming) emailInput.current?.focus();
    if (addError && !adding && confirming) passwordInput.current?.focus();
  }, [addError, adding, confirming, successMessage]);

  function changeEmail(value: string) {
    lookupGeneration.current += 1;
    lookupController.current?.abort();
    setLookingUp(false);
    lookupForm.setValue("email", value, { shouldDirty: true });
    setRecipient(null);
    setLookupError("");
    setAddError("");
    setSuccessMessage("");
    passwordForm.resetField("password");
  }

  async function findAccount(lookupEmail: string) {
    if (lookingUp || addStarted.current) return;
    const generation = ++lookupGeneration.current;
    const controller = new AbortController();
    lookupController.current?.abort();
    lookupController.current = controller;
    setLookingUp(true);
    setRecipient(null);
    setLookupError("");
    setAddError("");
    lookupEmail = lookupEmail.trim();
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lookup", email: lookupEmail }), signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(result, "Could not find this account. Check the email and try again."));
      if (generation !== lookupGeneration.current) return;
      if (!result?.recipient?.id || !result.recipient.email) throw new Error("Could not verify the account. Try again.");
      setRecipient(result.recipient);
      setSuccessMessage("");
    } catch (cause) {
      if (generation !== lookupGeneration.current || controller.signal.aborted) return;
      setLookupError(cause instanceof Error ? cause.message : "Could not find this account. Try again.");
      emailInput.current?.focus();
    } finally {
      if (generation === lookupGeneration.current) setLookingUp(false);
    }
  }

  const closeConfirmation = React.useCallback(() => {
    if (addStarted.current) return;
    setConfirming(false);
    passwordForm.resetField("password");
    setAddError("");
  }, [passwordForm]);

  async function addAdministrator({ password }: { password: string }) {
    if (!recipient || recipient.role === "admin" || !password || addStarted.current) return;
    addStarted.current = true;
    setAdding(true);
    setAddError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", email: recipient.email, recipientId: recipient.id, password, confirmed: true }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(apiError(result, "Could not add this administrator. Check your password and try again."));
      if (result?.added !== true) throw new Error("The result could not be confirmed. Look up this account again before retrying.");
      setConfirming(false);
      passwordForm.resetField("password");
      setRecipient(null);
      lookupForm.reset({ email: "" });
      setLookupError("");
      setAddError("");
      setSuccessMessage(`${result.recipient?.name || result.recipient?.email || "The account"} now has PolicyCraft administrator access. You remain signed in and can add another administrator.`);
    } catch (cause) {
      setAddError(cause instanceof Error ? cause.message : "Could not add this administrator. Check your password and try again.");
      passwordForm.resetField("password");
    } finally {
      addStarted.current = false;
      setAdding(false);
    }
  }

  function submitLookup(event: React.FormEvent<HTMLFormElement>) {
    void lookupForm.handleSubmit(({ email: submittedEmail }) => findAccount(submittedEmail))(event);
  }

  function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    void passwordForm.handleSubmit(addAdministrator)(event);
  }

  const recipientIsAdmin = recipient?.role === "admin";
  const lookupRegistration = lookupForm.register("email", { required: true, maxLength: 254 });

  return <ApplicationSurface data-pc-workspace="administration" className={`${styles.surface} max-w-5xl`}>
    <nav aria-label="Breadcrumb"><Link href="/admin" className={`inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)] ${focusClass}`}><ArrowRight size={14} className="rotate-180" aria-hidden="true" />Admin</Link></nav>
    <div className="mt-4"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">Administration</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight sm:text-[32px]">Administration</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">Add another administrator to PolicyCraft while keeping your own access.</p></div>

    <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white shadow-sm">
      <div className="grid lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,.85fr)]">
        <div className="min-w-0 p-5 sm:p-7">
          <section aria-labelledby="current-admin-title">
            <h2 id="current-admin-title" className="text-base font-semibold">Signed-in administrator</h2>
            <div className="mt-4 flex min-w-0 items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-cream)] p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><ShieldCheck size={19} aria-hidden="true" /></span>
              <div className="min-w-0"><p className="break-words font-semibold">{access.actor.name || "Administrator"}</p><p className="mt-1 break-all text-sm text-[var(--color-muted)]">{access.actor.email}</p></div>
            </div>
          </section>

          {successMessage ? <p role="status" aria-live="polite" className={`${styles.successMessage} mt-5 rounded-lg px-4 py-3 text-sm leading-6`}>{successMessage}</p> : null}

          <form onSubmit={submitLookup} className={`${styles.lookupForm} mt-7 border-t border-[var(--color-line)] pt-6`}>
            <h2 className="text-base font-semibold">Add an administrator</h2>
            <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">Find an active account, including an existing manager account, and grant it administrator access.</p>
            <label htmlFor="admin-recipient-email" className="mt-5 block text-xs font-semibold text-[var(--color-ink-2)]">New administrator email</label>
            <div className="mt-1.5 flex flex-col gap-3 sm:flex-row">
              <ApplicationInput {...lookupRegistration} ref={(element) => { lookupRegistration.ref(element); emailInput.current = element; }} id="admin-recipient-email" name="email" type="email" required maxLength={254} autoComplete="off" spellCheck={false} onChange={(event) => { lookupRegistration.onChange(event); changeEmail(event.target.value); }} disabled={adding} aria-invalid={!!lookupError} aria-describedby={lookupError ? "admin-lookup-error" : "admin-recipient-help"} placeholder="person@company.com" />
              <ApplicationButton type="submit" variant="primary" size="lg" className={styles.lookupButton} disabled={lookingUp || adding} busy={lookingUp} busyLabel="Finding account…" leadingIcon={<UserRound size={16} aria-hidden="true" />}>Find account</ApplicationButton>
            </div>
            <p id="admin-recipient-help" className="mt-3 text-xs leading-5 text-[var(--color-muted)]">The person needs an active account with a working password login. For someone new, <Link href="/admin/managers/new" className={`rounded font-semibold text-[var(--color-forest)] underline underline-offset-4 ${focusClass}`}>invite them as a manager</Link> and wait for them to accept first.</p>
            {lookupError ? <p id="admin-lookup-error" role="alert" className="mt-3 text-sm text-red-800">{lookupError}</p> : null}
          </form>

          <div aria-live="polite" aria-atomic="true">
            {recipient ? <section className="mt-7 border-t border-[var(--color-line)] pt-6" aria-labelledby="admin-recipient-title">
              <h2 id="admin-recipient-title" className="text-base font-semibold">Review administrator access</h2>
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-white p-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest)]"><UserRound size={19} aria-hidden="true" /></span>
                <div className="min-w-0"><p className="break-words font-semibold">{recipient.name || "Account holder"}</p><p className="mt-1 break-all text-sm text-[var(--color-muted)]">{recipient.email}</p><p className="mt-2 text-xs text-[var(--color-muted)]">Current PolicyCraft role: <span className="capitalize">{recipient.role === "user" ? "Client user" : recipient.role}</span></p></div>
              </div>
              {recipientIsAdmin ? <p role="status" className="mt-4 text-sm leading-6 text-[var(--color-muted)]">{alreadyAdminMessage}</p> : <ApplicationButton type="button" variant="outline" size="lg" onClick={() => { setAddError(""); passwordForm.resetField("password"); setConfirming(true); }} className="mt-5">Add administrator <ArrowRight size={15} aria-hidden="true" /></ApplicationButton>}
            </section> : null}
          </div>
        </div>

        <aside className="border-t border-[var(--color-line)] bg-[var(--color-cream-2)] p-5 sm:p-7 lg:border-l lg:border-t-0" aria-labelledby="admin-add-info-title">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[var(--color-forest)]"><ShieldCheck size={18} aria-hidden="true" /></div>
          <h2 id="admin-add-info-title" className="mt-4 font-display text-xl font-semibold">Adding an administrator</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--color-muted)]">Review the access change before you confirm it.</p>
          <ol className="mt-5 space-y-4 text-sm leading-5 text-[var(--color-ink-2)]">
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-[var(--color-forest)]">1</span><span>The recipient must already have an active account and working password login.</span></li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-[var(--color-forest)]">2</span><span>They receive full PolicyCraft administrator access.</span></li>
            <li className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold text-[var(--color-forest)]">3</span><span>Your administrator access stays active, and you remain signed in.</span></li>
          </ol>
          <div className="mt-5 border-t border-[var(--color-line)] pt-4"><p className="text-xs leading-5 text-[var(--color-muted)]">Their existing account email and password stay the same.</p></div>
        </aside>
      </div>
    </div>

    <Modal open={confirming} onClose={closeConfirmation} title="Add administrator access?" description="Confirm the account and enter your password to grant administrator access." hideClose={adding} width={500}>
      <form className={styles.surface} onSubmit={submitAdd}>
        <p className="break-all text-sm font-semibold">{recipient?.email}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--color-ink-2)]">This account will receive full PolicyCraft administrator access. Your access and current session will stay active.</p>
        <label htmlFor="admin-add-password" className="mt-5 block text-sm font-semibold">Your password</label>
        <ApplicationInput {...passwordRegistration} ref={(element) => { passwordRegistration.ref(element); passwordInput.current = element; }} id="admin-add-password" type="password" name="password" required autoComplete="current-password" disabled={adding} aria-invalid={!!addError} aria-describedby={addError ? "admin-add-error" : undefined} className="mt-2 w-full" />
        {addError ? <p id="admin-add-error" role="alert" className="mt-3 text-sm text-red-800">{addError}</p> : null}
        <div className={styles.dialogFooter}><ApplicationButton type="button" variant="outline" size="lg" onClick={closeConfirmation} disabled={adding}>Cancel</ApplicationButton><ApplicationButton type="submit" variant="primary" size="lg" className={styles.addButton} busy={adding} busyLabel="Adding…" leadingIcon={<ShieldCheck size={15} aria-hidden="true" />}>Confirm add</ApplicationButton></div>
      </form>
    </Modal>
  </ApplicationSurface>;
}
