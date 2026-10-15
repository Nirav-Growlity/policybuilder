"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck, UserRound } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { usePolicyCraftWorkspace } from "@/components/workspace/workspace-shell";
import { WorkspaceHero, WorkspaceSheet } from "@/components/workspace/workspace-motion";
import { Modal } from "@/components/ui/modal";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import styles from "./page.module.css";

type Recipient = { id: string; name: string; email: string; role: "admin" | "manager" | "user" };
const endpoint = "/api/policycraft/admin/administrator";
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

  return <ApplicationSurface data-pc-workspace="administration" className={styles.surface}>
    <section className={styles.page} aria-labelledby="administration-title">
      <WorkspaceHero
        titleId="administration-title"
        title="Administration"
        description="Add another administrator to PolicyCraft while keeping your own access."
        actions={<nav aria-label="Breadcrumb"><Link href="/admin" className={styles.heroLink}><ArrowLeft size={15} aria-hidden="true" />Admin</Link></nav>}
      />

      <WorkspaceSheet className={styles.sheet}>
        <div className={styles.columns}>
          <div className={styles.main}>
            <section className={styles.section} aria-labelledby="current-admin-title">
              <h2 id="current-admin-title" className={styles.sectionTitle}>Signed-in administrator</h2>
              <div className={styles.identityCard}>
                <span className={styles.identityIcon}><ShieldCheck size={19} aria-hidden="true" /></span>
                <div className={styles.identityBody}><p className={styles.identityName}>{access.actor.name || "Administrator"}</p><p className={styles.identityEmail}>{access.actor.email}</p></div>
              </div>
            </section>

            {successMessage ? <p role="status" aria-live="polite" className={styles.successMessage}>{successMessage}</p> : null}

            <form onSubmit={submitLookup} className={styles.lookupForm}>
              <h2 className={styles.sectionTitle}>Add an administrator</h2>
              <p className={styles.sectionText}>Find an active account, including an existing manager account, and grant it administrator access.</p>
              <label htmlFor="admin-recipient-email" className={styles.label}>New administrator email</label>
              <div className={styles.lookupRow}>
                <ApplicationInput {...lookupRegistration} ref={(element) => { lookupRegistration.ref(element); emailInput.current = element; }} id="admin-recipient-email" name="email" type="email" required maxLength={254} autoComplete="off" spellCheck={false} onChange={(event) => { lookupRegistration.onChange(event); changeEmail(event.target.value); }} disabled={adding} aria-invalid={!!lookupError} aria-describedby={lookupError ? "admin-lookup-error" : "admin-recipient-help"} placeholder="person@company.com" />
                <ApplicationButton type="submit" variant="primary" size="lg" className={`${styles.ctaButton} ${styles.lookupButton}`} disabled={lookingUp || adding} busy={lookingUp} busyLabel="Finding account…" leadingIcon={<UserRound size={16} aria-hidden="true" />}>Find account</ApplicationButton>
              </div>
              <p id="admin-recipient-help" className={styles.helpText}>The person needs an active account with a working password login. For someone new, <Link href="/admin/managers/new" className={styles.inlineLink}>invite them as a manager</Link> and wait for them to accept first.</p>
              {lookupError ? <p id="admin-lookup-error" role="alert" className={styles.errorText}>{lookupError}</p> : null}
            </form>

            <div aria-live="polite" aria-atomic="true">
              {recipient ? <section className={styles.section} aria-labelledby="admin-recipient-title">
                <h2 id="admin-recipient-title" className={styles.sectionTitle}>Review administrator access</h2>
                <div className={styles.recipientCard}>
                  <span className={styles.identityIcon}><UserRound size={19} aria-hidden="true" /></span>
                  <div className={styles.identityBody}><p className={styles.identityName}>{recipient.name || "Account holder"}</p><p className={styles.identityEmail}>{recipient.email}</p><p className={styles.roleLine}>Current PolicyCraft role: <span className={styles.roleValue}>{recipient.role === "user" ? "Client user" : recipient.role}</span></p></div>
                </div>
                {recipientIsAdmin ? <p role="status" className={styles.helpText}>{alreadyAdminMessage}</p> : <ApplicationButton type="button" variant="outline" size="lg" onClick={() => { setAddError(""); passwordForm.resetField("password"); setConfirming(true); }} className={styles.reviewAction}>Add administrator <ArrowRight size={15} aria-hidden="true" /></ApplicationButton>}
              </section> : null}
            </div>
          </div>

          <aside className={styles.aside} aria-labelledby="admin-add-info-title">
            <span className={styles.asideIcon}><ShieldCheck size={18} aria-hidden="true" /></span>
            <h2 id="admin-add-info-title" className={styles.asideTitle}>Adding an administrator</h2>
            <p className={styles.asideText}>Review the access change before you confirm it.</p>
            <ol className={styles.steps}>
              <li><span>1</span><p>The recipient must already have an active account and working password login.</p></li>
              <li><span>2</span><p>They receive full PolicyCraft administrator access.</p></li>
              <li><span>3</span><p>Your administrator access stays active, and you remain signed in.</p></li>
            </ol>
            <p className={styles.asideNote}>Their existing account email and password stay the same.</p>
          </aside>
        </div>
      </WorkspaceSheet>
    </section>

    <Modal open={confirming} onClose={closeConfirmation} title="Add administrator access?" description="Confirm the account and enter your password to grant administrator access." hideClose={adding} width={500}>
      <form className={styles.modalForm} onSubmit={submitAdd}>
        <p className={styles.modalEmail}>{recipient?.email}</p>
        <p className={styles.modalText}>This account will receive full PolicyCraft administrator access. Your access and current session will stay active.</p>
        <label htmlFor="admin-add-password" className={styles.modalLabel}>Your password</label>
        <ApplicationInput {...passwordRegistration} ref={(element) => { passwordRegistration.ref(element); passwordInput.current = element; }} id="admin-add-password" type="password" name="password" required autoComplete="current-password" disabled={adding} aria-invalid={!!addError} aria-describedby={addError ? "admin-add-error" : undefined} className={styles.modalInput} />
        {addError ? <p id="admin-add-error" role="alert" className={styles.modalError}>{addError}</p> : null}
        <div className={styles.dialogFooter}><ApplicationButton type="button" variant="outline" size="lg" onClick={closeConfirmation} disabled={adding}>Cancel</ApplicationButton><ApplicationButton type="submit" variant="primary" size="lg" className={`${styles.ctaButton} ${styles.addButton}`} busy={adding} busyLabel="Adding…" leadingIcon={<ShieldCheck size={15} aria-hidden="true" />}>Confirm add</ApplicationButton></div>
      </form>
    </Modal>
  </ApplicationSurface>;
}
