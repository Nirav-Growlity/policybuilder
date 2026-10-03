"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Loader2, LogOut, Settings2, Shield, Users } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { PolicyCraftAccess, PolicyCraftRole } from "@/lib/policycraft-access-types";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";

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
    { href: "/admin/policies", label: "Policies", icon: FileText },
    { href: "/admin/administration", label: "Administration", icon: Settings2 },
  ],
  manager: [{ href: "/manager", label: "Organizations & policies", icon: FileText }],
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
  const setScope = usePolicyCraftScope((state) => state.setScope);

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
  }, [pathname, role, router, setScope]);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      setScope(null);
      policyCraftBuilderStorage.clearScope();
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Try again.");
      setSigningOut(false);
    }
  }

  if (!access) {
    return (
      <main className="grid min-h-screen place-items-center bg-[var(--color-cream)] px-5 text-[var(--color-ink)]" aria-busy="true">
        {error ? <p role="alert" className="max-w-md text-sm text-red-800">{error}</p> : <span className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Loading workspace…</span>}
      </main>
    );
  }

  return (
    <WorkspaceContext.Provider value={{ access }}>
      <div className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
        <a href="#workspace-main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:shadow">Skip to workspace</a>
        <header className="border-b border-[var(--color-line)] bg-[var(--color-paper)]">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4 lg:px-10">
            <div className="flex min-w-0 items-center gap-5">
              <Link href={safeInternalPath(access.homeHref)} className="flex shrink-0 items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--color-forest)] text-white"><Shield size={17} aria-hidden="true" /></span>
                <span className="min-w-0"><span className="block font-display text-[15px] font-semibold leading-tight">PolicyCraft</span><span className="block text-[10px] uppercase tracking-[.14em] text-[var(--color-muted)]">Workspace</span></span>
              </Link>
              <nav aria-label="Workspace navigation" className="flex min-w-0 flex-wrap items-center gap-1">
                {NAVIGATION[role].map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
                  return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] ${active ? "bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)]" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-forest)]"}`}><Icon size={15} aria-hidden="true" />{label}</Link>;
                })}
              </nav>
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0 text-right">
                <p className="max-w-48 truncate text-[12px] font-semibold" title={access.actor.name}>{access.actor.name || access.actor.email}</p>
                <p className="max-w-48 truncate text-[10px] capitalize text-[var(--color-muted)]" title={access.actor.email}>{role}</p>
              </div>
              <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-line-2)] px-3 text-[12px] font-medium text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60">
                {signingOut ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <LogOut size={14} aria-hidden="true" />}<span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
              </button>
            </div>
          </div>
        </header>
        <main id="workspace-main" className="mx-auto max-w-7xl px-5 py-7 lg:px-10 lg:py-9">{children}</main>
      </div>
    </WorkspaceContext.Provider>
  );
}
