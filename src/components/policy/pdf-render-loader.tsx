"use client";
import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import styles from "@/components/policy/pdf-render-loader.module.css";

type PdfRenderLoaderProps = { updating?: boolean; still?: boolean };
type Tone = "brand" | "ink" | "soft" | "tint";
type Block = { x: number; y: number; w: number; h: number; tone: Tone };

// Seconds for the print line to travel one A4 page, then a beat before the page is filed.
const SWEEP = 2.2;
const CYCLE_MS = 3300;
const EASE = [0.22, 1, 0.36, 1] as const;

// One A4 page in millimetres: letterhead, title, body copy, a targets table and the sign-off.
const BLOCKS: Block[] = [
  { x: 22, y: 22, w: 14, h: 14, tone: "tint" },
  { x: 142, y: 25, w: 46, h: 3, tone: "soft" },
  { x: 160, y: 31, w: 28, h: 3, tone: "soft" },
  { x: 22, y: 52, w: 84, h: 8, tone: "brand" },
  { x: 22, y: 66, w: 124, h: 4, tone: "ink" },
  { x: 22, y: 80, w: 166, h: 0.8, tone: "soft" },
  { x: 22, y: 92, w: 166, h: 3.5, tone: "soft" },
  { x: 22, y: 100, w: 158, h: 3.5, tone: "soft" },
  { x: 22, y: 108, w: 163, h: 3.5, tone: "soft" },
  { x: 22, y: 116, w: 98, h: 3.5, tone: "soft" },
  { x: 22, y: 133, w: 64, h: 5, tone: "ink" },
  { x: 22, y: 146, w: 166, h: 11, tone: "tint" },
  { x: 27, y: 150.5, w: 30, h: 2.5, tone: "ink" },
  { x: 83, y: 150.5, w: 26, h: 2.5, tone: "ink" },
  { x: 139, y: 150.5, w: 30, h: 2.5, tone: "ink" },
  { x: 27, y: 163, w: 42, h: 2.5, tone: "soft" },
  { x: 83, y: 163, w: 30, h: 2.5, tone: "soft" },
  { x: 139, y: 163, w: 18, h: 2.5, tone: "brand" },
  { x: 22, y: 170, w: 166, h: 0.6, tone: "soft" },
  { x: 27, y: 176, w: 36, h: 2.5, tone: "soft" },
  { x: 83, y: 176, w: 34, h: 2.5, tone: "soft" },
  { x: 139, y: 176, w: 24, h: 2.5, tone: "brand" },
  { x: 22, y: 183, w: 166, h: 0.6, tone: "soft" },
  { x: 22, y: 198, w: 166, h: 3.5, tone: "soft" },
  { x: 22, y: 206, w: 152, h: 3.5, tone: "soft" },
  { x: 22, y: 214, w: 120, h: 3.5, tone: "soft" },
  { x: 22, y: 252, w: 58, h: 0.8, tone: "ink" },
  { x: 22, y: 257, w: 36, h: 2.5, tone: "soft" },
  { x: 140, y: 252, w: 48, h: 0.8, tone: "ink" },
  { x: 140, y: 257, w: 30, h: 2.5, tone: "soft" },
  { x: 97, y: 278, w: 16, h: 2.5, tone: "soft" },
];

const SIGNATURE = "M24 247c4-9 9-15 11-9 1.6 5-4 9-1.5 7.5 3-2 6-10 9-8 2 1.5-1 6 1 6.5 2.5.5 4-4 6.5-4 2.2 0 1.6 3.2 3.6 3.4 3 .3 6-3 10-4.5";

const TONES: Record<Tone, string> = {
  brand: "var(--pc-brand)",
  ink: "#94a3b8",
  soft: "#d5dde8",
  tint: "color-mix(in srgb, var(--pc-brand) 13%, white)",
};
const STILL_TONES: Record<Tone, string> = { brand: "#cbd5e1", ink: "#cbd5e1", soft: "#e2e8f0", tint: "#f1f5f9" };

const at = (y: number) => 0.25 + (y / 297) * SWEEP;

function PageContent({ animated, tones, glowId }: { animated: boolean; tones: Record<Tone, string>; glowId: string }) {
  return <svg className={styles.pageArt} viewBox="0 0 210 297" fill="none" aria-hidden="true">
    {BLOCKS.map((block, index) => <motion.rect
      key={index}
      x={block.x}
      y={block.y}
      height={block.h}
      rx={Math.min(block.h / 2, 1.6)}
      fill={tones[block.tone]}
      initial={animated ? { width: 0 } : false}
      animate={{ width: block.w }}
      transition={{ delay: at(block.y), duration: 0.22 + (block.w / 166) * 0.3, ease: EASE }}
    />)}
    <motion.path
      d={SIGNATURE}
      stroke={tones.ink}
      strokeWidth={1.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      initial={animated ? { pathLength: 0 } : false}
      animate={{ pathLength: 1 }}
      transition={{ delay: at(238), duration: 0.55, ease: "easeInOut" }}
    />
    {animated && <motion.g
      initial={{ y: 12, opacity: 0 }}
      animate={{ y: 288, opacity: [0, 1, 1, 0] }}
      transition={{ delay: 0.25, duration: SWEEP, ease: "linear", opacity: { delay: 0.25, duration: SWEEP, times: [0, 0.06, 0.9, 1] } }}
    >
      <rect x="0" y="-16" width="210" height="16" fill={`url(#${glowId})`} />
      <rect x="8" y="-0.5" width="194" height="1" rx=".5" fill="var(--pc-brand)" />
    </motion.g>}
    <defs>
      <linearGradient id={glowId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="var(--pc-brand)" stopOpacity="0" />
        <stop offset="1" stopColor="var(--pc-brand)" stopOpacity=".16" />
      </linearGradient>
    </defs>
  </svg>;
}

export function PdfRenderLoader({ updating = false, still = false }: PdfRenderLoaderProps) {
  const animated = !still;
  const glowId = `pdf-loader-glow-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [cycle, setCycle] = React.useState(0);
  React.useEffect(() => {
    if (!animated) return;
    const timer = setInterval(() => setCycle(current => current + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [animated]);

  return <div className={`${styles.loader} flex flex-col items-center justify-center px-6 py-10 text-center`} data-still={still || undefined}>
    <div className={styles.stage} aria-hidden="true">
      <span className={styles.floor} />
      <span className={`${styles.sheet} ${styles.pileFar}`} />
      <span className={`${styles.sheet} ${styles.pileNear}`} />
      <AnimatePresence>
        <motion.div
          key={animated ? cycle : "still"}
          className={styles.sheet}
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, x: 0, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, x: 10, y: -12, rotate: 2.4, scale: 0.97, transition: { duration: 0.55, ease: EASE } }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <PageContent animated={animated} tones={still ? STILL_TONES : TONES} glowId={glowId} />
        </motion.div>
      </AnimatePresence>
    </div>
    <div className="mt-6">
      <p className="text-[20px] font-semibold text-[var(--pc-text)] sm:text-[22px]">{still ? "Preview unavailable" : updating ? "Updating document preview" : "Rendering your document"}</p>
      <p className="mt-1 text-[13px] text-[var(--pc-muted)]">{still ? "Use Retry preview to try again." : "Assembling your pages for preview."}</p>
    </div>
  </div>;
}
