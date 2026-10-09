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
    <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-[var(--pc-divider)] bg-[var(--pc-panel)] p-1.5" role="group" aria-label={`${label} format`}>
      <span className="pl-1.5 pr-1 text-[12px] font-semibold text-[var(--pc-muted)]">{label}</span>
      {([
        { value: "bullet" as const, label: "Bullets", icon: <List size={13} /> },
        { value: "number" as const, label: "Numbers", icon: <ListOrdered size={13} /> },
      ]).map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--pc-brand)] ${value === option.value
            ? "border-[var(--pc-primary)] bg-[var(--pc-selection)] text-[var(--pc-selection-text)]"
            : "border-transparent text-[var(--pc-muted)] hover:border-[var(--pc-divider)] hover:bg-[var(--pc-inset)] hover:text-[var(--pc-text)]"
          }`}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
