"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ReactLenis, useLenis, type LenisRef } from "lenis/react";
import type { LenisOptions } from "lenis";
import "lenis/dist/lenis.css";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "@/components/react-bits/split-text";
import { Magnet } from "@/components/react-bits/magnet";
import { ScrollVelocity } from "@/components/react-bits/scroll-velocity";
import { AnimatePresence, animate, motion, type Variants } from "motion/react";
import { HomeLoginOverlay } from "@/components/auth/home-login-overlay";
import { signOut, useSession } from "@/lib/auth-client";
import type { PolicyCraftAccess } from "@/lib/policycraft-access-types";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage } from "@/lib/policycraft-builder-storage";
import { ApplicationUserMenu } from "@/components/ui/application-user-menu";
import { PublicWalkthrough } from "@/components/public/public-walkthrough";
import { PolicyPhotoMorph, type PolicyPhotoMorphHandle } from "@/components/public/policy-photo-morph";
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
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import styles from "./page.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);
// Mobile browsers resize the viewport as the address bar slides; re-measuring every pin then makes the page jump.
ScrollTrigger.config({ ignoreMobileResize: true });

// One page-wide Lenis instance, created once and driven by the GSAP ticker so smooth scroll and
// ScrollTrigger advance on the same frame. Kept at module level so the provider never rebuilds it.
const LENIS_OPTIONS: LenisOptions = {
  autoRaf: false,
  anchors: true,
  lerp: 0.085,
  wheelMultiplier: 0.95,
  smoothWheel: true,
  syncTouch: false,
  prevent: (node) => Boolean(node.closest('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper], [data-lenis-prevent]')),
};
const syncScrollTrigger = () => ScrollTrigger.update();

// Primary calls to action lean toward the pointer a few pixels, then spring back.
const CTA_MAGNET = { padding: 56, magnetStrength: 5, maxOffset: 9, spring: { stiffness: 210, damping: 20 } } as const;

const FRAMEWORKS = ["GRI", "EcoVadis", "CDP", "BRSR", "CSRD", "UNGC", "ISO 14001", "ISO 26000", "SA8000", "TCFD", "SBTi"];
// The standards strip shows the frameworks as two rows drifting in opposite directions.
const FRAMEWORK_ROWS = [FRAMEWORKS.slice(0, 6), FRAMEWORKS.slice(6)];

const POLICIES = [
  {
    id: "environmental",
    title: "Environmental",
    summary: "Cut emissions, use resources well and stay ready for climate risk.",
    covers: ["Energy and greenhouse gas emissions", "Water and biodiversity", "Waste and circular materials", "Climate risk preparedness"],
    standards: ["GRI", "ISO 14001", "UN SDGs"],
    photo: "/home/coastline.webp",
  },
  {
    id: "labour-human-rights",
    title: "Labour & human rights",
    summary: "Safe, fair and dignified work for everyone in your value chain.",
    covers: ["Health and safety at work", "Fair hours, pay and benefits", "No child or forced labour", "Inclusion and grievance channels"],
    standards: ["UNGC", "ILO", "SA8000", "ISO 45001"],
    photo: "/home/architecture.webp",
  },
  {
    id: "living-wage",
    title: "Living wage",
    summary: "Pay that covers what it really costs to live where your people work.",
    covers: ["Living-wage benchmark and method", "Benefits and total pay", "Pay equity and transparency", "Regular cost-of-living review"],
    standards: ["ILO", "UNGC", "SA8000", "EcoVadis"],
    photo: "/home/workspace.webp",
  },
  {
    id: "ethics",
    title: "Ethics",
    summary: "Clear rules for honest business, and a safe way to speak up.",
    covers: ["Anti-bribery and corruption", "Conflicts of interest", "Gifts and hospitality", "Whistleblowing"],
    standards: ["ISO 37001", "UNGC", "BRSR"],
    photo: "/home/ethics.webp",
  },
  {
    id: "sustainable-procurement",
    title: "Sustainable procurement",
    summary: "Hold your suppliers to the standards you hold yourself.",
    covers: ["Supplier code of conduct", "Due diligence and risk checks", "Supply chain traceability", "Supplier audits and improvement"],
    standards: ["ISO 20400", "EcoVadis", "UNGC"],
    photo: "/home/procurement.webp",
  },
];

// Share of a screen height the reader scrolls to move from one pinned policy to the next.
const POLICY_SCROLL_PER_STEP = 0.38;
// Extra hold, in steps, on the first and last policy so the pin does not start or end mid-change.
const POLICY_SCROLL_LEAD = 0.3;
const POLICY_STEPS = POLICIES.length - 1;
const POLICY_PHOTOS = POLICIES.map((policy) => policy.photo);

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const EASE_IN_OUT = [0.76, 0, 0.24, 1] as const;

// The incoming photo fades in over the outgoing one while it drifts into place and comes into focus.
// The outgoing photo stays fully visible underneath until it is covered, so the frame never flashes empty.
const PHOTO_FADE: Variants = {
  enter: { opacity: 0, zIndex: 2 },
  center: { opacity: 1, zIndex: 2, transition: { duration: 0.75, ease: "easeOut", zIndex: { duration: 0 } } },
  exit: { zIndex: 1, transition: { zIndex: { duration: 0 } } },
};

const PHOTO_DEPTH: Variants = {
  enter: (direction: number) => ({ scale: 1.06, y: direction > 0 ? "2%" : "-2%", filter: "blur(10px)" }),
  center: { scale: 1, y: "0%", filter: "blur(0px)", transition: { duration: 1.1, ease: EASE_OUT_EXPO } },
  exit: (direction: number) => ({ scale: 1.03, y: direction > 0 ? "-1.5%" : "1.5%", transition: { duration: 0.8, ease: EASE_IN_OUT } }),
};

const DETAIL_GROUP: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.18 } },
  exit: { opacity: 0, y: -12, filter: "blur(4px)", transition: { duration: 0.22, ease: "easeIn" } },
};

const SUMMARY_WORD: Variants = {
  hidden: { y: "110%" },
  show: { y: "0%", transition: { duration: 0.7, ease: EASE_OUT_EXPO } },
};

const DETAIL_ITEM: Variants = {
  hidden: { opacity: 0, y: 14, filter: "blur(6px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.55, ease: EASE_OUT_EXPO } },
};

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
  const pageRef = React.useRef<HTMLElement>(null);
  const lenisRef = React.useRef<LenisRef>(null);
  const docRef = React.useRef<HTMLElement>(null);
  const [loginPhase, setLoginPhase] = React.useState<"closed" | "open" | "closing">("closed");
  const loginActive = loginPhase !== "closed";
  const loginUsedRef = React.useRef(false);
  const [{ index: activePolicy, direction: policyDirection }, setPolicyState] = React.useState({ index: 0, direction: 1 });
  const policyTabRefs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const policyTriggerRef = React.useRef<ScrollTrigger | null>(null);
  const policyMorphRef = React.useRef<PolicyPhotoMorphHandle>(null);
  const policyPositionRef = React.useRef(0);
  const [policyScrolly, setPolicyScrolly] = React.useState(false);
  const [policyMorphReady, setPolicyMorphReady] = React.useState(false);
  const activePolicyData = POLICIES[activePolicy];

  // Direction decides which way the next photo wipes in.
  const selectPolicy = React.useCallback((index: number) => {
    setPolicyState((state) => state.index === index ? state : { index, direction: index > state.index ? 1 : -1 });
  }, []);

  // While the showcase is pinned, scroll position owns the selection, so choosing a policy scrolls to its stretch.
  function goToPolicy(index: number) {
    const trigger = policyTriggerRef.current;
    if (!trigger) {
      selectPolicy(index);
      return;
    }
    const progress = (index + POLICY_SCROLL_LEAD) / (POLICY_STEPS + POLICY_SCROLL_LEAD * 2);
    const target = trigger.start + progress * (trigger.end - trigger.start);
    const lenis = lenisRef.current?.lenis;
    if (lenis) lenis.scrollTo(target, { duration: 1.1 });
    else window.scrollTo({ top: target });
  }

  // Arrow keys move between policies, as in any vertical tab list.
  function handlePolicyKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const last = POLICIES.length - 1;
    const next = { ArrowDown: activePolicy === last ? 0 : activePolicy + 1, ArrowUp: activePolicy === 0 ? last : activePolicy - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    goToPolicy(next);
    policyTabRefs.current[next]?.focus();
  }

  // Closing goes through history so the Back button and the Close control agree.
  const requestCloseLogin = React.useCallback(() => {
    if (window.location.pathname === "/login") window.history.back();
    else setLoginPhase((phase) => (phase === "open" ? "closing" : phase));
  }, []);
  const finishCloseLogin = React.useCallback(() => setLoginPhase("closed"), []);

  React.useEffect(() => {
    function onPopState() {
      if (window.location.pathname === "/login") setLoginPhase((phase) => (phase === "closed" ? "open" : phase));
      else setLoginPhase((phase) => (phase === "open" ? "closing" : phase));
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // The hero copy gives way to the sheet and returns once it has settled back.
  React.useEffect(() => {
    const copy = pageRef.current?.querySelectorAll<HTMLElement>("[data-home-intro]");
    if (!copy?.length) return;
    if (loginPhase === "open") void animate(copy, { opacity: 0 }, { duration: 0.25, ease: "easeOut" });
    else if (loginPhase === "closing") void animate(copy, { opacity: 1 }, { duration: 0.3, delay: 0.35, ease: "easeOut" });
    else if (loginUsedRef.current) copy.forEach((element) => { element.style.opacity = ""; });
    if (loginPhase !== "closed") loginUsedRef.current = true;
  }, [loginPhase]);

  React.useEffect(() => {
    if (!loginActive) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    lenisRef.current?.lenis?.stop();
    return () => {
      document.body.style.overflow = previousOverflow;
      // The Lenis provider lives as long as the page, so the ref still holds the same instance here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      lenisRef.current?.lenis?.start();
    };
  }, [loginActive]);

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

  // Sign-in opens over the hero in place; the URL follows so links, reloads and Back keep working.
  function openLogin(event: React.MouseEvent<HTMLAnchorElement>) {
    closeMenu();
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (loginActive) return;
    lenisRef.current?.lenis?.scrollTo(0, { immediate: true });
    window.scrollTo(0, 0);
    window.history.pushState(null, "", "/login");
    setLoginPhase("open");
  }

  function openWorkspace(event: React.MouseEvent<HTMLAnchorElement>) {
    if (workspaceHref === "/login") openLogin(event);
    else closeMenu();
  }

  React.useEffect(() => {
    if (!menuOpen) return;

    const previousOverflow = document.body.style.overflow;
    const menuButton = menuButtonRef.current;
    const desktopCta = desktopCtaRef.current;
    const lenis = lenisRef.current?.lenis;
    document.body.style.overflow = "hidden";
    lenis?.stop();
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
      lenis?.start();
      if (menuButton?.getClientRects().length) menuButton.focus();
      else desktopCta?.focus();
    };
  }, [menuOpen]);

  // GSAP's ticker drives Lenis. Lag smoothing is off so a slow frame never makes scroll and pinned scenes disagree.
  React.useEffect(() => {
    const updateScroll = (time: number) => lenisRef.current?.lenis?.raf(time * 1000);
    gsap.ticker.add(updateScroll);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(updateScroll);
      gsap.ticker.lagSmoothing(500, 33);
    };
  }, []);
  useLenis(syncScrollTrigger);

  React.useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeDrawerAtDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener("change", closeDrawerAtDesktop);
    return () => desktop.removeEventListener("change", closeDrawerAtDesktop);
  }, []);

  useGSAP(() => {
    const page = pageRef.current;
    if (!page) return;

    // The headline animates word by word on its own (SplitText), so the intro skips it.
    const intro = page.querySelectorAll<HTMLElement>("[data-home-intro]:not(h1)");
    const coast = page.querySelector<HTMLElement>("[data-coast-image]");
    const introTimeline = gsap.timeline();
    introTimeline.fromTo(intro, { autoAlpha: 0, y: 22 }, {
      autoAlpha: 1,
      y: 0,
      duration: 1,
      stagger: 0.1,
      ease: "expo.out",
      clearProps: "transform,opacity,visibility",
    });
    // The coastline rises into place and fades up from behind the headline.
    if (coast) introTimeline.fromTo(coast, { autoAlpha: 0, yPercent: 5, scale: 1.06 }, { autoAlpha: 1, yPercent: 0, scale: 1, duration: 2, ease: "expo.out" }, 0);

    // Blocks that enter together rise together with a short stagger, rather than each on its own trigger.
    const reveals = gsap.utils.toArray<HTMLElement>("[data-home-reveal]", page);
    gsap.set(reveals, { autoAlpha: 0, y: 28 });
    ScrollTrigger.batch(reveals, {
      start: "top 90%",
      once: true,
      onEnter: (batch) => gsap.to(batch, {
        autoAlpha: 1,
        y: 0,
        duration: 1.05,
        stagger: 0.1,
        ease: "expo.out",
        overwrite: true,
        clearProps: "transform",
      }),
    });

    // Each band names its tone in CSS (--home-tone). The page eases to the tone of whichever band crosses the middle
    // of the screen, so neighbouring bands blend instead of meeting at a hard edge. Tones are read live, so a theme
    // switch picks up the dark values.
    const toneSections = gsap.utils.toArray<HTMLElement>("[data-home-tone]", page);
    let toneSection: HTMLElement | null = null;
    const applyTone = (section: HTMLElement, immediate = false) => {
      toneSection = section;
      const tone = getComputedStyle(section).getPropertyValue("--home-tone").trim();
      if (!tone) return;
      if (immediate) gsap.set(page, { backgroundColor: tone, overwrite: true });
      else gsap.to(page, { backgroundColor: tone, duration: 0.9, ease: "power2.out", overwrite: true });
    };
    if (toneSections.length) {
      page.dataset.toneShift = "true";
      applyTone(toneSections[0], true);
      toneSections.forEach((section) => ScrollTrigger.create({
        trigger: section,
        start: "top 55%",
        end: "bottom 55%",
        onToggle: (self) => { if (self.isActive) applyTone(section); },
      }));
    }
    const themeObserver = new MutationObserver(() => { if (toneSection) applyTone(toneSection, true); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-pc-theme"] });

    // Leaving the hero, the headline drifts up and recedes while the shade behind it lifts, so the coastline
    // brightens and opens up as it sinks and grows. The photo lags behind the page, so it slides on into the next
    // section instead of stopping at the hero's edge. A longer scrub lets every part ease to a stop together.
    const hero = page.querySelector<HTMLElement>("[data-hero]");
    const heroImage = page.querySelector<HTMLElement>("[data-hero-image]");
    const heroShade = page.querySelector<HTMLElement>("[data-hero-shade]");
    const heroContent = page.querySelector<HTMLElement>("[data-hero-content]");
    if (hero && heroImage && heroShade && heroContent) {
      gsap.timeline({ scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: 1 } })
        .fromTo(heroImage, { yPercent: 0, scale: 1 }, { yPercent: 18, scale: 1.12, ease: "none" }, 0)
        .fromTo(heroShade, { autoAlpha: 1 }, { autoAlpha: 0.15, ease: "power1.out" }, 0)
        .fromTo(heroContent, { y: 0, scale: 1, autoAlpha: 1 }, { y: -120, scale: 0.96, autoAlpha: 0, ease: "power2.in" }, 0);
    }

    // The sample policy puts itself together as it scrolls in: the sheet settles flat, its parts arrive in reading
    // order, the approval line draws, and the two finished files slide out last.
    const exportVisual = page.querySelector<HTMLElement>("[data-export-visual]");
    const exportPaper = page.querySelector<HTMLElement>("[data-export-paper-depth]");
    if (exportVisual && exportPaper) {
      const part = (selector: string) => exportVisual.querySelectorAll<HTMLElement>(selector);
      gsap.timeline({ scrollTrigger: { trigger: exportVisual, start: "top 88%", end: "center 52%", scrub: 0.8 }, defaults: { ease: "power2.out" } })
        .fromTo(exportPaper, { y: 70, rotateX: 5, rotateY: -3 }, { y: 0, rotateX: 0, rotateY: 0, duration: 1, ease: "none" }, 0)
        .from(part("[data-export-rail] > span"), { autoAlpha: 0, y: 8, stagger: 0.08, duration: 0.25 }, 0.04)
        .from(part("[data-export-part='top']"), { autoAlpha: 0, duration: 0.2 }, 0.1)
        .from(part("[data-export-part='kicker']"), { autoAlpha: 0, y: 10, duration: 0.2 }, 0.18)
        .from(part("[data-export-part='title']"), { autoAlpha: 0, y: 18, duration: 0.26 }, 0.24)
        .from(part("[data-export-part='lead']"), { autoAlpha: 0, y: 12, duration: 0.24 }, 0.33)
        .from(part("[data-export-part='columns'] > div"), { autoAlpha: 0, y: 12, stagger: 0.08, duration: 0.22 }, 0.43)
        .from(part("[data-export-part='signature'] > span"), { autoAlpha: 0, stagger: 0.1, duration: 0.18 }, 0.58)
        .fromTo(part("[data-export-part='signature'] > i"), { scaleX: 0 }, { scaleX: 1, transformOrigin: "left center", duration: 0.3 }, 0.6)
        .from(part("[data-export-file='pdf']"), { autoAlpha: 0, x: -56, scale: 0.94, duration: 0.24 }, 0.74)
        .from(part("[data-export-file='word']"), { autoAlpha: 0, x: 56, scale: 0.94, duration: 0.24 }, 0.8);
    }

    const media = gsap.matchMedia();

    // On wide screens the showcase holds still and scrolling walks through the policies one by one.
    media.add("(min-width: 1024px)", () => {
      const showcase = page.querySelector<HTMLElement>("[data-policy-showcase]");
      const frame = page.querySelector<HTMLElement>("[data-policy-frame]");
      if (!showcase || !frame) return;
      const tabs = policyTabRefs.current.filter((tab): tab is HTMLButtonElement => Boolean(tab));
      const pinOffset = () => Math.max(24, (window.innerHeight - showcase.offsetHeight) / 2);
      showcase.dataset.scrolly = "true";
      setPolicyScrolly(true);

      // One settled entrance as the showcase arrives, rather than an effect tied to every pixel of scroll.
      gsap.timeline({ scrollTrigger: { trigger: showcase, start: "top 78%", once: true, refreshPriority: 1 } })
        .fromTo(frame, { autoAlpha: 0, y: 40, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 1.1, ease: "expo.out", clearProps: "transform" })
        .fromTo(tabs, { autoAlpha: 0, x: -16 }, { autoAlpha: 1, x: 0, duration: 0.7, stagger: 0.06, ease: "power3.out", clearProps: "transform" }, "<0.1");

      policyTriggerRef.current = ScrollTrigger.create({
        trigger: showcase,
        start: () => `top top+=${pinOffset()}`,
        end: () => `+=${window.innerHeight * POLICY_SCROLL_PER_STEP * (POLICY_STEPS + POLICY_SCROLL_LEAD * 2)}`,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        // The walkthrough below registers its own pin first (child effects run before ours), so this pin must be
        // measured first; otherwise everything below ignores its added scroll distance and the two pins overlap.
        refreshPriority: 1,
        // Scroll drives the photo morph frame by frame; the copy switches as the morph passes its midpoint.
        onUpdate: (self) => {
          const position = gsap.utils.clamp(0, POLICY_STEPS, self.progress * (POLICY_STEPS + POLICY_SCROLL_LEAD * 2) - POLICY_SCROLL_LEAD);
          policyPositionRef.current = position;
          policyMorphRef.current?.setPosition(position);
          tabs.forEach((tab, index) => tab.style.setProperty("--policy-fill", String(gsap.utils.clamp(0, 1, position - index))));
          selectPolicy(Math.round(position));
        },
      });
      ScrollTrigger.sort();
      ScrollTrigger.refresh();

      return () => {
        policyTriggerRef.current = null;
        delete showcase.dataset.scrolly;
        setPolicyScrolly(false);
        setPolicyMorphReady(false);
        tabs.forEach((tab) => tab.style.removeProperty("--policy-fill"));
      };
    });

    return () => {
      media.revert();
      themeObserver.disconnect();
      delete page.dataset.toneShift;
      gsap.set(page, { clearProps: "backgroundColor" });
    };
  }, { scope: pageRef });

  const workspaceLabel = session ? "Open workspace" : "Open builder";

  return (
    <main className={styles.page} id="main-content" ref={pageRef}>
      <ReactLenis root options={LENIS_OPTIONS} ref={lenisRef} />
      {signingOut ? <AppTransitionScreen overlay title="Signing you out" detail="Closing your session securely." /> : null}
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
            <Link ref={desktopCtaRef} href={workspaceHref} onClick={openWorkspace} className={styles.primaryNavLink}>
              {workspaceLabel}<ArrowUpRight size={15} aria-hidden="true" />
            </Link>
            {isPending ? (
              <span className={styles.sessionStatus} role="status"><Loader2 size={15} className={styles.statusIcon} aria-hidden="true" /><span>Checking login status</span></span>
            ) : session ? null : (
              <Link href="/login" onClick={openLogin} className={styles.loginLink}><LogIn size={14} aria-hidden="true" />Log in</Link>
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
                <Link href="/login" onClick={openLogin} className={styles.loginLink}><LogIn size={14} aria-hidden="true" />Log in</Link>
              )}
            </div>
            <Link href={workspaceHref} onClick={closeMenu} className={styles.primaryNavLink}>
              {workspaceLabel}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          </section>
        </div>
      </header>

      <section className={styles.hero} data-hero data-home-tone aria-labelledby="home-heading">
        <div className={styles.heroImage} aria-hidden="true">
          {/* The photo moves inside the mask, so its soft edges stay put while it drifts. */}
          <div className={styles.heroImageInner} data-hero-image>
            <Image src="/home/coastline.webp" alt="" fill priority sizes="100vw" className={styles.coastImage} data-coast-image />
          </div>
        </div>
        <div className={styles.heroShade} data-hero-shade aria-hidden="true" />
        <div className={styles.heroContent} data-hero-content inert={loginActive}>
          <p className={styles.heroEyebrow} data-home-intro>Sustainability, made actionable</p>
          <SplitText tag="h1" id="home-heading" tabIndex={-1} data-home-intro trigger="load" text={"Good intentions.\nClear commitments."} startDelay={0.08} delay={65} duration={1.15} ease="expo.out" />
          <p className={styles.heroDescription} data-home-intro>Build a policy your people can follow and your stakeholders can trust.</p>
          <div className={styles.heroActions} data-home-intro>
            <Magnet {...CTA_MAGNET}><Link href={workspaceHref} onClick={openWorkspace} className={styles.primaryCta}>Start a new policy<ArrowRight size={16} aria-hidden="true" /></Link></Magnet>
            <a href="#how" className={styles.secondaryCta}>See how it works<ArrowDown size={14} aria-hidden="true" /></a>
          </div>
        </div>
        <figure className={styles.heroDocument} ref={docRef} data-home-intro inert={loginActive}>
          <p className={styles.heroDocumentKicker}>Environmental policy</p>
          <h2>Responsible<br />by design.</h2>
          <p className={styles.heroDocumentIntro}>A clear framework for the choices we make, the resources we use, and the future we share.</p>
        </figure>
        {loginActive ? (
          <React.Suspense fallback={null}>
            <HomeLoginOverlay docRef={docRef} phase={loginPhase === "closing" ? "closing" : "open"} onRequestClose={requestCloseLogin} onClosed={finishCloseLogin} />
          </React.Suspense>
        ) : null}
      </section>

      <section id="collection" className={styles.collection} data-home-tone aria-labelledby="collection-heading">
        <div className={styles.showcase} data-policy-showcase>
          {/* The title sits inside the pinned showcase, above the list, so it stays in view while the policies change. */}
          <div className={styles.showcaseAside}>
          <div className={styles.collectionHeading} data-home-reveal>
            <SplitText tag="h2" id="collection-heading" text="Five policies, one builder." />
            <p>Each one starts from what your stakeholders expect it to cover. You shape the rest around how your organization works.</p>
          </div>
          <div className={styles.policyTabs} role="tablist" aria-label="Policies" aria-orientation="vertical" onKeyDown={handlePolicyKeyDown}>
            {POLICIES.map((policy, index) => {
              const selected = index === activePolicy;
              return (
                <button
                  key={policy.id}
                  ref={(element) => { policyTabRefs.current[index] = element; }}
                  type="button"
                  role="tab"
                  id={`policy-tab-${policy.id}`}
                  aria-selected={selected}
                  aria-controls="policy-panel"
                  tabIndex={selected ? 0 : -1}
                  className={styles.policyTab}
                  onClick={() => goToPolicy(index)}
                >
                  {selected ? <motion.span layoutId="policy-marker" className={styles.policyMarker} transition={{ type: "spring", stiffness: 420, damping: 34 }} aria-hidden="true" /> : null}
                  {policy.title}
                </button>
              );
            })}
          </div>
          </div>
          <div className={styles.policyPanel} role="tabpanel" id="policy-panel" aria-labelledby={`policy-tab-${activePolicyData.id}`}>
            <div className={styles.policyPhoto} data-policy-frame aria-hidden="true">
              <div className={styles.policyPreload}>
                {POLICIES.map((policy) => <Image key={policy.id} src={policy.photo} alt="" fill sizes="(max-width: 720px) 100vw, 58vw" loading="eager" />)}
              </div>
              {policyScrolly ? (
                <PolicyPhotoMorph
                  ref={policyMorphRef}
                  photos={POLICY_PHOTOS}
                  className={`${styles.policyMorph} ${policyMorphReady ? styles.policyMorphReady : ""}`}
                  onReadyChange={(ready) => {
                    setPolicyMorphReady(ready);
                    if (ready) policyMorphRef.current?.setPosition(policyPositionRef.current);
                  }}
                />
              ) : null}
              <AnimatePresence initial={false} custom={policyDirection}>
                <motion.div key={activePolicyData.id} className={styles.policyPhotoLayer} custom={policyDirection} variants={PHOTO_FADE} initial="enter" animate="center" exit="exit">
                  <motion.div className={styles.policyPhotoLayer} custom={policyDirection} variants={PHOTO_DEPTH}>
                    <Image src={activePolicyData.photo} alt="" fill sizes="(max-width: 720px) 100vw, 58vw" />
                  </motion.div>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className={styles.policyDetailStage}>
              <AnimatePresence initial={false}>
                <motion.div key={activePolicyData.id} className={styles.policyDetail} variants={DETAIL_GROUP} initial="hidden" animate="show" exit="exit">
                  <p className={styles.policySummary}>
                    {activePolicyData.summary.split(" ").map((word, index) => (
                      <React.Fragment key={`${word}-${index}`}>{index > 0 ? " " : null}<span className={styles.summaryWord}><motion.span variants={SUMMARY_WORD}>{word}</motion.span></span></React.Fragment>
                    ))}
                  </p>
                  <div className={styles.policyFacts}>
                    <div>
                      <motion.h3 variants={DETAIL_ITEM}>What it covers</motion.h3>
                      <ul>{activePolicyData.covers.map((item) => <motion.li key={item} variants={DETAIL_ITEM}>{item}</motion.li>)}</ul>
                    </div>
                    <div>
                      <motion.h3 variants={DETAIL_ITEM}>Aligned with</motion.h3>
                      <ul className={styles.policyStandards}>{activePolicyData.standards.map((item) => <motion.li key={item} variants={DETAIL_ITEM}>{item}</motion.li>)}</ul>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      <PublicWalkthrough />

      <section className={styles.exportStory} data-home-tone aria-labelledby="export-heading">
        <div className={styles.exportInner}>
          <div className={styles.exportCopy} data-home-reveal>
            <SplitText tag="h2" id="export-heading" text="A policy worth putting your name on." />
            <p>Review the complete document in context, then export a polished PDF or an editable Word file.</p>
            <ul className={styles.exportBenefits}>
              <li><Check size={15} aria-hidden="true" /> Readable structure and clear ownership</li>
              <li><Check size={15} aria-hidden="true" /> Built for review, revision, and use</li>
            </ul>
            <Link href={workspaceHref} className={styles.textLink}>See the policy builder<ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className={styles.exportVisual} data-export-visual role="img" aria-label="Sample policy prepared for PDF and Word export">
            <div className={styles.exportRail} data-export-rail><span>FINAL REVIEW</span><span>READY TO SHARE</span></div>
            <div className={styles.exportPaperMotion} data-export-paper-depth>
            <div className={styles.exportPaper}>
              <div className={styles.exportPaperTop} data-export-part="top"><span>POLICYCRAFT</span><span>ENVIRONMENT / 2026</span></div>
              <p className={styles.exportPaperKicker} data-export-part="kicker">OUR COMMITMENT</p>
              <h3 data-export-part="title">Progress, with purpose.</h3>
              <p className={styles.exportPaperLead} data-export-part="lead">We will reduce our environmental impact through measured action, accountable ownership, and regular review.</p>
              <div className={styles.exportPaperColumns} data-export-part="columns">
                <div><span>01 / PRIORITY</span><b>Reduce operational emissions</b></div>
                <div><span>02 / OWNERSHIP</span><b>Reviewed by senior leadership</b></div>
              </div>
              <div className={styles.signatureLine} data-export-part="signature"><span>APPROVED BY</span><i /><span>DIRECTOR</span></div>
            </div>
            </div>
            <div className={styles.exportFile} data-export-file="pdf">PDF <span>Ready to share</span><Check size={15} aria-hidden="true" /></div>
            <div className={styles.exportFileWord} data-export-file="word">Word <span>Ready to edit</span><Check size={15} aria-hidden="true" /></div>
          </div>
        </div>
      </section>

      <section id="standards" className={styles.standards} data-home-tone aria-labelledby="standards-heading">
        <div className={styles.standardsInner}>
          <div className={styles.standardsCopy} data-home-reveal>
            <SplitText tag="h2" id="standards-heading" text="Grounded in standards. Written for your organization." />
            <p>Connect your commitments to widely used sustainability and human-rights frameworks.</p>
          </div>
          <div className={styles.frameworkStrip} data-home-reveal>
            <ul className={styles.visuallyHidden} aria-label="Supported frameworks">
              {FRAMEWORKS.map((framework) => <li key={framework}>{framework}</li>)}
            </ul>
            <ScrollVelocity
              texts={FRAMEWORK_ROWS.map((row) => row.map((framework) => <span key={framework} className={styles.frameworkName}>{framework}</span>))}
              velocity={34}
              numCopies={4}
              velocityMapping={{ input: [0, 1000], output: [0, 3] }}
              fadeEdges
              rowClassName={styles.frameworkRow}
            />
          </div>
        </div>
      </section>

      <section className={styles.finalCta} data-home-tone aria-labelledby="final-cta-heading">
        <div className={styles.finalCtaInner} data-home-reveal>
          <ShieldCheck size={22} strokeWidth={1.6} aria-hidden="true" />
          <SplitText tag="h2" id="final-cta-heading" text={"Make the commitment\nclear."} />
          <Magnet {...CTA_MAGNET}><Link href={workspaceHref} className={styles.primaryCta}>Start a new policy<ArrowRight size={16} aria-hidden="true" /></Link></Magnet>
        </div>
      </section>

      <footer className={styles.footer} data-home-tone>
        <div className={styles.footerInner}>
          <Link href="/" className={styles.footerBrand}><span className={styles.brandMark}><Leaf size={15} aria-hidden="true" /></span>PolicyCraft</Link>
          <span className={styles.footerDescriptor}>Sustainability policy builder</span>
          <a href="#main-content">Back to top<ArrowUpRight size={14} aria-hidden="true" /></a>
        </div>
      </footer>
    </main>
  );
}
