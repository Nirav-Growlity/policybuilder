"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { useGenerationStreams, type GenerationRun } from "@/lib/ai/use-generation-streams";
import { streamSopAi } from "@/lib/sop/ai-client";
import { MANUAL_AI_FIELD_LABELS, type ManualAiField, type SopAiRequest, type SopAiResult } from "@/lib/sop/ai-contract";
import { applyManualFieldResult, applySopAiResult, partialManualText } from "@/lib/sop/apply-ai-result";
import { useSopBuilder } from "@/lib/sop/store";
import type { SopManual, SopSection } from "@/lib/sop/types";
import { sopSectionLabel } from "@/lib/sop/types";
import { richTextToPlain } from "../manual-helpers";
import { useSopBuilderActions } from "./builder-context";

export type SectionAiAction = "generate" | "improve" | "shorten" | "grammar" | "custom";

const IMPROVE = "Improve clarity, completeness and professional tone. Keep every fact, role and number; do not invent new obligations.";
const GRAMMAR = "Correct grammar, spelling and punctuation only. Keep the wording, meaning, structure and length as they are.";

export function sectionAiRequest(action: SectionAiAction, base: { manual: SopAiRequest["manual"]; sopId: string; sectionId: string }, instruction?: string): SopAiRequest {
  switch (action) {
    case "generate": return { type: "sop-section", ...base, ...(instruction ? { instruction } : {}) };
    case "shorten": return { type: "refine", ...base, mode: "shorten" };
    case "improve": return { type: "refine", ...base, mode: "custom", instruction: IMPROVE };
    case "grammar": return { type: "refine", ...base, mode: "custom", instruction: GRAMMAR };
    case "custom": return { type: "refine", ...base, mode: "custom", instruction: instruction || IMPROVE };
  }
}

/** The same five actions for a front matter or closing field; the server writes or refines that one field. */
export function manualFieldRequest(action: SectionAiAction, manual: SopManual, field: ManualAiField, instruction?: string): SopAiRequest {
  switch (action) {
    case "generate": return { type: "manual-field", manual, field, mode: "generate", ...(instruction ? { instruction } : {}) };
    case "shorten": return { type: "manual-field", manual, field, mode: "shorten" };
    case "improve": return { type: "manual-field", manual, field, mode: "custom", instruction: IMPROVE };
    case "grammar": return { type: "manual-field", manual, field, mode: "custom", instruction: GRAMMAR };
    case "custom": return { type: "manual-field", manual, field, mode: "custom", instruction: instruction || IMPROVE };
  }
}

/**
 * Text written so far. Reads the model's streamed shape, where the one section
 * is keyed by kind under `sections` (blocks, or `{ narrative }` for
 * monitoring), and the final result's `section`.
 */
export function partialText(partial: unknown): string {
  if (!partial || typeof partial !== "object") return "";
  const record = partial as Record<string, unknown>;
  const streamed = record.sections && typeof record.sections === "object" ? Object.values(record.sections as Record<string, unknown>)[0] : undefined;
  const holder = (Array.isArray(streamed) ? { blocks: streamed } : streamed && typeof streamed === "object" ? streamed : record.section && typeof record.section === "object" ? record.section : record) as Record<string, unknown>;
  const blocks = Array.isArray(holder.blocks) ? holder.blocks : Array.isArray(holder.narrative) ? holder.narrative : [];
  return blocks.map((block) => (block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string" ? (block as { text: string }).text : "")).filter(Boolean).join("\n\n");
}

const ACTION_DONE: Record<SectionAiAction, string> = { generate: "written", improve: "improved", shorten: "shortened", grammar: "checked", custom: "updated" };

/** Per-section AI actions for one manual. Streams narrative text in place and applies the final section. */
export function useSectionAi() {
  const streams = useGenerationStreams();
  const { push } = useToast();
  const { orgId, manualId } = useSopBuilderActions();

  const run = React.useCallback(async (action: SectionAiAction, sopId: string, section: SopSection, instruction?: string) => {
    const manual = useSopBuilder.getState().manual;
    if (!manual) return;
    const key = `${sopId}:${section.id}`;
    const { reveal, signal } = streams.start(key);
    const name = section.title || sopSectionLabel(section.kind);
    try {
      const result: SopAiResult = await streamSopAi(sectionAiRequest(action, { manual, sopId, sectionId: section.id }, instruction), {
        orgId,
        manualId,
        signal,
        onPartial: (partial) => reveal.set(partialText(partial)),
      });
      if (signal.aborted) { push(`${name} stopped. Nothing was changed.`, "info"); return; }
      if (result.type !== "sop-section" && result.type !== "refine") throw new Error("Unexpected AI result.");
      const text = partialText(result);
      if (text) await reveal.finish(text);
      const next = { ...result.section, id: section.id, title: section.title, enabled: section.enabled } as SopSection;
      useSopBuilder.getState().updateSop(sopId, (sop) => ({
        ...sop,
        status: sop.status === "empty" ? "draft" : sop.status,
        sections: sop.sections.map((item) => (item.id === section.id ? next : item)),
      }));
      push(`${name} ${ACTION_DONE[action]}.`, "success");
    } catch (cause) {
      if (signal.aborted) return;
      push(cause instanceof Error && /not wired up/i.test(cause.message) ? "AI writing is not available yet. You can write this section yourself." : `Could not update ${name}. Try again.`, "error");
    } finally {
      streams.end(key, reveal);
    }
  }, [manualId, orgId, push, streams]);

  return {
    run,
    busy: (sopId: string, sectionId: string) => streams.busy(`${sopId}:${sectionId}`),
    reveal: (sopId: string, sectionId: string) => streams.reveal(`${sopId}:${sectionId}`),
    stop: (sopId: string, sectionId: string) => streams.stop(`${sopId}:${sectionId}`),
  };
}

/** The two parts of the manual that the whole-part request writes, and the fields each one streams into. */
export type ManualPart = "front-matter" | "closing";
export const MANUAL_PART_FIELDS: Record<ManualPart, ManualAiField[]> = {
  "front-matter": ["introduction", "objective", "howToUse"],
  closing: ["reviewMechanism", "approvalStatement"],
};
const PART_TITLE: Record<ManualPart, string> = { "front-matter": "Front matter", closing: "Closing" };

const notWired = (cause: unknown) => cause instanceof Error && /not wired up/i.test(cause.message);

/** The text one field holds once a finished part is applied, as the editor shows it. */
function partFieldText(result: SopAiResult, field: ManualAiField): string {
  if (result.type === "closing") return field === "approvalStatement" ? result.approvalStatement : richTextToPlain(result.reviewMechanism);
  if (result.type === "front-matter" && field !== "approvalStatement" && field !== "reviewMechanism") return richTextToPlain(result.frontMatter[field]);
  return "";
}

export type ManualFieldAi = ReturnType<typeof useManualFieldAi>;

/**
 * AI for the front matter and closing, mirroring useSectionAi: one field at a
 * time (write, improve, shorten, rewrite or a custom instruction), or a whole
 * part at once. Text streams into each field while it is written, and each
 * result is applied when its stream ends.
 */
export function useManualFieldAi() {
  const streams = useGenerationStreams();
  const { push } = useToast();
  const { orgId, manualId } = useSopBuilderActions();
  const [writing, setWriting] = React.useState<ManualPart | null>(null);
  const [failed, setFailed] = React.useState<Partial<Record<ManualPart, string>>>({});

  const run = React.useCallback(async (action: SectionAiAction, field: ManualAiField, instruction?: string) => {
    const manual = useSopBuilder.getState().manual;
    if (!manual) return;
    const { reveal, signal } = streams.start(field);
    const name = MANUAL_AI_FIELD_LABELS[field];
    try {
      const result = await streamSopAi(manualFieldRequest(action, manual, field, instruction), {
        orgId,
        manualId,
        signal,
        onPartial: (partial) => reveal.set(partialManualText(partial, field)),
      });
      if (signal.aborted) { push(`${name} stopped. Nothing was changed.`, "info"); return; }
      if (result.type !== "manual-field" || result.field !== field) throw new Error("Unexpected AI result.");
      const text = "statement" in result ? result.statement : richTextToPlain(result.blocks);
      if (text) await reveal.finish(text);
      useSopBuilder.getState().setManual((current) => applyManualFieldResult(current, result));
      push(`${name} ${ACTION_DONE[action]}.`, "success");
    } catch (cause) {
      if (signal.aborted) return;
      push(notWired(cause) ? "AI writing is not available yet. You can write this part yourself." : `Could not update ${name}. Try again.`, "error");
    } finally {
      streams.end(field, reveal);
    }
  }, [manualId, orgId, push, streams]);

  /** Writes every field of a part in one request. Each field has its own stream, and stopping any of them stops the request. */
  const writePart = React.useCallback(async (part: ManualPart) => {
    const manual = useSopBuilder.getState().manual;
    if (!manual) return;
    const fields = MANUAL_PART_FIELDS[part];
    const runs = Object.fromEntries(fields.map((field) => [field, streams.start(field)])) as Record<ManualAiField, GenerationRun>;
    const abort = new AbortController();
    fields.forEach((field) => runs[field].signal.addEventListener("abort", () => abort.abort(), { once: true }));
    setWriting(part);
    setFailed((current) => ({ ...current, [part]: undefined }));
    try {
      const result = await streamSopAi({ type: part, manual }, {
        orgId,
        manualId,
        signal: abort.signal,
        onPartial: (partial) => fields.forEach((field) => runs[field].reveal.set(partialManualText(partial, field))),
      });
      if (abort.signal.aborted) return;
      if (result.type !== part) throw new Error("Unexpected AI result.");
      await Promise.all(fields.map((field) => runs[field].reveal.finish(partFieldText(result, field))));
      useSopBuilder.getState().setManual((current) => applySopAiResult(current, {}, result));
      push(`${PART_TITLE[part]} written.`, "success");
    } catch (cause) {
      if (abort.signal.aborted) return;
      const message = notWired(cause) ? "AI writing is not available yet. Write this part yourself, or retry later." : `The ${PART_TITLE[part].toLowerCase()} was not written. Try again.`;
      setFailed((current) => ({ ...current, [part]: message }));
      push(message, "error");
    } finally {
      fields.forEach((field) => streams.end(field, runs[field].reveal));
      setWriting((current) => (current === part ? null : current));
    }
  }, [manualId, orgId, push, streams]);

  return {
    run,
    writePart,
    /** The part being written in one request, if any. */
    writing,
    /** Why the last whole-part request failed, until the next one starts. */
    failed,
    busy: (field: ManualAiField) => streams.busy(field),
    reveal: (field: ManualAiField) => streams.reveal(field),
    stop: (field: ManualAiField) => streams.stop(field),
  };
}
