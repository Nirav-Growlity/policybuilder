"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Leaf, LockKeyhole, X } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { signIn } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";
import { ApplicationButton, ApplicationField, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import styles from "./login-scene.module.css";

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

type LoginSceneProps = {
  /** "page" fills the area under the header; "overlay" fills its positioned parent. */
  variant: "page" | "overlay";
  sheetRef?: React.Ref<HTMLElement>;
  contentRef?: React.Ref<HTMLDivElement>;
  /** When set, the sheet shows a close control (used when the scene opens over the home page). */
  onClose?: () => void;
};

export function LoginScene({ variant, sheetRef, contentRef, onClose }: LoginSceneProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitedEmail = searchParams.get("email")?.trim() || "";
  const [emailLocked, setEmailLocked] = React.useState(Boolean(invitedEmail));
  const [opening, setOpening] = React.useState(false);
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
      setOpening(true);
      router.replace(safeNext(searchParams.get("next"), access));
      router.refresh();
    } catch {
      setError("root.server", { type: "server", message: "Unable to sign in. Please try again." });
    }
  }, () => clearErrors("root"));

  const serverError = errors.root?.server?.message;
  // Over the home page the hero already owns the h1, and its styles target h1 inside the hero.
  const Title = variant === "page" ? "h1" : "h2";

  return (
    <ApplicationSurface className={`${styles.scene} ${variant === "page" ? styles.page : styles.overlay}`}>
      {opening ? <AppTransitionScreen overlay title="Opening your workspace" detail="Signed in. Preparing your organizations and policies." /> : null}
      {/* Over the home page the hero's own photo shows through, so the scene and the page stay one surface. */}
      {variant === "page" ? (
        <>
          <div className={styles.image} aria-hidden="true">
            <Image src="/home/coastline.webp" alt="" fill priority sizes="100vw" className={styles.imageFill} />
          </div>
          <div className={styles.shade} aria-hidden="true" />
        </>
      ) : null}
      <section className={styles.sheet} ref={sheetRef} aria-labelledby="login-title">
        <div ref={contentRef}>
          <div className={styles.sheetTopRow}>
            <span className={styles.brand}><span className={styles.brandMark}><Leaf size={15} strokeWidth={1.8} aria-hidden="true" /></span>PolicyCraft</span>
            {onClose ? <button type="button" className={styles.close} onClick={onClose}><X size={14} aria-hidden="true" />Close</button> : null}
          </div>
          <Title className={styles.title} id="login-title">Sign in to your workspace</Title>
          <p className={styles.description}>Use your existing ESG account to pick up your policies where you left them.</p>
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
          <p className={styles.sheetFoot}>The ESG application does not need to be running.</p>
        </div>
      </section>
    </ApplicationSurface>
  );
}
