"use client";

import * as React from "react";
import { clsx } from "clsx";
import type { TextReveal } from "@/lib/ai/text-reveal";
import { FIELD_BREAK, ITEM_BREAK } from "@/lib/ai/use-generation-streams";
import styles from "./ai-stream.module.css";

const noSubscribe = () => () => undefined;

/** The text a reveal has shown so far; re-renders only the component that reads it. */
export function useRevealText(reveal?: TextReveal) {
  return React.useSyncExternalStore(
    reveal ? reveal.subscribe : noSubscribe,
    () => reveal?.text ?? "",
    () => "",
  );
}

/** One word. Memoised so settled words keep their finished animation while the stream grows. */
const Word = React.memo(function Word({ children }: { children: string }) {
  return <span className={styles.word}>{children}</span>;
});

/** Streamed text: each new word settles in from the brand ink, with a caret at the end. */
export function StreamTokens({ text, caret = true }: { text: string; caret?: boolean }) {
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((part, index) => (/^\s*$/.test(part) ? part : <Word key={index}>{part}</Word>))}
      {caret ? <span className={styles.caret} aria-hidden="true" /> : null}
    </>
  );
}

/** Shown until the first words arrive: the field rules itself like a page about to be written on. */
export function Composing({ lines = 3, note = "Drafting from your company profile and selected standards", compact = false }: { lines?: number; note?: string; compact?: boolean }) {
  return (
    <div className={clsx(styles.composing, compact && styles.compact)} role="status">
      <div className={styles.rules} aria-hidden="true">
        {Array.from({ length: lines }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}
      </div>
      {note ? <span className={styles.note}>{note}</span> : null}
    </div>
  );
}

/** A long-form section while the AI writes it. Takes the writing field's class so the swap back is seamless. */
export function StreamingProse({ reveal, className, label, fallback }: {
  reveal: TextReveal;
  className?: string;
  label?: string;
  /** Text to keep on screen (dimmed) until the first new words arrive, when rewriting an existing section. */
  fallback?: React.ReactNode;
}) {
  const text = useRevealText(reveal);
  return (
    <div className={clsx(className, styles.prose)} aria-label={label} aria-busy="true" data-streaming={text ? "" : undefined}>
      {text ? <StreamTokens text={text} /> : fallback ?? <Composing />}
    </div>
  );
}

/**
 * List items streaming in one after another. The reveal's text holds the items
 * separated by ITEM_BREAK, and each item's fields separated by FIELD_BREAK.
 */
export function StreamingItems({ reveal, render, waiting }: {
  reveal: TextReveal;
  render: (fields: string[], index: number, writing: boolean) => React.ReactNode;
  /** Shown before the first item starts. */
  waiting?: React.ReactNode;
}) {
  const text = useRevealText(reveal);
  if (!text) return <>{waiting ?? null}</>;
  const items = text.split(ITEM_BREAK).map((item) => item.split(FIELD_BREAK));
  return <>{items.map((fields, index) => render(fields, index, index === items.length - 1))}</>;
}

/** Renders one streamed field, with the caret only while it is the one being written. */
export function StreamField({ text, writing, className }: { text: string; writing: boolean; className?: string }) {
  return <span className={clsx(styles.field, className)}><StreamTokens text={text} caret={writing} /></span>;
}

export { styles as aiStream };
