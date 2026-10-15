"use client";

import * as React from "react";
import { clsx } from "clsx";
import { useApplicationSurface } from "./application-surface";

interface PanelProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({ title, description, icon, actions, children, className, bodyClassName }: PanelProps) {
  const application = useApplicationSurface();
  return (
    <section className={clsx("doc-card overflow-visible", application && "pc-authoring-panel", className)}>
      {(title || actions) && (
        <header className={clsx("flex items-center justify-between gap-3 px-6 py-4 border-b border-[var(--color-line)] bg-gradient-to-b from-[#fafaf5] to-[var(--color-cream-2)] rounded-t-[inherit]", application && "pc-authoring-panel-header")}>
          <div className="flex items-center gap-2.5 min-w-0">
            {icon && <span className="text-[var(--color-forest)] flex-shrink-0">{icon}</span>}
            <div className="min-w-0">
              {title && <h3 className="font-display text-[15px] font-semibold tracking-tight text-[var(--color-ink)] truncate">{title}</h3>}
              {description && <p className="text-[12px] text-[var(--color-muted)] mt-0.5">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </header>
      )}
      <div className={clsx("px-6 py-5", application && "pc-authoring-panel-body", bodyClassName)}>{children}</div>
    </section>
  );
}

export function InfoBar({
  variant = "info",
  icon,
  children,
}: {
  variant?: "info" | "warn";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const application = useApplicationSurface();
  return (
    <div
      className={clsx(
        "flex items-start gap-2.5 px-4 py-3 rounded-lg text-[13px] leading-relaxed",
        variant === "info" && "bg-[var(--color-forest-soft)] border border-[#cfe2d7] text-[var(--color-forest-deep)]",
        variant === "warn" && "bg-[var(--color-amber-bg)] border border-[var(--color-amber-line)] text-[var(--color-amber-ink)]",
        application && "pc-feature-notice"
      )}
      data-pc-tone={application ? variant : undefined}
    >
      {icon && <span className="flex-shrink-0 mt-0.5">{icon}</span>}
      <div>{children}</div>
    </div>
  );
}

interface BadgeProps {
  variant?: "forest" | "amber" | "blue" | "muted" | "danger";
  children: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "muted", children, icon, className }: BadgeProps) {
  const application = useApplicationSurface();
  const styles = {
    forest: "text-[var(--color-forest-deep)]",
    amber: "text-[var(--color-amber-ink)]",
    blue: "text-[var(--color-blue-ink)]",
    muted: "text-[var(--color-muted)]",
    danger: "text-[#9b2929]",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 text-[12px] font-semibold",
        styles[variant],
        application && "pc-feature-badge",
        className
      )}
      data-pc-tone={application ? variant : undefined}
    >
      {icon}
      {children}
    </span>
  );
}
