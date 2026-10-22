"use client";

import * as React from "react";
import { clsx } from "clsx";
import { useToast } from "./toast";
import { policyCraftScopeKey, policyCraftUrl, usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { useApplicationSurface } from "./application-surface";
import { FieldAccessibilityContext, useFieldAccessibility } from "./field-accessibility";

interface FieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}

export function Field({ label, hint, error, required, children, className, htmlFor }: FieldProps) {
  const application = useApplicationSurface();
  const fieldId = React.useId();
  const labelId = application && label ? `${fieldId}-label` : undefined;
  const descriptionId = application && (error || hint) ? `${fieldId}-description` : undefined;
  const child = React.Children.count(children) === 1 ? React.Children.toArray(children)[0] : undefined;
  const singleControl = React.isValidElement<{ id?: string }>(child) &&
    (child.type === Input || child.type === Textarea || child.type === Select || child.type === Combobox ||
      child.type === "input" || child.type === "textarea" || child.type === "select");
  const controlId = htmlFor || (application && singleControl ? child.props.id || `${fieldId}-control` : undefined);
  const grouped = application && Boolean(label) && !controlId;
  const Container = grouped ? "fieldset" : "div";
  const Label = grouped ? "legend" : "label";
  const content = application && singleControl && !child.props.id
    ? React.cloneElement(child, { id: controlId }) : children;
  return (
    <FieldAccessibilityContext.Provider value={application ? {labelId, descriptionId, invalid: Boolean(error)} : {}}>
    <Container className={clsx("flex min-w-0 flex-col gap-1.5", application && "pc-feature-field", className)}>
      {label && (
        <Label id={labelId} htmlFor={grouped ? undefined : controlId} className={clsx("text-[11.5px] font-semibold tracking-wide text-[var(--color-ink-2)] uppercase", application && "pc-feature-field-label")}>
          {label}
          {required && <span className="text-[#c43a3a] ml-0.5">*</span>}
        </Label>
      )}
      {content}
      {error ? (
        <p id={descriptionId} className={clsx("text-[11.5px] text-[#c43a3a] font-medium leading-snug", application && "pc-feature-field-error")}>{error}</p>
      ) : hint ? (
        <p id={descriptionId} className={clsx("text-[11.5px] text-[var(--color-muted)] leading-snug", application && "pc-feature-field-hint")}>{hint}</p>
      ) : null}
    </Container>
    </FieldAccessibilityContext.Provider>
  );
}

const baseInput =
  "w-full h-10 px-3.5 rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] text-[13.5px] text-[var(--color-ink)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-forest)] focus:ring-2 focus:ring-[var(--color-forest)]/15 transition-colors";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...rest }, ref) {
  const application = useApplicationSurface();
  const accessibility = useFieldAccessibility(rest);
  return <input ref={ref} className={clsx(baseInput, application && "pc-feature-input", className)} {...rest} {...accessibility} />;
});

interface ComboboxProps {
  value: string;
  options: string[];
  onValueChange: (value: string) => void;
  id?: string;
  name?: string;
  required?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

/** An editable dropdown with app-native styling, rather than a browser datalist. */
export function Combobox({ value, options, onValueChange, id, name, required, ariaLabel, placeholder, emptyMessage = "No matching options", disabled = false }: ComboboxProps) {
  const application = useApplicationSurface();
  const listboxId = React.useId();
  const [activeIndex, setActiveIndex] = React.useState(-1);
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

  React.useEffect(() => {
    if (application && open && activeIndex >= 0) {
      document.getElementById(`${listboxId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, application, listboxId, open]);

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={value}
        id={id}
        name={name}
        required={required}
        aria-label={ariaLabel}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => { setShowAll(false); setActiveIndex(-1); setOpen(true); }}
        onChange={(event) => {
          onValueChange(event.target.value);
          setShowAll(false);
          setActiveIndex(-1);
          setOpen(true);
        }}
        onKeyDown={application ? (event) => {
          if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActiveIndex(-1); }
          else if (event.key === "Tab") { setOpen(false); setActiveIndex(-1); }
          else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault(); setOpen(true);
            setActiveIndex(index => filtered.length ? (index < 0
              ? event.key === "ArrowDown" ? 0 : filtered.length - 1
              : (index + (event.key === "ArrowDown" ? 1 : -1) + filtered.length) % filtered.length) : -1);
          } else if (event.key === "Enter" && open && activeIndex >= 0 && filtered[activeIndex]) {
            event.preventDefault(); onValueChange(filtered[activeIndex]); setShowAll(false); setOpen(false); setActiveIndex(-1);
          }
        } : undefined}
        className={clsx(value ? "pr-[4.5rem]" : "pr-10", disabled && "cursor-not-allowed bg-[var(--color-cream)] text-[var(--color-muted)]")}
        aria-expanded={open}
        aria-haspopup="listbox"
        role={application ? "combobox" : undefined}
        aria-autocomplete={application ? "list" : undefined}
        aria-controls={application && open ? listboxId : undefined}
        aria-activedescendant={application && open && filtered[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
      />
      {value && !disabled && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => { onValueChange(""); setShowAll(true); setOpen(true); }}
          className="pc-feature-combobox-action absolute right-10 top-1 bottom-1 w-8 rounded-md text-[var(--color-muted)] hover:bg-[var(--color-cream)] hover:text-[var(--color-forest)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] transition-colors cursor-pointer"
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
        className="pc-feature-combobox-action absolute right-1 top-1 bottom-1 w-9 rounded-md text-[var(--color-muted)] hover:bg-[var(--color-cream)] hover:text-[var(--color-forest)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] transition-colors cursor-pointer"
      >
        <svg className={`mx-auto transition-transform ${open ? "rotate-180" : ""}`} width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
      {open && (
        <div id={listboxId} role="listbox" aria-label={ariaLabel || "Available options"} className="pc-feature-listbox absolute z-30 mt-1.5 w-full max-h-56 overflow-y-auto scrollbar-thin rounded-lg border border-[var(--color-line-2)] bg-[var(--color-paper)] p-1.5 shadow-[0_12px_28px_rgba(38,50,42,0.16)]">
          {filtered.length ? filtered.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              id={`${listboxId}-${index}`}
              data-pc-active={application && activeIndex === index ? "true" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onValueChange(option); setShowAll(false); setOpen(false); }}
              className={`w-full rounded-md px-3 py-2 text-left text-[12.5px] transition-colors cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] ${option === value ? "bg-[var(--color-forest-soft)] text-[var(--color-forest)] font-semibold" : "text-[var(--color-ink-2)] hover:bg-[var(--color-cream)]"}`}
            >
              {option}
            </button>
          )) : <p className="px-3 py-2 text-[12px] text-[var(--color-muted)]">{emptyMessage}</p>}
        </div>
      )}
    </div>
  );
}

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows, onBlur, onChange, ...rest },
  ref
) {
  const { push } = useToast();
  const application = useApplicationSurface();
  const accessibility = useFieldAccessibility(rest);
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
    const requestScope = usePolicyCraftScope.getState().scope;
    if (!requestScope) return;
    setChecking(true);

    try {
      const response = await fetch(policyCraftUrl("/api/grammar", requestScope), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: original }),
      });
      if (!response.ok) throw new Error("Grammar request failed");
      const { text: corrected } = await response.json() as { text?: string };

      // Do not overwrite a new edit made while the check was in flight.
      if (typeof corrected !== "string" || editVersion.current !== requestVersion || !textarea.isConnected || policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== policyCraftScopeKey(requestScope)) return;
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
        application && "pc-feature-input pc-feature-textarea",
        className
      )}
      onChange={handleChange}
      onBlur={handleBlur}
      {...rest}
      {...accessibility}
      aria-busy={checking || rest["aria-busy"] || undefined}
    />
  );
});

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, children, ...rest }, ref) {
  const application = useApplicationSurface();
  const accessibility = useFieldAccessibility(rest);
  return (
    <div className="relative">
      <select
        ref={ref}
        className={clsx(baseInput, "appearance-none pr-9 cursor-pointer", application && "pc-feature-input", className)}
        {...rest}
        {...accessibility}
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

export { DatePicker, Calendar } from "./calendar";
