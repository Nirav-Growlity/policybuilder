"use client";

import * as React from "react";
import { Popover } from "radix-ui";
import { clsx } from "clsx";
import { motion, useReducedMotion } from "motion/react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useApplicationSurface } from "./application-surface";
import { useFieldAccessibility } from "./field-accessibility";
import styles from "./calendar.module.css";

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
const MONTH_SHORT = MONTH_NAMES.map((month) => month.slice(0, 3));
const WEEKDAY_NAMES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const YEARS_PER_PAGE = 12;

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

const isIso = (value?: string): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);
const toIso = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const fromIso = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };

/** Gets today's date in YYYY-MM-DD */
function getTodayIso(): string {
  return toIso(new Date());
}

/** Moves an ISO date by days or months; month moves keep the day where the target month allows. */
function shiftIso(iso: string, { days = 0, months = 0 }: { days?: number; months?: number }) {
  const date = fromIso(iso);
  if (months) {
    const day = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  }
  if (days) date.setDate(date.getDate() + days);
  return toIso(date);
}

type View = "days" | "months" | "years";

/**
 * Accessible date picker shared by the application. The trigger matches the other inputs;
 * the calendar opens in a popover with day, month and year views, keyboard navigation and
 * optional minimum/maximum dates.
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
  const application = useApplicationSurface();
  const reduceMotion = useReducedMotion();
  const accessibility = useFieldAccessibility({ "aria-label": ariaLabel, "aria-invalid": hasError || undefined });
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>("days");
  const [focusIso, setFocusIso] = React.useState(() => initialFocus(value, minDate, maxDate));
  const [direction, setDirection] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const keyboardMove = React.useRef(false);
  const popoverId = React.useId();

  const todayIso = getTodayIso();
  const focusDate = fromIso(focusIso);
  const viewYear = focusDate.getFullYear();
  const viewMonth = focusDate.getMonth();
  const displayValue = formatToDisplay(value);

  const isDateDisabled = React.useCallback(
    (iso: string) => (!!minDate && iso < minDate) || (!!maxDate && iso > maxDate),
    [minDate, maxDate]
  );
  const monthDisabled = (year: number, month: number) => {
    const first = `${year}-${pad2(month + 1)}-01`;
    const last = toIso(new Date(year, month + 1, 0));
    return (!!minDate && last < minDate) || (!!maxDate && first > maxDate);
  };
  const yearDisabled = (year: number) => (!!minDate && `${year}-12-31` < minDate) || (!!maxDate && `${year}-01-01` > maxDate);

  const openChange = (next: boolean) => {
    if (disabled) return;
    if (next) {
      setFocusIso(initialFocus(value, minDate, maxDate));
      setView("days");
      setDirection(0);
    }
    setOpen(next);
  };

  const select = (iso: string) => {
    if (isDateDisabled(iso)) return;
    onChange(iso);
    setOpen(false);
  };

  // The selectable range is contiguous, so clamping always lands on an enabled day.
  const clampIso = (iso: string) => (minDate && iso < minDate ? minDate : maxDate && iso > maxDate ? maxDate : iso);

  const moveFocus = (target: string, keyboard = false) => {
    const next = clampIso(target);
    if (next === focusIso) return;
    setDirection(next > focusIso ? 1 : -1);
    keyboardMove.current = keyboard;
    setFocusIso(next);
  };

  // Keyboard moves keep DOM focus on the active day, including across months.
  React.useEffect(() => {
    if (!open || view !== "days" || !keyboardMove.current) return;
    keyboardMove.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focusIso}"]`)?.focus();
  }, [focusIso, open, view]);

  const onDayKeyDown = (event: React.KeyboardEvent) => {
    const steps: Record<string, { days?: number; months?: number }> = {
      ArrowLeft: { days: -1 }, ArrowRight: { days: 1 }, ArrowUp: { days: -7 }, ArrowDown: { days: 7 },
      PageUp: { months: event.shiftKey ? -12 : -1 }, PageDown: { months: event.shiftKey ? 12 : 1 },
    };
    const weekday = (focusDate.getDay() + 6) % 7;
    if (event.key === "Home") steps.Home = { days: -weekday };
    if (event.key === "End") steps.End = { days: 6 - weekday };
    const step = steps[event.key];
    if (!step) return;
    event.preventDefault();
    moveFocus(shiftIso(focusIso, step), true);
  };

  // Six full weeks from the Monday on or before the 1st, so the grid never changes height.
  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const gridStart = toIso(new Date(viewYear, viewMonth, 1 - ((firstOfMonth.getDay() + 6) % 7)));
  const cells = Array.from({ length: 42 }, (_, index) => shiftIso(gridStart, { days: index }));
  const yearPageStart = viewYear - (viewYear % YEARS_PER_PAGE);

  const headPrev = () => {
    if (view === "days") moveFocus(shiftIso(focusIso, { months: -1 }));
    else if (view === "months") moveFocus(shiftIso(focusIso, { months: -12 }));
    else moveFocus(shiftIso(focusIso, { months: -12 * YEARS_PER_PAGE }));
  };
  const headNext = () => {
    if (view === "days") moveFocus(shiftIso(focusIso, { months: 1 }));
    else if (view === "months") moveFocus(shiftIso(focusIso, { months: 12 }));
    else moveFocus(shiftIso(focusIso, { months: 12 * YEARS_PER_PAGE }));
  };
  const prevDisabled = view === "days" ? monthDisabled(viewMonth === 0 ? viewYear - 1 : viewYear, (viewMonth + 11) % 12)
    : view === "months" ? yearDisabled(viewYear - 1) : yearDisabled(yearPageStart - 1);
  const nextDisabled = view === "days" ? monthDisabled(viewMonth === 11 ? viewYear + 1 : viewYear, (viewMonth + 1) % 12)
    : view === "months" ? yearDisabled(viewYear + 1) : yearDisabled(yearPageStart + YEARS_PER_PAGE);

  const title = view === "days" ? `${MONTH_NAMES[viewMonth]} ${viewYear}` : view === "months" ? String(viewYear) : `${yearPageStart} – ${yearPageStart + YEARS_PER_PAGE - 1}`;
  const pageKey = view === "days" ? `d-${viewYear}-${viewMonth}` : view === "months" ? `m-${viewYear}` : `y-${yearPageStart}`;
  const slide = reduceMotion || direction === 0
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, x: direction * 18 }, animate: { opacity: 1, x: 0 } };
  const selectedYear = isIso(value) ? Number(value.slice(0, 4)) : null;
  const selectedMonth = isIso(value) ? Number(value.slice(5, 7)) - 1 : null;

  return (
    <Popover.Root open={open} onOpenChange={openChange}>
      <div className={clsx(styles.root, application && "pc-calendar-control", className)}>
        <Popover.Trigger asChild disabled={disabled}>
          <button
            ref={triggerRef}
            type="button"
            id={id}
            aria-label={ariaLabel ? `${ariaLabel}${displayValue ? `, ${displayValue}` : ""}` : undefined}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={open ? popoverId : undefined}
            {...accessibility}
            onKeyDown={(event) => { if (event.key === "ArrowDown" && !disabled) { event.preventDefault(); openChange(true); } }}
            className={styles.trigger}
          >
            <span className={styles.triggerIcon} aria-hidden="true"><CalendarDays size={16} /></span>
            <span className={clsx(styles.value, !displayValue && styles.placeholder)}>{displayValue || placeholder}</span>
          </button>
        </Popover.Trigger>
        {value && !disabled && (
          <button type="button" onClick={() => { onChange(""); triggerRef.current?.focus(); }} aria-label="Clear date" className={styles.clear}>
            <X size={14} />
          </button>
        )}
      </div>

      <Popover.Portal>
        <Popover.Content
          id={popoverId}
          role="dialog"
          aria-label="Choose a date"
          className={clsx(application && "pc-ui", styles.panel)}
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => gridRef.current?.querySelector<HTMLButtonElement>("[tabindex='0']")?.focus());
          }}
          onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}
        >
          <div className={styles.head}>
            <button type="button" onClick={headPrev} disabled={prevDisabled} className={styles.nav} aria-label={view === "days" ? "Previous month" : view === "months" ? "Previous year" : "Previous years"}>
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className={styles.title}
              aria-expanded={view !== "days"}
              aria-label={view === "days" ? `${title}, choose month` : view === "months" ? `${title}, choose year` : `${title}, back to days`}
              onClick={() => { setDirection(0); setView(view === "days" ? "months" : view === "months" ? "years" : "days"); }}
            >
              <span aria-live="polite">{title}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </button>
            <button type="button" onClick={headNext} disabled={nextDisabled} className={styles.nav} aria-label={view === "days" ? "Next month" : view === "months" ? "Next year" : "Next years"}>
              <ChevronRight size={16} />
            </button>
          </div>

          <div className={styles.viewport} ref={gridRef}>
            <motion.div key={pageKey} {...slide} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              {view === "days" ? (
                <>
                  <div className={styles.weekdays} aria-hidden="true">
                    {WEEKDAY_NAMES.map((weekday) => <span key={weekday} className={styles.weekday}>{weekday}</span>)}
                  </div>
                  <div className={styles.days} role="group" aria-label={title} onKeyDown={onDayKeyDown}>
                    {cells.map((iso) => {
                      const date = fromIso(iso);
                      const outside = date.getMonth() !== viewMonth;
                      const unavailable = isDateDisabled(iso);
                      return (
                        <button
                          key={iso}
                          type="button"
                          data-iso={iso}
                          data-calendar-day={outside ? undefined : date.getDate()}
                          data-outside={outside || undefined}
                          data-today={iso === todayIso || undefined}
                          aria-pressed={iso === value}
                          aria-current={iso === todayIso ? "date" : undefined}
                          aria-label={`${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`}
                          title={unavailable && minDate && iso < minDate ? `Must be on or after ${formatToDisplay(minDate)}` : undefined}
                          tabIndex={iso === focusIso ? 0 : -1}
                          disabled={unavailable}
                          onClick={() => select(iso)}
                          className={styles.day}
                        >
                          {date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : view === "months" ? (
                <div className={styles.grid3} role="group" aria-label={`Months of ${viewYear}`}>
                  {MONTH_SHORT.map((month, index) => (
                    <button
                      key={month}
                      type="button"
                      aria-pressed={selectedYear === viewYear && selectedMonth === index}
                      aria-label={`${MONTH_NAMES[index]} ${viewYear}`}
                      data-current={(index === new Date().getMonth() && viewYear === new Date().getFullYear()) || undefined}
                      tabIndex={index === viewMonth ? 0 : -1}
                      disabled={monthDisabled(viewYear, index)}
                      onClick={() => { setDirection(0); setFocusIso(clampIso(shiftIso(focusIso, { months: index - viewMonth }))); setView("days"); }}
                      className={styles.cell}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.grid3} role="group" aria-label="Years">
                  {Array.from({ length: YEARS_PER_PAGE }, (_, index) => yearPageStart + index).map((year) => (
                    <button
                      key={year}
                      type="button"
                      aria-pressed={selectedYear === year}
                      data-current={year === new Date().getFullYear() || undefined}
                      tabIndex={year === viewYear ? 0 : -1}
                      disabled={yearDisabled(year)}
                      onClick={() => { setDirection(0); setFocusIso(clampIso(shiftIso(focusIso, { months: (year - viewYear) * 12 }))); setView("months"); }}
                      className={styles.cell}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>

          <div className={styles.foot}>
            {minDate ? <span className={styles.note}>From <strong>{formatToDisplay(minDate)}</strong></span> : null}
            <div className={styles.footActions}>
              {value ? <button type="button" className={styles.footButton} onClick={() => { onChange(""); setOpen(false); }}>Clear</button> : null}
              <button type="button" className={clsx(styles.footButton, styles.footPrimary)} disabled={isDateDisabled(todayIso)} onClick={() => select(todayIso)}>Today</button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function initialFocus(value: string, minDate?: string, maxDate?: string) {
  if (isIso(value)) return value;
  const today = getTodayIso();
  if (minDate && today < minDate) return minDate;
  if (maxDate && today > maxDate) return maxDate;
  return today;
}

export const Calendar = DatePicker;
