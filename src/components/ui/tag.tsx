"use client";

import * as React from "react";
import { clsx } from "clsx";

interface TagProps {
  selected?: boolean;
  onClick?: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Tag({ selected, onClick, icon, children, className }: TagProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12.5px] font-medium border transition-all duration-150",
        selected
          ? "bg-[var(--color-forest-soft)] border-[var(--color-forest)] text-[var(--color-forest-deep)] shadow-[0_1px_2px_rgba(26,92,58,0.15)]"
          : "bg-[var(--color-paper)] border-[var(--color-line)] text-[var(--color-ink-2)] hover:border-[var(--color-forest)] hover:text-[var(--color-forest-deep)]",
        className
      )}
    >
      {icon}
      {children}
    </button>
  );
}
