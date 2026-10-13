"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring, useTransform, type HTMLMotionProps, type Transition } from "motion/react";
import NumberFlow from "@number-flow/react";
import { clsx } from "clsx";
import styles from "./workspace-ui.module.css";

/** One easing curve for the whole workspace: a long exponential settle. */
export const WS_EASE = [0.16, 1, 0.3, 1] as const;
export const WS_SPRING: Transition = { type: "spring", stiffness: 520, damping: 40, mass: 0.7 };

/*
 * Smoothness rule for every entrance in the workspace: animate only `opacity`
 * and a whole `transform` string. Motion hands those to the browser's
 * compositor (Web Animations API), so they stay fluid while React is still
 * rendering the page or covers are mounting. Animating `x`/`y`/`filter`
 * shorthands runs on the main thread and is what made entrances stutter.
 */
const lift = (distance: number) => `translate3d(0, ${distance}px, 0)`;

/**
 * Identifies the current page visit (the shell bumps it on every route
 * change). Entrances play once per visit: if a page swaps its loading screen
 * for the real view, the hero and sheet that mount the second time appear
 * already settled instead of animating in again.
 */
export const WorkspaceVisitContext = React.createContext("initial");
const playedEntrances = new Set<string>();

function useEntranceOnce(slot: string) {
  const reduced = useReducedMotion();
  const key = `${React.useContext(WorkspaceVisitContext)}:${slot}`;
  const [play] = React.useState(() => !playedEntrances.has(key));
  React.useEffect(() => {
    playedEntrances.add(key);
    if (playedEntrances.size > 64) playedEntrances.delete(playedEntrances.values().next().value!);
  }, [key]);
  return play && !reduced;
}
const SETTLED = "translate3d(0, 0px, 0)";

/** `null` holds the stat at zero until data arrives, then it rolls up to the value. */
type HeroStat = { label: string; value: number | string | null };

/**
 * Full-bleed masthead that continues the sticky navigation band. Pages put
 * their title, context and primary actions here, then lay a WorkspaceSheet
 * over its lower edge.
 */
export function WorkspaceHero({
  titleId,
  eyebrow,
  eyebrowIcon,
  title,
  description,
  actions,
  stats,
  children,
  className,
}: {
  titleId?: string;
  eyebrow?: React.ReactNode;
  eyebrowIcon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: HeroStat[];
  children?: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const entrance = useEntranceOnce("hero");
  const heroRef = React.useRef<HTMLElement>(null);
  const spotRef = React.useRef<HTMLSpanElement>(null);
  const { scrollY } = useScroll();
  // A gentle parallax: the hero copy settles back as the sheet scrolls over it.
  const drift = useTransform(scrollY, [0, 320], [0, reduced ? 0 : -28]);
  const words = title.split(/\s+/).filter(Boolean);

  const rise = (delay: number) => entrance ? {
    initial: { opacity: 0, transform: lift(14) },
    animate: { opacity: 1, transform: SETTLED },
    transition: { duration: 0.9, ease: WS_EASE, delay },
  } : {};

  // The backdrop light follows the pointer, eased by CSS so it trails softly.
  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduced || event.pointerType !== "mouse" || !heroRef.current || !spotRef.current) return;
    const bounds = heroRef.current.getBoundingClientRect();
    spotRef.current.style.transform = `translate3d(${event.clientX - bounds.left}px, ${event.clientY - bounds.top}px, 0)`;
  };

  return (
    <section ref={heroRef} className={clsx(styles.hero, className)} onPointerMove={handlePointerMove} aria-labelledby={titleId}>
      <div className={styles.heroBackdrop} aria-hidden="true"><span className={styles.heroRules} /><span ref={spotRef} className={styles.heroSpot} /></div>
      <motion.div className={styles.heroInner} style={{ y: drift }}>
        <div className={styles.heroText}>
          {eyebrow ? (
            <motion.p className={styles.heroEyebrow} {...rise(0)}>
              {eyebrowIcon ? <span className={styles.heroEyebrowIcon} aria-hidden="true">{eyebrowIcon}</span> : <span className={styles.heroEyebrowDot} aria-hidden="true" />}
              {eyebrow}
            </motion.p>
          ) : null}
          <h1 id={titleId} className={styles.heroTitle}>
            {/* Each word slides up out of its own mask. */}
            {entrance ? words.map((word, index) => (
              <React.Fragment key={`${word}-${index}`}>
                <span className={styles.heroWordMask}>
                  <motion.span
                    className={styles.heroWord}
                    initial={{ transform: "translate3d(0, 108%, 0)" }}
                    animate={{ transform: "translate3d(0, 0%, 0)" }}
                    transition={{ duration: 1, ease: WS_EASE, delay: 0.04 + index * 0.06 }}
                  >
                    {word}
                  </motion.span>
                </span>
                {index < words.length - 1 ? " " : null}
              </React.Fragment>
            )) : title}
          </h1>
          {description ? <motion.div className={styles.heroDescription} {...rise(0.16 + words.length * 0.05)}>{description}</motion.div> : null}
          {stats?.length ? (
            <motion.dl className={styles.heroStats} {...rise(0.24 + words.length * 0.05)}>
              {stats.map((stat) => (
                <div key={stat.label} className={styles.heroStat}>
                  <dt>{stat.label}</dt>
                  <dd><StatValue value={stat.value} /></dd>
                </div>
              ))}
            </motion.dl>
          ) : null}
          {children}
        </div>
        {actions ? <motion.div className={styles.heroActions} {...rise(0.2)}>{actions}</motion.div> : null}
      </motion.div>
    </section>
  );
}

/** Odometer-style number: digits roll to each new value on the compositor. */
function RollingNumber({ value }: { value: number | null }) {
  // Start at zero and roll to the value on the next frame, so every page
  // arrival (and every later change) reads as the number counting into place.
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    if (value === null) return;
    const frame = window.requestAnimationFrame(() => setShown(value));
    return () => window.cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className={clsx(styles.number, value === null && styles.numberPending)}>
      <NumberFlow
        value={shown}
        willChange
        transformTiming={{ duration: 950, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        spinTiming={{ duration: 950, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        opacityTiming={{ duration: 350, easing: "ease-out" }}
        aria-hidden="true"
      />
      <span className={styles.visuallyHidden}>{value === null ? "Loading" : value.toLocaleString()}</span>
    </span>
  );
}

/** A stat value: numbers roll, text (dates, "–") slides into place. */
function StatValue({ value }: { value: number | string | null }) {
  const reduced = useReducedMotion();
  if (value === null || typeof value === "number") return <RollingNumber value={value} />;
  return (
    <span className={styles.statValue}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          className={styles.number}
          initial={reduced ? false : { opacity: 0, transform: lift(10) }}
          animate={{ opacity: 1, transform: SETTLED }}
          exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.6, ease: WS_EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The light working surface laid over the masthead's lower edge. */
export function WorkspaceSheet({ as = "div", className, children, ...props }: { as?: "div" | "section" } & Omit<HTMLMotionProps<"div">, "ref">) {
  const entrance = useEntranceOnce("sheet");
  const Component = as === "section" ? motion.section : motion.div;
  return (
    <Component
      className={clsx(styles.sheet, className)}
      initial={entrance ? { opacity: 0, transform: lift(32) } : false}
      animate={{ opacity: 1, transform: SETTLED }}
      transition={{ duration: 1, ease: WS_EASE, delay: 0.12 }}
      {...props}
    >
      {children}
    </Component>
  );
}

/** Fades a block up the first time it scrolls into view. */
export function Reveal({ className, children, delay = 0, ...props }: { delay?: number } & Omit<HTMLMotionProps<"div">, "ref">) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, transform: lift(20) }}
      whileInView={{ opacity: 1, transform: SETTLED }}
      viewport={{ once: true, margin: "0px 0px -48px 0px" }}
      transition={{ duration: 0.9, ease: WS_EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/**
 * Motion props for a record (row, card, table row). Records rise in with a
 * short stagger as they scroll into view and fade on exit. Compositor-only
 * properties keep this smooth on long, cover-heavy lists.
 * Wrap the list in <AnimatePresence initial={false}> for exits.
 */
export function useRecordMotion() {
  const reduced = useReducedMotion();
  return React.useCallback((index: number) => reduced ? {} : {
    initial: { opacity: 0, transform: lift(18) },
    whileInView: { opacity: 1, transform: SETTLED },
    viewport: { once: true, margin: "0px 0px -24px 0px" },
    exit: { opacity: 0, transition: { duration: 0.15 } },
    transition: { duration: 0.8, ease: WS_EASE, delay: (index % 10) * 0.05 },
  }, [reduced]);
}

/**
 * Sliding selection background for segmented controls and filter chips.
 * Render it inside the selected button only; the shared layoutId makes it
 * travel between options. The button needs `position: relative; isolation: isolate`.
 */
export function SelectionPill({ layoutId, className }: { layoutId: string; className?: string }) {
  const reduced = useReducedMotion();
  return <motion.span layoutId={layoutId} className={clsx(styles.pill, className)} transition={reduced ? { duration: 0 } : WS_SPRING} aria-hidden="true" />;
}

/** A number that rolls to each new value. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  return <span className={className}><RollingNumber value={value} /></span>;
}

/**
 * Holds a rendered cover still while the list around it re-renders (search
 * typing, filter changes, row motion). It only re-renders when `coverKey`
 * changes, i.e. when the policy itself changed.
 */
const FrozenCover = React.memo(
  function FrozenCover({ children }: { coverKey: string; children: React.ReactNode }) { return <>{children}</>; },
  (previous, next) => previous.coverKey === next.coverKey,
);

/**
 * Mounts a cover only once it comes near the viewport. Each policy cover is a
 * full A4 render with its own fonts and images, so long lists stay light.
 */
function useNearViewport<T extends Element>() {
  const ref = React.useRef<T>(null);
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    const element = ref.current;
    if (!element || near) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      React.startTransition(() => setNear(true));
    }, { rootMargin: "300px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);
  return [ref, near] as const;
}

/**
 * Policy cover thumbnail on a small stack of pages. It lifts when its record
 * is hovered and tilts slightly toward the pointer. The cover renders lazily as
 * it nears the viewport; pass `coverKey` (e.g. id + updatedAt) so it is not
 * re-rendered by unrelated list updates.
 */
export function TiltCover({ className, children, label, coverKey }: { className?: string; children: React.ReactNode; label: string; coverKey?: string }) {
  const reduced = useReducedMotion();
  const rotateX = useSpring(0, { stiffness: 260, damping: 24 });
  const rotateY = useSpring(0, { stiffness: 260, damping: 24 });
  const [lazyRef, near] = useNearViewport<HTMLSpanElement>();
  const cover = coverKey ? <FrozenCover coverKey={coverKey}>{children}</FrozenCover> : children;
  return (
    <span ref={lazyRef} className={styles.coverLift} data-ws-cover="">
      <motion.span
        role="img"
        aria-label={label}
        className={clsx(styles.cover, className)}
        style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 600 }}
        onPointerMove={(event) => {
          if (reduced || event.pointerType !== "mouse") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          rotateY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 14);
          rotateX.set(-((event.clientY - bounds.top) / bounds.height - 0.5) * 10);
        }}
        onPointerLeave={() => { rotateX.set(0); rotateY.set(0); }}
        onErrorCapture={(event) => { if (event.target instanceof HTMLImageElement) event.target.style.visibility = "hidden"; }}
      >
        {near ? <span className={styles.coverReveal}>{cover}</span> : <span className={styles.coverPlaceholder} aria-hidden="true" />}
      </motion.span>
    </span>
  );
}

/** Deterministic avatar hue so a person keeps the same colour across lists. */
export function initialsFor(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "?";
}

export function hueFor(seed: string) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return 190 + (hash % 120);
}

export function Avatar({ name, seed, size = 40, className }: { name: string; seed?: string; size?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={clsx(styles.avatar, className)} style={{ "--ws-avatar-hue": hueFor(seed || name), width: size, height: size, fontSize: Math.round(size * 0.34) } as React.CSSProperties}>
      {initialsFor(name)}
    </span>
  );
}


export const workspaceStyles = styles;
