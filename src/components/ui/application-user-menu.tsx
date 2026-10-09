"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DropdownMenu } from "radix-ui";
import { Check, ChevronDown, FileText, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import { signOut, useSession } from "@/lib/auth-client";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";
import styles from "./application-user-menu.module.css";

type UserMenuProps = {
  user: { name?: string | null; email?: string | null };
  workspaceHref: string;
  onSignOut: () => void | Promise<void>;
  signingOut?: boolean;
};
const subscribe = () => () => undefined;
const appearances = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ApplicationUserMenu({ user, workspaceHref, onSignOut, signingOut = false }: UserMenuProps) {
  const mounted = React.useSyncExternalStore(subscribe, () => true, () => false);
  const { theme, setTheme } = useTheme();
  const identity = user.name || user.email || "Your account";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className={styles.trigger} aria-label={`Account for ${identity}`}>
        <span className={styles.avatar} aria-hidden="true"><UserRound size={17} /></span>
        <span className={styles.name}>{identity}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className={`pc-ui ${styles.menu}`} align="end" sideOffset={8} collisionPadding={12}>
          <DropdownMenu.Label className={styles.identity}><strong>{user.name || "Your account"}</strong><span>{user.email}</span></DropdownMenu.Label>
          <DropdownMenu.Item asChild className={styles.item}><Link href={workspaceHref}><FileText size={16} aria-hidden="true" />Open workspace</Link></DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Label className={styles.label}>Appearance</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={mounted ? theme ?? "system" : ""} onValueChange={setTheme}>
            {appearances.map(({ value, label, icon: Icon }) => (
              <DropdownMenu.RadioItem key={value} value={value} disabled={!mounted} className={styles.item} onSelect={(event) => event.preventDefault()}>
                <Icon size={16} aria-hidden="true" /><span>{label}</span><DropdownMenu.ItemIndicator className={styles.check}><Check size={15} aria-hidden="true" /></DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Item className={styles.item} disabled={signingOut} onSelect={() => { void onSignOut(); }}><LogOut size={16} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function ApplicationSessionMenu({ workspaceHref }: { workspaceHref: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const setScope = usePolicyCraftScope((state) => state.setScope);
  const [signingOut, setSigningOut] = React.useState(false);
  const [error, setError] = React.useState("");
  if (!session) return null;
  async function handleSignOut() {
    setSigningOut(true);
    setError("");
    try {
      const result = await signOut();
      if (result.error) throw new Error("Could not sign out. Please try again.");
      setScope(null);
      policyCraftBuilderStorage.clearScope();
      router.push("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }
  return <div className={styles.session}><ApplicationUserMenu user={session.user} workspaceHref={workspaceHref} signingOut={signingOut} onSignOut={handleSignOut} />{error ? <p role="alert" className={styles.error}>{error}</p> : null}</div>;
}
