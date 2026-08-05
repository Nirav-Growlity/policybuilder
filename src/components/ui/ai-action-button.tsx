"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Sparkles, Wand2, MessageSquarePlus, Send, X, Loader2 } from "lucide-react";
import { clsx } from "clsx";

interface AIActionButtonProps {
  onGenerate: (customPrompt?: string) => Promise<void> | void;
  loading?: boolean;
  label?: string;
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md";
  className?: string;
  placeholder?: string;
}

export function AIActionButton({
  onGenerate,
  loading = false,
  label = "AI Write",
  variant = "primary",
  size = "sm",
  className = "",
  placeholder = "e.g. Focus on zero waste packaging, renewable energy targets for Gujarat units...",
}: AIActionButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"menu" | "custom">("menu");
  const [customPrompt, setCustomPrompt] = React.useState("");
  const [coords, setCoords] = React.useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [mounted, setMounted] = React.useState(false);

  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updateCoords = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 6,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      updateCoords();
      window.addEventListener("scroll", updateCoords, true);
      window.addEventListener("resize", updateCoords);
    }
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, updateCoords]);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setMode("menu");
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleSuggest = async () => {
    setOpen(false);
    setMode("menu");
    await onGenerate();
  };

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(false);
    setMode("menu");
    const promptToSend = customPrompt.trim();
    setCustomPrompt("");
    await onGenerate(promptToSend || undefined);
  };

  const btnClasses = clsx(
    "inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-all duration-200 shadow-sm cursor-pointer relative select-none",
    size === "sm" ? "h-8 px-3 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]",
    variant === "primary" &&
      "bg-gradient-to-br from-[#185335] to-[#0f3823] text-white border border-[#0f3823] hover:from-[#206c46] hover:to-[#154d2f] hover:text-white hover:shadow-md active:scale-[0.98]",
    variant === "secondary" &&
      "bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-line-2)] hover:bg-[var(--color-cream-2)]",
    variant === "outline" &&
      "border border-[var(--color-forest)] text-[var(--color-forest)] bg-transparent hover:bg-[var(--color-forest-soft)]",
    variant === "ghost" &&
      "text-[var(--color-forest)] hover:bg-[var(--color-forest-soft)] bg-transparent shadow-none",
    className
  );

  return (
    <div className="inline-flex items-center shrink-0">
      <button
        ref={buttonRef}
        type="button"
        disabled={loading}
        onClick={() => {
          if (!open) updateCoords();
          setOpen(!open);
        }}
        className={btnClasses}
      >
        {loading ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <Wand2 size={13} className="text-amber-300" />
        )}
        <span>{loading ? "Generating…" : label}</span>
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              right: `${coords.right}px`,
              zIndex: 999999,
            }}
            className="w-80 sm:w-96 rounded-xl bg-white border border-[var(--color-line)] shadow-2xl overflow-hidden text-left font-sans text-[13px] animate-in fade-in zoom-in-95 duration-150"
          >
            {mode === "menu" ? (
              <div className="p-2 space-y-1">
                <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  Select Generation Option
                </div>
                <button
                  type="button"
                  onClick={handleSuggest}
                  className="w-full text-left flex items-start gap-3 p-2.5 rounded-lg hover:bg-[var(--color-cream-2)] transition-colors group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-[var(--color-forest-soft)] text-[var(--color-forest)] group-hover:bg-[var(--color-forest)] group-hover:text-white transition-colors shrink-0">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-forest-deep)]">
                      Suggest for me
                    </div>
                    <div className="text-[11.5px] text-[var(--color-muted)] leading-tight mt-0.5">
                      Automatically write based on company profile & standards.
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMode("custom")}
                  className="w-full text-left flex items-start gap-3 p-2.5 rounded-lg hover:bg-[var(--color-cream-2)] transition-colors group cursor-pointer"
                >
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition-colors shrink-0">
                    <MessageSquarePlus size={16} />
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--color-ink)]">
                      Custom prompt
                    </div>
                    <div className="text-[11.5px] text-[var(--color-muted)] leading-tight mt-0.5">
                      Write specific instructions to personalize the output.
                    </div>
                  </div>
                </button>
              </div>
            ) : (
              <form onSubmit={handleCustomSubmit} className="p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[var(--color-ink)] flex items-center gap-1.5">
                    <MessageSquarePlus size={14} className="text-amber-600" /> Custom Instructions
                  </span>
                  <button
                    type="button"
                    onClick={() => setMode("menu")}
                    className="p-1 rounded-md text-[var(--color-muted)] hover:bg-[var(--color-cream-2)]"
                  >
                    <X size={14} />
                  </button>
                </div>

                <textarea
                  autoFocus
                  rows={3}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={placeholder}
                  className="w-full text-[12.5px] p-2.5 rounded-lg border border-[var(--color-line-2)] focus:outline-none focus:ring-2 focus:ring-[var(--color-forest)]/30 focus:border-[var(--color-forest)] bg-[var(--color-paper)] resize-none"
                />

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setMode("menu")}
                    className="px-3 py-1.5 rounded-md text-[12px] font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-br from-[#185335] to-[#0f3823] text-white text-[12px] font-semibold hover:from-[#206c46] hover:to-[#154d2f] hover:text-white shadow-sm cursor-pointer transition-all"
                  >
                    <Send size={12} /> Generate
                  </button>
                </div>
              </form>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
