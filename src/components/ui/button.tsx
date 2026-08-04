"use client";

import * as React from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "ghost" | "ai" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--color-forest)] text-white border border-[var(--color-forest)] hover:bg-[var(--color-forest-deep)] hover:border-[var(--color-forest-deep)]",
  secondary:
    "bg-[var(--color-paper)] text-[var(--color-ink)] border border-[var(--color-line)] hover:bg-[var(--color-cream-2)]",
  ghost:
    "bg-transparent text-[var(--color-ink-2)] border border-transparent hover:bg-[var(--color-cream-2)]",
  ai:
    "bg-gradient-to-br from-[#1a4a4e] to-[#0f3034] text-white border border-[#0f3034] hover:brightness-110",
  danger:
    "bg-[#fdecec] text-[#9b2929] border border-[#f1c2c2] hover:bg-[#fbe0e0]",
  outline:
    "bg-transparent text-[var(--color-ink)] border border-[var(--color-line-2)] hover:bg-[var(--color-cream-2)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[12.5px] gap-1.5",
  md: "h-10 px-4 text-[13.5px] gap-2",
  lg: "h-12 px-5 text-[15px] gap-2.5",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "secondary", size = "md", icon, trailingIcon, loading, className, children, disabled, ...rest },
    ref
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={clsx(
          "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...rest}
      >
        {loading ? (
          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          icon
        )}
        {children}
        {!loading && trailingIcon}
      </button>
    );
  }
);
