"use client";

import * as React from "react";
import { useToast } from "@/components/ui/toast";
import { useGenerationStreams } from "@/lib/ai/use-generation-streams";
import { streamSopAi } from "@/lib/sop/ai-client";
import type { SopAiRequest, SopAiResult } from "@/lib/sop/ai-contract";
import { useSopBuilder } from "@/lib/sop/store";
import type { SopFrontMatter, SopSection } from "@/lib/sop/types";
import { sopSectionLabel } from "@/lib/sop/types";
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

/** Text written so far, read from a partial section or front matter object. */
export function partialText(partial: unknown): string {
  if (!partial || typeof partial !== "object") return "";
  const record = partial as Record<string, unknown>;
  const holder = (record.section && typeof record.section === "object" ? record.section : record) as Record<string, unknown>;
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

/** Writes the front matter or the closing with AI. */
export function useManualPartAi() {
  const { push } = useToast();
  const { orgId, manualId } = useSopBuilderActions();
  const [busy, setBusy] = React.useState<"front-matter" | "closing" | null>(null);
  const controller = React.useRef<AbortController | null>(null);

  const run = React.useCallback(async (type: "front-matter" | "closing", instruction?: string) => {
    const manual = useSopBuilder.getState().manual;
    if (!manual) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setBusy(type);
    try {
      const result = await streamSopAi({ type, manual, ...(instruction ? { instruction } : {}) }, { orgId, manualId, signal: abort.signal });
      if (abort.signal.aborted) return;
      if (result.type === "front-matter") {
        const frontMatter: Partial<SopFrontMatter> = result.frontMatter;
        useSopBuilder.getState().setManual((current) => ({ ...current, frontMatter: { ...current.frontMatter, ...frontMatter } }));
        push("Front matter written.", "success");
      } else if (result.type === "closing") {
        useSopBuilder.getState().setManual((current) => ({
          ...current,
          closing: { ...current.closing, reviewMechanism: result.reviewMechanism, approval: { ...current.closing.approval, statement: result.approvalStatement } },
        }));
        push("Closing written.", "success");
      }
    } catch (cause) {
      if (!abort.signal.aborted) push(cause instanceof Error && /not wired up/i.test(cause.message) ? "AI writing is not available yet. You can write this part yourself." : "Could not write this part. Try again.", "error");
    } finally {
      if (controller.current === abort) { controller.current = null; setBusy(null); }
    }
  }, [manualId, orgId, push]);

  React.useEffect(() => () => controller.current?.abort(), []);
  return { run, busy, stop: () => controller.current?.abort() };
}
