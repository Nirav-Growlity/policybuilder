"use client";

import * as React from "react";
import { clsx } from "clsx";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

export interface DatePickerProps {
  value?: string; // Format: "YYYY-MM-DD"
  onChange: (date: string) => void;
  minDate?: string; // Format: "YYYY-MM-DD" - baseline minimum selectable date
  maxDate?: string; // Format: "YYYY-MM-DD" - optional maximum selectable date
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Pads number to 2 digits */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** Formats YYYY-MM-DD to DD-MM-YYYY for intuitive human display */
export function formatToDisplay(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [y, m, d] = isoDate.split("-");
  return `${d}-${m}-${y}`;
}

/** Converts DD-MM-YYYY or YYYY-MM-DD to standard ISO YYYY-MM-DD */
export function parseToIso(dateStr?: string): string {
  if (!dateStr) return "";
  const trimmed = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split("-");
    return `${y}-${m}-${d}`;
  }
  return "";
}

/** Gets today's date in YYYY-MM-DD */
function getTodayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/**
 * Reusable, accessible Calendar and DatePicker component.
 * Supports baseline date constraints (minDate/maxDate), keyboard/click outside dismissal,
 * quick navigation, and matches the application's forest/paper design system.
 */
export function DatePicker({
  value = "",
  onChange,
  minDate,
  maxDate,
  placeholder = "DD-MM-YYYY",
  disabled = false,
  hasError = false,
  className,
  id,
  ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Normalize initial viewing month/year from current value or today
  const initialDate = value || minDate || getTodayIso();
  const [viewYear, setViewYear] = React.useState<number>(() => {
    const parts = initialDate.split("-");
    return parts.length === 3 ? parseInt(parts[0], 10) : new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = React.useState<number>(() => {
    const parts = initialDate.split("-");
    return parts.length === 3 ? parseInt(parts[1], 10) - 1 : new Date().getMonth();
  });

  // Keep view synchronized when value changes and popover opens
  React.useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-");
      setViewYear(parseInt(y, 10));
      setViewMonth(parseInt(m, 10) - 1);
    }
  }, [value]);

  // Dismiss popover on outside click
  React.useEffect(() => {
    if (!open) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open]);

  // Navigate months
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Generate day cells for the current viewMonth
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday = 0, Sunday = 6
  const firstDayIndex = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  // Year options for quick select dropdown (e.g. current - 15 to + 15)
  const currentYear = new Date().getFullYear();
  const yearOptions = React.useMemo(() => {
    const years: number[] = [];
    for (let y = currentYear - 10; y <= currentYear + 15; y++) {
      years.push(y);
    }
    return years;
  }, [currentYear]);

  // Check if a specific ISO date string is disabled
  const isDateDisabled = React.useCallback(
    (isoString: string): boolean => {
      if (minDate && isoString < minDate) return true;
      if (maxDate && isoString > maxDate) return true;
      return false;
    },
    [minDate, maxDate]
  );

  const handleSelectDay = (day: number) => {
    const isoString = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
    if (isDateDisabled(isoString)) return;
    onChange(isoString);
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onChange("");
    }
  };

  const handleSetToday = () => {
    const today = getTodayIso();
    if (!isDateDisabled(today)) {
      onChange(today);
      const [y, m] = today.split("-");
      setViewYear(parseInt(y, 10));
      setViewMonth(parseInt(m, 10) - 1);
      setOpen(false);
    }
  };

  const todayIso = getTodayIso();
  const displayVal = formatToDisplay(value);

  return (
    <div ref={rootRef} className={clsx("relative inline-block w-full", className)}>
      {/* Trigger input field */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        id={id}
        aria-label={ariaLabel || "Date picker"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
          if (e.key === "Escape" && open) {
            setOpen(false);
          }
        }}
        className={clsx(
          "w-full h-10 px-3.5 pr-16 rounded-lg border bg-[var(--color-paper)] text-[13.5px] transition-colors flex items-center justify-between select-none relative",
          disabled
            ? "cursor-not-allowed bg-[var(--color-cream)] text-[var(--color-muted)] border-[var(--color-line)]"
            : hasError
            ? "border-[#c43a3a] ring-2 ring-[#c43a3a]/15 text-[var(--color-ink)] cursor-pointer"
            : open
            ? "border-[var(--color-forest)] ring-2 ring-[var(--color-forest)]/15 text-[var(--color-ink)] cursor-pointer"
            : "border-[var(--color-line-2)] hover:border-[var(--color-forest)]/60 text-[var(--color-ink)] cursor-pointer"
        )}
      >
        <span className={clsx(!displayVal && "text-[var(--color-muted)]")}>
          {displayVal || placeholder}
        </span>

        <div className="absolute right-2.5 flex items-center gap-1.5 text-[var(--color-muted)]">
          {value && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear date"
              className="p-1 rounded hover:bg-[var(--color-cream-2)] hover:text-red-600 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
          <CalendarIcon
            size={16}
            className={clsx(
              "transition-colors",
              open ? "text-[var(--color-forest)]" : "text-[var(--color-muted)]"
            )}
          />
        </div>
      </div>

      {/* Popover Calendar Modal/Dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Calendar date picker"
          className="absolute z-50 mt-1.5 left-0 w-[290px] sm:w-[310px] p-3.5 rounded-xl border border-[var(--color-line-2)] bg-[var(--color-paper)] shadow-[0_12px_32px_rgba(35,52,42,0.16)] animate-in fade-in zoom-in-95 duration-100"
        >
          {/* Header with Month/Year Navigation */}
          <div className="flex items-center justify-between gap-1 mb-3">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Previous month"
              className="p-1.5 rounded-lg text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-forest)] transition-colors cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>

            <div className="flex items-center gap-1.5">
              <select
                value={viewMonth}
                onChange={(e) => setViewMonth(parseInt(e.target.value, 10))}
                aria-label="Select month"
                className="text-[13px] font-semibold text-[var(--color-ink)] bg-transparent rounded px-1.5 py-1 hover:bg-[var(--color-cream-2)] border-0 focus:outline-none cursor-pointer"
              >
                {MONTH_NAMES.map((m, idx) => (
                  <option key={m} value={idx}>
                    {m}
                  </option>
                ))}
              </select>

              <select
                value={viewYear}
                onChange={(e) => setViewYear(parseInt(e.target.value, 10))}
                aria-label="Select year"
                className="text-[13px] font-semibold text-[var(--color-ink)] bg-transparent rounded px-1.5 py-1 hover:bg-[var(--color-cream-2)] border-0 focus:outline-none cursor-pointer font-mono"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={nextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-lg text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-forest)] transition-colors cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
            {WEEKDAY_NAMES.map((wd) => (
              <span
                key={wd}
                className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--color-muted)] py-0.5"
              >
                {wd}
              </span>
            ))}
          </div>

          {/* Day Grid */}
          <div className="grid grid-cols-7 gap-1">
            {/* Empty slots before first day */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8 w-8" />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateIso = `${viewYear}-${pad2(viewMonth + 1)}-${pad2(day)}`;
              const isSelected = value === dateIso;
              const isToday = todayIso === dateIso;
              const disabledDay = isDateDisabled(dateIso);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabledDay}
                  onClick={() => handleSelectDay(day)}
                  className={clsx(
                    "h-8 w-8 rounded-lg text-[12px] font-medium transition-all flex items-center justify-center relative",
                    isSelected
                      ? "bg-[var(--color-forest)] text-white font-bold shadow-sm"
                      : disabledDay
                      ? "text-stone-300 line-through cursor-not-allowed opacity-40 bg-stone-100/50"
                      : isToday
                      ? "border border-[var(--color-forest)] text-[var(--color-forest)] font-semibold hover:bg-[var(--color-forest-soft)] cursor-pointer"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-cream-2)] hover:text-[var(--color-forest)] cursor-pointer"
                  )}
                  title={disabledDay && minDate && dateIso < minDate ? `Must be on or after ${formatToDisplay(minDate)}` : undefined}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Baseline info notice when minDate is active */}
          {minDate && (
            <div className="mt-2.5 pt-2 border-t border-[var(--color-line)] text-[11px] text-[var(--color-muted)] flex items-center justify-between">
              <span>Baseline: <strong className="text-[var(--color-ink-2)]">{formatToDisplay(minDate)}</strong></span>
              <button
                type="button"
                onClick={handleSetToday}
                disabled={isDateDisabled(todayIso)}
                className="text-[11px] font-semibold text-[var(--color-forest)] hover:underline disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                Today
              </button>
            </div>
          )}

          {!minDate && (
            <div className="mt-2.5 pt-2 border-t border-[var(--color-line)] flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={handleSetToday}
                className="font-semibold text-[var(--color-forest)] hover:underline cursor-pointer"
              >
                Select Today
              </button>
              {value && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="text-[var(--color-muted)] hover:text-red-600 transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const Calendar = DatePicker;
