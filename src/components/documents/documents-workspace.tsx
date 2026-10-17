"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import type { PolicyCraftRole } from "@/lib/policycraft-access-types";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { ApplicationButton } from "@/components/ui/app-primitives";

/**
 * Documents is shared by every role, so the workspace shell is chosen from
 * the signed-in actor instead of the route. The same loading screen as the
 * shell's own covers the access check, so the two read as one step.
 */
export function DocumentsWorkspace({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [role, setRole] = React.useState<PolicyCraftRole | null>(null);
  const [error, setError] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let active = true;
    void fetch("/api/policycraft/access", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname || "/documents")}`);
          return;
        }
        if (!response.ok) throw new Error("Could not load your PolicyCraft access.");
        const body = await response.json() as { actor?: { role?: PolicyCraftRole } };
        if (active && body.actor?.role) setRole(body.actor.role);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load your PolicyCraft access."); });
    return () => { active = false; };
    // The role does not change between pages; check once per attempt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (role) return <WorkspaceShell role={role}>{children}</WorkspaceShell>;
  if (!error) return <AppTransitionScreen title="Loading your workspace" detail="Checking your organization and policy access." />;
  return (
    <ApplicationSurface className="grid min-h-screen place-items-center px-5">
      <main className="grid max-w-md justify-items-center gap-4 text-center">
        <p role="alert" className="text-sm text-[var(--pc-error)]">{error}</p>
        <ApplicationButton type="button" onClick={() => { setError(""); setAttempt((value) => value + 1); }} leadingIcon={<Shield size={14} aria-hidden="true" />}>Retry loading workspace</ApplicationButton>
      </main>
    </ApplicationSurface>
  );
}
