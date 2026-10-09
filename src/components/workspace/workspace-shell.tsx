"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { Building2, ChevronDown, ClipboardList, FileText, Loader2, LogOut, Menu, Settings2, Shield, Users, X } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { PolicyCraftAccess, PolicyCraftRole } from "@/lib/policycraft-access-types";
import type { PolicyCraftManagerTaskCollection } from "@/lib/policycraft-task-types";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { ApplicationThemeControl } from "@/components/ui/application-theme-control";
import { ApplicationButton } from "@/components/ui/app-primitives";
import styles from "./workspace-shell.module.css";

type WorkspaceContextValue = { access: PolicyCraftAccess };
const WorkspaceContext = React.createContext<WorkspaceContextValue | null>(null);

export function usePolicyCraftWorkspace(): WorkspaceContextValue {
  const context = React.useContext(WorkspaceContext);
  if (!context) throw new Error("usePolicyCraftWorkspace must be used within WorkspaceShell");
  return context;
}

const NAVIGATION: Record<PolicyCraftRole, { href: string; label: string; icon: typeof FileText }[]> = {
  admin: [
    { href: "/admin", label: "Managers", icon: Users },
    { href: "/admin/organizations", label: "Organizations", icon: Building2 },
    { href: "/admin/policies", label: "Policies", icon: FileText },
    { href: "/admin/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/admin/administration", label: "Administration", icon: Settings2 },
  ],
  manager: [
    { href: "/manager", label: "Organizations & policies", icon: FileText },
    { href: "/manager/tasks", label: "Tasks", icon: ClipboardList },
  ],
  user: [{ href: "/drafts", label: "Policies", icon: FileText }],
};

function safeInternalPath(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function WorkspaceShell({
  role,
  children,
}: Readonly<{ role: PolicyCraftRole; children: React.ReactNode }>) {
  const router = useRouter();
  const pathname = usePathname();
  const [access, setAccess] = React.useState<PolicyCraftAccess | null>(null);
  const [error, setError] = React.useState("");
  const [signingOut, setSigningOut] = React.useState(false);
  const [retryAccess, setRetryAccess] = React.useState(0);
  const [openTaskCount, setOpenTaskCount] = React.useState(0);
  const [accountOpenPath, setAccountOpenPath] = React.useState<string | null>(null);
  const [mobileNavOpenPath, setMobileNavOpenPath] = React.useState<string | null>(null);
  const accountOpen = accountOpenPath === pathname;
  const mobileNavOpen = mobileNavOpenPath === pathname;
  const accountTriggerRef = React.useRef<HTMLButtonElement>(null);
  const accountBreakpointAtOpenRef = React.useRef<boolean | null>(null);
  const mobileTriggerRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLElement>(null);
  const drawerCloseRef = React.useRef<HTMLButtonElement>(null);
  const reducedMotion = useReducedMotion();
  const setScope = usePolicyCraftScope((state) => state.setScope);
  const closeAccountMenu = React.useCallback(() => {
    accountBreakpointAtOpenRef.current = null;
    setAccountOpenPath(null);
  }, []);

  React.useEffect(() => {
    if (!accountOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      closeAccountMenu();
      accountTriggerRef.current?.focus();
    }
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Element && !event.target.closest(`.${styles.account}`)) closeAccountMenu();
    }
    const media = window.matchMedia("(min-width: 1024px)");
    function handleBreakpointChange(event: MediaQueryListEvent) {
      if (event.matches === accountBreakpointAtOpenRef.current) return;
      closeAccountMenu();
      window.requestAnimationFrame(() => accountTriggerRef.current?.focus());
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    media.addEventListener("change", handleBreakpointChange);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
      media.removeEventListener("change", handleBreakpointChange);
    };
  }, [accountOpen, closeAccountMenu]);

  const closeMobileDrawer = React.useCallback(() => {
    setMobileNavOpenPath(null);
    window.requestAnimationFrame(() => mobileTriggerRef.current?.focus());
  }, []);

  React.useEffect(() => {
    if (accountOpenPath !== null && accountOpenPath !== pathname) {
      queueMicrotask(closeAccountMenu);
    }
    if (mobileNavOpenPath !== null && mobileNavOpenPath !== pathname) {
      queueMicrotask(() => {
        setMobileNavOpenPath(null);
        window.requestAnimationFrame(() => mobileTriggerRef.current?.focus());
      });
    }
  }, [accountOpenPath, closeAccountMenu, mobileNavOpenPath, pathname]);

  function handleDrawerKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileDrawer();
      return;
    }
    if (event.key !== "Tab" || !drawerRef.current) return;
    const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])"));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      drawerCloseRef.current?.focus();
    } else if (event.shiftKey && (document.activeElement === first || !drawerRef.current.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !drawerRef.current.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  React.useEffect(() => {
    if (!mobileNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();
    const media = window.matchMedia("(min-width: 1024px)");
    const handleBreakpoint = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      setMobileNavOpenPath(null);
      window.requestAnimationFrame(() => accountTriggerRef.current?.focus());
    };
    media.addEventListener("change", handleBreakpoint);
    return () => {
      document.body.style.overflow = previousOverflow;
      media.removeEventListener("change", handleBreakpoint);
    };
  }, [mobileNavOpen]);

  React.useEffect(() => {
    let active = true;
    setScope(null);
    policyCraftBuilderStorage.clearScope();
    const timer = window.setTimeout(() => {
      setAccess(null);
      setError("");
      void fetch("/api/policycraft/access", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname || "/")}`);
          return null;
        }
        if (!response.ok) throw new Error("Could not load your PolicyCraft access.");
        return response.json() as Promise<PolicyCraftAccess>;
      })
      .then((result) => {
        if (!active || !result) return;
        if (result.actor.role !== role) {
          router.replace(safeInternalPath(result.homeHref));
          return;
        }
        setAccess(result);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load your PolicyCraft access.");
      });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [pathname, retryAccess, role, router, setScope]);

  React.useEffect(() => {
    if (!access || role !== "manager") return;
    let active = true;
    const refreshTaskCount = () => {
      if (document.visibilityState !== "visible") return;
      void fetch("/api/policycraft/tasks", { cache: "no-store" }).then(async (response) => {
        if (!response.ok) return;
        const body = await response.json().catch(() => null);
        if (!active) return;
        const tasks = Array.isArray(body?.tasks) ? body.tasks as PolicyCraftManagerTaskCollection["tasks"] : [];
        setOpenTaskCount(tasks.filter((task) => task.status === "assigned" || task.status === "in_progress").length);
      }).catch(() => undefined);
    };
    const timer = window.setInterval(refreshTaskCount, 30_000);
    window.addEventListener("focus", refreshTaskCount);
    document.addEventListener("visibilitychange", refreshTaskCount);
    refreshTaskCount();
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refreshTaskCount); document.removeEventListener("visibilitychange", refreshTaskCount); };
  }, [access, role]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    setError("");
    try {
      setScope(null);
      policyCraftBuilderStorage.clearScope();
      const result = await signOut();
      if (result.error) throw new Error(result.error.message || "Could not sign out. Try again.");
      router.replace("/login");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? `Could not sign out: ${cause.message}` : "Could not sign out. Try again.");
      setSigningOut(false);
    }
  }

  if (!access) {
    return (
      <ApplicationSurface className={styles.accessState} aria-busy={!error}>
        {error ? <main className={styles.accessMessage}><p role="alert">{error}</p><ApplicationButton type="button" onClick={() => setRetryAccess((attempt) => attempt + 1)} leadingIcon={<Shield size={14} aria-hidden="true" />}>Retry loading workspace</ApplicationButton></main> : <main className={styles.loading} role="status" aria-live="polite"><Loader2 size={16} className={styles.spinner} aria-hidden="true" />Loading workspace…</main>}
      </ApplicationSurface>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ access }}>
      <div className={styles.workspaceRoot} style={role === "user" ? undefined : { "--color-muted": "#5f6e65" } as React.CSSProperties}>
        <ApplicationSurface className={styles.chrome}>
          <a href="#workspace-main" className={styles.skipLink}>Skip to workspace</a>
          <header className={styles.header} inert={mobileNavOpen}>
            <div className={styles.headerInner}>
              <Link href={safeInternalPath(access.homeHref)} className={styles.brand}>
                <span className={styles.brandMark}><Shield size={17} aria-hidden="true" /></span>
                <span><span className={styles.brandName}>PolicyCraft</span><span className={styles.brandCaption}>Workspace</span></span>
              </Link>
              <nav aria-label="Workspace navigation" className={styles.desktopNav}>
                {NAVIGATION[role].map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href === "/manager" && pathname.startsWith("/manager/") && !pathname.startsWith("/manager/tasks")) || (href !== "/admin" && href !== "/manager" && pathname.startsWith(`${href}/`)) || (href === "/admin" && pathname.startsWith("/admin/managers/"));
                  return <Link key={href} href={href} aria-current={active ? "page" : undefined} aria-label={role === "manager" && href === "/manager/tasks" ? `Tasks${openTaskCount ? `, ${openTaskCount} open` : ""}` : undefined} className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}>
                    {active ? <motion.span className={styles.navMarker} layoutId="workspace-nav-marker" transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeOut" }} aria-hidden="true" /> : null}
                    <Icon size={15} aria-hidden="true" /><span>{label}</span>{role === "manager" && href === "/manager/tasks" && openTaskCount > 0 ? <span className={styles.taskBadge} aria-hidden="true">{openTaskCount > 99 ? "99+" : openTaskCount}</span> : null}
                  </Link>;
                })}
              </nav>
              <div className={styles.headerActions}>
                <div className={styles.account} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeAccountMenu(); }}>
                  <button ref={accountTriggerRef} type="button" className={styles.accountTrigger} aria-label={`Account for ${access.actor.name || access.actor.email}, ${role}`} aria-expanded={accountOpen} aria-controls={accountOpen ? "workspace-account-menu" : undefined} onClick={() => { if (accountOpen) closeAccountMenu(); else { accountBreakpointAtOpenRef.current = window.matchMedia("(min-width: 1024px)").matches; setAccountOpenPath(pathname); } setMobileNavOpenPath(null); }}>
                    <span className={styles.accountIdentity}><span className={styles.accountName}>{access.actor.name || access.actor.email}</span><span className={styles.accountRole}>{role}</span></span>
                    <ChevronDown size={16} aria-hidden="true" className={accountOpen ? styles.chevronOpen : ""} />
                  </button>
                  {accountOpen ? <motion.div id="workspace-account-menu" className={styles.accountMenu} role="group" aria-label="Account actions" initial={reducedMotion ? false : { opacity: 0, scale: 0.97, y: -3 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: reducedMotion ? 0 : 0.15, ease: "easeOut" }}>
                      <div className={styles.accountDetails}><strong>{access.actor.name || "Your account"}</strong><span title={access.actor.email}>{access.actor.email}</span><span className={styles.roleLabel}>{role}</span></div>
                      <ApplicationThemeControl />
                      <ApplicationButton type="button" variant="ghost" className={styles.signOutButton} onClick={() => void handleSignOut()} disabled={signingOut} busy={signingOut} busyLabel="Signing out…" leadingIcon={!signingOut ? <LogOut size={15} aria-hidden="true" /> : undefined}>Sign out</ApplicationButton>
                    </motion.div> : null}
                </div>
                <button ref={mobileTriggerRef} type="button" className={styles.mobileNavTrigger} aria-label={mobileNavOpen ? "Close workspace navigation" : "Open workspace navigation"} aria-expanded={mobileNavOpen} aria-controls={mobileNavOpen ? "workspace-mobile-navigation" : undefined} onClick={() => { setMobileNavOpenPath(mobileNavOpen ? null : pathname); setAccountOpenPath(null); }}>
                  {mobileNavOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
                </button>
              </div>
            </div>
          </header>
          {error ? <div role="alert" className={styles.signOutError} inert={mobileNavOpen}><p>{error}</p><ApplicationButton type="button" variant="ghost" size="sm" onClick={() => void handleSignOut()} disabled={signingOut} leadingIcon={<LogOut size={14} aria-hidden="true" />}>Retry sign out</ApplicationButton></div> : null}
          {mobileNavOpen ? <div className={styles.drawerLayer}>
            <button type="button" className={styles.drawerBackdrop} aria-hidden="true" tabIndex={-1} onClick={closeMobileDrawer} />
            <motion.aside ref={drawerRef} id="workspace-mobile-navigation" className={styles.mobileDrawer} role="dialog" aria-modal="true" aria-labelledby="workspace-drawer-title" initial={reducedMotion ? false : { x: "100%" }} animate={{ x: 0 }} transition={{ duration: reducedMotion ? 0 : 0.25, ease: "easeOut" }} onKeyDown={handleDrawerKeyDown}>
              <div className={styles.drawerHeader}>
                <Link href={safeInternalPath(access.homeHref)} className={styles.brand} onClick={closeMobileDrawer}><span className={styles.brandMark}><Shield size={17} aria-hidden="true" /></span><span><span className={styles.brandName}>PolicyCraft</span><span className={styles.brandCaption}>Workspace</span></span></Link>
                <h2 id="workspace-drawer-title" className={styles.visuallyHidden}>Workspace navigation</h2>
                <button ref={drawerCloseRef} type="button" className={styles.mobileNavTrigger} aria-label="Close workspace navigation" onClick={closeMobileDrawer}><X size={19} aria-hidden="true" /></button>
              </div>
              <section className={styles.drawerAccount} aria-label="Account">
                <div className={styles.drawerIdentity}><strong>{access.actor.name || access.actor.email}</strong><span>{access.actor.email}</span><span className={styles.roleLabel}>{role}</span></div>
                <ApplicationThemeControl />
                <ApplicationButton type="button" variant="ghost" className={styles.signOutButton} onClick={() => void handleSignOut()} disabled={signingOut} busy={signingOut} busyLabel="Signing out…" leadingIcon={!signingOut ? <LogOut size={15} aria-hidden="true" /> : undefined}>Sign out</ApplicationButton>
              </section>
              <nav aria-label="Workspace navigation" className={styles.mobileNav}>
                {NAVIGATION[role].map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href === "/manager" && pathname.startsWith("/manager/") && !pathname.startsWith("/manager/tasks")) || (href !== "/admin" && href !== "/manager" && pathname.startsWith(`${href}/`)) || (href === "/admin" && pathname.startsWith("/admin/managers/"));
                  return <Link key={href} href={href} aria-current={active ? "page" : undefined} aria-label={role === "manager" && href === "/manager/tasks" ? `Tasks${openTaskCount ? `, ${openTaskCount} open` : ""}` : undefined} className={`${styles.mobileNavLink} ${active ? styles.mobileNavLinkActive : ""}`} onClick={closeMobileDrawer}><Icon size={17} aria-hidden="true" /><span>{label}</span>{role === "manager" && href === "/manager/tasks" && openTaskCount > 0 ? <span className={styles.taskBadge} aria-hidden="true">{openTaskCount > 99 ? "99+" : openTaskCount}</span> : null}</Link>;
                })}
              </nav>
            </motion.aside>
          </div> : null}
        </ApplicationSurface>
        <main id="workspace-main" className="mx-auto max-w-7xl px-5 py-7 lg:px-10 lg:py-9" inert={mobileNavOpen}>{children}</main>
      </div>
    </WorkspaceContext.Provider>
  );
}
