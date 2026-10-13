"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Minus, Plus } from "lucide-react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { clsx } from "clsx";
import { useApplicationSurface } from "@/components/ui/application-surface";
import { normalizeHexColor } from "@/lib/document-themes";
import styles from "./design-studio.module.css";

export const SPRING = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 } as const;
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** A labelled group of settings inside a section. */
export function Group({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section data-reveal className={styles.group}>
      {title || action ? (
        <div className={styles.groupHead}>
          {title ? <h3 className={styles.groupTitle}>{title}</h3> : <span />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A setting row: label on the left, control on the right (or below when `stacked`). */
export function Row({ label, hint, stacked = false, htmlFor, children }: { label: string; hint?: string; stacked?: boolean; htmlFor?: string; children: React.ReactNode }) {
  const Label = htmlFor ? "label" : "span";
  return (
    <div className={clsx(styles.row, stacked && styles.rowStacked)}>
      <Label {...(htmlFor ? { htmlFor } : {})} className={styles.rowLabel}>
        {label}
        {hint ? <span className={styles.rowHint}>{hint}</span> : null}
      </Label>
      <div className={styles.rowControl}>{children}</div>
    </div>
  );
}

type SegmentOption<T extends string> = { value: T; label: string; icon?: React.ReactNode; disabled?: boolean };

/** Single-choice toggle group with a sliding selection pill. */
export function Segmented<T extends string>({ label, value, options, onChange, iconOnly = false, size = "default" }: { label: string; value: T; options: SegmentOption<T>[]; onChange: (value: T) => void; iconOnly?: boolean; size?: "default" | "small" }) {
  const id = React.useId();
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((option, index) => ({ option, index })).filter(({ option }) => !option.disabled);
  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = enabled.findIndex(({ option }) => option.value === value);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = enabled[(current + step + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.option.value);
    refs.current[next.index]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={clsx(styles.segmented, size === "small" && styles.segmentedSmall)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => { refs.current[index] = element; }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={iconOnly ? option.label : undefined}
            title={iconOnly ? option.label : undefined}
            tabIndex={checked || (!options.some((item) => item.value === value) && index === 0) ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={styles.segment}
          >
            {checked ? <motion.span layoutId={`${id}-pill`} transition={SPRING} className={styles.segmentPill} /> : null}
            <span className={styles.segmentContent}>
              {option.icon}
              {iconOnly ? null : <span>{option.label}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** On/off switch with a spring-loaded knob. */
export function Switch({ label, checked, onChange, describedBy }: { label: string; checked: boolean; onChange: (checked: boolean) => void; describedBy?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-describedby={describedBy} onClick={() => onChange(!checked)} className={styles.switch} data-on={checked || undefined}>
      <motion.span layout transition={SPRING} className={styles.switchKnob} />
    </button>
  );
}

/** A full-width row that toggles a setting; the whole row is the switch's label. */
export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const hintId = React.useId();
  return (
    <div className={styles.switchRow}>
      <span className={styles.rowLabel} onClick={() => onChange(!checked)}>
        {label}
        {hint ? <span id={hintId} className={styles.rowHint}>{hint}</span> : null}
      </span>
      <Switch label={label} checked={checked} onChange={onChange} describedBy={hint ? hintId : undefined} />
    </div>
  );
}

/** Numeric stepper: − value +. `values` turns it into a stepper over a fixed list. */
export function Stepper({ label, value, min, max, step = 1, values, unit, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; values?: readonly number[]; unit?: string; onChange: (value: number) => void }) {
  // With a fixed list, step to the nearest listed value so a template's off-list value still moves the right way.
  const below = values ? [...values].reverse().find((item) => item < value - 1e-6) : undefined;
  const above = values ? values.find((item) => item > value + 1e-6) : undefined;
  const canDown = values ? below !== undefined : value - step >= (min ?? -Infinity) - 1e-6;
  const canUp = values ? above !== undefined : value + step <= (max ?? Infinity) + 1e-6;
  const nudge = (direction: 1 | -1) => {
    if (values) {
      const next = direction === 1 ? above : below;
      if (next !== undefined) onChange(next);
    } else onChange(Math.round(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value + direction * step)) * 100) / 100);
  };
  return (
    <div role="group" aria-label={label} className={styles.stepper}>
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={!canDown} onClick={() => nudge(-1)} className={styles.stepperButton}><Minus size={13} aria-hidden="true" /></button>
      <span className={styles.stepperValue} aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={value} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -8, opacity: 0 }} transition={{ duration: 0.16, ease: EASE_OUT }} className={styles.stepperNumber}>
            {value}
          </motion.span>
        </AnimatePresence>
        {unit ? <span className={styles.stepperUnit}>{unit}</span> : null}
      </span>
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={!canUp} onClick={() => nudge(1)} className={styles.stepperButton}><Plus size={13} aria-hidden="true" /></button>
    </div>
  );
}

/** Range slider with its value shown beside the label. */
export function Slider({ label, value, min, max, step = 1, format = (v) => String(v), disabled, onChange }: { label: string; value: number; min: number; max: number; step?: number; format?: (value: number) => string; disabled?: boolean; onChange: (value: number) => void }) {
  const id = React.useId();
  const progress = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.slider} data-disabled={disabled || undefined}>
      <div className={styles.sliderHead}>
        <label htmlFor={id} className={styles.rowLabel}>{label}</label>
        <output htmlFor={id} className={styles.sliderValue}>{format(value)}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))} className={styles.range} style={{ "--progress": `${progress}%` } as React.CSSProperties} />
    </div>
  );
}

/** Collapsible group whose body animates its height. */
export function Disclosure({ title, summary, defaultOpen = false, children }: { title: string; summary?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const bodyId = React.useId();
  return (
    <div data-reveal className={styles.disclosure} data-open={open || undefined}>
      <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((current) => !current)} className={styles.disclosureButton}>
        <span className={styles.disclosureTitle}>{title}</span>
        {summary ? <span className={styles.disclosureSummary}>{summary}</span> : null}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={SPRING} className={styles.disclosureChevron}><ChevronDown size={15} aria-hidden="true" /></motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div id={bodyId} key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ height: { duration: 0.26, ease: EASE_OUT }, opacity: { duration: 0.18 } }} className={styles.disclosureBody}>
            <div className={styles.disclosureInner}>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Swatch + HEX input with a popover color picker. */
export function ColorField({ id, label, hint, value, onChange, onValidityChange, size = "default" }: { id: string; label: string; hint?: string; value: string; onChange: (value: string) => void; onValidityChange?: (id: string, valid: boolean) => void; size?: "default" | "large" }) {
  const application = useApplicationSurface();
  const [open, setOpen] = React.useState(false);
  const [edit, setEdit] = React.useState({ source: value, draft: value });
  const draft = edit.source === value ? edit.draft : value;
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ left: number; top: number; above: boolean } | null>(null);
  const valid = Boolean(normalizeHexColor(draft));

  const commit = (next: string) => {
    setEdit({ source: normalizeHexColor(next) || value, draft: next });
    const normalized = normalizeHexColor(next);
    onValidityChange?.(id, Boolean(normalized));
    if (normalized) onChange(normalized);
  };

  React.useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const box = anchor.getBoundingClientRect();
      const width = pickerRef.current?.offsetWidth || 212;
      const height = pickerRef.current?.offsetHeight || 250;
      const scroller = anchor.closest<HTMLElement>("[data-studio-scroll]");
      const bottom = Math.min(window.innerHeight, scroller?.getBoundingClientRect().bottom || window.innerHeight) - 8;
      const above = box.bottom + height + 6 > bottom;
      setPosition({
        left: Math.min(Math.max(8, box.left), window.innerWidth - width - 8),
        top: above ? Math.max(8, box.top - height - 6) : box.bottom + 6,
        above,
      });
    };
    place();
    const frame = window.requestAnimationFrame(() => pickerRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus());
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); };
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || anchorRef.current?.contains(target) || pickerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return (
    <div className={clsx(styles.color, size === "large" && styles.colorLarge)}>
      <span className={styles.colorLabel} title={hint}>{label}</span>
      <div className={styles.colorControl} data-invalid={!valid || undefined}>
        <button ref={anchorRef} type="button" aria-label={`Pick ${label.toLowerCase()}`} aria-expanded={open} onClick={() => setOpen((current) => !current)} className={styles.colorSwatch}>
          <motion.span key={value} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={SPRING} style={{ background: value }} />
        </button>
        <HexColorInput color={draft} onChange={commit} prefixed aria-label={`${label} HEX color`} className={styles.colorHex} />
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div
            ref={pickerRef}
            role="group"
            aria-label={`${label} color picker`}
            data-pc-color-picker
            initial={{ opacity: 0, scale: 0.94, y: position?.above ? 6 : -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className={clsx(styles.picker, application && "pc-ui pc-builder-authoring")}
            style={position ? { left: position.left, top: position.top, transformOrigin: position.above ? "bottom left" : "top left" } : { left: 0, top: 0, visibility: "hidden" }}
            onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); anchorRef.current?.focus(); } }}
          >
            <HexColorPicker color={value} onChange={commit} />
            <button type="button" onClick={() => { setOpen(false); anchorRef.current?.focus(); }} className={styles.pickerDone}>Done</button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Quiet inline action, used for resets and secondary links. */
export function TextButton({ children, onClick, tone = "default", disabled }: { children: React.ReactNode; onClick: () => void; tone?: "default" | "danger"; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={clsx(styles.textButton, tone === "danger" && styles.textButtonDanger)}>{children}</button>;
}

/** Inline status message for warnings and errors. */
export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "error"; children: React.ReactNode }) {
  return (
    <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} role={tone === "info" ? undefined : "alert"} className={styles.notice} data-tone={tone}>
      {children}
    </motion.p>
  );
}
