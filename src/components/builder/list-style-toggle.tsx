import { List, ListOrdered } from "lucide-react";
import type { ListMarkerStyle } from "@/lib/types";

export function ListStyleToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ListMarkerStyle;
  onChange: (value: ListMarkerStyle) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white p-1" role="group" aria-label={`${label} format`}>
      <span className="pl-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-muted)]">{label}</span>
      {([
        { value: "bullet" as const, label: "Bullets", icon: <List size={13} /> },
        { value: "number" as const, label: "Numbers", icon: <ListOrdered size={13} /> },
      ]).map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition-colors ${value === option.value
            ? "bg-[var(--color-forest)] text-white"
            : "text-[var(--color-muted)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-ink)]"
          }`}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
