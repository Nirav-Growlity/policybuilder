"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BookOpen, ClipboardSignature, ListChecks, Plus, Search, Trash2, Undo2, X } from "lucide-react";
import { Checkmark } from "@/components/builder/steps/authoring-ui";
import { CompanyInfoForm } from "@/components/builder/company-info-form";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SelectMenu } from "@/components/ui/select-menu";
import { SOP_CATALOG } from "@/lib/sop/catalog";
import { useSopBuilder } from "@/lib/sop/store";
import type { Company } from "@/lib/types";
import type { Sop, SopPillar } from "@/lib/sop/types";
import { createEmptyCompanyFacts } from "@/lib/sop/company-facts";
import { createSopId } from "@/lib/sop/initial-manual";
import { PILLAR_LABELS, PILLAR_ORDER, filterCatalog, groupCatalog, manualTitle, sopFromCustom, sopFromTopic, withSuggestedCodes } from "../manual-helpers";
import { CompanyFactsPanel } from "../new-manual/company-facts-panel";
import { ManualDetailsPanel } from "../new-manual/details-step";
import wizard from "../new-manual/wizard.module.css";
import styles from "./builder.module.css";

/** "+ Add SOP": catalog topics not yet in the manual, plus a custom title. */
export function AddSopModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (sops: Sop[], write: boolean) => void }) {
  const manual = useSopBuilder((state) => state.manual);
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [customTitle, setCustomTitle] = React.useState("");
  const [customPillar, setCustomPillar] = React.useState<SopPillar>("E");
  const [write, setWrite] = React.useState(true);
  const used = new Set(manual?.sops.map((sop) => sop.catalogId).filter(Boolean));
  const available = SOP_CATALOG.filter((topic) => !used.has(topic.id));
  const groups = groupCatalog(filterCatalog(available, query), "pillar");
  const count = picked.size + (customTitle.trim() ? 1 : 0);

  const reset = () => { setQuery(""); setPicked(new Set()); setCustomTitle(""); };
  const submit = () => {
    if (!manual || !count) return;
    const sops = [
      ...available.filter((topic) => picked.has(topic.id)).map(sopFromTopic),
      ...(customTitle.trim() ? [sopFromCustom({ id: createSopId("custom"), title: customTitle, pillar: customPillar, department: "" })] : []),
    ];
    // Codes continue the manual's numbering per department.
    const coded = withSuggestedCodes({ ...manual, sops: [...manual.sops, ...sops] }).sops.slice(manual.sops.length);
    onAdd(coded, write);
    reset();
  };

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title="Add SOPs" description="Pick from the catalog or name your own. New SOPs join their pillar in the outline." width={720}>
      <div className={styles.addModal}>
        <label className={wizard.search}>
          <Search size={15} aria-hidden="true" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the catalog" aria-label="Search the catalog" />
        </label>
        <div className={styles.addList} data-lenis-prevent="">
          {groups.length === 0 ? <p className={wizard.empty}>{available.length ? `Nothing matches “${query}”.` : "Every catalog SOP is already in this manual."}</p> : null}
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
                        <span className={wizard.topicText}><span className={wizard.topicTitle}>{topic.title}</span><span className={wizard.topicMeta}>{topic.department}</span></span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className={styles.addCustomRow}>
          <input value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="Or name a custom SOP" aria-label="Custom SOP title" className={wizard.composerInput} maxLength={160} />
          <SelectMenu size="compact" value={customPillar} onValueChange={(value) => setCustomPillar(value as SopPillar)} options={PILLAR_ORDER.map((value) => ({ value, label: PILLAR_LABELS[value] }))} aria-label="Pillar for the custom SOP" />
        </div>
        <div className={styles.addFoot}>
          <label className={styles.writeToggle}>
            <input type="checkbox" className="sr-only" checked={write} onChange={(event) => setWrite(event.target.checked)} />
            <Checkmark checked={write} />
            <span>Write them with AI now</span>
          </label>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button variant="primary" size="md" icon={<Plus size={14} aria-hidden="true" />} disabled={!count} onClick={submit}>{count ? `Add ${count} ${count === 1 ? "SOP" : "SOPs"}` : "Add SOPs"}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** One shared empty value, so editors that compare by identity do not see a new list on every render. */
const NO_FACTS = createEmptyCompanyFacts();

/**
 * Company and manual control, the builder's equivalent of the policy "Company details" dialog.
 * Like the policy, it first says what editing does not change, then opens the form.
 */
export function ManualDetailsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const manual = useSopBuilder((state) => state.manual);
  const setManual = useSopBuilder((state) => state.setManual);
  const [confirmed, setConfirmed] = React.useState(false);
  const [wasOpen, setWasOpen] = React.useState(open);
  if (wasOpen !== open) { setWasOpen(open); if (open) setConfirmed(false); }
  const onCompanyChange = React.useCallback((updater: (company: Company) => Company | undefined) => {
    setManual((current) => {
      const company = updater(current.company);
      if (!company) return current;
      // Sites are listed in the front matter; keep them in step with the company.
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
        description="Editing the company or document control does not rewrite SOPs that are already written."
        width={540}
        footer={<><Button variant="ghost" size="md" onClick={onClose}>Cancel</Button><Button variant="primary" size="md" onClick={() => setConfirmed(true)}>Continue to edit</Button></>}
      >
        <p className={styles.reviewLead}>Afterwards, check these still match the company:</p>
        <ul className={styles.reviewList}>
          <li><BookOpen size={15} aria-hidden="true" /><span><strong>Front matter</strong><span>Introduction, objective, sites and values</span></span></li>
          <li><ListChecks size={15} aria-hidden="true" /><span><strong>Each SOP</strong><span>Scope, responsibilities and site references</span></span></li>
          <li><ClipboardSignature size={15} aria-hidden="true" /><span><strong>Closing and approval</strong><span>Approvers, revision history and sign-off</span></span></li>
        </ul>
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} title="Company and manual details" description="Changes save automatically. Review the SOPs after editing." width={980} footer={<Button variant="primary" size="md" onClick={onClose}>Done</Button>}>
      <div className="pc-builder-authoring flex flex-col gap-5">
        <CompanyInfoForm company={manual.company} onCompanyChange={onCompanyChange} documentLabel="manual" />
        <ManualDetailsPanel control={manual.control} onChange={(patch) => {
          const store = useSopBuilder.getState();
          // A manual still carrying its automatic name follows its title; a renamed one keeps its name.
          const followsTitle = store.manual !== null && (store.title === manualTitle(store.manual) || store.title === manualTitle({ company: store.manual.company }));
          setManual((current) => ({ ...current, control: { ...current.control, ...patch } }));
          const next = useSopBuilder.getState().manual;
          if (followsTitle && next) store.setTitle(manualTitle(next));
        }} showErrors />
        <CompanyFactsPanel facts={manual.facts ?? NO_FACTS} onChange={(patch) => setManual((current) => ({ ...current, facts: { ...(current.facts ?? NO_FACTS), ...patch } }))} />
      </div>
    </Modal>
  );
}

/** Confirms a delete in place, with Undo for a few seconds, in the app's toast style. */
export function UndoToast({ message, onUndo, onDismiss, duration = 7000 }: { message: string | null; onUndo: () => void; onDismiss: () => void; duration?: number }) {
  const mounted = React.useSyncExternalStore(() => () => undefined, () => true, () => false);
  React.useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timer);
  }, [duration, message, onDismiss]);
  if (!mounted) return null;
  return createPortal(
    <div className={`pc-ui ${styles.undoRegion}`} role="region" aria-label="Undo">
      <AnimatePresence>
        {message ? (
          <motion.div key={message} className="pc-toast pc-toast-info" role="status" aria-live="polite" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.2, ease: "easeOut" }}>
            <Trash2 size={18} aria-hidden="true" className="pc-toast-icon" />
            <span className="pc-toast-text">{message}</span>
            <button type="button" className={styles.undoButton} onClick={onUndo}><Undo2 size={14} aria-hidden="true" />Undo</button>
            <button type="button" className="pc-toast-close pc-focus" aria-label="Dismiss" onClick={onDismiss}><X size={16} aria-hidden="true" /></button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
