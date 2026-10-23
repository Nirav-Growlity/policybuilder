"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { useGenerationStreams, type GenerationRun } from "@/lib/ai/use-generation-streams";
import { isAiUnavailable } from "@/lib/sop/ai-client";
import { streamHandbookAi } from "@/lib/handbook/ai-client";
import { HANDBOOK_AI_FIELD_LABELS, type HandbookAiField, type HandbookAiRequest, type HandbookAiResult } from "@/lib/handbook/ai-contract";
import { applyChapterSectionResult, applyHandbookClosingResult, applyHandbookFieldResult, applyHandbookFrontMatterResult, partialHandbookFieldText } from "@/lib/handbook/apply-ai-result";
import { useHandbookBuilder } from "@/lib/handbook/store";
import type { HandbookManual } from "@/lib/handbook/types";
import type { SopSection } from "@/lib/sop/types";
import { sopSectionLabel } from "@/lib/sop/types";
import { richTextToPlain } from "@/components/documents/manual-helpers";
import { partialText, type SectionAiAction } from "@/components/documents/builder/use-section-ai";
import { useHandbookBuilderActions } from "./handbook-builder-context";

export type { SectionAiAction };

const IMPROVE = "Improve clarity, completeness and professional tone. Keep every fact, role and number; do not invent new obligations.";
const GRAMMAR = "Correct grammar, spelling and punctuation only. Keep the wording, meaning, structure and length as they are.";

type Base = { manual: HandbookManual; chapterId: string; sectionId: string };

/** The five section actions as chapter requests: write, shorten, or refine with an instruction. */
export function chapterSectionRequest(action: SectionAiAction, base: Base, instruction?: string): HandbookAiRequest {
  switch (action) {
    case "generate": return { type: "chapter-section", ...base, ...(instruction ? { instruction } : {}) };
    case "shorten": return { type: "refine", ...base, mode: "shorten" };
    case "improve": return { type: "refine", ...base, mode: "custom", instruction: IMPROVE };
    case "grammar": return { type: "refine", ...base, mode: "custom", instruction: GRAMMAR };
    case "custom": return { type: "refine", ...base, mode: "custom", instruction: instruction || IMPROVE };
  }
}

/** The same five actions for a front matter or closing field. */
export function handbookFieldRequest(action: SectionAiAction, manual: HandbookManual, field: HandbookAiField, instruction?: string): HandbookAiRequest {
  switch (action) {
    case "generate": return { type: "manual-field", manual, field, mode: "generate", ...(instruction ? { instruction } : {}) };
    case "shorten": return { type: "manual-field", manual, field, mode: "shorten" };
    case "improve": return { type: "manual-field", manual, field, mode: "custom", instruction: IMPROVE };
    case "grammar": return { type: "manual-field", manual, field, mode: "custom", instruction: GRAMMAR };
    case "custom": return { type: "manual-field", manual, field, mode: "custom", instruction: instruction || IMPROVE };
  }
}

const ACTION_DONE: Record<SectionAiAction, string> = { generate: "written", improve: "improved", shorten: "shortened", grammar: "checked", custom: "updated" };

/** Per-section AI actions for one chapter. Streams text in place and applies the final section. */
export function useChapterSectionAi() {
  const streams = useGenerationStreams();
  const { push } = useToast();
  const { orgId, manualId } = useHandbookBuilderActions();

  const run = React.useCallback(async (action: SectionAiAction, chapterId: string, section: SopSection, instruction?: string) => {
    const manual = useHandbookBuilder.getState().manual;
    if (!manual) return;
    const key = `${chapterId}:${section.id}`;
    const { reveal, signal } = streams.start(key);
    const name = section.title || sopSectionLabel(section.kind);
    try {
      const result: HandbookAiResult = await streamHandbookAi(chapterSectionRequest(action, { manual, chapterId, sectionId: section.id }, instruction), {
        orgId,
        manualId,
        signal,
        onPartial: (partial) => reveal.set(partialText(partial)),
      });
      if (signal.aborted) { push(`${name} stopped. Nothing was changed.`, "info"); return; }
      if (result.type !== "chapter-section" && result.type !== "refine") throw new Error("Unexpected AI result.");
      const text = partialText(result);
      if (text) await reveal.finish(text);
      useHandbookBuilder.getState().setManual((current) => applyChapterSectionResult(current, chapterId, section.id, result.section));
      push(`${name} ${ACTION_DONE[action]}.`, "success");
    } catch (cause) {
      if (signal.aborted) return;
      push(isAiUnavailable(cause) ? "AI writing is not available yet. You can write this section yourself." : `Could not update ${name}. Try again.`, "error");
    } finally {
      streams.end(key, reveal);
    }
  }, [manualId, orgId, push, streams]);

  return {
    run,
    busy: (chapterId: string, sectionId: string) => streams.busy(`${chapterId}:${sectionId}`),
    reveal: (chapterId: string, sectionId: string) => streams.reveal(`${chapterId}:${sectionId}`),
    stop: (chapterId: string, sectionId: string) => streams.stop(`${chapterId}:${sectionId}`),
  };
}

/** The two parts the whole-part request writes, and the fields each one streams into. */
export type HandbookPart = "front-matter" | "closing";
export const HANDBOOK_PART_FIELDS: Record<HandbookPart, HandbookAiField[]> = {
  "front-matter": ["welcome", "about", "purpose"],
  closing: ["acknowledgement"],
};
const PART_TITLE: Record<HandbookPart, string> = { "front-matter": "Opening pages", closing: "Closing" };

/** The text one field holds once a finished part is applied, as the editor shows it. */
function partFieldText(result: HandbookAiResult, field: HandbookAiField): string {
  if (result.type === "closing") {
    if (field === "acknowledgement") return result.acknowledgement;
    return "";
  }
  if (result.type === "front-matter" && field !== "acknowledgement") return richTextToPlain(result.frontMatter[field]);
  return "";
}

export type HandbookFieldAi = ReturnType<typeof useHandbookFieldAi>;

/**
 * AI for the opening pages and the closing, mirroring useManualFieldAi: one
 * field at a time, or a whole part in one request. Each field streams while it
 * is written, and each result is applied when its stream ends.
 */
export function useHandbookFieldAi() {
  const streams = useGenerationStreams();
  const { push } = useToast();
  const { orgId, manualId } = useHandbookBuilderActions();
  const [writing, setWriting] = React.useState<HandbookPart | null>(null);
  const [failed, setFailed] = React.useState<Partial<Record<HandbookPart, string>>>({});

  const run = React.useCallback(async (action: SectionAiAction, field: HandbookAiField, instruction?: string) => {
    const manual = useHandbookBuilder.getState().manual;
    if (!manual) return;
    const { reveal, signal } = streams.start(field);
    const name = HANDBOOK_AI_FIELD_LABELS[field];
    try {
      const result = await streamHandbookAi(handbookFieldRequest(action, manual, field, instruction), {
        orgId,
        manualId,
        signal,
        onPartial: (partial) => reveal.set(partialHandbookFieldText(partial, field)),
      });
      if (signal.aborted) { push(`${name} stopped. Nothing was changed.`, "info"); return; }
      if (result.type !== "manual-field" || result.field !== field) throw new Error("Unexpected AI result.");
      const text = "statement" in result ? result.statement : richTextToPlain(result.blocks);
      if (text) await reveal.finish(text);
      useHandbookBuilder.getState().setManual((current) => applyHandbookFieldResult(current, result));
      push(`${name} ${ACTION_DONE[action]}.`, "success");
    } catch (cause) {
      if (signal.aborted) return;
      push(isAiUnavailable(cause) ? "AI writing is not available yet. You can write this part yourself." : `Could not update ${name}. Try again.`, "error");
    } finally {
      streams.end(field, reveal);
    }
  }, [manualId, orgId, push, streams]);

  /** Writes every field of a part in one request. Stopping any one field stops the request. */
  const writePart = React.useCallback(async (part: HandbookPart) => {
    const manual = useHandbookBuilder.getState().manual;
    if (!manual) return;
    const fields = HANDBOOK_PART_FIELDS[part];
    const runs = Object.fromEntries(fields.map((field) => [field, streams.start(field)])) as Record<HandbookAiField, GenerationRun>;
    const abort = new AbortController();
    fields.forEach((field) => runs[field].signal.addEventListener("abort", () => abort.abort(), { once: true }));
    setWriting(part);
    setFailed((current) => ({ ...current, [part]: undefined }));
    try {
      const result = await streamHandbookAi({ type: part, manual }, {
        orgId,
        manualId,
        signal: abort.signal,
        onPartial: (partial) => fields.forEach((field) => runs[field].reveal.set(partialHandbookFieldText(partial, field))),
      });
      if (abort.signal.aborted) return;
      if (result.type !== part) throw new Error("Unexpected AI result.");
      await Promise.all(fields.map((field) => runs[field].reveal.finish(partFieldText(result, field))));
      useHandbookBuilder.getState().setManual((current) => (
        result.type === "front-matter"
          ? applyHandbookFrontMatterResult(current, result.frontMatter)
          : applyHandbookClosingResult(current, result as Extract<HandbookAiResult, { type: "closing" }>)
      ));
      push(`${PART_TITLE[part]} written.`, "success");
    } catch (cause) {
      if (abort.signal.aborted) return;
      const message = isAiUnavailable(cause) ? "AI writing is not available yet. Write this part yourself, or retry later." : `The ${PART_TITLE[part].toLowerCase()} was not written. Try again.`;
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
    busy: (field: HandbookAiField) => streams.busy(field),
    reveal: (field: HandbookAiField) => streams.reveal(field),
    stop: (field: HandbookAiField) => streams.stop(field),
  };
}
