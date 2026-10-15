"use client";

/**
 * Paces streamed text for display. Network chunks arrive in uneven bursts;
 * the reveal releases characters at a rate that follows the backlog, so the
 * text reads as one steady stream and still catches up quickly when a large
 * chunk lands. Components subscribe to it, so only the streaming surface
 * re-renders on each frame.
 */
export interface TextReveal {
  /** The text shown so far. */
  readonly text: string;
  /** True once the first character is on screen. */
  readonly started: boolean;
  /** Replace the full text the reveal is heading towards (it only grows during a stream). */
  set(target: string): void;
  /** Set the final text and resolve once all of it is shown. */
  finish(target?: string): Promise<void>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/** Below this rate the stream would feel stalled; the backlog term speeds it up from here. */
const MIN_CHARS_PER_SECOND = 55;
/** How quickly a backlog drains: about 63% of it is shown within this many milliseconds. */
const CATCH_UP_MS = 160;

export interface TextRevealOptions {
  /** The steady rate when there is no backlog. */
  charsPerSecond?: number;
  /** How quickly a backlog drains; Infinity keeps a fixed pace for an even rhythm. */
  catchUpMs?: number;
}

export function createTextReveal({ charsPerSecond = MIN_CHARS_PER_SECOND, catchUpMs = CATCH_UP_MS }: TextRevealOptions = {}): TextReveal {
  let target = "";
  let shown = 0;
  let carry = 0;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = 0;
  let text = "";
  const listeners = new Set<() => void>();
  const waiting: (() => void)[] = [];
  const instant = typeof window === "undefined";

  const emit = () => { listeners.forEach((listener) => listener()); };
  const settleWaiting = () => { if (shown >= target.length) waiting.splice(0).forEach((resolve) => resolve()); };

  const cancel = () => {
    if (frame) cancelAnimationFrame(frame);
    if (timer) clearTimeout(timer);
    frame = 0;
    timer = undefined;
  };
  // Animation frames pause while the window is covered or in the background; a slower timer keeps the stream moving.
  const schedule = () => {
    frame = requestAnimationFrame(tick);
    timer = setTimeout(() => tick(performance.now()), 200);
  };

  const tick = (now: number) => {
    cancel();
    const dt = Math.min(250, last ? now - last : 16);
    last = now;
    const backlog = target.length - shown;
    carry += Math.max((charsPerSecond * dt) / 1000, backlog * (1 - Math.exp(-dt / catchUpMs)));
    const step = Math.min(backlog, Math.floor(carry));
    carry -= step;
    if (step > 0) {
      shown += step;
      text = target.slice(0, shown);
      emit();
    }
    if (shown < target.length) schedule();
    else { last = 0; carry = 0; settleWaiting(); }
  };

  const run = () => {
    if (instant) {
      shown = target.length;
      text = target;
      emit();
      settleWaiting();
      return;
    }
    if (!frame && !timer && shown < target.length) schedule();
    settleWaiting();
  };

  return {
    get text() { return text; },
    get started() { return shown > 0; },
    set(next) {
      // A rewrite of text already shown (rare, e.g. a corrected escape) restarts from the common prefix.
      if (!next.startsWith(target.slice(0, shown))) {
        let common = 0;
        while (common < shown && next[common] === target[common]) common++;
        shown = common;
        text = next.slice(0, shown);
        emit();
      }
      target = next;
      run();
    },
    finish(next) {
      if (next !== undefined) this.set(next);
      // In a hidden tab nobody is watching; show the rest at once so the caller is not held up.
      if (typeof document !== "undefined" && document.hidden && shown < target.length) {
        cancel();
        shown = target.length;
        text = target;
        emit();
      }
      return new Promise<void>((resolve) => { waiting.push(resolve); settleWaiting(); });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    dispose() {
      cancel();
      shown = target.length;
      settleWaiting();
      listeners.clear();
    },
  };
}
