"use client";

import * as React from "react";
import { AnimatePresence, animate, motion } from "motion/react";
import styles from "@/components/builder/ai-cover-generation-loader.module.css";

type AICoverGenerationLoaderProps = { title?: string; company?: string; accent?: string };
type Blob = { left: number; top: number; scale: number; color: number };
type Study = { blobs: Blob[]; motif: "horizon" | "orbit" | "bands" };

const CYCLE_MS = 3400;
const EASE = [0.22, 1, 0.36, 1] as const;

// Each study moves the same colour fields into a new arrangement, then sharpens a motif over them.
const STUDIES: Study[] = [
  { motif: "horizon", blobs: [{ left: 56, top: -12, scale: 1.05, color: 2 }, { left: -22, top: 28, scale: 1.3, color: 0 }, { left: 38, top: 50, scale: 1, color: 1 }, { left: 4, top: -18, scale: 0.8, color: 3 }] },
  { motif: "orbit", blobs: [{ left: -16, top: -14, scale: 1.2, color: 1 }, { left: 48, top: 38, scale: 1.3, color: 0 }, { left: 58, top: -22, scale: 0.9, color: 3 }, { left: -4, top: 52, scale: 0.85, color: 2 }] },
  { motif: "bands", blobs: [{ left: 28, top: -26, scale: 1.2, color: 0 }, { left: -26, top: 42, scale: 1, color: 2 }, { left: 54, top: 48, scale: 1.1, color: 1 }, { left: -12, top: -8, scale: 0.75, color: 3 }] },
];

function Motif({ kind, accent }: { kind: Study["motif"]; accent: string }) {
  const deep = `color-mix(in srgb, ${accent} 72%, #020617)`;
  if (kind === "horizon") return <>
    <circle cx="86" cy="30" r="14" fill="#fff" fillOpacity=".9" />
    <path d="M0 72C22 54 44 58 64 69s36 9 53-7v38H0Z" fill={accent} fillOpacity=".88" />
    <path d="M0 86c30-11 58 6 117-7v21H0Z" fill={deep} />
  </>;
  if (kind === "orbit") return <>
    <g stroke="#fff" strokeOpacity=".8" strokeWidth="1.3" fill="none">
      {[28, 42, 56, 70, 84].map(radius => <circle key={radius} cx="0" cy="100" r={radius} />)}
    </g>
    <circle cx="88" cy="28" r="10" fill={accent} />
    <circle cx="88" cy="28" r="17" stroke={accent} strokeOpacity=".5" fill="none" />
  </>;
  return <>
    <path d="M-12 70 58 0h22L10 70Z" fill="#fff" fillOpacity=".55" />
    <path d="M22 100 117 5v28l-67 67Z" fill={accent} fillOpacity=".88" />
    <path d="M58 100 117 41v18l-41 41Z" fill={deep} />
    <g fill="#fff" fillOpacity=".85">
      {[0, 1, 2, 3].flatMap(column => [0, 1, 2].map(row => <circle key={`${column}-${row}`} cx={14 + column * 7} cy={14 + row * 7} r="1.2" />))}
    </g>
  </>;
}

function TypesetLine({ text, delay, className }: { text: string; delay: number; className: string }) {
  const words = text.split(" ");
  const starts = words.map((_, index) => words.slice(0, index).join("").length);
  return <p className={className}>
    {words.map((word, wordIndex) => <React.Fragment key={wordIndex}>
      <span className="inline-block whitespace-nowrap">
        {Array.from(word).map((character, characterIndex) => <motion.span
          key={characterIndex}
          className="inline-block"
          initial={{ opacity: 0, y: "0.4em", filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ delay: delay + (starts[wordIndex] + characterIndex) * 0.035, duration: 0.5, ease: EASE }}
        >{character}</motion.span>)}
      </span>
      {wordIndex < words.length - 1 ? " " : null}
    </React.Fragment>)}
  </p>;
}

export function AICoverGenerationLoader({ title = "Policy", company = "", accent = "#4186f3" }: AICoverGenerationLoaderProps) {
  const grainId = `ai-cover-grain-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [cycle, setCycle] = React.useState(0);
  const fields = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const timer = setInterval(() => setCycle(current => current + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, []);
  // Each new study starts out of focus and develops while the colour fields move.
  React.useEffect(() => {
    if (!fields.current) return;
    const controls = animate(fields.current, { filter: ["blur(30px)", "blur(30px)", "blur(16px)"] }, { duration: 1.4, times: [0, 0.2, 1], ease: "easeOut" });
    return () => controls.stop();
  }, [cycle]);
  const study = STUDIES[cycle % STUDIES.length];
  const palette = [accent, "#4186f3", "#5eead4", "#ffffff"];
  const companyName = company.trim();

  return (
    <div data-ai-cover-loader role="region" style={{ fontFamily: "var(--pc-font)" }} className="absolute inset-0 z-20 flex min-h-full w-full flex-col items-center justify-center overflow-auto bg-[var(--pc-page)] px-6 py-8 text-center text-[var(--pc-text)]" aria-label="Cover design in progress" aria-busy="true">
      <div className={styles.stage} aria-hidden="true">
        <motion.span
          className={styles.halo}
          style={{ background: `radial-gradient(closest-side, color-mix(in srgb, ${accent} 26%, transparent), transparent)` }}
          animate={{ scale: [1, 1.07, 1], opacity: [0.75, 1, 0.75] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          data-ai-cover-page
          className={styles.cover}
          initial={{ opacity: 0, y: 18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className={styles.art} style={{ backgroundColor: `color-mix(in srgb, ${accent} 16%, white)` }}>
            <div ref={fields} className={styles.fields}>
              {study.blobs.map((blob, index) => <motion.span
                key={index}
                className={styles.field}
                initial={false}
                animate={{ left: `${blob.left}%`, top: `${blob.top}%`, scale: blob.scale, backgroundColor: palette[blob.color] }}
                transition={{ duration: 1.3, ease: EASE }}
              />)}
            </div>
            <AnimatePresence>
              <motion.svg
                key={study.motif}
                className={styles.motif}
                viewBox="0 0 117 100"
                preserveAspectRatio="xMidYMid slice"
                initial={{ opacity: 0, clipPath: "inset(0% 0% 100% 0%)" }}
                animate={{ opacity: 1, clipPath: "inset(0% 0% 0% 0%)" }}
                exit={{ opacity: 0, transition: { duration: 0.45 } }}
                transition={{ delay: 0.55, duration: 0.9, ease: EASE }}
              >
                <Motif kind={study.motif} accent={accent} />
              </motion.svg>
            </AnimatePresence>
            <motion.svg
              key={`grain-${cycle}`}
              className={styles.grain}
              initial={{ opacity: 0.75 }}
              animate={{ opacity: 0.12 }}
              transition={{ duration: 1.7, ease: "easeOut" }}
            >
              <filter id={grainId}><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /></filter>
              <rect width="100%" height="100%" filter={`url(#${grainId})`} />
            </motion.svg>
            <motion.span
              key={`sheen-${cycle}`}
              className={styles.sheen}
              initial={{ x: "-120%" }}
              animate={{ x: "120%" }}
              transition={{ delay: 1.5, duration: 1.1, ease: "easeInOut" }}
            />
          </div>
          <div className={styles.copy}>
            <TypesetLine text={title} delay={0.5} className={styles.title} />
            {companyName
              ? <TypesetLine text={companyName} delay={0.5 + title.length * 0.035 + 0.15} className={styles.company} />
              : <span className={styles.placeholder} />}
            <motion.span
              className={styles.rule}
              style={{ backgroundColor: accent }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 1.3, duration: 0.7, ease: EASE }}
            />
            <div className={styles.meta}>
              {[38, 26].map((width, index) => <motion.span
                key={width}
                style={{ width: `${width}%` }}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.6 + index * 0.12, duration: 0.4, ease: EASE }}
              />)}
            </div>
          </div>
        </motion.div>
      </div>
      <div className="relative z-10 mt-8" role="status" aria-live="polite">
        <p className="text-[17px] font-semibold leading-snug text-[var(--pc-text)]">Designing your cover</p>
        <p className="mt-1 text-[13px] text-[var(--pc-muted)]">Arranging artwork and details for your {title}.</p>
      </div>
    </div>
  );
}
