"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import "@fontsource-variable/instrument-sans/wdth.css";
import { BookOpen, Building2, ChevronDown, ClipboardList, FileText, LogOut, Menu, Settings2, Shield, Users, X } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { PolicyCraftAccess, PolicyCraftRole } from "@/lib/policycraft-access-types";
import type { PolicyCraftManagerTaskCollection } from "@/lib/policycraft-task-types";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { ApplicationThemeControl } from "@/components/ui/application-theme-control";
import { ApplicationButton } from "@/components/ui/app-primitives";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import { Avatar, WorkspaceVisitContext, WS_SPRING } from "./workspace-motion";
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
    { href: "/documents", label: "Documents", icon: BookOpen },
    { href: "/admin/tasks", label: "Tasks", icon: ClipboardList },
    { href: "/admin/administration", label: "Administration", icon: Settings2 },
  ],
  manager: [
    { href: "/manager", label: "Organizations", icon: Building2 },
    { href: "/manager/policies", label: "Policies", icon: FileText },
    { href: "/documents", label: "Documents", icon: BookOpen },
    { href: "/manager/tasks", label: "Tasks", icon: ClipboardList },
  ],
  user: [
    { href: "/drafts", label: "Policies", icon: FileText },
    { href: "/documents", label: "Documents", icon: BookOpen },
  ],
};

function BrandLink({ href, onClick }: { href: string; onClick?: () => void }) {
  return (
    <Link href={href} className={styles.brand} onClick={onClick}>
      <span className={styles.brandMark}><Shield size={17} aria-hidden="true" /></span>
      <span><span className={styles.brandName}>PolicyCraft</span><span className={styles.brandCaption}>Workspace</span></span>
    </Link>
  );
}

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
  const setScope = usePolicyCraftScope((state) => state.setScope);
  const [scrolled, setScrolled] = React.useState(false);
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 32, restDelta: 0.001 });
  useMotionValueEvent(scrollY, "change", (latest) => setScrolled(latest > 12));

  // Workspace-only styling hook. Global stylesheets persist across client
  // navigations, so every workspace rule is gated on this attribute and the
  // builder never matches it.
  React.useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-pc-shell", role);
    return () => root.removeAttribute("data-pc-shell");
  }, [role]);

  // Inertial wheel scrolling. Lists are paginated and covers mount lazily, so
  // the page stays light enough for Lenis to hold 60fps. Dialogs, menus and
  // nested scroll areas keep native scrolling.
  const lenisRef = React.useRef<Lenis | null>(null);
  React.useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      lerp: 0.12,
      wheelMultiplier: 0.9,
      allowNestedScroll: true,
      prevent: (node) => Boolean(node.closest?.(".pc-modal-overlay, [role='dialog'], [data-lenis-prevent], .pc-disclosure-panel")),
    });
    lenisRef.current = lenis;
    return () => { lenis.destroy(); lenisRef.current = null; };
  }, []);

  // A new id per page visit; page entrances play once per visit.
  const [visit, setVisit] = React.useState({ path: pathname, id: 0 });
  if (visit.path !== pathname) setVisit({ path: pathname, id: visit.id + 1 });

  // Each page starts at the top with no smooth-scroll momentum carried over.
  // A layout effect runs before the browser paints, so the new page never
  // shows for a frame at the previous page's scroll offset and then jumps.
  React.useLayoutEffect(() => {
    lenisRef.current?.scrollTo(0, { immediate: true, force: true });
  }, [pathname]);
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
    // Access is re-checked on every navigation, but the current workspace stays
    // on screen while it runs; blanking it here made every page change flash
    // the full-screen loader and rebuild the shell.
    const timer = window.setTimeout(() => {
      setError("");
      const fontReady = document.fonts?.load('600 40px "Instrument Sans Variable"').catch(() => undefined) ?? Promise.resolve();
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
        // Keep the same object when nothing changed so pages that depend on
        // access (organizations, scope) do not refetch their data.
        return Promise.race([fontReady, new Promise((resolve) => window.setTimeout(resolve, 600))]).then(() => {
          if (active) setAccess((current) => current && JSON.stringify(current) === JSON.stringify(result) ? current : result);
        });
      })
      .catch((cause) => {
        if (!active) return;
        setAccess(null);
        setError(cause instanceof Error ? cause.message : "Could not load your PolicyCraft access.");
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
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? `Could not sign out: ${cause.message}` : "Could not sign out. Try again.");
      setSigningOut(false);
    }
  }

  const isActive = (href: string) => pathname === href || (href === "/manager" && pathname.startsWith("/manager/organizations/")) || (href !== "/admin" && href !== "/manager" && pathname.startsWith(`${href}/`)) || (href === "/admin" && pathname.startsWith("/admin/managers/"));
  const taskLabel = (href: string) => role === "manager" && href === "/manager/tasks" ? `Tasks${openTaskCount ? `, ${openTaskCount} open` : ""}` : undefined;
  const taskBadge = (href: string) => role === "manager" && href === "/manager/tasks" && openTaskCount > 0
    ? <motion.span key={openTaskCount} className={styles.taskBadge} aria-hidden="true" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={WS_SPRING}>{openTaskCount > 99 ? "99+" : openTaskCount}</motion.span>
    : null;

  if (!access) {
    if (!error) return <AppTransitionScreen title="Loading your workspace" detail="Checking your organization and policy access." />;
    return (
      <ApplicationSurface className={styles.accessState}>
        <div className={styles.accessBand} aria-hidden="true"><span className={styles.brandMark}><Shield size={17} /></span></div>
        <main className={styles.accessMessage}><p role="alert">{error}</p><ApplicationButton type="button" onClick={() => setRetryAccess((attempt) => attempt + 1)} leadingIcon={<Shield size={14} aria-hidden="true" />}>Retry loading workspace</ApplicationButton></main>
      </ApplicationSurface>
    );
  }

  const displayName = access.actor.name || access.actor.email;

  return (
    <WorkspaceContext.Provider value={{ access }}>
      <ApplicationSurface className={styles.workspaceRoot} style={role === "user" ? undefined : { "--color-muted": "#5f6e65" } as React.CSSProperties}>
        {signingOut ? <AppTransitionScreen overlay title="Signing you out" detail="Closing your session securely." /> : null}
        <a href="#workspace-main" className={styles.skipLink}>Skip to workspace</a>
        <header className={styles.header} data-scrolled={scrolled || undefined} inert={mobileNavOpen} style={{ viewTransitionName: "ws-header" }}>
          <div className={styles.headerInner}>
            <BrandLink href={safeInternalPath(access.homeHref)} />
            <nav aria-label="Workspace navigation" className={styles.desktopNav}>
              {NAVIGATION[role].map(({ href, label, icon: Icon }) => {
                const active = isActive(href);
                return <Link key={href} href={href} aria-current={active ? "page" : undefined} aria-label={taskLabel(href)} className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}>
                  {active ? <motion.span className={styles.navMarker} layoutId="workspace-nav-marker" transition={WS_SPRING} aria-hidden="true" /> : null}
                  <Icon size={15} aria-hidden="true" /><span>{label}</span>{taskBadge(href)}
                </Link>;
              })}
            </nav>
            <div className={styles.headerActions}>
              <div className={styles.account} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeAccountMenu(); }}>
                <button ref={accountTriggerRef} type="button" className={styles.accountTrigger} aria-label={`Account for ${displayName}, ${role}`} aria-expanded={accountOpen} aria-controls={accountOpen ? "workspace-account-menu" : undefined} onClick={() => { if (accountOpen) closeAccountMenu(); else { accountBreakpointAtOpenRef.current = window.matchMedia("(min-width: 1024px)").matches; setAccountOpenPath(pathname); } setMobileNavOpenPath(null); }}>
                  <Avatar name={displayName} seed={access.actor.email} size={32} className={styles.accountAvatar} />
                  <span className={styles.accountIdentity}><span className={styles.accountName}>{displayName}</span><span className={styles.accountRole}>{role}</span></span>
                  <ChevronDown size={16} aria-hidden="true" className={accountOpen ? styles.chevronOpen : ""} />
                </button>
                <AnimatePresence>
                  {accountOpen ? <motion.div key="account-menu" id="workspace-account-menu" className={styles.accountMenu} role="group" aria-label="Account actions" initial={{ opacity: 0, scale: 0.96, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: -4, transition: { duration: 0.12 } }} transition={{ type: "spring", stiffness: 520, damping: 34 }}>
                    <div className={styles.accountCard}>
                      <Avatar name={displayName} seed={access.actor.email} size={44} />
                      <div className={styles.accountDetails}><strong>{access.actor.name || "Your account"}</strong><span title={access.actor.email}>{access.actor.email}</span><span className={styles.roleLabel}>{role}</span></div>
                    </div>
                    <ApplicationThemeControl />
                    <ApplicationButton type="button" variant="ghost" className={styles.signOutButton} onClick={() => void handleSignOut()} disabled={signingOut} busy={signingOut} busyLabel="Signing out…" leadingIcon={!signingOut ? <LogOut size={15} aria-hidden="true" /> : undefined}>Sign out</ApplicationButton>
                  </motion.div> : null}
                </AnimatePresence>
              </div>
              <button ref={mobileTriggerRef} type="button" className={styles.mobileNavTrigger} aria-label={mobileNavOpen ? "Close workspace navigation" : "Open workspace navigation"} aria-expanded={mobileNavOpen} aria-controls={mobileNavOpen ? "workspace-mobile-navigation" : undefined} onClick={() => { setMobileNavOpenPath(mobileNavOpen ? null : pathname); setAccountOpenPath(null); }}>
                {mobileNavOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <motion.span className={styles.scrollProgress} style={{ scaleX: progress }} aria-hidden="true" />
        </header>
        {error ? <div role="alert" className={styles.signOutError} inert={mobileNavOpen}><p>{error}</p><ApplicationButton type="button" variant="ghost" size="sm" onClick={() => void handleSignOut()} disabled={signingOut} leadingIcon={<LogOut size={14} aria-hidden="true" />}>Retry sign out</ApplicationButton></div> : null}
        <AnimatePresence>
          {mobileNavOpen ? <div key="drawer" className={styles.drawerLayer} data-lenis-prevent="">
            <motion.button type="button" className={styles.drawerBackdrop} aria-hidden="true" tabIndex={-1} onClick={closeMobileDrawer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            <motion.aside ref={drawerRef} id="workspace-mobile-navigation" className={styles.mobileDrawer} role="dialog" aria-modal="true" aria-labelledby="workspace-drawer-title" initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 380, damping: 40 }} onKeyDown={handleDrawerKeyDown}>
              <div className={styles.drawerHeader}>
                <BrandLink href={safeInternalPath(access.homeHref)} onClick={closeMobileDrawer} />
                <h2 id="workspace-drawer-title" className={styles.visuallyHidden}>Workspace navigation</h2>
                <button ref={drawerCloseRef} type="button" className={styles.mobileNavTrigger} aria-label="Close workspace navigation" onClick={closeMobileDrawer}><X size={19} aria-hidden="true" /></button>
              </div>
              <section className={styles.drawerAccount} aria-label="Account">
                <div className={styles.accountCard}>
                  <Avatar name={displayName} seed={access.actor.email} size={40} />
                  <div className={styles.drawerIdentity}><strong>{displayName}</strong><span>{access.actor.email}</span><span className={styles.roleLabel}>{role}</span></div>
                </div>
                <ApplicationButton type="button" variant="ghost" className={styles.signOutButton} onClick={() => void handleSignOut()} disabled={signingOut} busy={signingOut} busyLabel="Signing out…" leadingIcon={!signingOut ? <LogOut size={15} aria-hidden="true" /> : undefined}>Sign out</ApplicationButton>
              </section>
              <nav aria-label="Workspace navigation" className={styles.mobileNav}>
                {NAVIGATION[role].map(({ href, label, icon: Icon }, index) => {
                  const active = isActive(href);
                  return <motion.div key={href} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, delay: 0.08 + index * 0.04, ease: [0.22, 1, 0.36, 1] }}>
                    <Link href={href} aria-current={active ? "page" : undefined} aria-label={taskLabel(href)} className={`${styles.mobileNavLink} ${active ? styles.mobileNavLinkActive : ""}`} onClick={closeMobileDrawer}><Icon size={17} aria-hidden="true" /><span>{label}</span>{taskBadge(href)}</Link>
                  </motion.div>;
                })}
              </nav>
            </motion.aside>
          </div> : null}
        </AnimatePresence>
        <main id="workspace-main" className={styles.main} inert={mobileNavOpen}>
          {/* Route changes: the old page fades away on top while the new page
              plays its own entrance underneath, so the two never pop. */}
          <WorkspaceVisitContext.Provider value={`${visit.id}:${visit.path}`}>
            <React.ViewTransition key={pathname} enter="ws-page-enter" exit="ws-page-exit" default="none">
              <div className={styles.page}>{children}</div>
            </React.ViewTransition>
          </WorkspaceVisitContext.Provider>
        </main>
      </ApplicationSurface>
    </WorkspaceContext.Provider>
  );
}
