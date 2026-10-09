"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Check, Leaf, Loader2, LockKeyhole, Mail } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signIn, signOut } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import styles from "./page.module.css";

type Invitation = { mode: "new" | "existing"; email: string; name: string; expiresAt: string };
type InvitationResponse = { invitation?: Invitation; error?: string };

const existingInvitationSchema = z.object({
  // The native email input remains the source of email-format validation.
  email: z.string(),
  password: z.string(),
  confirmPassword: z.string(),
});

const newInvitationSchema = existingInvitationSchema.extend({
  password: z.string().min(8, "Use a password with at least 8 characters."),
  confirmPassword: z.string().min(8, "Use a password with at least 8 characters."),
}).superRefine(({ password, confirmPassword }, context) => {
  if (password !== confirmPassword) {
    context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match." });
  }
});

type InvitationFormValues = z.infer<typeof existingInvitationSchema>;

function AcceptInvitationContent() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [invitation, setInvitation] = React.useState<Invitation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notice, setNotice] = React.useState("");
  const [accepted, setAccepted] = React.useState(false);
  const [newAccountAccepted, setNewAccountAccepted] = React.useState(false);
  const [signInRedirectError, setSignInRedirectError] = React.useState("");
  const [redirectingToSignIn, setRedirectingToSignIn] = React.useState(false);
  const [retryCount, setRetryCount] = React.useState(0);
  const acceptanceStarted = React.useRef(false);
  const signInRedirectStarted = React.useRef(false);
  const newAccountAcceptedHeading = React.useRef<HTMLHeadingElement>(null);
  const reducedMotion = useReducedMotion();
  const schema = React.useMemo(() => invitation?.mode === "new" ? newInvitationSchema : existingInvitationSchema, [invitation?.mode]);
  const {
    clearErrors,
    formState: { errors: formErrors, isSubmitting },
    handleSubmit,
    register,
    setError,
    setValue,
  } = useForm<InvitationFormValues>({
    resolver: zodResolver(schema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  React.useEffect(() => {
    if (newAccountAccepted) newAccountAcceptedHeading.current?.focus();
  }, [newAccountAccepted]);

  React.useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      if (!token) { setNotice("This invitation link is missing its token. Ask your administrator to resend it."); setLoading(false); return; }
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
      .then((data) => { if (active) { setInvitation(data); setValue("email", data.email); } })
      .catch((cause) => { if (active) setNotice(cause instanceof Error ? cause.message : "This invitation is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [retryCount, setValue, token]);

  function retryInvitationLookup() {
    setInvitation(null);
    setNotice("");
    clearErrors();
    setLoading(true);
    setRetryCount((attempt) => attempt + 1);
  }

  async function finishSignIn(acceptedInvite: boolean) {
    if (!acceptedInvite) return;
    const accessResponse = await fetch("/api/policycraft/access", { cache: "no-store" });
    if (!accessResponse.ok) {
      setAccepted(true);
      setNotice("Your invitation was accepted. Sign in to open your workspace.");
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

  async function submitValues({ email, password }: InvitationFormValues) {
    if (!invitation || isSubmitting || accepted || newAccountAccepted || acceptanceStarted.current) return;
    clearErrors("root");
    setNotice("");
    acceptanceStarted.current = true;
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
      setError("root.server", { type: "server", message: cause instanceof Error ? cause.message : "Could not accept this invitation." });
    } finally {
      acceptanceStarted.current = false;
    }
  }

  const submitInvalid = () => {
    clearErrors("root.server");
    setNotice("");
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    void handleSubmit(submitValues, submitInvalid)(event);
  };

  const serverError = formErrors.root?.server?.message;

  return <ApplicationSurface className={styles.surface}>
    <a className={styles.skipLink} href="#invitation-main">Skip to invitation</a>
    <main className={styles.main} id="invitation-main">
      <motion.section className={`${styles.card} pc-auth-entrance`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}>
        <div className={styles.brand}><span className={styles.brandMark}><Leaf size={19} aria-hidden="true" /></span><span><span className={styles.brandName}>PolicyCraft</span><span className={styles.brandCaption}>Manager invitation</span></span></div>
        {loading ? <div className={styles.loading} aria-live="polite"><Loader2 size={16} className={styles.spinner} aria-hidden="true" />Checking invitation…</div> : newAccountAccepted ? <div role="status" aria-live="polite"><span className={styles.successIcon}><Check size={19} aria-hidden="true" /></span><h1 ref={newAccountAcceptedHeading} tabIndex={-1} className={styles.title}>Manager account created</h1><p className={styles.copy}>Your invitation was accepted. Sign in with the password you just created to open your manager workspace.</p>{signInRedirectError ? <p className={styles.warning} role="alert">{signInRedirectError}</p> : null}<ApplicationButton type="button" variant="primary" className={styles.fullButton} onClick={() => void continueNewAccountToSignIn()} busy={redirectingToSignIn} busyLabel="Signing out…" leadingIcon={!redirectingToSignIn ? <ArrowRight size={15} aria-hidden="true" /> : undefined}>{signInRedirectError ? "Retry sign in" : "Continue to sign in"}</ApplicationButton></div> : accepted ? <><span className={styles.successIcon}><Check size={19} aria-hidden="true" /></span><h1 className={styles.title}>Invitation accepted</h1><p className={styles.copy}>Your manager access is ready. Opening your workspace…</p>{notice ? <p className={styles.warning} role="status">{notice}</p> : null}</> : !invitation ? <><h1 className={styles.title}>Invitation unavailable</h1><p className={styles.errorCopy} role="alert">{notice || "Ask your administrator to send a new link."}</p>{token ? <ApplicationButton type="button" variant="outline" className={styles.fullButton} onClick={retryInvitationLookup} leadingIcon={<ArrowRight size={15} aria-hidden="true" />}>Try this link again</ApplicationButton> : null}</> : <>
          <h1 className={styles.title}>Accept your invitation</h1>
          <p className={styles.copy}>{invitation.mode === "new" ? "Create your PolicyCraft manager account. You will choose your own password." : "Sign in to the existing ESG account linked to this invitation. Its password and organization details will stay unchanged."}</p>
          <div className={styles.invitee}><Mail size={15} aria-hidden="true" /><span className={styles.inviteeEmail}>{invitation.email}</span>{invitation.name ? <span className={styles.inviteeName}>{invitation.name}</span> : null}</div>
          <form className={styles.form} onSubmit={(event) => { void submit(event); }} aria-describedby={serverError ? "invitation-form-error" : undefined}>
            {invitation.mode === "existing" ? <>
              <ApplicationField className={styles.formField} id="invitation-email" label="Email" required><ApplicationInput type="email" autoComplete="username" spellCheck={false} required invalid={Boolean(formErrors.email)} {...register("email")} /></ApplicationField>
              <ApplicationField className={styles.formField} id="invitation-password" label="Existing password" required><ApplicationInput type="password" autoComplete="current-password" required invalid={Boolean(formErrors.password)} {...register("password")} /></ApplicationField>
            </> : <>
              <ApplicationField className={styles.formField} id="invitation-email" label="Email" required><ApplicationInput type="email" autoComplete="username" spellCheck={false} required readOnly {...register("email")} /></ApplicationField>
              <ApplicationField className={styles.formField} id="invitation-new-password" label="Create password" required error={formErrors.password?.message}><ApplicationInput type="password" autoComplete="new-password" minLength={8} required invalid={Boolean(formErrors.password)} {...register("password")} /></ApplicationField>
              <ApplicationField className={styles.formField} id="invitation-confirm-password" label="Confirm password" required error={formErrors.confirmPassword?.message}><ApplicationInput type="password" autoComplete="new-password" minLength={8} required invalid={Boolean(formErrors.confirmPassword)} {...register("confirmPassword")} /></ApplicationField>
            </>}
            {serverError ? <p id="invitation-form-error" className={styles.formError} role="alert" aria-live="polite">{serverError}</p> : null}
            <ApplicationButton type="submit" variant="primary" className={styles.fullButton} busy={isSubmitting} busyLabel="Accepting invitation…" leadingIcon={!isSubmitting ? <LockKeyhole size={15} aria-hidden="true" /> : undefined} trailingIcon={!isSubmitting ? <ArrowRight size={15} aria-hidden="true" /> : undefined}>{invitation.mode === "new" ? "Create account & accept" : "Sign in & accept"}</ApplicationButton>
          </form>
        </>}
      </motion.section>
    </main>
  </ApplicationSurface>;
}

export default function AcceptInvitationPage() {
  return <React.Suspense fallback={<ApplicationSurface className={styles.surface} aria-busy="true"><div className={styles.fallback} /></ApplicationSurface>}><AcceptInvitationContent /></React.Suspense>;
}
