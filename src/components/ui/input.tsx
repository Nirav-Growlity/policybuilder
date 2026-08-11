"use client";

import * as React from "react";
import { clsx } from "clsx";
import { useToast } from "./toast";

interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, hint, required, children, className }: FieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {label && (
        <label className="text-[11.5px] font-semibold tracking-wide text-[var(--color-ink-2)] uppercase">
          {label}
          {required && <span className="text-[#c43a3a] ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint && <p className="text-[11.5px] text-[var(--color-muted)] leading-snug">{hint}</p>}
    </div>
  );
}

const baseInput =
  "w-full h-10 px-3.5 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] text-[13.5px] text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-forest)] focus:ring-2 focus:ring-[var(--color-forest)]/15 transition-colors";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={clsx(baseInput, className)} {...rest} />;
});

interface ComboboxProps {
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

/** An editable dropdown with app-native styling, rather than a browser datalist. */
export function Combobox({ value, options, onValueChange, placeholder, emptyMessage = "No matching options", disabled = false }: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [showAll, setShowAll] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const filtered = showAll ? options : options.filter((option) => option.toLowerCase().includes(value.toLowerCase()));

  React.useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => { setShowAll(false); setOpen(true); }}
        onChange={(event) => {
          onValueChange(event.target.value);
          setShowAll(false);
          setOpen(true);
        }}
        className={clsx(value ? "pr-[4.5rem]" : "pr-10", disabled && "cursor-not-allowed bg-[var(--color-cream)] text-[var(--color-muted)]")}
        aria-expanded={open}
        aria-haspopup="listbox"
      />
      {value && !disabled && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => { onValueChange(""); setShowAll(true); setOpen(true); }}
          className="absolute right-10 top-1 bottom-1 w-8 rounded-md text-[var(--color-muted)] hover:bg-[var(--color-cream)] hover:text-[var(--color-forest)] transition-colors cursor-pointer"
        >
          <svg className="mx-auto" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      )}
      {!disabled && <button
        type="button"
        aria-label="Show options"
        onClick={() => {
          setShowAll(true);
          setOpen((shown) => !shown);
        }}
        className="absolute right-1 top-1 bottom-1 w-9 rounded-md text-[var(--color-muted)] hover:bg-[var(--color-cream)] hover:text-[var(--color-forest)] transition-colors cursor-pointer"
      >
        <svg className={`mx-auto transition-transform ${open ? "rotate-180" : ""}`} width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
      {open && (
        <div role="listbox" className="absolute z-30 mt-1.5 w-full max-h-56 overflow-y-auto rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] p-1.5 shadow-[0_12px_28px_rgba(38,50,42,0.16)]">
          {filtered.length ? filtered.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onValueChange(option); setShowAll(false); setOpen(false); }}
              className={`w-full rounded-md px-3 py-2 text-left text-[12.5px] transition-colors cursor-pointer ${option === value ? "bg-[var(--color-forest-soft)] text-[var(--color-forest)] font-semibold" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream)]"}`}
            >
              {option}
            </button>
          )) : <p className="px-3 py-2 text-[12px] text-[var(--color-muted)]">{emptyMessage}</p>}
        </div>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows, onBlur, onChange, ...rest },
  ref
) {
  const { push } = useToast();
  const [checking, setChecking] = React.useState(false);
  const manuallyEdited = React.useRef(false);
  const editVersion = React.useRef(0);

  const handleChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    // AI-generated values arrive through props. Only a real user edit can make a
    // textarea eligible for a correction request.
    if (event.nativeEvent.isTrusted) {
      manuallyEdited.current = true;
      editVersion.current += 1;
    }
    onChange?.(event);
  }, [onChange]);

  const handleBlur = React.useCallback(async (event: React.FocusEvent<HTMLTextAreaElement>) => {
    onBlur?.(event);
    const textarea = event.currentTarget;
    const original = textarea.value;
    if (!manuallyEdited.current || !original.trim() || checking) return;

    manuallyEdited.current = false;
    const requestVersion = editVersion.current;
    setChecking(true);

    try {
      const response = await fetch("/api/grammar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: original }),
      });
      if (!response.ok) throw new Error("Grammar request failed");
      const { text: corrected } = await response.json() as { text?: string };

      // Do not overwrite a new edit made while the check was in flight.
      if (typeof corrected !== "string" || editVersion.current !== requestVersion) return;
      if (corrected !== original) {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setter?.call(textarea, corrected);
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        push("Spelling and grammar corrected", "success");
      }
    } catch {
      manuallyEdited.current = true;
      push("Could not check spelling and grammar", "error");
    } finally {
      setChecking(false);
    }
  }, [checking, onBlur, push]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      data-grammar-checking={checking ? "true" : undefined}
      className={clsx(
        baseInput,
        "h-auto py-2 leading-relaxed resize-y",
        !rows && "min-h-[100px]",
        className
      )}
      onChange={handleChange}
      onBlur={handleBlur}
      {...rest}
    />
  );
});

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={clsx(baseInput, "appearance-none pr-9 cursor-pointer", className)}
        {...rest}
      >
        {children}
      </select>
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-muted)]"
        width="10"
        height="6"
        viewBox="0 0 10 6"
        fill="none"
      >
        <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
});
