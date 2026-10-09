"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Leaf, LockKeyhole } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signIn } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { ApplicationThemeControl } from "@/components/ui/application-theme-control";
import styles from "./page.module.css";

const loginSchema = z.object({
  // Keep email acceptance in sync with the native type="email" control.
  email: z.string(),
  password: z.string(),
});

type LoginValues = z.infer<typeof loginSchema>;

function safeNext(value: string | null, access: PolicyCraftAccess): string {
  const path = value?.startsWith("/") && !value.startsWith("//") ? value : "";
  if (path.startsWith("/builder")) return path;
  if (access.actor.role === "admin" && path.startsWith("/admin")) return path;
  if (access.actor.role === "manager" && path.startsWith("/manager")) return path;
  if (access.actor.role === "user" && (path.startsWith("/drafts") || path.startsWith("/dashboard"))) return path.replace(/^\/dashboard/, "/drafts");
  return access.homeHref.startsWith("/") && !access.homeHref.startsWith("//") ? access.homeHref : "/";
}

function LoginPageContent() {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email")?.trim() || "";
  const [emailLocked, setEmailLocked] = React.useState(Boolean(invitedEmail));
  const {
    clearErrors,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    setValue,
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
    defaultValues: { email: invitedEmail, password: "" },
  });

  React.useEffect(() => {
    let active = true;
    void fetch("/api/policycraft/access", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return null;
      return response.json() as Promise<PolicyCraftAccess>;
    }).then((access) => {
      if (active && access) router.replace(safeNext(searchParams.get("next"), access));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [router, searchParams]);

  const submit = handleSubmit(async ({ email, password }) => {
    clearErrors("root");
    try {
      const result = await signIn.email({ email: email.trim(), password });
      if (result.error) {
        setError("root.server", { type: "server", message: result.error.message || "Email or password is incorrect." });
        return;
      }
      const accessResponse = await fetch("/api/policycraft/access", { cache: "no-store" });
      if (!accessResponse.ok) {
        setError("root.server", { type: "server", message: "You signed in, but your workspace could not be loaded. Contact an administrator." });
        return;
      }
      const access = await accessResponse.json() as PolicyCraftAccess;
      router.replace(safeNext(searchParams.get("next"), access));
      router.refresh();
    } catch {
      setError("root.server", { type: "server", message: "Unable to sign in. Please try again." });
    }
  }, () => clearErrors("root"));

  const serverError = errors.root?.server?.message;

  return (
    <ApplicationSurface className={styles.surface}>
      <div className={styles.themeControl}><ApplicationThemeControl /></div>
      <a className={styles.skipLink} href="#login-main">Skip to sign in</a>
      <main className={styles.main} id="login-main" aria-label="Sign in">
        <motion.section className={`${styles.card} pc-auth-entrance`} aria-labelledby="login-title" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.2, ease: "easeOut" }}>
          <div className={styles.brand}>
            <span className={styles.brandMark}><Leaf size={19} aria-hidden="true" /></span>
            <span className={styles.brandText}><strong>PolicyCraft</strong><small>Sustainability Suite</small></span>
          </div>
          <h1 className={styles.title} id="login-title">Sign in to your workspace</h1>
          <p className={styles.description}>Use your existing ESG account. The ESG application does not need to be running.</p>
          <form className={styles.form} onSubmit={submit} aria-describedby={serverError ? "login-error" : undefined}>
            <ApplicationField id="login-email" label="Email" required>
              <ApplicationInput type="email" required autoComplete="username" spellCheck={false} readOnly={emailLocked} {...register("email")} />
            </ApplicationField>
            {emailLocked ? <button type="button" className={styles.emailAction} onClick={() => { setEmailLocked(false); setValue("email", "", { shouldDirty: true, shouldValidate: false }); }}>Use another email</button> : null}
            <ApplicationField id="login-password" label="Password" required>
              <ApplicationInput type="password" required autoComplete="current-password" {...register("password")} />
            </ApplicationField>
            {serverError ? <p id="login-error" className={styles.error} role="alert" aria-live="polite">{serverError}</p> : null}
            <ApplicationButton className={styles.submit} variant="primary" size="lg" type="submit" busy={isSubmitting} busyLabel="Signing in…" leadingIcon={!isSubmitting ? <LockKeyhole size={16} aria-hidden="true" /> : null} trailingIcon={!isSubmitting ? <ArrowRight size={16} aria-hidden="true" /> : null}>
              Sign in
            </ApplicationButton>
          </form>
        </motion.section>
      </main>
    </ApplicationSurface>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={<ApplicationSurface className={styles.surface} />}>
      <LoginPageContent />
    </React.Suspense>
  );
}
