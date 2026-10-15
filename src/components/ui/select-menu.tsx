"use client";

import * as React from "react";
import { Popover } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";
import { clsx } from "clsx";
import styles from "./select-menu.module.css";

export type SelectMenuOption = {
  value: string;
  label: string;
  /** Secondary line under the label, such as an email address. */
  description?: string;
  /** Options sharing a group render under one heading, in first-seen order. */
  group?: string;
  disabled?: boolean;
  /** Extra text matched by search but never shown. */
  keywords?: string;
};

export type SelectMenuProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectMenuOption[];
  placeholder?: string;
  /** Search appears automatically for long lists; pass a boolean to force it on or off. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  required?: boolean;
  /** Submits the value with native forms through a hidden input. */
  name?: string;
  size?: "compact" | "default";
  id?: string;
  className?: string;
  onBlur?: () => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
};

const SEARCH_THRESHOLD = 8;

/**
 * Single-value dropdown that replaces native selects in the application surfaces:
 * a trigger styled like the other inputs and a searchable, grouped listbox.
 */
export const SelectMenu = React.forwardRef<HTMLButtonElement, SelectMenuProps>(function SelectMenu({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  searchable,
  searchPlaceholder = "Search…",
  emptyMessage = "No matches",
  disabled = false,
  required,
  name,
  size = "default",
  id,
  className,
  onBlur,
  ...aria
}, ref) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeValue, setActiveValue] = React.useState<string | null>(null);
  const listId = React.useId();
  const listRef = React.useRef<HTMLDivElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const typeahead = React.useRef({ text: "", timer: 0 });

  const selected = options.find((option) => option.value === value);
  const withSearch = searchable ?? options.length > SEARCH_THRESHOLD;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = normalizedQuery
    ? options.filter((option) => `${option.label} ${option.description ?? ""} ${option.group ?? ""} ${option.keywords ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
    : options;
  const enabled = visible.filter((option) => !option.disabled);
  const optionId = (optionValue: string) => `${listId}-option-${encodeURIComponent(optionValue)}`;

  function openMenu(next: boolean) {
    if (disabled) return;
    setOpen(next);
    if (next) {
      setQuery("");
      setActiveValue(selected && !selected.disabled ? selected.value : options.find((option) => !option.disabled)?.value ?? null);
    }
  }

  function choose(option: SelectMenuOption) {
    if (option.disabled) return;
    setOpen(false);
    if (option.value !== value) onValueChange(option.value);
  }

  function move(step: 1 | -1 | "first" | "last") {
    if (!enabled.length) return;
    const current = enabled.findIndex((option) => option.value === activeValue);
    const index = step === "first" ? 0 : step === "last" ? enabled.length - 1 : current === -1 ? (step === 1 ? 0 : enabled.length - 1) : Math.min(enabled.length - 1, Math.max(0, current + step));
    setActiveValue(enabled[index].value);
  }

  // Keep the keyboard-active option in view as it moves.
  React.useEffect(() => {
    if (!open || !activeValue) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(optionId(activeValue))?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
    // optionId only depends on listId, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeValue]);

  function onListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); move(1); return;
      case "ArrowUp": event.preventDefault(); move(-1); return;
      case "PageDown": event.preventDefault(); move("last"); return;
      case "PageUp": event.preventDefault(); move("first"); return;
      case "Enter": {
        event.preventDefault();
        const option = enabled.find((item) => item.value === activeValue);
        if (option) choose(option);
        return;
      }
      case "Escape":
        // Radix closes the menu; stop here so an enclosing modal stays open.
        event.stopPropagation();
        return;
      case "Tab":
        // Close and hand focus back to the trigger rather than leaving the portal for the page.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
    }
    if (withSearch) return;
    if (event.key === "Home" || event.key === "End") { event.preventDefault(); move(event.key === "Home" ? "first" : "last"); return; }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const state = typeahead.current;
      window.clearTimeout(state.timer);
      state.text += event.key.toLocaleLowerCase();
      state.timer = window.setTimeout(() => { state.text = ""; }, 500);
      const match = enabled.find((option) => option.label.toLocaleLowerCase().startsWith(state.text));
      if (match) setActiveValue(match.value);
    }
  }

  const groups: { name: string | undefined; options: SelectMenuOption[] }[] = [];
  for (const option of visible) {
    const group = groups.find((item) => item.name === option.group);
    if (group) group.options.push(option);
    else groups.push({ name: option.group, options: [option] });
  }
  const activeId = activeValue && enabled.some((option) => option.value === activeValue) ? optionId(activeValue) : undefined;

  return <Popover.Root open={open} onOpenChange={openMenu}>
    <Popover.Trigger asChild disabled={disabled}>
      <button
        ref={ref}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-required={required || undefined}
        {...aria}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); openMenu(true); }
        }}
        className={clsx(styles.trigger, size === "compact" && styles.triggerCompact, className)}
      >
        <span className={clsx(styles.value, !selected && styles.placeholder)}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} aria-hidden="true" className={styles.chevron} />
      </button>
    </Popover.Trigger>
    {name ? <input type="hidden" name={name} value={value} /> : null}
    <Popover.Portal>
      <Popover.Content
        className={clsx("pc-ui", styles.panel)}
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={12}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (withSearch ? searchRef.current : listRef.current)?.focus();
        }}
        onKeyDown={onListKeyDown}
      >
        {withSearch ? <div className={styles.searchRow}>
          <Search size={15} aria-hidden="true" className={styles.searchIcon} />
          <input
            ref={searchRef}
            type="text"
            role="combobox"
            aria-label={searchPlaceholder.replace(/…$/, "")}
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={searchPlaceholder}
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              const term = next.trim().toLocaleLowerCase();
              const first = options.find((option) => !option.disabled && `${option.label} ${option.description ?? ""} ${option.group ?? ""} ${option.keywords ?? ""}`.toLocaleLowerCase().includes(term));
              setActiveValue(first?.value ?? null);
            }}
            className={styles.search}
          />
        </div> : null}
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={withSearch ? undefined : -1}
          aria-activedescendant={withSearch ? undefined : activeId}
          aria-labelledby={aria["aria-labelledby"] ?? id}
          className={styles.list}
        >
          {visible.length === 0 ? <p className={styles.empty} role="status">{emptyMessage}{query.trim() ? ` for “${query.trim()}”` : ""}</p> : groups.map((group) => {
            const items = group.options.map((option) => {
              const isSelected = option.value === value;
              const isActive = option.value === activeValue;
              return <div
                key={option.value}
                id={optionId(option.value)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled || undefined}
                data-active={isActive || undefined}
                className={styles.option}
                onPointerMove={() => { if (!option.disabled && activeValue !== option.value) setActiveValue(option.value); }}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                <span className={styles.optionText}>
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description ? <span className={styles.optionDescription}>{option.description}</span> : null}
                </span>
                {isSelected ? <Check size={16} aria-hidden="true" className={styles.check} /> : null}
              </div>;
            });
            return group.name ? <div key={group.name} role="group" aria-label={group.name} className={styles.group}>
              <div className={styles.groupLabel} aria-hidden="true">{group.name}</div>
              {items}
            </div> : <React.Fragment key="ungrouped">{items}</React.Fragment>;
          })}
        </div>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
});
