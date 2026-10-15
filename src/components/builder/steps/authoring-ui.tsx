"use client";

import * as React from "react";
import { clsx } from "clsx";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { MotionConfig, motion } from "motion/react";
import { Textarea } from "@/components/ui/input";
import styles from "./authoring.module.css";
import { StreamingProse, useRevealText } from "@/components/ui/ai-stream";
import type { TextReveal } from "@/lib/ai/text-reveal";

gsap.registerPlugin(useGSAP);

export { styles as authoring };

/** Wraps a write-mode step. Its sheets settle in once when the step opens. */
export function StepRoot({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const root = ref.current;
    if (!root) return;
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(Array.from(root.children), { y: 14, autoAlpha: 0, duration: 0.46, ease: "power3.out", stagger: 0.06, clearProps: "opacity,visibility,transform" });
    });
    return () => media.revert();
  }, { scope: ref });

  return (
    <MotionConfig reducedMotion="user">
      <div ref={ref} data-authoring-root="" className={clsx(styles.root, className)}>{children}</div>
    </MotionConfig>
  );
}

/** Resizes a textarea to its content so long sections never scroll inside a box. */
export function useAutosize(value: string) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const resize = React.useCallback(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, []);
  React.useLayoutEffect(resize, [resize, value]);
  React.useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);
  return { ref, resize };
}

type AutosizeTextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
};

/** A textarea that grows with its text. Grammar checking comes from the shared Textarea. */
export function AutosizeTextarea({ value, onChange, className, rows = 1, ...rest }: AutosizeTextareaProps) {
  const { ref, resize } = useAutosize(value);
  return (
    <Textarea
      ref={ref}
      rows={rows}
      value={value}
      onChange={(event) => { onChange(event); resize(); }}
      className={clsx("overflow-hidden", className)}
      {...rest}
    />
  );
}

const countWords = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;

/** Long-form section body: a calm writing surface with a word count beneath it. While `stream` is set, the AI's words arrive in place. */
export function WritingField({ value, onChange, placeholder, busy, label, stream }: {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  busy?: boolean;
  label?: string;
  stream?: TextReveal;
}) {
  const streamed = useRevealText(stream);
  const words = countWords(stream ? streamed : value);

  return (
    <div>
      {stream ? (
        <StreamingProse reveal={stream} label={label} className={styles.writing} />
      ) : (
        <AutosizeTextarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={4}
          aria-label={label}
          data-busy={busy || undefined}
          className={styles.writing}
        />
      )}
      <div className={styles.fieldMeta} aria-hidden="true">
        {words > 0 ? <span>{words} {words === 1 ? "word" : "words"}</span> : null}
      </div>
    </div>
  );
}

/** Checkbox face; the tick draws in when checked. Pair it with a visually hidden input placed before it. */
export function Checkmark({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className={styles.check} data-checked={checked || undefined}>
      <svg viewBox="0 0 16 16">
        <motion.path
          d="M3.5 8.5 6.6 11.5 12.5 4.8"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        />
      </svg>
    </span>
  );
}

/** Entrance for an item added after the list first rendered (pair with AnimatePresence initial={false}). */
export const itemEnter = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const },
};
