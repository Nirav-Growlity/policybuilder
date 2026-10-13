"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { useApplicationSurface } from "./application-surface";

type ActionDisclosureProps = {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
};

/** Compact actions that stay in the normal Tab order instead of emulating an ARIA menu. */
export function ActionDisclosure({ label, children, disabled = false }: ActionDisclosureProps) {
  const application = useApplicationSurface();
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = React.useState<{ top: number; right: number; maxHeight: number; above: boolean } | null>(null);

  // The panel is portalled with fixed positioning so clipped tables and later rows cannot hide it.
  const updatePlacement = React.useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const gap = 8;
    const edge = 12;
    const anchor = trigger.getBoundingClientRect();
    const height = panel.scrollHeight;
    const spaceBelow = window.innerHeight - anchor.bottom - gap - edge;
    const spaceAbove = anchor.top - gap - edge;
    const above = height > spaceBelow && spaceAbove > spaceBelow;
    const maxHeight = Math.max(above ? spaceAbove : spaceBelow, 120);
    const top = above ? Math.max(edge, anchor.top - gap - Math.min(height, maxHeight)) : anchor.bottom + gap;
    setPlacement({ top, right: Math.max(edge, window.innerWidth - anchor.right), maxHeight, above });
  }, []);

  React.useLayoutEffect(() => {
    if (!open) return;
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  React.useEffect(() => {
    if (!open) return;
    const isInside = (target: EventTarget | null) => target instanceof Node && (rootRef.current?.contains(target) || panelRef.current?.contains(target));
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isInside(event.target)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-flex ${application ? "pc-disclosure-root" : ""} ${open ? "z-30" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={application ? "pc-disclosure-trigger pc-focus" : "inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-50"}
      >
        <MoreHorizontal size={19} aria-hidden="true" />
      </button>
      {open ? createPortal(
        <div className={application ? "pc-ui" : undefined}>
          <motion.div
            ref={panelRef}
            id={id}
            className={application ? "pc-disclosure-panel" : "min-w-52 overflow-y-auto rounded-xl border border-[var(--color-line)] bg-white p-1.5 shadow-[0_16px_44px_rgba(29,45,36,.16)]"}
            initial={application ? { opacity: 0, scale: 0.98 } : false}
            animate={application ? { opacity: 1, scale: 1 } : undefined}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{
              position: "fixed",
              zIndex: 60,
              margin: 0,
              top: placement?.top ?? 0,
              right: placement?.right ?? 0,
              maxHeight: placement?.maxHeight,
              visibility: placement ? "visible" : "hidden",
              transformOrigin: placement?.above ? "bottom right" : "top right",
            }}
            onClick={() => {
              triggerRef.current?.focus();
              setOpen(false);
            }}
          >
            {children}
          </motion.div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function ActionDisclosureItem({
  children,
  onClick,
  disabled = false,
  destructive = false,
  busy = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
  busy?: boolean;
}) {
  const application = useApplicationSurface();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={application ? `pc-disclosure-item pc-focus ${destructive ? "pc-disclosure-danger" : ""}` : `flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-60 ${destructive ? "text-red-800 hover:bg-red-50" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]"}`}
    >
      {children}
    </button>
  );
}
