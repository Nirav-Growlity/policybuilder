"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, FilePlus2, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { Checkmark } from "@/components/builder/steps/authoring-ui";
import { SelectMenu } from "@/components/ui/select-menu";
import type { HandbookCatalogTopic } from "@/lib/handbook/catalog";
import { HANDBOOK_PARTS, handbookPartLabel, type HandbookPartId } from "@/lib/handbook/types";
import { createSopId } from "@/lib/sop/initial-manual";
import { chapterSelectionSummary, filterHandbookCatalog, groupHandbookCatalog, type CustomChapterDraft } from "../handbook-helpers";
import { WizardHeading } from "../new-manual/wizard-chrome";
import styles from "../new-manual/wizard.module.css";

export type ChapterStart = "recommended" | "scratch";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ChooseChaptersStep({
  catalog,
  industryLabel,
  start,
  onStart,
  selected,
  onToggle,
  onSetGroup,
  custom,
  onCustomChange,
  creating,
  onBack,
  onLook,
  onCreate,
}: {
  catalog: readonly HandbookCatalogTopic[];
  industryLabel: string;
  start: ChapterStart;
  onStart: (choice: ChapterStart) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSetGroup: (ids: string[], checked: boolean) => void;
  custom: CustomChapterDraft[];
  onCustomChange: (custom: CustomChapterDraft[]) => void;
  creating: boolean;
  onBack: () => void;
  onLook: () => void;
  onCreate: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const [composerOpen, setComposerOpen] = React.useState(false);
  const filtered = React.useMemo(() => filterHandbookCatalog(catalog, query), [catalog, query]);
  const groups = React.useMemo(() => groupHandbookCatalog(filtered), [filtered]);
  const count = selected.size + custom.length;
  const canCreate = count > 0 && !creating;

  const startCards: { id: ChapterStart; title: string; description: string; icon: React.ReactNode }[] = [
    { id: "recommended", title: `Recommended for ${industryLabel}`, description: "The chapters most employee handbooks include, already ticked. Add or remove any.", icon: <Sparkles size={19} aria-hidden="true" /> },
    { id: "scratch", title: "Start from scratch", description: "Nothing ticked. Pick from the catalog or add your own chapters.", icon: <FilePlus2 size={19} aria-hidden="true" /> },
  ];

  return (
    <section className="px-5 pb-32 pt-8 lg:px-8 lg:pt-10">
      <div className="mx-auto w-full max-w-6xl">
        <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-1 text-[13px] font-medium text-[var(--color-muted)] transition-colors hover:text-[var(--pc-text)]">
          <ArrowLeft size={14} aria-hidden="true" /> Back to company and handbook details
        </button>
        <div className="mt-4">
          <WizardHeading title="Choose the chapters for your handbook." description="Each chapter covers one topic, such as leave or grievances, and is written from your company profile." />
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

        <section className={styles.catalog} aria-labelledby="handbook-catalog-title">
          <div className={styles.catalogHead}>
            <div>
              <h2 id="handbook-catalog-title" className={styles.catalogTitle}>Chapter catalog</h2>
              <p className={styles.catalogText}>{catalog.length} chapters drawn from real employee handbooks.</p>
            </div>
            <div className={styles.catalogTools}>
              <label className={styles.search}>
                <Search size={15} aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters" aria-label="Search chapters" />
              </label>
              <button type="button" className={styles.addCustom} onClick={() => setComposerOpen(true)}><Plus size={15} aria-hidden="true" />Add custom chapter</button>
            </div>
          </div>

          <AnimatePresence initial={false}>
            {composerOpen ? <CustomChapterComposer key="composer" onCancel={() => setComposerOpen(false)} onAdd={(draft) => { onCustomChange([...custom, draft]); setComposerOpen(false); }} /> : null}
          </AnimatePresence>

          {custom.length ? (
            <div className={styles.group}>
              <div className={styles.groupHead}><h3 className={styles.groupTitle}>Your chapters</h3><span className={styles.groupCount}>{custom.length}</span></div>
              <ul className={styles.topicList}>
                {custom.map((draft) => (
                  <li key={draft.id} className={styles.topic} data-selected="">
                    <span className={styles.topicLabel}>
                      <Checkmark checked />
                      <span className={styles.topicText}><span className={styles.topicTitle}>{draft.title}</span><span className={styles.topicMeta}>{handbookPartLabel(draft.part)}</span></span>
                    </span>
                    <button type="button" className={styles.topicRemove} aria-label={`Remove ${draft.title}`} onClick={() => onCustomChange(custom.filter((item) => item.id !== draft.id))}><X size={15} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {groups.length === 0 ? <p className={styles.empty}>No chapters match “{query}”. Try another word, or add it as a custom chapter.</p> : null}
          {groups.map((group) => {
            const ids = group.topics.map((topic) => topic.id);
            const checkedCount = ids.filter((id) => selected.has(id)).length;
            return (
              <div key={group.key} className={styles.group}>
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
                            <span className={styles.topicMeta}>{topic.description}</span>
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
            <strong>{chapterSelectionSummary(count)}</strong>
            <span>Look and cover are optional; you can change them any time.</span>
          </p>
          <div className={styles.footerActions}>
            <button type="button" className={styles.secondaryButton} onClick={onLook} disabled={!canCreate}>Look &amp; cover<ArrowRight size={15} aria-hidden="true" /></button>
            <button type="button" className={styles.primaryButton} onClick={onCreate} disabled={!canCreate} aria-busy={creating || undefined}>
              {creating ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {creating ? "Creating handbook…" : "Create handbook"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomChapterComposer({ onAdd, onCancel }: { onAdd: (draft: CustomChapterDraft) => void; onCancel: () => void }) {
  const [title, setTitle] = React.useState("");
  const [part, setPart] = React.useState<HandbookPartId>("working");
  const inputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { inputRef.current?.focus(); }, []);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({ id: createSopId("custom"), title: title.trim(), part });
  };
  return (
    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.24, ease: EASE }} className="overflow-hidden" onSubmit={submit} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
      <div className={styles.composer}>
        <input ref={inputRef} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Chapter title, e.g. Remote Work Policy" aria-label="Custom chapter title" className={styles.composerInput} maxLength={160} />
        <SelectMenu size="compact" className={styles.composerSelect} value={part} onValueChange={(value) => setPart(value as HandbookPartId)} options={HANDBOOK_PARTS.map((entry) => ({ value: entry.id, label: entry.label }))} aria-label="Part of the handbook" />
        <div className={styles.composerActions}>
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>Cancel</button>
          <button type="submit" className={styles.primaryButton} disabled={!title.trim()}><Plus size={15} aria-hidden="true" />Add chapter</button>
        </div>
      </div>
    </motion.form>
  );
}
