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
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[rgba(14,26,20,0.4)] backdrop-blur-sm animate-fade-in">
      <div
        className="bg-[var(--color-paper)] rounded-2xl shadow-[var(--shadow-lift)] overflow-hidden animate-fade-up"
        style={{ width, maxWidth: "calc(100vw - 32px)" }}
      >
        {(title || !hideClose) && (
          <header className="flex items-start justify-between gap-4 px-7 pt-6">
            <div className="min-w-0">
              {title && <h2 className="font-display text-[19px] font-semibold text-[var(--color-ink)] tracking-tight">{title}</h2>}
              {description && <p className="text-[12.5px] text-[var(--color-muted)] mt-1.5 leading-relaxed">{description}</p>}
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                className="text-[var(--color-muted)] hover:text-[var(--color-ink)] transition-colors p-1 -m-1"
                aria-label="Close"
              >
                <X size={18} />
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
