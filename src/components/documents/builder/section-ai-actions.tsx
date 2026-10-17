"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronDown, Minimize2, PenLine, RotateCcw, SpellCheck, Sparkles, WandSparkles } from "lucide-react";
import { clsx } from "clsx";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { Textarea } from "@/components/ui/input";
import ai from "@/components/ui/ai-action-button.module.css";
import type { SectionAiAction } from "./use-section-ai";
import styles from "./builder.module.css";

const REFINE_OPTIONS: { action: Exclude<SectionAiAction, "custom">; title: string; hint: string; icon: React.ReactNode }[] = [
  { action: "improve", title: "Improve", hint: "Clearer and more complete, same facts.", icon: <Sparkles size={16} /> },
  { action: "shorten", title: "Shorten", hint: "Tighter wording, nothing important lost.", icon: <Minimize2 size={16} /> },
  { action: "grammar", title: "Fix grammar", hint: "Spelling and punctuation only.", icon: <SpellCheck size={16} /> },
  { action: "generate", title: "Rewrite", hint: "Replace this section with a fresh draft.", icon: <RotateCcw size={16} /> },
];

/**
 * One AI control per section. Empty: AI Write (from the profile, or with
 * instructions). With text: AI edit (improve, shorten, grammar, rewrite or a
 * custom instruction). While running it becomes the shared Stop control.
 */
export function SectionAiActions({ hasContent, busy, onRun, onStop, label = "AI Write" }: {
  hasContent: boolean;
  busy: boolean;
  onRun: (action: SectionAiAction, instruction?: string) => void;
  onStop: () => void;
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [custom, setCustom] = React.useState<string | null>(null);
  const wrapper = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const menuId = React.useId();
  const customOpen = custom !== null;

  React.useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setCustom(null); };
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) close(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close(); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key, true);
    const frame = requestAnimationFrame(() => wrapper.current?.querySelector<HTMLElement>("[data-ai-menu] button, [data-ai-menu] textarea")?.focus());
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key, true); cancelAnimationFrame(frame); };
  }, [customOpen, open]);

  if (busy || !hasContent) {
    return (
      <AIActionButton
        label={label}
        loading={busy}
        onStop={onStop}
        onGenerate={(prompt) => onRun("generate", prompt)}
        placeholder="e.g. Cover both plants, mention the CPCB authorization, keep it under 120 words"
      />
    );
  }

  const choose = (action: SectionAiAction, instruction?: string) => { setOpen(false); setCustom(null); onRun(action, instruction); };

  return (
    <div ref={wrapper} className={styles.aiActions}>
      <button ref={trigger} type="button" className={ai.trigger} data-ai-trigger="primary" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)}>
        <span className={ai.icon} aria-hidden="true"><WandSparkles size={15} /></span>
        <span>AI edit</span>
        <ChevronDown size={14} aria-hidden="true" className={ai.chevron} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div key="refine" id={menuId} data-ai-menu="" role="dialog" aria-label="Edit with AI" className={clsx(ai.popover, styles.aiPopover)} initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
            {custom === null ? (
              <div className={ai.menu}>
                {REFINE_OPTIONS.map((option) => (
                  <button key={option.action} type="button" className={ai.option} onClick={() => choose(option.action)}>
                    <span className={ai.optionIcon} aria-hidden="true">{option.icon}</span>
                    <span className={ai.optionText}><span className={ai.optionTitle}>{option.title}</span><span className={ai.optionHint}>{option.hint}</span></span>
                  </button>
                ))}
                <button type="button" className={ai.option} onClick={() => setCustom("")}>
                  <span className={ai.optionIcon} aria-hidden="true"><PenLine size={16} /></span>
                  <span className={ai.optionText}><span className={ai.optionTitle}>Custom instruction</span><span className={ai.optionHint}>Say how this section should change.</span></span>
                </button>
              </div>
            ) : (
              <form className={ai.form} onSubmit={(event) => { event.preventDefault(); if (custom.trim()) choose("custom", custom.trim()); }}>
                <div className={ai.formHead}>
                  <button type="button" className={ai.back} aria-label="Back to AI edits" onClick={() => setCustom(null)}><ArrowLeft size={15} /></button>
                  <span className={ai.formTitle}>Custom instruction</span>
                </div>
                <Textarea rows={3} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="e.g. Use a numbered list and add the weekly inspection" aria-label="Custom instruction" className={ai.prompt} />
                <div className={ai.formFoot}>
                  <button type="button" className={ai.cancel} onClick={() => setCustom(null)}>Back</button>
                  <button type="submit" className={ai.generate} disabled={!custom.trim()}><Sparkles size={14} aria-hidden="true" /> Apply</button>
                </div>
              </form>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
