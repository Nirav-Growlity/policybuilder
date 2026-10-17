"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, FilePlus2, FileUp, Loader2, Plus, Search, Sparkles, Upload, X } from "lucide-react";
import { Segmented } from "@/components/builder/design-studio/controls";
import { Checkmark } from "@/components/builder/steps/authoring-ui";
import { SelectMenu } from "@/components/ui/select-menu";
import type { SopCatalogTopic } from "@/lib/sop/catalog";
import type { SopPillar } from "@/lib/sop/types";
import { createSopId } from "@/lib/sop/initial-manual";
import { PILLAR_LABELS, PILLAR_ORDER, filterCatalog, groupCatalog, selectionSummary, type CatalogGroupMode, type CustomSopDraft } from "../manual-helpers";
import { WizardHeading } from "./wizard-chrome";
import styles from "./wizard.module.css";

export type StartChoice = "recommended" | "import" | "scratch";
export type ImportState = { status: "checking" } | { status: "available"; file: File | null } | { status: "unavailable" };

const EASE = [0.22, 1, 0.36, 1] as const;

export function ChooseSopsStep({
  catalog,
  industryLabel,
  start,
  onStart,
  selected,
  onToggle,
  onSetGroup,
  custom,
  onCustomChange,
  importState,
  onImportFile,
  creating,
  onBack,
  onLook,
  onCreate,
}: {
  catalog: readonly SopCatalogTopic[];
  industryLabel: string;
  start: StartChoice;
  onStart: (choice: StartChoice) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSetGroup: (ids: string[], checked: boolean) => void;
  custom: CustomSopDraft[];
  onCustomChange: (custom: CustomSopDraft[]) => void;
  importState: ImportState;
  onImportFile: (file: File | null) => void;
  creating: boolean;
  onBack: () => void;
  onLook: () => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<CatalogGroupMode>("pillar");
  const [composerOpen, setComposerOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const filtered = React.useMemo(() => filterCatalog(catalog, query), [catalog, query]);
  const groups = React.useMemo(() => groupCatalog(filtered, mode), [filtered, mode]);
  const count = selected.size + custom.length;
  const importing = start === "import" && importState.status === "available" && importState.file;
  const canCreate = (count > 0 || Boolean(importing)) && !creating;

  const startCards: { id: StartChoice; title: string; description: string; icon: React.ReactNode }[] = [
    { id: "recommended", title: `Recommended for ${industryLabel}`, description: "The SOPs that manuals in your industry include most often, already ticked. Add or remove any.", icon: <Sparkles size={19} aria-hidden="true" /> },
    { id: "import", title: "Import my existing SOP manual", description: "Upload a .docx manual. Its SOPs come across as they are, ready to edit and restyle.", icon: <FileUp size={19} aria-hidden="true" /> },
    { id: "scratch", title: "Start from scratch", description: "Nothing ticked. Pick from the catalog or add your own SOPs.", icon: <FilePlus2 size={19} aria-hidden="true" /> },
  ];

  return (
    <section className="px-5 pb-32 pt-8 lg:px-8 lg:pt-10">
      <div className="mx-auto w-full max-w-6xl">
        <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--pc-text)]">
          <ArrowLeft size={14} aria-hidden="true" /> Back to company and manual details
        </button>
        <div className="mt-4">
          <WizardHeading title="Choose the SOPs for your manual." description="Every SOP gets the same skeleton (purpose, scope, roles, procedure, KPIs, records) and is written from your company profile." />
        </div>

        <ul className={styles.startGrid} aria-label="How to start">
          {startCards.map((card) => (
            <li key={card.id} className="flex">
              <button type="button" aria-pressed={start === card.id} onClick={() => onStart(card.id)} className={styles.startCard}>
                <span className={styles.startIcon}>{card.icon}</span>
                <span className={styles.startTitle}>{card.title}</span>
                <span className={styles.startText}>{card.description}</span>
              </button>
            </li>
          ))}
        </ul>

        <AnimatePresence initial={false}>
          {start === "import" ? (
            <motion.div key="import" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
              <div className={styles.importPanel}>
                {importState.status === "checking" ? (
                  <p className={styles.importText} role="status"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Checking the import service…</p>
                ) : importState.status === "unavailable" ? (
                  <div className={styles.importSoon}>
                    <span className={styles.startIcon}><FileUp size={19} aria-hidden="true" /></span>
                    <div>
                      <p className={styles.importTitle}>Importing .docx manuals is coming soon</p>
                      <p className={styles.importText}>For now, start from the recommended set or from scratch. You can paste your existing wording into each SOP in the builder.</p>
                    </div>
                  </div>
                ) : (
                  <label className={styles.importDrop} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files?.[0]; if (file) onImportFile(file); }}>
                    <Upload size={20} aria-hidden="true" />
                    <span className={styles.importTitle}>{importState.file ? importState.file.name : "Drop your SOP manual here or browse"}</span>
                    <span className={styles.importText}>{importState.file ? "SOPs from this file are added when you create the manual. Anything ticked below is added too." : "Word .docx, up to 10 MB."}</span>
                    <input ref={fileRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { onImportFile(event.target.files?.[0] ?? null); event.target.value = ""; }} />
                  </label>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <section className={styles.catalog} aria-labelledby="sop-catalog-title">
          <div className={styles.catalogHead}>
            <div>
              <h2 id="sop-catalog-title" className={styles.catalogTitle}>SOP catalog</h2>
              <p className={styles.catalogText}>{catalog.length} procedures drawn from real ESG and operations manuals.</p>
            </div>
            <div className={styles.catalogTools}>
              <label className={styles.search}>
                <Search size={15} aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search SOPs" aria-label="Search SOPs" />
              </label>
              <div className={styles.modeToggle}>
                <Segmented label="Group SOPs" size="small" value={mode} onChange={setMode} options={[{ value: "pillar", label: "By pillar" }, { value: "department", label: "By department" }]} />
              </div>
              <button type="button" className={styles.addCustom} onClick={() => setComposerOpen(true)}><Plus size={15} aria-hidden="true" />Add custom SOP</button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {composerOpen ? <CustomSopComposer key="composer" onCancel={() => setComposerOpen(false)} onAdd={(draft) => { onCustomChange([...custom, draft]); setComposerOpen(false); }} /> : null}
          </AnimatePresence>

          {custom.length ? (
            <div className={styles.group}>
              <div className={styles.groupHead}><h3 className={styles.groupTitle}>Your SOPs</h3><span className={styles.groupCount}>{custom.length}</span></div>
              <ul className={styles.topicList}>
                {custom.map((draft) => (
                  <li key={draft.id} className={styles.topic} data-selected="">
                    <span className={styles.topicLabel}>
                      <Checkmark checked />
                      <span className={styles.topicText}><span className={styles.topicTitle}>{draft.title}</span><span className={styles.topicMeta}>{PILLAR_LABELS[draft.pillar]}{draft.department ? ` · ${draft.department}` : ""}</span></span>
                    </span>
                    <button type="button" className={styles.topicRemove} aria-label={`Remove ${draft.title}`} onClick={() => onCustomChange(custom.filter((item) => item.id !== draft.id))}><X size={15} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {groups.length === 0 ? <p className={styles.empty}>No SOPs match “{query}”. Try another word, or add it as a custom SOP.</p> : null}
          {groups.map((group) => {
            const ids = group.topics.map((topic) => topic.id);
            const checkedCount = ids.filter((id) => selected.has(id)).length;
            return (
              <div key={`${mode}-${group.key}`} className={styles.group}>
                <div className={styles.groupHead}>
                  <h3 className={styles.groupTitle}>{group.label}</h3>
                  <span className={styles.groupCount}>{checkedCount} of {ids.length}</span>
                  <button type="button" className={styles.groupToggle} onClick={() => onSetGroup(ids, checkedCount < ids.length)}>{checkedCount < ids.length ? "Select all" : "Clear"}</button>
                </div>
                <ul className={styles.topicList}>
                  {group.topics.map((topic) => {
                    const checked = selected.has(topic.id);
                    return (
                      <li key={topic.id} className={styles.topic} data-selected={checked || undefined}>
                        <label className={styles.topicLabel}>
                          <input type="checkbox" className="sr-only" checked={checked} onChange={() => onToggle(topic.id)} />
                          <Checkmark checked={checked} />
                          <span className={styles.topicText}>
                            <span className={styles.topicTitle}>{topic.title}</span>
                            <span className={styles.topicMeta}>{mode === "pillar" ? topic.department : PILLAR_LABELS[topic.pillar]}{topic.description ? ` · ${topic.description}` : ""}</span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      </div>

      <div className={styles.footer}>
        <div className={styles.footerInner}>
          <p className={styles.footerSummary} aria-live="polite">
            <strong>{importing && count === 0 ? `Importing ${importState.status === "available" && importState.file ? importState.file.name : "your manual"}` : selectionSummary(count)}</strong>
            <span>Look and cover are optional; you can change them any time.</span>
          </p>
          <div className={styles.footerActions}>
            <button type="button" className={styles.secondaryButton} onClick={onLook} disabled={!canCreate}>Look &amp; cover<ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" className={styles.primaryButton} onClick={onCreate} disabled={!canCreate} aria-busy={creating || undefined}>
              {creating ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {creating ? "Creating manual…" : "Create manual"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomSopComposer({ onAdd, onCancel }: { onAdd: (draft: CustomSopDraft) => void; onCancel: () => void }) {
  const [title, setTitle] = React.useState("");
  const [pillar, setPillar] = React.useState<SopPillar>("E");
  const [department, setDepartment] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({ id: createSopId("custom"), title: title.trim(), pillar, department: department.trim() });
  };
  return (
    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24, ease: EASE }} className="overflow-hidden" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
      <div className={styles.composer}>
        <input ref={inputRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="SOP title, e.g. Boiler Water Treatment" aria-label="Custom SOP title" className={styles.composerInput} maxLength={160} />
        <SelectMenu size="compact" className={styles.composerSelect} value={pillar} onValueChange={(value) => setPillar(value as SopPillar)} options={PILLAR_ORDER.map((value) => ({ value, label: PILLAR_LABELS[value] }))} aria-label="Pillar" />
        <input value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Department" aria-label="Department" className={styles.composerInput} maxLength={80} />
        <div className={styles.composerActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.primaryButton} disabled={!title.trim()}><Plus size={15} aria-hidden="true" />Add SOP</button>
        </div>
      </div>
    </motion.form>
  );
}
