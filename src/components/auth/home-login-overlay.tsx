"use client";

import * as React from "react";
import { animate } from "motion/react";
import { LoginScene } from "./login-scene";

const EASE = [0.22, 1, 0.36, 1] as const;
const OPEN_MS = 700;
const CLOSE_MS = 650;

type Flip = { x: number; y: number; scaleX: number; scaleY: number };

/** Offset and scale that place `element` exactly over `target`. Both are measured in the viewport. */
function flipOnto(element: HTMLElement, target: HTMLElement): Flip | null {
  if (!element.offsetWidth || !element.offsetHeight || !target.offsetWidth || !target.offsetHeight) return null;
  const a = element.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  return {
    x: b.left + b.width / 2 - (a.left + a.width / 2),
    y: b.top + b.height / 2 - (a.top + a.height / 2),
    scaleX: target.offsetWidth / element.offsetWidth,
    scaleY: target.offsetHeight / element.offsetHeight,
  };
}

type HomeLoginOverlayProps = {
  /** The hero's sample document: the sheet grows out of it and settles back onto it. */
  docRef: React.RefObject<HTMLElement | null>;
  phase: "open" | "closing";
  /** Starts the close (the page owns history, so it decides how). */
  onRequestClose: () => void;
  /** Called once the close animation has finished. */
  onClosed: () => void;
};

/**
 * The sign-in sheet shown over the home hero without leaving the page. Only the
 * empty sheet shell moves (transform), and its contents fade in once it has
 * landed, so nothing re-lays out or re-rasterises text mid-flight.
 */
export function HomeLoginOverlay({ docRef, phase, onRequestClose, onClosed }: HomeLoginOverlayProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = React.useRef<HTMLElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const openedRef = React.useRef(false);

  React.useLayoutEffect(() => {
    const root = rootRef.current;
    const sheet = sheetRef.current;
    const content = contentRef.current;
    if (!root || !sheet || !content || openedRef.current) return;
    openedRef.current = true;
    const focusFirstField = () => root.querySelector<HTMLInputElement>("input:not([readonly])")?.focus({ preventScroll: true });
    const doc = docRef.current;
    const flip = doc ? flipOnto(sheet, doc) : null;
    root.style.opacity = "0";
    content.style.opacity = "0";
    void animate(root, { opacity: [0, 1] }, { duration: 0.28, ease: "easeOut" });
    if (flip) {
      sheet.style.transform = `translate3d(${flip.x}px, ${flip.y}px, 0) rotate(1.6deg) scale(${flip.scaleX}, ${flip.scaleY})`;
      void animate(sheet, { x: [flip.x, 0], y: [flip.y, 0], rotate: [1.6, 0], scaleX: [flip.scaleX, 1], scaleY: [flip.scaleY, 1] }, { duration: OPEN_MS / 1000, ease: EASE });
    }
    void animate(content, { opacity: [0, 1] }, { duration: 0.3, delay: flip ? 0.38 : 0.1, ease: "easeOut" });
    // Safety net: never leave the sheet hidden if a frame loop stalls.
    window.setTimeout(() => { root.style.opacity = ""; content.style.opacity = ""; focusFirstField(); }, OPEN_MS + 300);
  }, [docRef]);

  React.useEffect(() => {
    if (phase !== "closing") return;
    const root = rootRef.current;
    const sheet = sheetRef.current;
    const content = contentRef.current;
    if (!root || !sheet || !content) { onClosed(); return; }
    const doc = docRef.current;
    const flip = doc ? flipOnto(sheet, doc) : null;
    void animate(content, { opacity: 0 }, { duration: 0.14, ease: "easeOut" });
    if (flip) void animate(sheet, { x: [0, flip.x], y: [0, flip.y], rotate: [0, 1.6], scaleX: [1, flip.scaleX], scaleY: [1, flip.scaleY] }, { duration: CLOSE_MS / 1000 - 0.1, delay: 0.1, ease: EASE });
    void animate(root, { opacity: [1, 0] }, { duration: 0.24, delay: flip ? 0.4 : 0.1, ease: "easeIn" });
    const timer = window.setTimeout(onClosed, CLOSE_MS + 40);
    return () => window.clearTimeout(timer);
  }, [phase, docRef, onClosed]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && phase === "open") { event.preventDefault(); onRequestClose(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [phase, onRequestClose]);

  return (
    <div ref={rootRef} data-lenis-prevent style={{ position: "absolute", inset: 0, zIndex: 4, overflowY: "auto", willChange: "opacity" }} role="region" aria-label="Sign in">
      <LoginScene variant="overlay" sheetRef={sheetRef} contentRef={contentRef} onClose={phase === "open" ? onRequestClose : undefined} />
    </div>
  );
}
