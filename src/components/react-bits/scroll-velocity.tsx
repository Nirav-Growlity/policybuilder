"use client";

// Adapted from React Bits ScrollVelocity (https://reactbits.dev/text-animations/scroll-velocity, TS-CSS variant).
// Trimmed to the drifting rows: no drag, outline or skew. The rows stop working while off screen, the
// wrapper is a plain div (the caller supplies the accessible list), and styling comes from the caller's
// class names. Like the rest of the home page, it plays regardless of the OS reduce-motion setting.

import * as React from "react";
import { motion, useAnimationFrame, useInView, useMotionValue, useScroll, useSpring, useTransform, useVelocity } from "motion/react";

type VelocityMapping = { input: [number, number]; output: [number, number] };

export type ScrollVelocityProps = {
  /** One row per entry; odd rows drift the other way. */
  texts: React.ReactNode[];
  /** Resting drift, in pixels per second. */
  velocity?: number;
  damping?: number;
  stiffness?: number;
  numCopies?: number;
  /** Maps scroll speed (px/s) to an extra multiple of the resting drift. */
  velocityMapping?: VelocityMapping;
  fadeEdges?: boolean;
  className?: string;
  rowClassName?: string;
  scrollerClassName?: string;
  copyClassName?: string;
};

const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const FADE_STEPS = Array.from({ length: 9 }, (_, i) => i / 8);
const FADE_MASK = `linear-gradient(to right, ${[
  ...FADE_STEPS.map((t) => `rgba(0, 0, 0, ${smootherstep(t).toFixed(3)}) ${(t * 12).toFixed(1)}%`),
  ...FADE_STEPS.map((t) => `rgba(0, 0, 0, ${smootherstep(1 - t).toFixed(3)}) ${(88 + t * 12).toFixed(1)}%`),
].join(", ")})`;

function wrap(min: number, max: number, value: number) {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
}

function useElementWidth<T extends HTMLElement>(ref: React.RefObject<T | null>) {
  const [width, setWidth] = React.useState(0);
  React.useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.borderBoxSize?.[0]?.inlineSize ?? entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

type VelocityRowProps = {
  children: React.ReactNode;
  baseVelocity: number;
  active: boolean;
  damping: number;
  stiffness: number;
  numCopies: number;
  velocityMapping: VelocityMapping;
  rowClassName?: string;
  scrollerClassName?: string;
  copyClassName?: string;
};

function VelocityRow({ children, baseVelocity, active, damping, stiffness, numCopies, velocityMapping, rowClassName, scrollerClassName, copyClassName }: VelocityRowProps) {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const scrollVelocity = useVelocity(scrollY);
  const smoothVelocity = useSpring(scrollVelocity, { damping, stiffness });
  const velocityFactor = useTransform(smoothVelocity, velocityMapping.input, velocityMapping.output, { clamp: false });
  const copyRef = React.useRef<HTMLSpanElement>(null);
  const copyWidth = useElementWidth(copyRef);
  const x = useTransform(baseX, (value) => (copyWidth === 0 ? "0px" : `${wrap(-copyWidth, 0, value)}px`));
  const directionFactor = React.useRef(1);

  useAnimationFrame((_, delta) => {
    if (!active) return;
    let moveBy = directionFactor.current * baseVelocity * (Math.min(delta, 64) / 1000);
    // Scrolling back up turns the rows around; scrolling faster pushes them along.
    if (velocityFactor.get() < 0) directionFactor.current = -1;
    else if (velocityFactor.get() > 0) directionFactor.current = 1;
    moveBy += directionFactor.current * moveBy * velocityFactor.get();
    baseX.set(baseX.get() + moveBy);
  });

  return (
    <div className={rowClassName} style={{ position: "relative", overflow: "hidden" }}>
      <motion.div className={scrollerClassName} style={{ display: "flex", whiteSpace: "nowrap", x }}>
        {Array.from({ length: numCopies }, (_, index) => (
          <span key={index} ref={index === 0 ? copyRef : undefined} className={copyClassName} style={{ flexShrink: 0 }}>
            {children}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export function ScrollVelocity({
  texts,
  velocity = 100,
  damping = 50,
  stiffness = 400,
  numCopies = 6,
  velocityMapping = { input: [0, 1000], output: [0, 5] },
  fadeEdges = false,
  className,
  rowClassName,
  scrollerClassName,
  copyClassName,
}: ScrollVelocityProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { margin: "120px 0px" });

  return (
    <div ref={rootRef} className={className} aria-hidden="true" style={{ width: "100%", ...(fadeEdges ? { WebkitMaskImage: FADE_MASK, maskImage: FADE_MASK } : {}) }}>
      {texts.map((text, index) => (
        <VelocityRow
          key={index}
          baseVelocity={index % 2 !== 0 ? -velocity : velocity}
          active={inView}
          damping={damping}
          stiffness={stiffness}
          numCopies={numCopies}
          velocityMapping={velocityMapping}
          rowClassName={rowClassName}
          scrollerClassName={scrollerClassName}
          copyClassName={copyClassName}
        >
          {text}
        </VelocityRow>
      ))}
    </div>
  );
}
