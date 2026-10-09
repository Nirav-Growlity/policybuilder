"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Lenis from "lenis";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { motion, useReducedMotion } from "motion/react";
import { signOut, useSession } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";
import { ApplicationUserMenu } from "@/components/ui/application-user-menu";
import { PublicWalkthrough } from "@/components/public/public-walkthrough";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Leaf,
  Loader2,
  LogIn,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";
import styles from "./page.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const FRAMEWORKS = ["GRI", "EcoVadis", "CDP", "BRSR", "CSRD", "UNGC", "ISO 14001", "ISO 26000", "SA8000", "TCFD", "SBTi"];

const POLICIES = [
  { number: "01", title: "Environmental", line: "Protect resources and improve performance", category: "PLANET", className: "environmentCover", photo: "/home/coastline.webp", artwork: "orbitMark" },
  { number: "02", title: "Labour &\nHuman Rights", line: "Fair conditions across the value chain", category: "PEOPLE", className: "peopleCover", photo: "/home/architecture.webp", artwork: "archMark" },
  { number: "03", title: "Living Wage", line: "Pay that reflects local living costs", category: "PAY", className: "wageCover", photo: "/home/workspace.webp", artwork: "columnMark" },
  { number: "04", title: "Ethics", line: "Integrity in every decision", category: "CONDUCT", className: "ethicsCover", photo: "/home/ethics.webp", artwork: "ethicsMark" },
  { number: "05", title: "Sustainable\nProcurement", line: "Responsible sourcing, end to end", category: "SUPPLY CHAIN", className: "procurementCover", photo: "/home/procurement.webp", artwork: "procurementMark" },
];

export default function Home() {
  const reduceMotion = useReducedMotion();
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
  const pageRef = React.useRef<HTMLElement>(null);
  const lenisRef = React.useRef<Lenis | null>(null);

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
    lenisRef.current?.stop();
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
      lenisRef.current?.start();
      if (menuButton?.getClientRects().length) menuButton.focus();
      else desktopCta?.focus();
    };
  }, [menuOpen]);

  React.useEffect(() => {
    if (reduceMotion || !pageRef.current) return;

    const lenis = new Lenis({
      autoRaf: false,
      anchors: true,
      lerp: 0.09,
      smoothWheel: true,
      syncTouch: false,
      prevent: (node) => Boolean(node.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper], [data-lenis-prevent]')),
    });
    lenisRef.current = lenis;
    if (menuOpen) lenis.stop();

    const updateScroll = (time: number) => lenis.raf(time * 1000);
    const unsubscribe = lenis.on("scroll", () => ScrollTrigger.update());
    gsap.ticker.add(updateScroll);

    return () => {
      gsap.ticker.remove(updateScroll);
      unsubscribe();
      lenis.destroy();
      if (lenisRef.current === lenis) lenisRef.current = null;
    };
  }, [menuOpen, reduceMotion]);

  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerAtDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeDrawerAtDesktop);
    return () => desktop.removeEventListener("change", closeDrawerAtDesktop);
  }, []);

  useGSAP(() => {
    const page = pageRef.current;
    if (!page) return;

    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      const intro = page.querySelectorAll<HTMLElement>("[data-home-intro]");
      const coast = page.querySelector<HTMLElement>("[data-coast-image]");
      const introTimeline = gsap.timeline();
      introTimeline.fromTo(intro, { autoAlpha: 0, y: 18 }, {
        autoAlpha: 1,
        y: 0,
        duration: 0.72,
        stagger: 0.09,
        ease: "power2.out",
        clearProps: "transform,opacity,visibility",
      });
      if (coast) introTimeline.fromTo(coast, { scale: 1.05 }, { scale: 1, duration: 1.1, ease: "power2.out" }, "<");

      page.querySelectorAll<HTMLElement>("[data-home-reveal]:not([data-home-cover-reveal])").forEach((element) => {
        gsap.fromTo(element, { autoAlpha: 0, y: 18 }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.6,
          ease: "power2.out",
          scrollTrigger: { trigger: element, start: "top 88%", once: true },
        });
      });

      const policyGrid = page.querySelector<HTMLElement>("[data-policy-grid]");
      const covers = page.querySelectorAll<HTMLElement>("[data-home-cover-reveal]");
      if (policyGrid && covers.length) {
        gsap.fromTo(covers, { autoAlpha: 0, y: 24, rotateX: 4 }, {
          autoAlpha: 1,
          y: 0,
          rotateX: 0,
          transformPerspective: 900,
          duration: 0.72,
          stagger: 0.13,
          ease: "power2.out",
          scrollTrigger: { trigger: policyGrid, start: "top 84%", once: true },
        });
      }

      page.querySelectorAll<HTMLElement>("[data-cover]").forEach((cover) => {
        const image = cover.querySelector<HTMLElement>("[data-cover-art]");
        if (!image) return;
        gsap.to(image, {
          yPercent: -7,
          ease: "none",
          scrollTrigger: { trigger: cover, start: "top bottom", end: "bottom top", scrub: 0.6 },
        });
      });

      const exportPaper = page.querySelector<HTMLElement>("[data-export-paper-depth]");
      if (exportPaper) {
        gsap.fromTo(exportPaper, { y: 22, rotateX: 1.5, rotateY: -1.5 }, {
          y: 0,
          rotateX: 0,
          rotateY: 0,
          ease: "none",
          scrollTrigger: { trigger: exportPaper, start: "top 88%", end: "center 45%", scrub: 0.7 },
        });
      }
    });

    return () => media.revert();
  }, { scope: pageRef });

  const workspaceLabel = session ? "Open workspace" : "Open builder";

  return (
    <main className={styles.page} id="main-content" ref={pageRef}>
      <a className={styles.skipLink} href="#home-heading">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" onClick={closeMenu} className={styles.brand}>
            <span className={styles.brandMark}><Leaf size={17} strokeWidth={1.8} aria-hidden="true" /></span>
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
            <Link ref={desktopCtaRef} href={workspaceHref} className={styles.primaryNavLink}>
              {workspaceLabel}<ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            {isPending ? (
              <span className={styles.sessionStatus} role="status"><Loader2 size={15} className={styles.statusIcon} aria-hidden="true" /><span>Checking login status</span></span>
            ) : session ? null : (
              <Link href="/login" className={styles.loginLink}><LogIn size={14} aria-hidden="true" />Log in</Link>
            )}
          </div>
          {!isPending && session && (
            <div className={styles.userMenu}>
              <ApplicationUserMenu
                user={{ name: session.user.name, email: session.user.email }}
                workspaceHref={workspaceHref}
                onSignOut={handleSignOut}
                signingOut={signingOut}
              />
            </div>
          )}

          <Link href={workspaceHref} className={styles.mobilePublicCta} aria-label="Start a policy">
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
            <div className={styles.mobileActions}>
              {isPending ? (
                <span className={styles.sessionStatus} role="status"><Loader2 size={15} className={styles.statusIcon} aria-hidden="true" /><span>Checking login status</span></span>
              ) : session ? null : (
                <Link href="/login" onClick={closeMenu} className={styles.loginLink}><LogIn size={14} aria-hidden="true" />Log in</Link>
              )}
            </div>
            <Link href={workspaceHref} onClick={closeMenu} className={styles.primaryNavLink}>
              {workspaceLabel}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="home-heading">
        <div className={styles.heroImage} aria-hidden="true">
          <Image src="/home/coastline.webp" alt="" fill priority sizes="100vw" className={styles.coastImage} data-coast-image />
        </div>
        <div className={styles.heroShade} aria-hidden="true" />
        <div className={styles.heroContent}>
          <p className={styles.heroEyebrow} data-home-intro>Sustainability, made actionable</p>
          <h1 id="home-heading" tabIndex={-1} data-home-intro>Good intentions.<br />Clear commitments.</h1>
          <p className={styles.heroDescription} data-home-intro>Build a policy your people can follow and your stakeholders can trust.</p>
          <div className={styles.heroActions} data-home-intro>
            <Link href={workspaceHref} className={styles.primaryCta}>Start a new policy<ArrowRight size={16} aria-hidden="true" /></Link>
            <a href="#how" className={styles.secondaryCta}>See how it works<ArrowDown size={14} aria-hidden="true" /></a>
          </div>
        </div>
        <figure className={styles.heroDocument} data-home-intro>
          <div className={styles.heroDocumentTop}><span>POLICYCRAFT&nbsp; / &nbsp;SAMPLE</span><span>01 / 08</span></div>
          <div className={styles.heroDocumentRule} />
          <p className={styles.heroDocumentKicker}>ENVIRONMENTAL POLICY</p>
          <h2>Responsible<br />by design.</h2>
          <p className={styles.heroDocumentIntro}>A clear framework for the choices we make, the resources we use, and the future we share.</p>
          <div className={styles.heroDocumentFoot}><span>Scope · Commitments · Review</span><span>2026</span></div>
        </figure>
      </section>

      <section id="collection" className={styles.collection} aria-labelledby="collection-heading">
        <div className={styles.collectionHeading} data-home-reveal>
          <h2 id="collection-heading">Choose the commitment<br />you’re ready to make.</h2>
          <p>Start with a practical foundation. Shape every policy around the realities of your organization.</p>
        </div>
        <div className={styles.policyGrid} data-policy-grid>
          {POLICIES.map((policy) => (
            <motion.article
              key={policy.number}
              className={styles.policyItem}
              data-cover
              variants={{ rest: { y: 0, rotateZ: 0 }, hover: { y: -7, rotateZ: -0.45 } }}
              initial="rest"
              whileHover={reduceMotion ? undefined : "hover"}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <div className={`${styles.policyCover} ${styles[policy.className]}`} data-home-cover-reveal>
                {policy.photo && <motion.div className={styles.coverPhoto} aria-hidden="true" variants={{ rest: { scale: 1 }, hover: { scale: 1.045 } }} transition={{ duration: 0.32, ease: "easeOut" }}><Image src={policy.photo} alt="" fill sizes="(max-width: 720px) 85vw, 34vw" data-cover-art /></motion.div>}
                <div className={styles.coverTop}><span>{policy.category}</span><span>PC&nbsp; / &nbsp;{policy.number}</span></div>
                {!policy.photo && (
                  <motion.div className={styles.coverArtwork} aria-hidden="true" variants={{ rest: { y: 0 }, hover: { y: -5 } }} transition={{ duration: 0.32, ease: "easeOut" }}>
                    <span className={styles.coverArtworkDepth} data-cover-art>
                      {policy.artwork === "ethicsMark" ? <span className={styles.ethicsMark}><i /><i /><i /></span> : <span className={styles.procurementMark}><i /><i /><i /><i /><i /></span>}
                    </span>
                  </motion.div>
                )}
                <div className={styles.coverBottom}>
                  <h3>{policy.title.split("\n").map((line, index) => <React.Fragment key={line}>{index > 0 && <br />}{line}</React.Fragment>)}</h3>
                  <p>{policy.line}</p>
                </div>
              </div>
              <div className={styles.policyMeta}><span>POLICY PROFILE&nbsp; / &nbsp;{policy.number} / 05</span></div>
            </motion.article>
          ))}
        </div>
      </section>

      <PublicWalkthrough />

      <section className={styles.exportStory} aria-labelledby="export-heading">
        <div className={styles.exportInner}>
          <div className={styles.exportCopy} data-home-reveal>
            <h2 id="export-heading">A policy worth putting your name on.</h2>
            <p>Review the complete document in context, then export a polished PDF or an editable Word file.</p>
            <ul className={styles.exportBenefits}>
              <li><Check size={15} aria-hidden="true" /> Readable structure and clear ownership</li>
              <li><Check size={15} aria-hidden="true" /> Built for review, revision, and use</li>
            </ul>
            <Link href={workspaceHref} className={styles.textLink}>See the policy builder<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className={styles.exportVisual} data-home-reveal role="img" aria-label="Sample policy prepared for PDF and Word export">
            <div className={styles.exportRail}><span>FINAL REVIEW</span><span>READY TO SHARE</span></div>
            <div className={styles.exportPaperMotion} data-export-paper-depth>
            <div className={styles.exportPaper}>
              <div className={styles.exportPaperTop}><span>POLICYCRAFT</span><span>ENVIRONMENT / 2026</span></div>
              <p className={styles.exportPaperKicker}>OUR COMMITMENT</p>
              <h3>Progress, with purpose.</h3>
              <p className={styles.exportPaperLead}>We will reduce our environmental impact through measured action, accountable ownership, and regular review.</p>
              <div className={styles.exportPaperColumns}>
                <div><span>01 / PRIORITY</span><b>Reduce operational emissions</b></div>
                <div><span>02 / OWNERSHIP</span><b>Reviewed by senior leadership</b></div>
              </div>
              <div className={styles.signatureLine}><span>APPROVED BY</span><i /><span>DIRECTOR</span></div>
            </div>
            </div>
            <div className={styles.exportFile}>PDF <span>Ready to share</span><Check size={15} aria-hidden="true" /></div>
            <div className={styles.exportFileWord}>Word <span>Ready to edit</span><Check size={15} aria-hidden="true" /></div>
          </div>
        </div>
      </section>

      <section id="standards" className={styles.standards} aria-labelledby="standards-heading">
        <div className={styles.standardsInner}>
          <div className={styles.standardsCopy} data-home-reveal>
            <h2 id="standards-heading">Grounded in standards. Written for your organization.</h2>
            <p>Connect your commitments to widely used sustainability and human-rights frameworks.</p>
          </div>
          <ul className={styles.frameworkList} aria-label="Supported frameworks" data-home-reveal>
            {FRAMEWORKS.map((framework) => <li key={framework}>{framework}</li>)}
          </ul>
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-cta-heading">
        <div className={styles.finalCtaInner} data-home-reveal>
          <ShieldCheck size={22} strokeWidth={1.6} aria-hidden="true" />
          <h2 id="final-cta-heading">Make the commitment<br />clear.</h2>
          <Link href={workspaceHref} className={styles.primaryCta}>Start a new policy<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerBrand}><span className={styles.brandMark}><Leaf size={15} aria-hidden="true" /></span>PolicyCraft</Link>
          <span className={styles.footerDescriptor}>Sustainability policy builder</span>
          <a href="#main-content">Back to top<ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
      </footer>
    </main>
  );
}
