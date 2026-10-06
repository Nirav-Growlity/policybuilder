"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { clsx } from "clsx";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
  hideClose?: boolean;
}

export function Modal({ open, onClose, title, description, children, width = 460, hideClose }: ModalProps) {
  const mounted = React.useSyncExternalStore(() => () => undefined, () => true, () => false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const titleId = React.useId();
  const descriptionId = React.useId();
  React.useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const frame = window.requestAnimationFrame(() => dialogRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        e.preventDefault();
        dialogRef.current.focus();
      } else if (!dialogRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousBodyOverflow;
      if (previousActive?.isConnected) previousActive.focus();
    };
  }, [open]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto overscroll-contain p-4 bg-[rgba(14,26,20,0.4)] backdrop-blur-sm animate-fade-in motion-reduce:animate-none">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        aria-label={title ? undefined : "Dialog"}
        tabIndex={-1}
        className="bg-[var(--color-paper)] rounded-2xl shadow-[var(--shadow-lift)] overflow-hidden animate-fade-up focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] motion-reduce:animate-none"
        style={{ width, maxWidth: "calc(100vw - 32px)", maxHeight: "calc(100dvh - 32px)", overflowY: "auto" }}
      >
        {(title || !hideClose) && (
          <header className="flex items-start justify-between gap-4 px-7 pt-6">
            <div className="min-w-0">
              {title && <h2 id={titleId} className="font-display text-[19px] font-semibold text-[var(--color-ink)] tracking-tight">{title}</h2>}
              {description && <p id={descriptionId} className="text-[12.5px] text-[var(--color-muted)] mt-1.5 leading-relaxed">{description}</p>}
            </div>
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                className="min-h-8 min-w-8 -m-1 inline-flex items-center justify-center rounded text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </header>
        )}
        <div className={clsx("px-7", title ? "py-5" : "pt-7 pb-7")}>{children}</div>
      </div>
    </div>,
    document.body
  );
}
