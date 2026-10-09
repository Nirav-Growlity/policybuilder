"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";
import { ApplicationThemeControl } from "@/components/ui/application-theme-control";
import { PublicWalkthrough } from "@/components/public/public-walkthrough";
import {
  ArrowRight,
  Award,
  FileText,
  Leaf,
  Loader2,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import styles from "./page.module.css";

const FRAMEWORKS = ["GRI", "EcoVadis", "CDP", "BRSR", "CSRD", "UNGC", "ISO 14001", "ISO 26000", "SA8000", "TCFD", "SBTi"];

function PolicyPreview() {
  return (
    <div className={styles.previewFrame} role="img" aria-label="Sample environmental policy preview">
      <div className={styles.previewToolbar} aria-hidden="true">
        <span className={styles.previewToolbarLabel}><FileText size={14} /> Policy preview</span>
        <span className={styles.previewPageCount}>01 / 08</span>
      </div>
      <article className={styles.paper}>
        <div className={styles.paperHeader}>
          <span className={styles.paperMark}><Leaf size={14} aria-hidden="true" /></span>
          <span>POLICYCRAFT · SAMPLE</span>
        </div>
        <div className={styles.paperRule} />
        <p className={styles.paperKicker}>ENVIRONMENTAL POLICY</p>
        <h2 className={styles.paperTitle}>Environmental<br />Policy</h2>
        <p className={styles.paperCompany}>A practical framework for responsible operations</p>
        <div className={styles.paperSection}>
          <h3>Policy declaration</h3>
          <p>We are committed to protecting the environment, preventing pollution, and improving our environmental performance.</p>
        </div>
        <div className={styles.paperSection}>
          <h3>Areas of focus</h3>
          <ul>
            <li><span aria-hidden="true" />Energy and emissions</li>
            <li><span aria-hidden="true" />Water stewardship</li>
            <li><span aria-hidden="true" />Waste and circularity</li>
          </ul>
        </div>
        <div className={styles.paperFooter}><span>Scope and commitments</span><span>01</span></div>
      </article>
      <div className={styles.previewCaption}>A structured policy, ready to review and refine.</div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [workspaceHref, setWorkspaceHref] = React.useState("/login");
  const setScope = usePolicyCraftScope((state) => state.setScope);
  const [signingOut, setSigningOut] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  const desktopCtaRef = React.useRef<HTMLAnchorElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const drawerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let active = true;
    if (!session) return () => { active = false; };
    void fetch("/api/policycraft/access", { cache: "no-store" }).then(async (response) => response.ok ? response.json() as Promise<PolicyCraftAccess> : null).then((access) => {
      if (active && access) setWorkspaceHref(access.homeHref);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session]);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      setScope(null);
      policyCraftBuilderStorage.clearScope();
      await signOut();
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  React.useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    const desktopCta = desktopCtaRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleDrawerKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !drawerRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !drawerRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDrawerKeyDown);
    return () => {
      document.removeEventListener("keydown", handleDrawerKeyDown);
      document.body.style.overflow = previousOverflow;
      if (menuButton?.getClientRects().length) menuButton.focus();
      else desktopCta?.focus();
    };
  }, [menuOpen]);

  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerAtDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeDrawerAtDesktop);
    return () => desktop.removeEventListener("change", closeDrawerAtDesktop);
  }, []);

  const workspaceLabel = session ? "Open workspace" : "Open builder";

  return (
    <main className={styles.page} id="main-content">
      <a className={styles.skipLink} href="#home-heading">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" onClick={closeMenu} className={styles.brand} aria-label="PolicyCraft home">
            <span className={styles.brandMark}><Leaf size={18} strokeWidth={2.2} aria-hidden="true" /></span>
            <span className={styles.brandText}>
              <span className={styles.brandName}>PolicyCraft</span>
              <span className={styles.brandDescriptor}>Sustainability Suite</span>
            </span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Main navigation">
            <a href="#how">How it works</a>
            <a href="#standards">Standards</a>
          </nav>

          <div className={styles.desktopActions}>
            <ApplicationThemeControl />
            <Link ref={desktopCtaRef} href={workspaceHref} className={styles.primaryNavLink}>
              {workspaceLabel}<ArrowRight size={15} aria-hidden="true" />
            </Link>
            {isPending ? (
              <span className={styles.sessionStatus} role="status"><Loader2 size={15} className={styles.statusIcon} aria-hidden="true" /><span>Checking login status</span></span>
            ) : session ? (
              <>
                <Link href={workspaceHref} className={styles.secondaryNavLink}><FileText size={14} aria-hidden="true" />Workspace</Link>
                <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className={styles.secondaryNavLink}>
                  <LogOut size={14} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
                </button>
              </>
            ) : (
              <Link href="/login" className={styles.secondaryNavLink}><LogIn size={14} aria-hidden="true" />Log in</Link>
            )}
          </div>

          <Link href={workspaceHref} className={styles.mobilePublicCta} aria-label="Start a new policy">
            <span>Start a policy</span><ArrowRight size={14} aria-hidden="true" />
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-controls="public-mobile-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
        </div>

        <div
          className={styles.mobileMenu}
          id="public-mobile-menu"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-menu-heading"
          hidden={!menuOpen}
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeMenu(); }}
        >
          <section className={styles.mobileDrawer}>
            <div className={styles.mobileDrawerHeader}>
              <h2 id="public-menu-heading">Menu</h2>
              <button ref={closeButtonRef} type="button" className={styles.drawerCloseButton} onClick={closeMenu} aria-label="Close menu">
                <X size={19} aria-hidden="true" />
              </button>
            </div>
            <nav className={styles.mobileNav} aria-label="Main navigation">
              <a href="#how" onClick={closeMenu}>How it works</a>
              <a href="#standards" onClick={closeMenu}>Standards</a>
            </nav>
            <div className={styles.mobileTheme}><ApplicationThemeControl /></div>
            <div className={styles.mobileActions}>
              {isPending ? (
                <span className={styles.sessionStatus} role="status"><Loader2 size={15} className={styles.statusIcon} aria-hidden="true" /><span>Checking login status</span></span>
              ) : session ? (
                <>
                  <Link href={workspaceHref} onClick={closeMenu} className={styles.secondaryNavLink}><FileText size={14} aria-hidden="true" />Workspace</Link>
                  <button type="button" onClick={() => { closeMenu(); void handleSignOut(); }} disabled={signingOut} className={styles.secondaryNavLink}>
                    <LogOut size={14} aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </>
              ) : (
                <Link href="/login" onClick={closeMenu} className={styles.secondaryNavLink}><LogIn size={14} aria-hidden="true" />Log in</Link>
              )}
            </div>
            <Link href={workspaceHref} onClick={closeMenu} className={styles.primaryNavLink}>
              {workspaceLabel}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="home-heading">
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}><span aria-hidden="true" />Sustainability policy builder</p>
            <h1 id="home-heading" tabIndex={-1}>Build a sustainability policy in under twenty minutes.</h1>
            <p className={styles.heroDescription}>
              A guided, AI-assisted workbench for environmental, labour and human-rights, and living-wage policies.
            </p>
            <div className={styles.heroActions}>
              <Link href={workspaceHref} className={styles.primaryCta}>Start a new policy<ArrowRight size={17} aria-hidden="true" /></Link>
              <a href="#how" className={styles.secondaryCta}>See how it works</a>
            </div>
            <p className={styles.heroFootnote}>Create, review, and export a policy that fits your organization.</p>
          </div>
          <div className={styles.heroVisual}><PolicyPreview /></div>
        </div>
      </section>

      <PublicWalkthrough />

      <section id="standards" className={styles.standards} aria-labelledby="standards-heading">
        <div className={styles.standardsInner}>
          <div className={styles.standardsCopy}>
            <h2 id="standards-heading">Frameworks your reviewers recognize.</h2>
            <p>Connect policy commitments with widely used sustainability and human-rights frameworks.</p>
          </div>
          <ul className={styles.frameworkList} aria-label="Supported frameworks">
            {FRAMEWORKS.map((framework) => <li key={framework}>{framework}</li>)}
          </ul>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-heading">
        <div className={styles.finalCtaIcon}><Award size={28} strokeWidth={1.7} aria-hidden="true" /></div>
        <h2 id="final-cta-heading">Ready when you are.</h2>
        <p>Open the builder or bring an existing policy. We’ll help with structure, writing, and export.</p>
        <Link href={workspaceHref} className={styles.primaryCta}>Open the builder<ArrowRight size={17} aria-hidden="true" /></Link>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span><ShieldCheck size={14} aria-hidden="true" />PolicyCraft · Sustainability Policy Builder</span>
          <a href="#main-content">Back to top<ArrowRight size={14} aria-hidden="true" /></a>
        </div>
      </footer>
    </main>
  );
}
