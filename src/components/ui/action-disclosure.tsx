"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";

type ActionDisclosureProps = {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
};

/** Compact actions that stay in the normal Tab order instead of emulating an ARIA menu. */
export function ActionDisclosure({ label, children, disabled = false }: ActionDisclosureProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onFocusIn = (event: FocusEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
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
    <div ref={rootRef} className={`relative inline-flex ${open ? "z-30" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--color-line-2)] bg-white text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MoreHorizontal size={19} aria-hidden="true" />
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={id}
          className="absolute right-0 top-full z-50 mt-2 min-w-52 rounded-xl border border-[var(--color-line)] bg-white p-1.5 shadow-[0_16px_44px_rgba(29,45,36,.16)]"
          onClick={() => {
            triggerRef.current?.focus();
            setOpen(false);
          }}
        >
          {children}
        </div>
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
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-60 ${destructive ? "text-red-800 hover:bg-red-50" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]"}`}
    >
      {children}
    </button>
  );
}
