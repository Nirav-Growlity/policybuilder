"use client";

import * as React from "react";
import { AlertTriangle, BookOpen, ClipboardSignature, ListChecks, Plus, Search } from "lucide-react";
import { Checkmark } from "@/components/builder/steps/authoring-ui";
import { CompanyInfoForm } from "@/components/builder/company-info-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { HANDBOOK_CATALOG } from "@/lib/handbook/catalog";
import { createEmptyHandbookFacts, createHandbookId } from "@/lib/handbook/initial-handbook";
import { useHandbookBuilder } from "@/lib/handbook/store";
import { HANDBOOK_PARTS, type HandbookChapter, type HandbookPartId } from "@/lib/handbook/types";
import type { Company } from "@/lib/types";
import { createEmptyCompanyFacts } from "@/lib/sop/company-facts";
import { filterHandbookCatalog, groupHandbookCatalog, chapterFromCustom, chapterFromTopic, handbookTitle } from "@/components/documents/handbook-helpers";
import { CompanyFactsPanel } from "@/components/documents/new-manual/company-facts-panel";
import { ManualDetailsPanel } from "@/components/documents/new-manual/details-step";
import { HandbookFactsPanel } from "@/components/documents/new-handbook/handbook-facts-panel";
import wizard from "@/components/documents/new-manual/wizard.module.css";
import styles from "@/components/documents/builder/builder.module.css";

const PART_OPTIONS = HANDBOOK_PARTS.map((part) => ({ value: part.id, label: part.label }));

/** "+ Add chapter": catalog topics not yet in the handbook, plus a custom title. */
export function AddChapterModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (chapters: HandbookChapter[], write: boolean) => void }) {
  const manual = useHandbookBuilder((state) => state.manual);
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [customTitle, setCustomTitle] = React.useState("");
  const [customPart, setCustomPart] = React.useState<HandbookPartId>("working");
  const [write, setWrite] = React.useState(true);
  const used = new Set(manual?.chapters.map((chapter) => chapter.catalogId).filter(Boolean));
  const available = HANDBOOK_CATALOG.filter((topic) => !used.has(topic.id));
  const groups = groupHandbookCatalog(filterHandbookCatalog(available, query));
  const count = picked.size + (customTitle.trim() ? 1 : 0);

  const reset = () => { setQuery(""); setPicked(new Set()); setCustomTitle(""); };
  const submit = () => {
    if (!manual || !count) return;
    const chapters = [
      ...available.filter((topic) => picked.has(topic.id)).map(chapterFromTopic),
      ...(customTitle.trim() ? [chapterFromCustom({ id: createHandbookId("custom"), title: customTitle, part: customPart })] : []),
    ];
    onAdd(chapters, write);
    reset();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add chapters" description="Pick from the catalog or name your own. New chapters join their part in the outline." width={720}>
      <div className={styles.addModal}>
        <label className={wizard.search}>
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the catalog" aria-label="Search the catalog" />
        </label>
        <div className={styles.addList} data-lenis-prevent="">
          {groups.length === 0 ? <p className={wizard.empty}>{available.length ? `Nothing matches “${query}”.` : "Every catalog chapter is already in this handbook."}</p> : null}
          {groups.map((group) => (
            <div key={group.key} className={wizard.group}>
              <div className={wizard.groupHead}><h3 className={wizard.groupTitle}>{group.label}</h3><span className={wizard.groupCount}>{group.topics.length}</span></div>
              <ul className={styles.addTopics}>
                {group.topics.map((topic) => {
                  const checked = picked.has(topic.id);
                  return (
                    <li key={topic.id} className={wizard.topic} data-selected={checked || undefined}>
                      <label className={wizard.topicLabel}>
                        <input type="checkbox" className="sr-only" checked={checked} onChange={() => setPicked((current) => { const next = new Set(current); if (next.has(topic.id)) next.delete(topic.id); else next.add(topic.id); return next; })} />
                        <Checkmark checked={checked} />
                        <span className={wizard.topicText}><span className={wizard.topicTitle}>{topic.title}</span><span className={wizard.topicMeta}>{topic.description}</span></span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.addCustomRow}>
          <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Or name a custom chapter" aria-label="Custom chapter title" className={wizard.composerInput} maxLength={160} />
          <SelectMenu size="compact" value={customPart} onValueChange={(value) => setCustomPart(value as HandbookPartId)} options={PART_OPTIONS} aria-label="Part for the custom chapter" />
        </div>
        <div className={styles.addFoot}>
          <label className={styles.writeToggle}>
            <input type="checkbox" className="sr-only" checked={write} onChange={(event) => setWrite(event.target.checked)} />
            <Checkmark checked={write} />
            <span>Write them with AI now</span>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button variant="primary" size="md" icon={<Plus size={14} aria-hidden="true" />} disabled={!count} onClick={submit}>{count ? `Add ${count} ${count === 1 ? "chapter" : "chapters"}` : "Add chapters"}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** One shared empty value, so editors that compare by identity do not see a new list on every render. */
const NO_FACTS = createEmptyCompanyFacts();
const NO_HANDBOOK_FACTS = createEmptyHandbookFacts();

/**
 * Company and handbook details, the handbook's equivalent of the SOP details
 * dialog. Like it, it first says what editing does not change, then opens the form.
 */
export function HandbookDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const manual = useHandbookBuilder((state) => state.manual);
  const setManual = useHandbookBuilder((state) => state.setManual);
  const [confirmed, setConfirmed] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setConfirmed(false); }
  const onCompanyChange = React.useCallback((updater: (company: Company) => Company | undefined) => {
    setManual((current) => {
      const company = updater(current.company);
      if (!company) return current;
      // Sites are listed on the opening pages; keep them in step with the company.
      return { ...current, company, frontMatter: { ...current.frontMatter, sites: [...(company.sites ?? [])] } };
    });
  }, [setManual]);
  if (!manual) return null;
  if (!confirmed) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        icon={<AlertTriangle size={18} aria-hidden="true" />}
        title="Before you change company details"
        description="Editing the company or document control does not rewrite chapters that are already written."
        width={540}
        footer={<><Button variant="ghost" size="md" onClick={onClose}>Cancel</Button><Button variant="primary" size="md" onClick={() => setConfirmed(true)}>Continue to edit</Button></>}
      >
        <p className={styles.reviewLead}>Afterwards, check these still match the company:</p>
        <ul className={styles.reviewList}>
          <li><BookOpen size={15} aria-hidden="true" /><span><strong>Opening pages</strong><span>Welcome, about the company, sites and values</span></span></li>
          <li><ListChecks size={15} aria-hidden="true" /><span><strong>Each chapter</strong><span>Working hours, leave, sites and contacts</span></span></li>
          <li><ClipboardSignature size={15} aria-hidden="true" /><span><strong>Closing and acknowledgement</strong><span>Approvers, revision history and sign-off</span></span></li>
        </ul>
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} title="Company and handbook details" description="Changes save automatically. Review the chapters after editing." width={980} footer={<Button variant="primary" size="md" onClick={onClose}>Done</Button>}>
      <div className="pc-builder-authoring flex flex-col gap-5">
        <CompanyInfoForm company={manual.company} onCompanyChange={onCompanyChange} documentLabel="handbook" />
        <ManualDetailsPanel control={manual.control} titlePlaceholder="Employee Handbook" documentNoun="handbook" onChange={(patch) => {
          const store = useHandbookBuilder.getState();
          // A handbook still carrying its automatic name follows its title; a renamed one keeps its name.
          const followsTitle = store.manual !== null && (store.title === handbookTitle(store.manual) || store.title === handbookTitle({ company: store.manual.company }));
          setManual((current) => ({ ...current, control: { ...current.control, ...patch } }));
          const next = useHandbookBuilder.getState().manual;
          if (followsTitle && next) store.setTitle(handbookTitle(next));
        }} showErrors />
        <HandbookFactsPanel facts={manual.handbookFacts ?? NO_HANDBOOK_FACTS} onChange={(patch) => setManual((current) => ({ ...current, handbookFacts: { ...(current.handbookFacts ?? NO_HANDBOOK_FACTS), ...patch } }))} />
        <CompanyFactsPanel facts={manual.facts ?? NO_FACTS} onChange={(patch) => setManual((current) => ({ ...current, facts: { ...(current.facts ?? NO_FACTS), ...patch } }))} />
      </div>
    </Modal>
  );
}
