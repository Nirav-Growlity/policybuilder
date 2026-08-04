"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, X, Info, AlertTriangle } from "lucide-react";
import { clsx } from "clsx";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  text: string;
  type: ToastType;
}

interface ToastContextValue {
  push: (text: string, type?: ToastType) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <Toaster />");
  return ctx;
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const push = React.useCallback((text: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const ctx = React.useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {mounted &&
        createPortal(
          <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
            {items.map((t) => (
              <div
                key={t.id}
                className={clsx(
                  "pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-[var(--shadow-lift)] animate-fade-up max-w-sm",
                  t.type === "success" && "bg-[var(--color-forest)] text-white",
                  t.type === "error" && "bg-[#7a1f1f] text-white",
                  t.type === "info" && "bg-[var(--color-blue-ink)] text-white"
                )}
              >
                {t.type === "success" && <Check size={16} />}
                {t.type === "error" && <X size={16} />}
                {t.type === "info" && <Info size={16} />}
                <span>{t.text}</span>
              </div>
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export { AlertTriangle };
