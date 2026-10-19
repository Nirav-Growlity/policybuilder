"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, Minimize2, PenLine, RotateCcw, Sparkles, SpellCheck, WandSparkles } from "lucide-react";
import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";
import { Textarea } from "./input";
import { useApplicationSurface } from "./application-surface";
import type { AIEditAction } from "@/lib/ai/prompts";
import styles from "./ai-action-button.module.css";

interface AIActionButtonProps {
  onGenerate: (customPrompt?: string) => Promise<void> | void;
  loading?: boolean;
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md";
  className?: string;
  placeholder?: string;
  /** While loading, turns the button into a Stop control for a streaming generation. */
  onStop?: () => void;
  /**
   * With text already written, the button becomes AI edit: improve, shorten,
   * fix grammar, rewrite or a custom instruction, in the same order as the
   * SOP builder. Without it, or while the field is empty, it writes.
   */
  onEdit?: (action: AIEditAction, instruction?: string) => Promise<void> | void;
  hasContent?: boolean;
  /** What is being edited, for the menu hints: "section", "objective", "target". */
  subject?: string;
}

const EDIT_OPTIONS: { action: Exclude<AIEditAction, "custom">; title: string; hint: (subject: string) => string; icon: React.ReactNode }[] = [
  { action: "improve", title: "Improve", hint: () => "Clearer and more complete, same facts.", icon: <Sparkles size={16} /> },
  { action: "shorten", title: "Shorten", hint: () => "Tighter wording, nothing important lost.", icon: <Minimize2 size={16} /> },
  { action: "grammar", title: "Fix grammar", hint: () => "Spelling and punctuation only.", icon: <SpellCheck size={16} /> },
  { action: "rewrite", title: "Rewrite", hint: (subject) => `Replace this ${subject} with a fresh draft.`, icon: <RotateCcw size={16} /> },
];

const ease = [0.22, 1, 0.36, 1] as const;

export function AIActionButton({
  onGenerate,
  loading = false,
  label = "AI Write",
  variant = "primary",
  size = "sm",
  className = "",
  placeholder = "e.g. Focus on zero waste packaging, renewable energy targets for Gujarat units...",
  onStop,
  onEdit,
  hasContent = false,
  subject = "section",
}: AIActionButtonProps) {
  const application = useApplicationSurface();
  const popoverId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"menu" | "custom">("menu");
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [coords, setCoords] = React.useState<{ top: number; right: number; above: boolean }>({ top: 0, right: 0, above: false });
  const mounted = React.useSyncExternalStore(() => () => undefined, () => true, () => false);
  const quiet = variant === "ghost";
  const stoppable = loading && Boolean(onStop);
  const editing = Boolean(onEdit) && hasContent;

  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  const updateCoords = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const height = popoverRef.current?.getBoundingClientRect().height || 220;
      const below = rect.bottom + 8;
      const above = application && below + height > window.innerHeight - 12;
      setCoords({
        top: above ? Math.max(12, rect.top - height - 8) : below,
        right: Math.max(12, window.innerWidth - rect.right),
        above,
      });
    }
  }, [application]);

  React.useEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
    }
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, mode, updateCoords]);

  React.useEffect(() => {
    if (!application || !open) return;
    const frame = requestAnimationFrame(() => {
      updateCoords();
      popoverRef.current?.querySelector<HTMLElement>(mode === "custom" ? "textarea" : "button")?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); setOpen(false); setMode("menu"); buttonRef.current?.focus();
      } else if (mode === "menu" && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && popoverRef.current?.contains(document.activeElement)) {
        const buttons = Array.from(popoverRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])"));
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault(); buttons[next]?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKey, true); };
  }, [application, open, mode, updateCoords]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setMode("menu");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleSuggest = async () => {
    setOpen(false);
    setMode("menu");
    await onGenerate();
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const promptToSend = customPrompt.trim();
    if (editing && !promptToSend) return;
    setOpen(false);
    setMode("menu");
    setCustomPrompt("");
    if (editing) await onEdit?.("custom", promptToSend);
    else await onGenerate(promptToSend || undefined);
  };

  const handleEdit = async (action: AIEditAction) => {
    setOpen(false);
    setMode("menu");
    await onEdit?.(action);
  };

  const iconSize = quiet ? 14 : size === "md" ? 16 : 15;
  const panelMotion = {
    initial: { opacity: 0, y: coords.above ? 6 : -6, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: coords.above ? 4 : -4, scale: 0.98 },
  };
  const contentMotion = { initial: { opacity: 0, x: mode === "custom" ? 12 : -12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0 } };

  return (
    <div className="inline-flex items-center shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={loading && !stoppable}
        onClick={() => {
          if (loading) { onStop?.(); return; }
          if (!open) updateCoords();
          setOpen(!open);
        }}
        className={clsx(styles.trigger, quiet && styles.quiet, className)}
        aria-expanded={loading ? undefined : open}
        aria-controls={open ? popoverId : undefined}
        aria-haspopup={loading ? undefined : "dialog"}
        aria-busy={loading || undefined}
        aria-label={stoppable ? "Stop writing" : undefined}
        data-ai-trigger={variant}
        data-stoppable={stoppable || undefined}
      >
        {loading ? (
          <>
            <span className={styles.icon} aria-hidden="true">
              <svg viewBox="0 0 20 20" className={styles.orbit}>
                <circle cx="10" cy="10" r="7.5" className={styles.orbitTrack} />
                <circle cx="10" cy="10" r="7.5" className={styles.orbitArc} pathLength={100} />
                <path d="M10 6.2 11.05 8.95 13.8 10 11.05 11.05 10 13.8 8.95 11.05 6.2 10 8.95 8.95Z" className={styles.orbitStar} />
              </svg>
              {stoppable ? <span className={styles.stopMark} /> : null}
            </span>
            <span className={styles.busyLabel}>
              <span className={styles.writingLabel}>{quiet ? "Refining" : "Writing"}</span>
              {stoppable ? <span className={styles.stopLabel}>Stop</span> : null}
            </span>
          </>
        ) : (
          <>
            <span className={styles.icon} aria-hidden="true">
              {quiet || editing ? <WandSparkles size={iconSize} /> : <Sparkles size={iconSize} />}
            </span>
            <span>{editing ? "AI edit" : label}</span>
            {!quiet && <ChevronDown size={14} aria-hidden="true" className={styles.chevron} />}
          </>
        )}
      </button>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                key="ai-popover"
                ref={popoverRef}
                id={popoverId}
                role="dialog"
                aria-label={editing ? "Edit with AI" : "Policy generation"}
                style={{
                  position: "fixed",
                  top: `${coords.top}px`,
                  right: `${coords.right}px`,
                  zIndex: 999999,
                  transformOrigin: coords.above ? "bottom right" : "top right",
                }}
                className={clsx(styles.popover, application && "pc-ui pc-builder-authoring")}
                {...panelMotion}
                transition={{ duration: 0.18, ease }}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {mode === "menu" && editing ? (
                    <motion.div key="edit-menu" className={styles.menu} {...contentMotion} transition={{ duration: 0.16, ease }}>
                      {EDIT_OPTIONS.map((option) => (
                        <button key={option.action} type="button" onClick={() => void handleEdit(option.action)} className={styles.option}>
                          <span className={styles.optionIcon} aria-hidden="true">{option.icon}</span>
                          <span className={styles.optionText}>
                            <span className={styles.optionTitle}>{option.title}</span>
                            <span className={styles.optionHint}>{option.hint(subject)}</span>
                          </span>
                        </button>
                      ))}
                      <button type="button" onClick={() => setMode("custom")} className={styles.option}>
                        <span className={styles.optionIcon} aria-hidden="true"><PenLine size={16} /></span>
                        <span className={styles.optionText}>
                          <span className={styles.optionTitle}>Custom instruction</span>
                          <span className={styles.optionHint}>Say how this {subject} should change.</span>
                        </span>
                      </button>
                    </motion.div>
                  ) : mode === "menu" ? (
                    <motion.div key="menu" className={styles.menu} {...contentMotion} transition={{ duration: 0.16, ease }}>
                      <button type="button" onClick={handleSuggest} className={styles.option}>
                        <span className={styles.optionIcon} aria-hidden="true"><Sparkles size={16} /></span>
                        <span className={styles.optionText}>
                          <span className={styles.optionTitle}>Suggest for me</span>
                          <span className={styles.optionHint}>Writes from the company profile and the standards you selected.</span>
                        </span>
                      </button>
                      <button type="button" onClick={() => setMode("custom")} className={styles.option}>
                        <span className={styles.optionIcon} aria-hidden="true"><PenLine size={16} /></span>
                        <span className={styles.optionText}>
                          <span className={styles.optionTitle}>Custom instructions</span>
                          <span className={styles.optionHint}>Tell the AI what to focus on, include or leave out.</span>
                        </span>
                      </button>
                    </motion.div>
                  ) : (
                    <motion.form key="custom" onSubmit={handleCustomSubmit} className={styles.form} {...contentMotion} transition={{ duration: 0.16, ease }}>
                      <div className={styles.formHead}>
                        <button
                          type="button"
                          onClick={() => setMode("menu")}
                          aria-label={editing ? "Back to AI edits" : "Back to generation options"}
                          className={styles.back}
                        >
                          <ArrowLeft size={15} />
                        </button>
                        <span className={styles.formTitle}>{editing ? "Custom instruction" : "Custom instructions"}</span>
                      </div>

                      <Textarea
                        autoFocus
                        aria-label={editing ? "Custom instruction" : "Custom generation instructions"}
                        rows={editing ? 3 : 4}
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={editing ? `e.g. Make this ${subject} more specific to our operations` : placeholder}
                        className={styles.prompt}
                      />

                      <div className={styles.formFoot}>
                        <button type="button" onClick={() => setMode("menu")} className={styles.cancel}>
                          Back
                        </button>
                        <button type="submit" className={styles.generate} disabled={editing && !customPrompt.trim()}>
                          <Sparkles size={14} aria-hidden="true" /> {editing ? "Apply" : "Generate"}
                        </button>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
