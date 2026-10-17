"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, Square } from "lucide-react";
import { useSopBuilder } from "@/lib/sop/store";
import { enabledSops, isSopWritten } from "../manual-helpers";
import { useSopBuilderActions } from "./builder-context";
import styles from "./builder.module.css";

/** "9 of 14 written": opens a list of the SOPs still to write, each with Retry or Write. */
export function ProgressPill() {
  const manual = useSopBuilder((state) => state.manual!);
  const generation = useSopBuilder((state) => state.generation);
  const select = useSopBuilder((state) => state.select);
  const { generate, retry, cancelGeneration } = useSopBuilderActions();
  const [open, setOpen] = React.useState(false);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const sops = enabledSops(manual);
  const written = sops.filter(isSopWritten).length;
  const running = sops.filter((sop) => generation[sop.id]?.status === "writing" || generation[sop.id]?.status === "queued").length;
  const failed = sops.filter((sop) => generation[sop.id]?.status === "failed").length;
  const remaining = sops.filter((sop) => !isSopWritten(sop));
  const idle = remaining.filter((sop) => !generation[sop.id] || generation[sop.id].status === "done");

  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!sops.length) return null;
  const tone = failed ? "error" : running ? "busy" : written === sops.length ? "done" : "idle";

  return (
    <div ref={wrapper} className={styles.pillWrap}>
      <button type="button" className={styles.pill} data-tone={tone} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        {tone === "busy" ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : tone === "error" ? <AlertTriangle size={13} aria-hidden="true" /> : tone === "done" ? <Check size={13} aria-hidden="true" /> : null}
        <span>{written} of {sops.length} written</span>
        <span className={styles.pillTrack} aria-hidden="true"><span style={{ width: `${(written / sops.length) * 100}%` }} /></span>
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div role="dialog" aria-label="Writing progress" className={styles.pillPanel} initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.16 }}>
            <div className={styles.pillHead}>
              <strong>{written === sops.length ? "Every SOP is written" : `${remaining.length} ${remaining.length === 1 ? "SOP" : "SOPs"} to write`}</strong>
              {running ? <button type="button" className={styles.linkButton} onClick={cancelGeneration}><Square size={11} aria-hidden="true" />Stop</button>
                : idle.length > 1 ? <button type="button" className={styles.linkButton} onClick={() => generate(idle.map((sop) => sop.id))}><Sparkles size={12} aria-hidden="true" />Write all {idle.length}</button> : null}
            </div>
            {remaining.length ? (
              <ul className={styles.pillList}>
                {remaining.map((sop) => {
                  const state = generation[sop.id];
                  return (
                    <li key={sop.id}>
                      <button type="button" className={styles.pillSop} onClick={() => { select({ kind: "sop", sopId: sop.id }); setOpen(false); }}>
                        <span className={styles.pillTitle}>{sop.title || "Untitled SOP"}</span>
                        <span className={styles.pillState} data-tone={state?.status === "failed" ? "error" : undefined}>{state?.status === "writing" ? "Writing…" : state?.status === "queued" ? "Queued" : state?.status === "failed" ? (/not wired up/i.test(state.error ?? "") ? "AI not available yet" : "Not written") : "Not started"}</span>
                      </button>
                      {state?.status === "failed" ? <button type="button" className={styles.pillAction} onClick={() => retry(sop.id)}><RefreshCw size={12} aria-hidden="true" />Retry</button>
                        : !state || state.status === "done" ? <button type="button" className={styles.pillAction} onClick={() => generate([sop.id])}><Sparkles size={12} aria-hidden="true" />Write</button> : null}
                    </li>
                  );
                })}
              </ul>
            ) : <p className={styles.pillEmpty}>Review each SOP, then export from Review &amp; export.</p>}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
