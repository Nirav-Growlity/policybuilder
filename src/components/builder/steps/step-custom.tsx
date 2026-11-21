"use client";
import { useBuilder } from "@/lib/store";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { List, ListOrdered, Plus, Table2, Trash2, Type } from "lucide-react";
import type { PolicySection, RichTextBlock } from "@/lib/types";
import { SelectMenu } from "@/components/ui/select-menu";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { useToast } from "@/components/ui/toast";
import { streamAI } from "@/lib/ai/client";
import type { AIEdit } from "@/lib/ai/prompts";
import { EDIT_DONE } from "@/lib/ai/policy-edit";
import { keepFinishedSentences, useGenerationStreams } from "@/lib/ai/use-generation-streams";

const BLOCK_FORMATS = [{ value: "paragraph", label: "Paragraph" }, { value: "bullets", label: "Bulleted list" }, { value: "numbered", label: "Numbered list" }];

const makeBlock = (sectionId: string, type: RichTextBlock["type"]): RichTextBlock => ({ id: `${sectionId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, type, text: "", ...(type === "table" ? { columns: ["Column 1", "Column 2"], rows: [["", ""]] } : {}) });

/** A list comes back one item per line; drop any marker the model added, since the document prints its own. */
const listText = (text: string) => text.split("\n").map((line) => line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "").trim()).filter(Boolean).join("\n");

export function StepCustom() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const streams = useGenerationStreams();
  const custom = (policy.sections || []).filter((s) => s.kind === "custom" && s.enabled);
  // AI write and AI edit for one paragraph or list block. Tables are left to the user.
  const runBlockAI = async (section: PolicySection, block: RichTextBlock, customPrompt?: string, edit?: AIEdit) => {
    const { reveal, signal } = streams.start(block.id);
    try {
      const format = block.type === "bullets" || block.type === "numbered" ? block.type : "paragraph";
      const r = await streamAI({ type: "custom-block", policy, areaName: section.title, blockFormat: format, customPrompt, existingContent: block.text, edit }, { signal });
      // A stopped edit would cut the block short, so it changes nothing.
      if (edit && signal.aborted) { push("Stopped. Nothing was changed.", "info"); return; }
      const raw = signal.aborted ? keepFinishedSentences(r.text ?? "") : r.text ?? "";
      const text = format === "paragraph" ? raw.trim() : listText(raw);
      if (text) {
        updatePolicy((p) => ({ sections: (p.sections || []).map((s) => s.id !== section.id ? s : { ...s, blocks: (s.blocks || []).map((b) => b.id === block.id ? { ...b, text } : b) }) }));
        push(signal.aborted ? "Stopped. Finished sentences were kept." : edit ? `Block ${EDIT_DONE[edit.action]}.` : "Block written.", signal.aborted ? "info" : "success");
      } else if (signal.aborted) {
        push("Stopped before any text was written.", "info");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end(block.id, reveal);
    }
  };
  const updateBlock = (sectionId: string, blockId: string, patch: Partial<RichTextBlock>) => updatePolicy((p) => ({ sections: (p.sections || []).map((s) => s.id !== sectionId ? s : { ...s, blocks: (s.blocks || []).map((b) => b.id === blockId ? { ...b, ...patch } : b) }) }));
  const removeBlock = (sectionId: string, blockId: string) => updatePolicy((p) => ({ sections: (p.sections || []).map((s) => s.id !== sectionId ? s : { ...s, blocks: (s.blocks || []).filter((b) => b.id !== blockId) }) }));
  const addBlock = (sectionId: string, type: RichTextBlock["type"]) => updatePolicy((p) => ({ sections: (p.sections || []).map((s) => s.id !== sectionId ? s : { ...s, blocks: [...(s.blocks || []), makeBlock(sectionId, type)] }) }));
  const updateCell = (sectionId: string, block: RichTextBlock, row: number, column: number, value: string) => { const rows = (block.rows || []).map((r) => [...r]); rows[row][column] = value; updateBlock(sectionId, block.id, { rows }); };
  const addRow = (sectionId: string, block: RichTextBlock) => updateBlock(sectionId, block.id, { rows: [...(block.rows || []), (block.columns || []).map(() => "")] });
  const addColumn = (sectionId: string, block: RichTextBlock) => updateBlock(sectionId, block.id, { columns: [...(block.columns || []), `Column ${(block.columns?.length || 0) + 1}`], rows: (block.rows || []).map((row) => [...row, ""]) });
  const removeRow = (sectionId: string, block: RichTextBlock, index: number) => updateBlock(sectionId, block.id, { rows: (block.rows || []).filter((_, i) => i !== index) });
  const removeColumn = (sectionId: string, block: RichTextBlock, index: number) => updateBlock(sectionId, block.id, { columns: (block.columns || []).filter((_, i) => i !== index), rows: (block.rows || []).map((row) => row.filter((_, i) => i !== index)) });
  return <div className="space-y-5">{custom.map((section) => <div key={section.id} className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[14px] p-4"><h2 className="font-display text-[18px] font-semibold">{section.title}</h2><div className="mt-3 space-y-3">{(section.blocks || []).map((block, blockIndex) => <div key={block.id} className="rounded-lg border border-[var(--color-line)] bg-[var(--pc-panel)] p-3"><div className="mb-2 flex items-center justify-between gap-3"><span className="text-[12px] font-semibold text-[var(--color-muted)]">{block.type === "table" ? "Table" : "Content block"}</span><div className="flex items-center gap-1">{block.type !== "table" ? <AIActionButton variant="ghost" label="AI Write" subject="block" loading={streams.busy(block.id)} onGenerate={(prompt) => runBlockAI(section, block, prompt)} onStop={() => streams.stop(block.id)} hasContent={Boolean(block.text.trim())} onEdit={(action, instruction) => runBlockAI(section, block, undefined, { action, instruction })} /> : null}<button type="button" onClick={() => removeBlock(section.id, block.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-[var(--color-muted)] transition-colors hover:bg-red-50 hover:text-red-700" aria-label={`Delete block ${blockIndex + 1} from ${section.title}`} title="Delete block"><Trash2 size={14}/><span>Delete</span></button></div></div>{block.type === "table" ? <TableEditor block={block} sectionId={section.id} sectionTitle={section.title} updateBlock={updateBlock} updateCell={updateCell} addRow={addRow} addColumn={addColumn} removeRow={removeRow} removeColumn={removeColumn}/> : <><div className="mb-2 w-52 max-w-full"><SelectMenu size="compact" aria-label={`Content format for ${section.title}, block ${blockIndex + 1}`} value={block.type} onValueChange={(value) => updateBlock(section.id, block.id, { type: value as RichTextBlock["type"] })} options={BLOCK_FORMATS} /></div><Textarea aria-label={`${block.type === "paragraph" ? "Paragraph" : "List items"} content for ${section.title}, block ${blockIndex + 1}`} value={block.text} readOnly={streams.busy(block.id)} rows={block.type === "paragraph" ? 4 : 3} onChange={(e) => updateBlock(section.id, block.id, { type: block.type, text: e.target.value })} placeholder={block.type === "paragraph" ? "Write a paragraph…" : "One item per line…"}/></>}</div>)}</div><div className="mt-4 flex flex-wrap gap-2"><Button variant="secondary" size="sm" icon={<Type size={13}/>} onClick={() => addBlock(section.id, "paragraph")}>Paragraph</Button><Button variant="secondary" size="sm" icon={<List size={13}/>} onClick={() => addBlock(section.id, "bullets")}>Bullets</Button><Button variant="secondary" size="sm" icon={<ListOrdered size={13}/>} onClick={() => addBlock(section.id, "numbered")}>Numbers</Button><Button variant="secondary" size="sm" icon={<Table2 size={13}/>} onClick={() => addBlock(section.id, "table")}>Add table</Button></div></div>)}</div>;
}

function TableEditor({ block, sectionId, sectionTitle, updateBlock, updateCell, addRow, addColumn, removeRow, removeColumn }: { block: RichTextBlock; sectionId: string; sectionTitle: string; updateBlock: (sectionId: string, blockId: string, patch: Partial<RichTextBlock>) => void; updateCell: (sectionId: string, block: RichTextBlock, row: number, column: number, value: string) => void; addRow: (sectionId: string, block: RichTextBlock) => void; addColumn: (sectionId: string, block: RichTextBlock) => void; removeRow: (sectionId: string, block: RichTextBlock, index: number) => void; removeColumn: (sectionId: string, block: RichTextBlock, index: number) => void; }) {
  const columns = block.columns || []; const rows = block.rows || [];
  return <div className="pr-1"><div className="mb-3 text-[13px] font-semibold text-[var(--color-muted)]">Custom table</div><div className="overflow-x-auto rounded-lg border border-[var(--color-line)]"><table className="min-w-full text-[13px]"><thead className="bg-[var(--color-cream)]"><tr>{columns.map((column, index) => <th key={index} className="min-w-[150px] p-2 border-r border-[var(--color-line)]"><div className="flex gap-1"><Input aria-label={`Column ${index + 1} name for ${sectionTitle}`} value={column} onChange={(e) => { const next = [...columns]; next[index] = e.target.value; updateBlock(sectionId, block.id, { columns: next }); }} className="min-h-10 text-[13px] font-semibold bg-[var(--pc-panel)]"/><button type="button" onClick={() => removeColumn(sectionId, block, index)} disabled={columns.length <= 1} className="min-h-10 min-w-10 rounded-md text-[var(--color-muted)] hover:text-red-700 disabled:opacity-30" aria-label={`Remove column ${index + 1} from ${sectionTitle}`}><Trash2 size={14}/></button></div></th>)}</tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t border-[var(--color-line)]">{columns.map((column, columnIndex) => <td key={columnIndex} className="p-1.5 border-r border-[var(--color-line)]"><Input aria-label={`Row ${rowIndex + 1}, ${column || `column ${columnIndex + 1}`} in ${sectionTitle}`} value={row[columnIndex] || ""} onChange={(e) => updateCell(sectionId, block, rowIndex, columnIndex, e.target.value)} className="min-h-10 text-[13px] border-transparent bg-transparent focus:bg-[var(--pc-panel)]"/></td>)}<td className="p-1 text-center"><button type="button" onClick={() => removeRow(sectionId, block, rowIndex)} disabled={rows.length <= 1} className="min-h-10 min-w-10 rounded-md text-[var(--color-muted)] hover:text-red-700 disabled:opacity-30" aria-label={`Remove row ${rowIndex + 1} from ${sectionTitle}`}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div><div className="mt-3 flex flex-wrap gap-2"><Button variant="secondary" size="sm" icon={<Plus size={12}/>} onClick={() => addRow(sectionId, block)}>Add row</Button><Button variant="secondary" size="sm" icon={<Plus size={12}/>} onClick={() => addColumn(sectionId, block)}>Add column</Button></div></div>;
}
