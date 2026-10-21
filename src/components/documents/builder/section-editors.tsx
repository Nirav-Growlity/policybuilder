"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowUp, GripVertical, Pilcrow, Plus, Table2, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import { AutosizeTextarea, WritingField, authoring as ui, itemEnter } from "@/components/builder/steps/authoring-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StreamField } from "@/components/ui/ai-stream";
import type { TextReveal } from "@/lib/ai/text-reveal";
import type { RichTextBlock } from "@/lib/types";
import { createSopId } from "@/lib/sop/initial-manual";
import type { SopDefinitionRow, SopKpi, SopProcedureStep, SopRecordRow, SopResponsibilityRow, SopSection } from "@/lib/sop/types";
import { arrayMove, createTableBlock, narrativeSegments, plainToRichText, richTextToPlain, spliceBlocks } from "../manual-helpers";
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

const MAX_TABLE_COLUMNS = 8;
const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/**
 * One run of text blocks edited as plain text. The draft keeps what the
 * writer typed (a trailing blank line, say) until the blocks change from
 * elsewhere, which is told apart by comparing the text the blocks stand for.
 */
function TextRun({ blocks, onChange, keepEmpty, label, placeholder, className, style, busy, autoFocus }: {
  blocks: RichTextBlock[];
  onChange: (blocks: RichTextBlock[]) => void;
  /** Keep one empty paragraph when the text is cleared, so the run (and focus) stays beside a table. */
  keepEmpty: boolean;
  label: string;
  placeholder?: string;
  className: string;
  style?: React.CSSProperties;
  busy?: boolean;
  autoFocus?: boolean;
}) {
  const plain = richTextToPlain(blocks);
  const [draft, setDraft] = React.useState({ text: plain, emitted: plain });
  if (plain !== draft.emitted) setDraft({ text: plain, emitted: plain });
  return (
    <AutosizeTextarea
      value={plain !== draft.emitted ? plain : draft.text}
      aria-label={label}
      placeholder={placeholder}
      rows={className === ui.writing ? 4 : 1}
      data-busy={busy || undefined}
      className={className}
      style={style}
      autoFocus={autoFocus}
      onChange={(event) => {
        let next = plainToRichText(event.target.value, blocks);
        if (!next.length && keepEmpty) next = [{ id: blocks[0]?.id ?? createSopId("block"), type: "paragraph", text: "" }];
        setDraft({ text: event.target.value, emitted: richTextToPlain(next) });
        onChange(next);
      }}
    />
  );
}

/** An editable table block: headings, cells, add or remove rows and columns, and remove the table. */
export function NarrativeTable({ block, onChange, onRemove, onAddTextAbove, onAddTextBelow, name, autoFocus }: {
  block: RichTextBlock;
  onChange: (block: RichTextBlock) => void;
  onRemove: () => void;
  onAddTextAbove?: () => void;
  onAddTextBelow?: () => void;
  /** "Table 1 in Scope": the caption and the prefix of every control's label. */
  name: string;
  autoFocus?: boolean;
}) {
  const columns = block.columns?.length ? block.columns : [""];
  const rows = (block.rows ?? []).map((row) => columns.map((_, index) => row[index] ?? ""));
  const set = (next: { columns?: string[]; rows?: string[][] }) => onChange({ ...block, columns: next.columns ?? columns, rows: next.rows ?? rows });
  const heading = (index: number) => columns[index].trim() || `Column ${index + 1}`;
  return (
    <div className={styles.blockTable} role="group" aria-label={name}>
      <div className={styles.blockTableScroll}>
        <table className={clsx(ui.table, styles.blockTableGrid)} style={{ minWidth: columns.length * 150 + 44 }}>
          <caption className="sr-only">{name}</caption>
          <colgroup>{columns.map((_, index) => <col key={index} />)}<col style={{ width: 44 }} /></colgroup>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={index} scope="col">
                  <div className={styles.blockTableHead}>
                    <Input
                      value={column}
                      autoFocus={autoFocus && index === 0}
                      onChange={(event) => set({ columns: columns.map((item, current) => (current === index ? event.target.value : item)) })}
                      placeholder={`Column ${index + 1}`}
                      aria-label={`${name}, column ${index + 1} heading`}
                      className={clsx(ui.inline, styles.blockTableHeading)}
                    />
                    <button type="button" className={ui.iconButton} aria-label={`${name}, remove column ${heading(index)}`} disabled={columns.length === 1} onClick={() => set({ columns: columns.filter((_, current) => current !== index), rows: rows.map((row) => row.filter((_, current) => current !== index)) })}><X size={13} aria-hidden="true" /></button>
                  </div>
                </th>
              ))}
              <th><span className="sr-only">Row actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={ui.tableRow}>
                {row.map((cell, index) => (
                  <td key={index}>
                    <AutosizeTextarea value={cell} onChange={(event) => set({ rows: rows.map((item, current) => (current === rowIndex ? item.map((value, column) => (column === index ? event.target.value : value)) : item)) })} aria-label={`${name}, ${heading(index)}, row ${rowIndex + 1}`} className={clsx(ui.cellText, ui.inline)} />
                  </td>
                ))}
                <td>
                  <div className={ui.rowActions}>
                    <button type="button" className={ui.iconButton} data-tone="danger" aria-label={`${name}, remove row ${rowIndex + 1}`} onClick={() => set({ rows: rows.filter((_, current) => current !== rowIndex) })}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={styles.blockTableBar}>
        <Button variant="ghost" size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => set({ rows: [...rows, columns.map(() => "")] })}>Add row</Button>
        <Button variant="ghost" size="sm" icon={<Plus size={14} aria-hidden="true" />} disabled={columns.length >= MAX_TABLE_COLUMNS} onClick={() => set({ columns: [...columns, ""], rows: rows.map((row) => [...row, ""]) })}>Add column</Button>
        {onAddTextAbove ? <Button variant="ghost" size="sm" icon={<Pilcrow size={14} aria-hidden="true" />} onClick={onAddTextAbove}>Text above</Button> : null}
        {onAddTextBelow ? <Button variant="ghost" size="sm" icon={<Pilcrow size={14} aria-hidden="true" />} onClick={onAddTextBelow}>Text below</Button> : null}
        <button type="button" className={clsx(ui.iconButton, styles.blockTableRemove)} data-tone="danger" aria-label={`Remove ${name.charAt(0).toLowerCase()}${name.slice(1)}`} title="Remove table" onClick={onRemove}><Trash2 size={15} aria-hidden="true" /></button>
      </div>
    </div>
  );
}

/**
 * A block-aware text field: text runs as textareas and tables as editable
 * tables, in the order the blocks are stored. Returns the content and an
 * `addTable` action so each caller puts the button where it fits.
 */
function useNarrativeBlocks({ blocks, onChange, label, placeholder, busy, variant }: {
  blocks: RichTextBlock[];
  onChange: (blocks: RichTextBlock[]) => void;
  label: string;
  placeholder?: string;
  busy?: boolean;
  variant: "writing" | "step";
}) {
  const [focusId, setFocusId] = React.useState<string | null>(null);
  const segments = narrativeSegments(blocks);
  const hasTable = blocks.some((block) => block.type === "table");
  const insertText = (at: number) => {
    const paragraph: RichTextBlock = { id: createSopId("block"), type: "paragraph", text: "" };
    setFocusId(paragraph.id);
    onChange(spliceBlocks(blocks, at, 0, [paragraph]));
  };
  const addTable = () => {
    const table = createTableBlock();
    setFocusId(table.id);
    onChange([...blocks, table]);
  };
  // Tables are numbered in reading order: "Table 2 in Scope".
  const tablesUpTo = segments.map((_, index) => segments.slice(0, index + 1).filter((segment) => segment.type === "table").length);
  const content = segments.map((segment, index) => {
    if (segment.type === "text") {
      const previous = segments[index - 1];
      return (
        <TextRun
          key={previous?.type === "table" ? `after-${previous.block.id}` : "lead"}
          blocks={segment.blocks}
          onChange={(next) => onChange(spliceBlocks(blocks, segment.start, segment.blocks.length, next))}
          keepEmpty={hasTable}
          label={index === 0 ? label : `${label}, text after table ${tablesUpTo[index]}`}
          placeholder={index === 0 ? placeholder : "Text after the table."}
          className={variant === "writing" ? ui.writing : clsx(ui.cellText, ui.inline, styles.stepText)}
          style={variant === "writing" && index > 0 ? { minHeight: 64 } : undefined}
          busy={busy}
          autoFocus={segment.blocks[0]?.id === focusId}
        />
      );
    }
    const next = segments[index + 1];
    const { block, start } = segment;
    return (
      <NarrativeTable
        key={block.id}
        block={block}
        name={`Table ${tablesUpTo[index]} in ${label}`}
        autoFocus={block.id === focusId}
        onChange={(table) => onChange(spliceBlocks(blocks, start, 1, [table]))}
        onRemove={() => onChange(spliceBlocks(blocks, start, 1, []))}
        onAddTextAbove={index === 0 ? () => insertText(start) : undefined}
        onAddTextBelow={next?.type === "text" ? undefined : () => insertText(start + 1)}
      />
    );
  });
  const words = countWords(richTextToPlain(blocks));
  return { content, addTable, words };
}

export function NarrativeField({ blocks, onChange, label, placeholder, busy, stream }: {
  blocks: RichTextBlock[];
  onChange: (blocks: RichTextBlock[]) => void;
  label: string;
  placeholder?: string;
  busy?: boolean;
  stream?: TextReveal;
}) {
  const hint = placeholder ?? "Write in plain sentences. Start lines with “-” for a bulleted list or “1.” for numbered steps.";
  const { content, addTable, words } = useNarrativeBlocks({ blocks, onChange, label, placeholder: hint, busy, variant: "writing" });
  // While the AI writes, its words arrive in place of the whole field.
  if (stream) return <WritingField value="" onChange={() => undefined} label={label} stream={stream} />;
  return (
    <div className={styles.narrative}>
      {content}
      <div className={styles.narrativeFoot}>
        <Button variant="ghost" size="sm" icon={<Table2 size={14} aria-hidden="true" />} onClick={addTable} aria-label={`Add table to ${label}`}>Add table</Button>
        {words > 0 ? <span className={styles.narrativeWords} aria-hidden="true">{words} {words === 1 ? "word" : "words"}</span> : null}
      </div>
    </div>
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
                <StepBody step={step} index={index} sectionNumber={sectionNumber} update={update} />
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

/** A step's body (text and any tables), its sub-steps, and the "+ Sub-step" and "+ Table" actions. */
function StepBody({ step, index, sectionNumber, update }: { step: SopProcedureStep; index: number; sectionNumber: number; update: (index: number, patch: Partial<SopProcedureStep>) => void }) {
  const body = useNarrativeBlocks({ blocks: step.body, onChange: (next) => update(index, { body: next }), label: `Step ${index + 1} description`, placeholder: "What happens in this step, who records what, and when.", variant: "step" });
  return (
    <>
      {body.content}
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
      <div className={styles.stepAdds}>
        <button type="button" className={styles.subAdd} onClick={() => update(index, { substeps: [...(step.substeps ?? []), { id: createSopId("substep"), text: "" }] })}><Plus size={13} aria-hidden="true" />Sub-step</button>
        <button type="button" className={styles.subAdd} aria-label={`Add table to step ${index + 1}`} onClick={body.addTable}><Table2 size={13} aria-hidden="true" />Table</button>
      </div>
    </>
  );
}

const DEFINITION_COLUMNS: ColumnSpec<SopDefinitionRow>[] = [{ key: "term", label: "Term", width: "28%", placeholder: "Term" }, { key: "definition", label: "Definition", width: "auto", placeholder: "What it means in this SOP" }];
const RESPONSIBILITY_COLUMNS: ColumnSpec<SopResponsibilityRow>[] = [{ key: "role", label: "Role", width: "28%", placeholder: "e.g. EHS Manager" }, { key: "responsibilities", label: "Responsibilities (one per line)", width: "auto", placeholder: "One responsibility per line", lines: true }];
const KPI_COLUMNS: ColumnSpec<SopKpi>[] = [{ key: "indicator", label: "Indicator", width: "36%", placeholder: "What is measured" }, { key: "target", label: "Target", width: "18%", placeholder: "e.g. 100%" }, { key: "frequency", label: "Frequency", width: "18%", placeholder: "Monthly" }, { key: "owner", label: "Owner", width: "auto", placeholder: "Role" }];
const RECORD_COLUMNS: ColumnSpec<SopRecordRow>[] = [{ key: "code", label: "Form / record no.", width: "16%", placeholder: "Optional" }, { key: "record", label: "Record", width: "30%", placeholder: "e.g. Waste manifest register" }, { key: "owner", label: "Owner", width: "18%", placeholder: "Role" }, { key: "retention", label: "Retention", width: "14%", placeholder: "3 years" }, { key: "format", label: "Format", width: "auto", placeholder: "Electronic" }];

/** The editor for one section's content, chosen by its kind. */
export function SectionBody({ section, onChange, sectionNumber, busy, stream }: {
  section: SopSection;
  onChange: (section: SopSection) => void;
  sectionNumber: number;
  busy?: boolean;
  stream?: TextReveal;
}) {
  switch (section.kind) {
    case "introduction":
    case "purpose":
    case "scope":
    case "training":
    case "compliance":
    case "corrective":
    case "review":
    case "custom":
    case "appendix":
      return <NarrativeField blocks={section.blocks} onChange={(blocks) => onChange({ ...section, blocks })} label={section.title} busy={busy} stream={stream} placeholder={NARRATIVE_HINTS[section.kind]} />;
    case "definitions":
      return <RowsTable caption={section.title} rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} newRow={() => ({ term: "", definition: "" })} addLabel="Add term" columns={DEFINITION_COLUMNS} />;
    case "responsibilities":
      return <RowsTable caption={section.title} rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} newRow={() => ({ role: "", responsibilities: [] })} addLabel="Add role" columns={RESPONSIBILITY_COLUMNS} />;
    case "procedure":
      return <ProcedureEditor steps={section.steps} onChange={(steps) => onChange({ ...section, steps })} sectionNumber={sectionNumber} />;
    case "monitoring":
      return (
        <div className={styles.stack}>
          <RowsTable caption="Key performance indicators" rows={section.kpis} onChange={(kpis) => onChange({ ...section, kpis })} newRow={() => ({ indicator: "", target: "", frequency: "", owner: "" })} addLabel="Add KPI" columns={KPI_COLUMNS} />
          <NarrativeField blocks={section.narrative} onChange={(narrative) => onChange({ ...section, narrative })} label={`${section.title} notes`} placeholder="How results are reviewed and what happens when a target is missed (optional)." busy={busy} stream={stream} />
        </div>
      );
    case "records":
      return <RowsTable caption={section.title} rows={section.rows} onChange={(rows) => onChange({ ...section, rows })} newRow={() => ({ code: "", record: "", owner: "", retention: "", format: "" })} addLabel="Add record" columns={RECORD_COLUMNS} />;
    case "references":
      return <LinesField lines={section.items} onChange={(items) => onChange({ ...section, items })} label={section.title} placeholder={"One reference per line, e.g.\nISO 14001:2015 Clause 8.1\nHazardous Waste Rules, 2016"} className={clsx(ui.writing, styles.linesWriting)} />;
  }
}

/**
 * A table, procedure or list section while the whole SOP is written: the same
 * layout as its editor, with words settling in and the caret on the field
 * being written. `section` is the part typed so far.
 */
export function StreamingSectionBody({ section, sectionNumber }: { section: SopSection; sectionNumber: number }) {
  // Two passes over the same layout: the first finds the last field with text, which carries the caret.
  let count = 0;
  let active = -1;
  const draw = (measure: boolean) => {
    count = 0;
    const field = (text: string, className?: string) => {
      const index = count++;
      if (measure) {
        if (text) active = index;
        return null;
      }
      return <StreamField text={text} writing={index === active} className={clsx(ui.streamCell, className)} />;
    };
    const table = <Row extends Record<string, unknown>>(rows: Row[], columns: ColumnSpec<Row>[], caption: string) => (
      <div className={styles.rowsTable}>
        <div className={ui.tableWrap}>
          <table className={clsx(ui.table, styles.table)} aria-busy="true">
            <caption className="sr-only">{caption}</caption>
            <colgroup>{columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}<col style={{ width: 52 }} /></colgroup>
            <thead><tr>{columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((row, index) => (
                <motion.tr key={index} className={ui.tableRow} {...itemEnter}>
                  {columns.map((column) => {
                    const value = row[column.key];
                    return <td key={column.key}>{field(Array.isArray(value) ? value.join("\n") : String(value ?? ""), ui.cellText)}</td>;
                  })}
                  <td />
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
    switch (section.kind) {
      case "definitions": return table(section.rows, DEFINITION_COLUMNS, section.title);
      case "responsibilities": return table(section.rows, RESPONSIBILITY_COLUMNS, section.title);
      case "records": return table(section.rows, RECORD_COLUMNS, section.title);
      case "monitoring":
        return (
          <div className={styles.stack}>
            {table(section.kpis, KPI_COLUMNS, "Key performance indicators")}
            {section.narrative.length ? field(richTextToPlain(section.narrative), ui.writing) : null}
          </div>
        );
      case "references":
        return field(section.items.join("\n"), clsx(ui.writing, styles.linesWriting));
      case "procedure":
        return (
          <div className={styles.procedure}>
            <ol className={styles.steps}>
              {section.steps.map((step, index) => (
                <motion.li key={step.id} {...itemEnter} className={styles.step} aria-busy="true">
                  <div className={styles.stepRail}><span className={styles.stepNumber}>{sectionNumber}.{index + 1}</span></div>
                  <div className={styles.stepBody}>
                    <div className={styles.stepHead}>
                      {field(step.heading, styles.stepHeading)}
                      {step.responsible ? <span className={styles.responsible}><span>Responsible</span>{field(step.responsible)}</span> : null}
                    </div>
                    {step.body.length ? field(richTextToPlain(step.body), ui.cellText) : null}
                    {(step.substeps ?? []).length ? (
                      <ol className={styles.substeps}>
                        {(step.substeps ?? []).map((substep, subIndex) => (
                          <li key={substep.id} className={styles.substep}>
                            <span className={styles.substepNumber}>{sectionNumber}.{index + 1}.{subIndex + 1}</span>
                            {field(substep.text, ui.cellText)}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        );
      default:
        return null;
    }
  };
  draw(true);
  return draw(false);
}

const NARRATIVE_HINTS: Partial<Record<SopSection["kind"], string>> = {
  introduction: "Why this procedure matters for the company and its sites, in two or three sentences.",
  purpose: "Why this SOP exists and what it controls.",
  scope: "Which sites, activities, people and contractors it covers, and what it excludes.",
  training: "Who is trained, how often, and how attendance is recorded.",
  compliance: "The laws, regulator, permits, standards and buyer codes this SOP satisfies, and how compliance is shown (legal register, inspections, returns, audits).",
  corrective: "How deviations are recorded and investigated, corrective action deadlines by severity, escalation, and disciplinary steps under the HR policy.",
  review: "When and by whom this SOP is reviewed, and what triggers an early review.",
  appendix: "Forms, checklists or reference tables that support this SOP.",
};
