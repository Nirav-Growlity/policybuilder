"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, CheckCircle2, CircleHelp, Info, LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { twMerge } from "tailwind-merge";
import styles from "./app-primitives.module.css";

const buttonVariants = cva(styles.button, {
  variants: {
    variant: {
      primary: styles.buttonPrimary,
      secondary: styles.buttonSecondary,
      outline: styles.buttonOutline,
      ghost: styles.buttonGhost,
      danger: styles.buttonDanger,
    },
    size: {
      sm: styles.buttonSmall,
      md: styles.buttonMedium,
      lg: styles.buttonLarge,
      icon: styles.buttonIcon,
    },
  },
  defaultVariants: { variant: "secondary", size: "md" },
});

export interface ApplicationButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  busy?: boolean;
  busyLabel?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const ApplicationButton = React.forwardRef<HTMLButtonElement, ApplicationButtonProps>(function ApplicationButton(
  { variant, size, className, children, busy = false, busyLabel, leadingIcon, trailingIcon, disabled, ...props },
  ref,
) {
  const label = busy && busyLabel ? busyLabel : children;
  return (
    <button
      ref={ref}
      className={twMerge(buttonVariants({ variant, size }), className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? <LoaderCircle className={styles.spinner} size={16} aria-hidden="true" /> : leadingIcon}
      <span className={styles.buttonLabel}>{label}</span>
      {!busy && trailingIcon}
    </button>
  );
});

const inputVariants = cva(styles.input, {
  variants: {
    size: { compact: styles.inputCompact, operational: styles.inputOperational },
    invalid: { true: styles.inputInvalid, false: "" },
  },
  defaultVariants: { size: "operational", invalid: false },
});

export interface ApplicationInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">, VariantProps<typeof inputVariants> {}

export const ApplicationInput = React.forwardRef<HTMLInputElement, ApplicationInputProps>(function ApplicationInput(
  { className, size, invalid, ...props },
  ref,
) {
  return <input ref={ref} className={twMerge(inputVariants({ size, invalid }), className)} {...props} aria-invalid={invalid || props["aria-invalid"]} />;
});

export function ApplicationField({
  id,
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={twMerge(styles.field, className)}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}{required ? <span className={styles.requiredMark} aria-hidden="true"> *</span> : null}
      </label>
      {React.isValidElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean | "true" | "false" }>(children)
        ? React.cloneElement(children, {
            id,
            "aria-describedby": [children.props["aria-describedby"], hintId, errorId].filter(Boolean).join(" ") || undefined,
            "aria-invalid": error ? true : children.props["aria-invalid"],
          })
        : children}
      {hint ? <p id={hintId} className={styles.fieldHint}>{hint}</p> : null}
      {error ? <p id={errorId} className={styles.fieldError} role="alert">{error}</p> : null}
    </div>
  );
}

const statusVariants = cva(styles.status, {
  variants: {
    tone: {
      success: styles.statusSuccess,
      warning: styles.statusWarning,
      error: styles.statusError,
      info: styles.statusInfo,
      ai: styles.statusAi,
      neutral: styles.statusNeutral,
    },
  },
  defaultVariants: { tone: "neutral" },
});

const statusIcons = {
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
  info: Info,
  ai: Sparkles,
  neutral: CircleHelp,
} as const;

export function ApplicationStatus({
  tone = "neutral",
  icon,
  children,
  className,
}: {
  tone?: keyof typeof statusIcons;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = statusIcons[tone];
  return <span className={twMerge(statusVariants({ tone }), className)}>{icon ?? <Icon size={14} aria-hidden="true" />}<span>{children}</span></span>;
}
