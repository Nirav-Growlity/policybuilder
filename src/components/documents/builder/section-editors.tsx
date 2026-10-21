"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { AutosizeTextarea, WritingField, authoring as ui, itemEnter } from "@/components/builder/steps/authoring-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TextReveal } from "@/lib/ai/text-reveal";
import type { RichTextBlock } from "@/lib/types";
import { createSopId } from "@/lib/sop/initial-manual";
import type { SopProcedureStep, SopSection } from "@/lib/sop/types";
import { arrayMove, plainToRichText, richTextToPlain } from "../manual-helpers";
import styles from "./builder.module.css";

/**
 * Keeps the text a writer is typing while the blocks it produces go upstream.
 * Parsing on every keystroke would drop a trailing blank line and jump the
 * caret, so the draft only resets when the blocks change from elsewhere (AI, undo).
 */
function useDraftText<T>(value: T, toText: (value: T) => string) {
  const [draft, setDraft] = React.useState(() => ({ text: toText(value), emitted: value }));
  const [seen, setSeen] = React.useState<T>(value);
  if (value !== seen) {
    setSeen(value);
    if (value !== draft.emitted) setDraft({ text: toText(value), emitted: value });
  }
  /** Records what the writer typed and the value it produced upstream. */
  const update = (text: string, emitted: T) => setDraft({ text, emitted });
  return { text: draft.text, update };
}

export function NarrativeField({ blocks, onChange, label, placeholder, busy, stream }: {
  blocks: RichTextBlock[];
  onChange: (blocks: RichTextBlock[]) => void;
  label: string;
  placeholder?: string;
  busy?: boolean;
  stream?: TextReveal;
}) {
  const { text, update } = useDraftText(blocks, richTextToPlain);
  return (
    <WritingField
      value={text}
      label={label}
      busy={busy}
      stream={stream}
      placeholder={placeholder ?? "Write in plain sentences. Start lines with “-” for a bulleted list or “1.” for numbered steps."}
      onChange={(event) => {
        const next = plainToRichText(event.target.value, blocks);
        update(event.target.value, next);
        onChange(next);
      }}
    />
  );
}

/** One item per line (responsibilities, references). Empty lines are kept while typing and skipped in the document. */
export function LinesField({ lines, onChange, label, placeholder, className }: { lines: string[]; onChange: (lines: string[]) => void; label: string; placeholder?: string; className?: string }) {
  const { text, update } = useDraftText(lines, (value) => value.join("\n"));
  return (
    <AutosizeTextarea
      value={text}
      aria-label={label}
      placeholder={placeholder}
      className={className ?? clsx(ui.cellText, ui.inline)}
      onChange={(event) => {
        const next = event.target.value.split("\n");
        update(event.target.value, next);
        onChange(next);
      }}
    />
  );
}

export type ColumnSpec<Row> = { key: keyof Row & string; label: string; width: string; placeholder?: string; lines?: boolean };

/** An editable table: inline cells, a remove action per row and "+ Add row" under it. */
export function RowsTable<Row extends Record<string, unknown>>({ rows, columns, onChange, newRow, addLabel, caption, emptyText }: {
  rows: Row[];
  columns: ColumnSpec<Row>[];
  onChange: (rows: Row[]) => void;
  newRow: () => Row;
  addLabel: string;
  caption: string;
  /** Shown while there are no rows; defaults to the SOP section wording. */
  emptyText?: string;
}) {
  const update = (index: number, patch: Partial<Row>) => onChange(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)));
  return (
    <div className={styles.rowsTable}>
      {rows.length ? (
        <div className={ui.tableWrap}>
          <table className={clsx(ui.table, styles.table)}>
            <caption className="sr-only">{caption}</caption>
            <colgroup>{columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}<col style={{ width: 52 }} /></colgroup>
            <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              <AnimatePresence initial={false}>
                {rows.map((row, index) => (
                  <motion.tr key={index} className={ui.tableRow} {...itemEnter}>
                    {columns.map((column) => (
                      <td key={column.key}>
                        {column.lines ? (
                          <LinesField lines={(row[column.key] as string[]) ?? []} onChange={(value) => update(index, { [column.key]: value } as Partial<Row>)} label={`${column.label}, row ${index + 1}`} placeholder={column.placeholder} />
                        ) : (
                          <AutosizeTextarea value={String(row[column.key] ?? "")} onChange={(event) => update(index, { [column.key]: event.target.value } as Partial<Row>)} aria-label={`${column.label}, row ${index + 1}`} placeholder={column.placeholder} className={clsx(ui.cellText, ui.inline)} />
                        )}
                      </td>
                    ))}
                    <td>
                      <div className={ui.rowActions}>
                        <button type="button" className={ui.iconButton} data-tone="danger" aria-label={`Remove row ${index + 1}`} onClick={() => onChange(rows.filter((_, current) => current !== index))}><Trash2 size={15} aria-hidden="true" /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      ) : <p className={ui.empty}>{emptyText ?? "Nothing here yet. Add a row, or let AI write this section."}</p>}
      <div className={styles.addRow}>
        <Button variant="ghost" size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => onChange([...rows, newRow()])}>{addLabel}</Button>
      </div>
    </div>
  );
}

/** Procedure: numbered steps with a Responsible role, a body and optional sub-steps; drag or arrows to reorder. */
export function ProcedureEditor({ steps, onChange, sectionNumber }: { steps: SopProcedureStep[]; onChange: (steps: SopProcedureStep[]) => void; sectionNumber: number }) {
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [over, setOver] = React.useState<number | null>(null);
  const update = (index: number, patch: Partial<SopProcedureStep>) => onChange(steps.map((step, current) => (current === index ? { ...step, ...patch } : step)));
  const addStep = () => onChange([...steps, { id: createSopId("step"), heading: "", body: [], responsible: "" }]);
  return (
    <div className={styles.procedure}>
      {steps.length === 0 ? <p className={ui.empty}>No steps yet. Add the first step, or let AI write the procedure.</p> : null}
      <ol className={styles.steps}>
        <AnimatePresence initial={false}>
          {steps.map((step, index) => (
            <motion.li
              key={step.id}
              layout="position"
              {...itemEnter}
              className={styles.step}
              data-dragging={dragging === index || undefined}
              data-drop-target={over === index && dragging !== null && dragging !== index || undefined}
              onDragOver={(event) => { if (dragging === null) return; event.preventDefault(); setOver(index); }}
              onDrop={(event) => { event.preventDefault(); if (dragging !== null) onChange(arrayMove(steps, dragging, index)); setDragging(null); setOver(null); }}
            >
              <div className={styles.stepRail}>
                <span
                  className={styles.stepGrip}
                  draggable
                  onDragStart={(event) => { setDragging(index); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", step.id); }}
                  onDragEnd={() => { setDragging(null); setOver(null); }}
                  aria-hidden="true"
                  title="Drag to reorder"
                ><GripVertical size={15} /></span>
                <span className={styles.stepNumber}>{sectionNumber}.{index + 1}</span>
              </div>
              <div className={styles.stepBody}>
                <div className={styles.stepHead}>
                  <Input value={step.heading} onChange={(event) => update(index, { heading: event.target.value })} placeholder="Step heading, e.g. Segregation at source" aria-label={`Step ${index + 1} heading`} className={clsx(ui.inline, styles.stepHeading)} />
                  <label className={styles.responsible}>
                    <span>Responsible</span>
                    <Input value={step.responsible ?? ""} onChange={(event) => update(index, { responsible: event.target.value })} placeholder="Role" aria-label={`Step ${index + 1} responsible`} className={styles.responsibleInput} />
                  </label>
                  <div className={ui.rowActions}>
                    <button type="button" className={ui.iconButton} aria-label={`Move step ${index + 1} up`} disabled={index === 0} onClick={() => onChange(arrayMove(steps, index, index - 1))}><ArrowUp size={15} aria-hidden="true" /></button>
                    <button type="button" className={ui.iconButton} aria-label={`Move step ${index + 1} down`} disabled={index === steps.length - 1} onClick={() => onChange(arrayMove(steps, index, index + 1))}><ArrowDown size={15} aria-hidden="true" /></button>
                    <button type="button" className={ui.iconButton} data-tone="danger" aria-label={`Remove step ${index + 1}`} onClick={() => onChange(steps.filter((_, current) => current !== index))}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </div>
                <StepBody blocks={step.body} onChange={(body) => update(index, { body })} label={`Step ${index + 1} description`} />
                {(step.substeps ?? []).length ? (
                  <ol className={styles.substeps}>
                    {(step.substeps ?? []).map((substep, subIndex) => (
                      <li key={substep.id} className={styles.substep}>
                        <span className={styles.substepNumber}>{sectionNumber}.{index + 1}.{subIndex + 1}</span>
                        <AutosizeTextarea value={substep.text} onChange={(event) => update(index, { substeps: (step.substeps ?? []).map((item) => (item.id === substep.id ? { ...item, text: event.target.value } : item)) })} aria-label={`Sub-step ${subIndex + 1} of step ${index + 1}`} placeholder="Sub-step" className={clsx(ui.cellText, ui.inline)} />
                        <button type="button" className={ui.iconButton} data-tone="danger" aria-label={`Remove sub-step ${subIndex + 1}`} onClick={() => update(index, { substeps: (step.substeps ?? []).filter((item) => item.id !== substep.id) })}><X size={14} aria-hidden="true" /></button>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <button type="button" className={styles.subAdd} onClick={() => update(index, { substeps: [...(step.substeps ?? []), { id: createSopId("substep"), text: "" }] })}><Plus size={13} aria-hidden="true" />Sub-step</button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      <div className={styles.addRow}>
        <Button variant="ghost" size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={addStep}>Add step</Button>
      </div>
    </div>
  );
}

function StepBody({ blocks, onChange, label }: { blocks: RichTextBlock[]; onChange: (blocks: RichTextBlock[]) => void; label: string }) {
  const { text, update } = useDraftText(blocks, richTextToPlain);
  return (
    <AutosizeTextarea
      value={text}
      aria-label={label}
      placeholder="What happens in this step, who records what, and when."
      className={clsx(ui.cellText, ui.inline, styles.stepText)}
      onChange={(event) => {
        const next = plainToRichText(event.target.value, blocks);
        update(event.target.value, next);
        onChange(next);
      }}
    />
  );
}

/** The editor for one section's content, chosen by its kind. */
export function SectionBody({ section, onChange, sectionNumber, busy, stream }: {
  section: SopSection;
  onChange: (section: SopSection) => void;
  sectionNumber: number;
  busy?: boolean;
  stream?: TextReveal;
}) {
  switch (section.kind) {
    case "purpose":
    case "scope":
    case "training":
    case "review":
    case "custom":
    case "appendix":
      return <NarrativeField blocks={section.blocks} onChange={(blocks) => onChange({ ...section, blocks })} label={section.title} busy={busy} stream={stream} placeholder={NARRATIVE_HINTS[section.kind]} />;
    case "definitions":
      return <RowsTable caption={section.title} rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} newRow={() => ({ term: "", definition: "" })} addLabel="Add term" columns={[{ key: "term", label: "Term", width: "28%", placeholder: "Term" }, { key: "definition", label: "Definition", width: "auto", placeholder: "What it means in this SOP" }]} />;
    case "responsibilities":
      return <RowsTable caption={section.title} rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} newRow={() => ({ role: "", responsibilities: [] })} addLabel="Add role" columns={[{ key: "role", label: "Role", width: "28%", placeholder: "e.g. EHS Manager" }, { key: "responsibilities", label: "Responsibilities (one per line)", width: "auto", placeholder: "One responsibility per line", lines: true }]} />;
    case "procedure":
      return <ProcedureEditor steps={section.steps} onChange={(steps) => onChange({ ...section, steps })} sectionNumber={sectionNumber} />;
    case "monitoring":
      return (
        <div className={styles.stack}>
          <RowsTable caption="Key performance indicators" rows={section.kpis} onChange={(kpis) => onChange({ ...section, kpis })} newRow={() => ({ indicator: "", target: "", frequency: "", owner: "" })} addLabel="Add KPI" columns={[{ key: "indicator", label: "Indicator", width: "36%", placeholder: "What is measured" }, { key: "target", label: "Target", width: "18%", placeholder: "e.g. 100%" }, { key: "frequency", label: "Frequency", width: "18%", placeholder: "Monthly" }, { key: "owner", label: "Owner", width: "auto", placeholder: "Role" }]} />
          <NarrativeField blocks={section.narrative} onChange={(narrative) => onChange({ ...section, narrative })} label={`${section.title} notes`} placeholder="How results are reviewed and what happens when a target is missed (optional)." busy={busy} stream={stream} />
        </div>
      );
    case "records":
      return <RowsTable caption={section.title} rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} newRow={() => ({ record: "", owner: "", retention: "", format: "" })} addLabel="Add record" columns={[{ key: "record", label: "Record", width: "34%", placeholder: "e.g. Waste manifest register" }, { key: "owner", label: "Owner", width: "20%", placeholder: "Role" }, { key: "retention", label: "Retention", width: "18%", placeholder: "3 years" }, { key: "format", label: "Format", width: "auto", placeholder: "Electronic" }]} />;
    case "references":
      return <LinesField lines={section.items} onChange={(items) => onChange({ ...section, items })} label={section.title} placeholder={"One reference per line, e.g.\nISO 14001:2015 Clause 8.1\nHazardous Waste Rules, 2016"} className={clsx(ui.writing, styles.linesWriting)} />;
  }
}

const NARRATIVE_HINTS: Partial<Record<SopSection["kind"], string>> = {
  purpose: "Why this SOP exists and what it controls.",
  scope: "Which sites, activities, people and contractors it covers, and what it excludes.",
  training: "Who is trained, how often, and how attendance is recorded.",
  review: "When and by whom this SOP is reviewed, and what triggers an early review.",
  appendix: "Forms, checklists or reference tables that support this SOP.",
};
