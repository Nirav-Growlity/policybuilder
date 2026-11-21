"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, X, Info, AlertTriangle, CircleAlert, LoaderCircle } from "lucide-react";
import { clsx } from "clsx";
import { AnimatePresence, motion } from "motion/react";

type ToastType = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  /** A button inside the toast, such as Undo. Choosing it dismisses the toast. */
  action?: ToastAction;
  /** How long the toast stays, in milliseconds. Defaults to 5 seconds. */
  duration?: number;
  /** Work in progress: shows a spinner and stays until `dismiss` or `update` ends it. */
  busy?: boolean;
}

interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
  action?: ToastAction;
  duration: number;
  busy: boolean;
}

interface ToastContextValue {
  /** Shows a toast and returns its id. */
  push: (text: string, type?: ToastType, options?: ToastOptions) => number;
  /** Changes a toast's text (for example the next step of a busy toast). */
  update: (id: number, text: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <Toaster />");
  return ctx;
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(0);
  const mounted = React.useSyncExternalStore(() => () => undefined, () => true, () => false);

  const push = React.useCallback((text: string, type: ToastType = "success", options?: ToastOptions) => {
    const id = ++nextId.current;
    setItems((prev) => [...prev, { id, text, type, action: options?.action, duration: options?.duration ?? 5000, busy: Boolean(options?.busy) }]);
    return id;
  }, []);
  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);
  const update = React.useCallback((id: number, text: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, text } : item)));
  }, []);

  const ctx = React.useMemo(() => ({ push, update, dismiss }), [push, update, dismiss]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {mounted &&
        createPortal(
          <div className="pc-ui pc-toast-region" role="region" aria-label="Notifications">
            <AnimatePresence initial={false}>
              {items.map((item) => <ToastNotification key={item.id} item={item} dismiss={dismiss} />)}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

function ToastNotification({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const remaining = React.useRef(item.duration);
  const paused = hovered || focused;

  React.useEffect(() => {
    if (paused || item.busy) return;
    const started = performance.now();
    const timer = window.setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [dismiss, item.id, item.busy, paused]);

  const Icon = item.busy ? LoaderCircle : item.type === "success" ? CheckCircle2 : item.type === "error" ? CircleAlert : Info;
  return (
    <motion.div
      className={clsx("pc-toast", `pc-toast-${item.type}`, item.busy && "pc-toast-busy")}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    >
      <Icon size={18} aria-hidden="true" className={clsx("pc-toast-icon", item.busy && "pc-toast-spinner")} />
      <span className="pc-toast-text">{item.text}</span>
      {item.action ? (
        <button
          type="button"
          className="pc-toast-action pc-focus"
          onClick={() => { item.action?.onClick(); dismiss(item.id); }}
        >
          {item.action.label}
        </button>
      ) : null}
      <button type="button" className="pc-toast-close pc-focus" aria-label={`Dismiss notification: ${item.text}`} onClick={() => dismiss(item.id)}>
        <X size={16} aria-hidden="true" />
      </button>
    </motion.div>
  );
}

export { AlertTriangle };
