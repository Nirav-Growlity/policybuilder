"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronDown, PenLine, Sparkles, WandSparkles } from "lucide-react";
import { clsx } from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Textarea } from "./input";
import { useApplicationSurface } from "./application-surface";
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
}

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
}: AIActionButtonProps) {
  const application = useApplicationSurface();
  const reduceMotion = useReducedMotion();
  const popoverId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"menu" | "custom">("menu");
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [coords, setCoords] = React.useState<{ top: number; right: number; above: boolean }>({ top: 0, right: 0, above: false });
  const mounted = React.useSyncExternalStore(() => () => undefined, () => true, () => false);
  const quiet = variant === "ghost";
  const stoppable = loading && Boolean(onStop);

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
    setOpen(false);
    setMode("menu");
    const promptToSend = customPrompt.trim();
    setCustomPrompt("");
    await onGenerate(promptToSend || undefined);
  };

  const iconSize = quiet ? 14 : size === "md" ? 16 : 15;
  const panelMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, y: coords.above ? 6 : -6, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: coords.above ? 4 : -4, scale: 0.98 },
      };
  const contentMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: mode === "custom" ? 12 : -12 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0 } };

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
              {quiet ? <WandSparkles size={iconSize} /> : <Sparkles size={iconSize} />}
            </span>
            <span>{label}</span>
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
                aria-label="Policy generation"
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
                  {mode === "menu" ? (
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
                          aria-label="Back to generation options"
                          className={styles.back}
                        >
                          <ArrowLeft size={15} />
                        </button>
                        <span className={styles.formTitle}>Custom instructions</span>
                      </div>

                      <Textarea
                        autoFocus
                        aria-label="Custom generation instructions"
                        rows={4}
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder={placeholder}
                        className={styles.prompt}
                      />

                      <div className={styles.formFoot}>
                        <button type="button" onClick={() => setMode("menu")} className={styles.cancel}>
                          Back
                        </button>
                        <button type="submit" className={styles.generate}>
                          <Sparkles size={14} aria-hidden="true" /> Generate
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
