"use client";

import * as React from "react";
import { clsx } from "clsx";

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

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={clsx(
        baseInput,
        "h-auto py-2 leading-relaxed resize-y",
        !rows && "min-h-[100px]",
        className
      )}
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
