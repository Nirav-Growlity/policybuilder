"use client";

import * as React from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { gsap } from "gsap";
import { Check, Copy, Pencil, RefreshCcw, Save, Trash2 } from "lucide-react";
import { ThemeContactSheet } from "../document-theme-picker";
import {
  DOCUMENT_THEMES,
  getDocumentTemplatePatch,
  getDocumentThemePatch,
  getPolicyDocumentTheme,
  type DocumentThemeDefinition,
} from "@/lib/document-themes";
import { getPolicyProfile } from "@/lib/constants";
import { useBuilder } from "@/lib/store";
import {
  createSavedDocumentTheme,
  getSavedThemePatch,
  isSavedThemeNameAvailable,
  nextThemeCopyName,
  useThemeLibrary,
} from "@/lib/theme-library";
import type { Policy, SavedDocumentTheme } from "@/lib/types";
import { EASE_OUT, Group, Notice, Segmented, SPRING, TextButton } from "./controls";
import styles from "./design-studio.module.css";

const INTENT_LABEL: Record<string, string> = {
  minimal: "Minimal",
  regulatory: "Formal",
  "data-heavy": "Table-led",
  impact: "Image-led",
  editorial: "Editorial",
};

const DENSITY_LABEL: Record<string, string> = { compact: "compact", balanced: "balanced", spacious: "spacious" };

function describeTheme(theme: DocumentThemeDefinition) {
  return `${INTENT_LABEL[theme.intent] ?? theme.intent}, ${DENSITY_LABEL[theme.defaults.density] ?? theme.defaults.density}`;
}

export function TemplateSection() {
  const { themes } = useThemeLibrary();
  const [library, setLibrary] = React.useState<"built-in" | "saved">("built-in");
  return (
    <>
      <div data-reveal className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Template</h2>
        <Segmented
          label="Template library"
          size="small"
          value={library}
          onChange={setLibrary}
          options={[{ value: "built-in", label: "Built-in" }, { value: "saved", label: `Saved${themes.length ? ` ${themes.length}` : ""}` }]}
        />
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={library}
          initial={{ opacity: 0, x: library === "saved" ? 16 : -16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: library === "saved" ? -16 : 16 }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
        >
          {library === "built-in" ? <BuiltInTemplates /> : <SavedTemplates />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function BuiltInTemplates() {
  const { policy, updatePolicy } = useBuilder();
  const resolved = getPolicyDocumentTheme(policy);
  const profile = getPolicyProfile(policy.policyType);
  const cardRefs = React.useRef(new Map<string, HTMLElement>());

  const apply = (theme: DocumentThemeDefinition) => {
    if (theme.id === resolved.id) return;
    // Switching template changes composition only; brand colors and fonts are kept.
    updatePolicy((current) => getDocumentTemplatePatch(theme.id as NonNullable<Policy["documentTemplate"]>, current));
    const card = cardRefs.current.get(theme.id);
    if (card && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.fromTo(card.querySelector("[data-theme-preview]"), { scale: 0.965 }, { scale: 1, duration: 0.55, ease: "elastic.out(1, 0.55)", clearProps: "transform" });
    }
  };

  return (
    <>
      <LayoutGroup id="built-in-templates">
        <ul className={styles.templateList}>
          {DOCUMENT_THEMES.map((theme) => {
            const selected = theme.id === resolved.id;
            return (
              <li key={theme.id} data-reveal>
                <button
                  ref={(element) => { if (element) cardRefs.current.set(theme.id, element); else cardRefs.current.delete(theme.id); }}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => apply(theme)}
                  className={styles.templateCard}
                >
                  {selected ? <motion.span layoutId="template-in-use" transition={SPRING} className={styles.templateRing} aria-hidden="true" /> : null}
                  <ThemeContactSheet theme={theme} companyName={policy.company.name} policyLabel={profile.label} policyType={policy.policyType} compact />
                  <span className={styles.templateMeta}>
                    <span className={styles.templateName}>{theme.name}</span>
                    <span className={styles.templateKind}>{describeTheme(theme)}</span>
                  </span>
                  <AnimatePresence>
                    {selected ? (
                      <motion.span key="in-use" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={SPRING} className={styles.inUse}>
                        <Check size={12} strokeWidth={3} aria-hidden="true" /> In use
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </button>
              </li>
            );
          })}
        </ul>
      </LayoutGroup>
      <div data-reveal className={styles.sectionFoot}>
        <TextButton onClick={() => updatePolicy(() => getDocumentThemePatch(getPolicyDocumentTheme(useBuilder.getState().policy).id))}>
          Restore this template&apos;s colors and fonts
        </TextButton>
      </div>
    </>
  );
}

function SavedTemplates() {
  const { policy, updatePolicy } = useBuilder();
  const { themes, saveTheme, deleteTheme } = useThemeLibrary();
  const [naming, setNaming] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const activeName = policy.documentThemeOverrides?.customThemeName;

  const saveCurrent = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!isSavedThemeNameAvailable(themes, trimmed)) {
      setError(trimmed ? "That name is already used. Pick another." : "Enter a name.");
      return;
    }
    const saved = createSavedDocumentTheme(useBuilder.getState().policy, trimmed);
    saveTheme(saved);
    updatePolicy(() => getSavedThemePatch(saved));
    setName("");
    setError("");
    setNaming(false);
  };

  return (
    <>
      <Group>
        <AnimatePresence mode="wait" initial={false}>
          {naming ? (
            <motion.form key="form" onSubmit={saveCurrent} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }} className={styles.saveForm}>
              <label className={styles.rowLabel} htmlFor="save-design-name">Name this design</label>
              <input id="save-design-name" autoFocus value={name} maxLength={60} onChange={(event) => { setName(event.target.value); setError(""); }} placeholder="e.g. Group brand, blue" className={styles.textInput} aria-invalid={Boolean(error) || undefined} />
              {error ? <Notice tone="error">{error}</Notice> : null}
              <div className={styles.formActions}>
                <button type="button" onClick={() => { setNaming(false); setError(""); }} className={styles.buttonQuiet}>Cancel</button>
                <button type="submit" className={styles.buttonPrimary}>Save design</button>
              </div>
            </motion.form>
          ) : (
            <motion.button key="cta" type="button" onClick={() => setNaming(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={styles.buttonPrimaryWide}>
              <Save size={15} aria-hidden="true" /> Save current design
            </motion.button>
          )}
        </AnimatePresence>
      </Group>

      {themes.length ? (
        <motion.ul layout className={styles.savedList}>
          <AnimatePresence initial={false}>
            {themes.map((saved) => (
              <SavedRow
                key={saved.id}
                saved={saved}
                active={activeName === saved.name}
                themes={themes}
                onApply={() => updatePolicy(() => getSavedThemePatch(saved))}
                onUpdate={() => saveTheme(createSavedDocumentTheme(useBuilder.getState().policy, saved.name, saved))}
                onDuplicate={() => {
                  const copyName = nextThemeCopyName(themes, saved.name);
                  const now = new Date().toISOString();
                  saveTheme({ ...structuredClone(saved), id: crypto.randomUUID(), name: copyName, overrides: { ...saved.overrides, customThemeName: copyName }, createdAt: now, updatedAt: now });
                }}
                onRename={(next) => saveTheme({ ...saved, name: next, overrides: { ...saved.overrides, customThemeName: next }, updatedAt: new Date().toISOString() })}
                onDelete={() => deleteTheme(saved.id)}
              />
            ))}
          </AnimatePresence>
        </motion.ul>
      ) : (
        <div data-reveal className={styles.empty}>
          <p className={styles.emptyTitle}>No saved designs yet</p>
          <p className={styles.emptyText}>Set up colors, fonts and layout, then save them here to reuse on other policies.</p>
        </div>
      )}
    </>
  );
}

function SavedRow({ saved, active, themes, onApply, onUpdate, onDuplicate, onRename, onDelete }: {
  saved: SavedDocumentTheme;
  active: boolean;
  themes: SavedDocumentTheme[];
  onApply: () => void;
  onUpdate: () => void;
  onDuplicate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = React.useState<"idle" | "rename" | "delete">("idle");
  const [draft, setDraft] = React.useState(saved.name);
  const [error, setError] = React.useState("");
  const [updated, setUpdated] = React.useState(false);
  const base = DOCUMENT_THEMES.find((theme) => theme.id === saved.baseThemeId) ?? DOCUMENT_THEMES[0];
  const colors = { ...base.colors, ...saved.overrides.colors };

  React.useEffect(() => {
    if (!updated) return undefined;
    const timer = window.setTimeout(() => setUpdated(false), 1600);
    return () => window.clearTimeout(timer);
  }, [updated]);

  const submitRename = (event: React.FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next === saved.name) { setMode("idle"); return; }
    if (!isSavedThemeNameAvailable(themes, next, saved.id)) { setError(next ? "That name is already used." : "Enter a name."); return; }
    onRename(next);
    setMode("idle");
  };

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -24, transition: { duration: 0.18 } }} transition={{ duration: 0.22, ease: EASE_OUT }} className={styles.savedRow} data-active={active || undefined}>
      <button type="button" onClick={onApply} aria-pressed={active} className={styles.savedApply}>
        <span className={styles.savedSwatches} aria-hidden="true">
          {[colors.primary, colors.accent, colors.soft, colors.paper].map((color, index) => <span key={index} style={{ background: color }} />)}
        </span>
        <span className={styles.savedText}>
          <span className={styles.templateName}>{saved.name}</span>
          <span className={styles.templateKind}>Based on {base.name}</span>
        </span>
        {active ? <Check size={15} strokeWidth={2.5} className={styles.savedCheck} aria-label="In use" /> : null}
      </button>

      <AnimatePresence mode="wait" initial={false}>
        {mode === "rename" ? (
          <motion.form key="rename" onSubmit={submitRename} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} className={styles.savedInline}>
            <input autoFocus aria-label="New name" value={draft} maxLength={60} onChange={(event) => { setDraft(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setMode("idle"); } }} className={styles.textInput} />
            {error ? <Notice tone="error">{error}</Notice> : null}
            <div className={styles.formActions}>
              <button type="button" onClick={() => setMode("idle")} className={styles.buttonQuiet}>Cancel</button>
              <button type="submit" className={styles.buttonPrimary}>Rename</button>
            </div>
          </motion.form>
        ) : mode === "delete" ? (
          <motion.div key="delete" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }} className={styles.savedInline}>
            <p className={styles.confirmText}>Delete “{saved.name}”? Policies already using it keep their design.</p>
            <div className={styles.formActions}>
              <button type="button" onClick={() => setMode("idle")} className={styles.buttonQuiet}>Keep</button>
              <button type="button" onClick={onDelete} className={styles.buttonDanger}>Delete</button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="actions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className={styles.savedActions}>
            {active ? (
              <button type="button" onClick={() => { onUpdate(); setUpdated(true); }} className={styles.savedUpdate}>
                <AnimatePresence mode="popLayout" initial={false}>
                  {updated
                    ? <motion.span key="done" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}><Check size={13} aria-hidden="true" /> Saved</motion.span>
                    : <motion.span key="update" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}><RefreshCcw size={13} aria-hidden="true" /> Save changes</motion.span>}
                </AnimatePresence>
              </button>
            ) : <span />}
            <span className={styles.iconActions}>
              <IconAction label={`Rename ${saved.name}`} onClick={() => { setDraft(saved.name); setError(""); setMode("rename"); }}><Pencil size={14} /></IconAction>
              <IconAction label={`Duplicate ${saved.name}`} onClick={onDuplicate}><Copy size={14} /></IconAction>
              <IconAction label={`Delete ${saved.name}`} onClick={() => setMode("delete")} danger><Trash2 size={14} /></IconAction>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

function IconAction({ label, onClick, danger = false, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={styles.iconAction} data-danger={danger || undefined}>{children}</button>;
}

