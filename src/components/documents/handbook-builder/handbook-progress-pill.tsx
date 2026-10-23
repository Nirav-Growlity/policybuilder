"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, Square } from "lucide-react";
import { useHandbookBuilder } from "@/lib/handbook/store";
import type { HandbookChapter } from "@/lib/handbook/types";
import { enabledChapters, isChapterWritten } from "@/components/documents/handbook-helpers";
import styles from "@/components/documents/builder/builder.module.css";
import { useHandbookBuilderActions } from "./handbook-builder-context";

/** "9 of 14 written": opens a list of the chapters still to write, each with Retry or Write. */
export function HandbookProgressPill() {
  const manual = useHandbookBuilder((state) => state.manual!);
  const generation = useHandbookBuilder((state) => state.generation);
  const select = useHandbookBuilder((state) => state.select);
  const { generate, retry, cancelGeneration } = useHandbookBuilderActions();
  const [open, setOpen] = React.useState(false);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const chapters = enabledChapters(manual);
  const written = chapters.filter(isChapterWritten).length;
  const running = chapters.filter((chapter) => generation[chapter.id]?.status === "writing" || generation[chapter.id]?.status === "queued").length;
  const failed = chapters.filter((chapter) => generation[chapter.id]?.status === "failed").length;
  const remaining = chapters.filter((chapter) => !isChapterWritten(chapter));
  const idle = remaining.filter((chapter) => !generation[chapter.id] || generation[chapter.id].status === "done");

  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!chapters.length) return null;
  const tone = failed ? "error" : running ? "busy" : written === chapters.length ? "done" : "idle";

  return (
    <div ref={wrapper} className={styles.pillWrap}>
      <button type="button" className={styles.pill} data-tone={tone} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        {tone === "busy" ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : tone === "error" ? <AlertTriangle size={13} aria-hidden="true" /> : tone === "done" ? <Check size={13} aria-hidden="true" /> : null}
        <span>{written} of {chapters.length} written</span>
        <span className={styles.pillTrack} aria-hidden="true"><span style={{ width: `${(written / chapters.length) * 100}%` }} /></span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div role="dialog" aria-label="Writing progress" className={styles.pillPanel} initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.16 }}>
            <div className={styles.pillHead}>
              <strong>{written === chapters.length ? "Every chapter is written" : `${remaining.length} ${remaining.length === 1 ? "chapter" : "chapters"} to write`}</strong>
              {running ? <button type="button" className={styles.linkButton} onClick={cancelGeneration}><Square size={11} aria-hidden="true" />Stop</button>
                : idle.length > 1 ? <button type="button" className={styles.linkButton} onClick={() => generate(idle.map((chapter) => chapter.id))}><Sparkles size={12} aria-hidden="true" />Write all {idle.length}</button> : null}
            </div>
            {remaining.length ? (
              <ul className={styles.pillList}>
                {remaining.map((chapter: HandbookChapter) => {
                  const state = generation[chapter.id];
                  return (
                    <li key={chapter.id}>
                      <button type="button" className={styles.pillSop} onClick={() => { select({ kind: "chapter", chapterId: chapter.id }); setOpen(false); }}>
                        <span className={styles.pillTitle}>{chapter.title || "Untitled chapter"}</span>
                        <span className={styles.pillState} data-tone={state?.status === "failed" ? "error" : undefined}>{state?.status === "writing" ? "Writing…" : state?.status === "queued" ? "Queued" : state?.status === "failed" ? (/not wired up/i.test(state.error ?? "") ? "AI not available yet" : "Not written") : "Not started"}</span>
                      </button>
                      {state?.status === "failed" ? <button type="button" className={styles.pillAction} onClick={() => retry(chapter.id)}><RefreshCw size={12} aria-hidden="true" />Retry</button>
                        : !state || state.status === "done" ? <button type="button" className={styles.pillAction} onClick={() => generate([chapter.id])}><Sparkles size={12} aria-hidden="true" />Write</button> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className={styles.pillEmpty}>Review each chapter, then export from Review &amp; export.</p>}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
