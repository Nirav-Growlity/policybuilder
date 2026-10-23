/**
 * Server-side core of the handbook AI route: validates a request, builds the
 * prompt, streams Claude's structured JSON and turns it into a
 * HandbookAiResult. Without an API key it throws ClaudeKeyMissingError.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { HANDBOOK_AI_FIELDS, type HandbookAiRequest, type HandbookAiResult } from "../handbook/ai-contract";
import { chapterSectionsToWrite, handbookFieldText, isStatementField, wireToChapterSections } from "../handbook/apply-ai-result";
import { handbookManualSchema } from "../handbook/schema";
import type { HandbookManual } from "../handbook/types";
import { createSopId } from "../sop/initial-manual";
import type { SopSection } from "../sop/types";
import type { RichTextBlock } from "../types";
import { ClaudeKeyMissingError, cleanJsonText, hasClaudeKey, streamClaudeText } from "./claude";
import {
  buildHandbookPrompt,
  chapterOutputSchema,
  chapterSectionsSchema,
  collectHandbookReferences,
  handbookClosingSchema,
  handbookFieldSchema,
  handbookFrontMatterSchema,
} from "./handbook-prompts";

const instructionSchema = z.string().max(4_000).optional();

const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("chapter"), manual: handbookManualSchema, chapterId: z.string().min(1), instruction: instructionSchema }),
  z.object({ type: z.literal("chapter-section"), manual: handbookManualSchema, chapterId: z.string().min(1), sectionId: z.string().min(1), instruction: instructionSchema }),
  z.object({ type: z.literal("refine"), manual: handbookManualSchema, chapterId: z.string().min(1), sectionId: z.string().min(1), mode: z.enum(["expand", "shorten", "formal", "custom"]), instruction: instructionSchema }),
  z.object({ type: z.literal("front-matter"), manual: handbookManualSchema, instruction: instructionSchema }),
  z.object({ type: z.literal("closing"), manual: handbookManualSchema, instruction: instructionSchema }),
  z.object({ type: z.literal("manual-field"), manual: handbookManualSchema, field: z.enum(HANDBOOK_AI_FIELDS), mode: z.enum(["generate", "shorten", "custom"]), instruction: instructionSchema }),
]);

export function parseHandbookAiRequest(body: unknown): { ok: true; request: HandbookAiRequest } | { ok: false; error: string } {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Invalid request${issue ? ` at ${issue.path.join(".") || "body"}: ${issue.message}` : "."}` };
  }
  const request = parsed.data as HandbookAiRequest;
  if (request.type === "manual-field") {
    if (request.mode !== "generate" && !handbookFieldText(request.manual, request.field)) return { ok: false, error: "Write this part before refining it with AI." };
    if (request.mode === "custom" && !request.instruction?.trim()) return { ok: false, error: "A custom refinement needs an instruction." };
  }
  if (request.type === "chapter" || request.type === "chapter-section" || request.type === "refine") {
    const chapter = request.manual.chapters.find((candidate) => candidate.id === request.chapterId);
    if (!chapter) return { ok: false, error: "The chapter is not in this handbook." };
    if (request.type === "chapter" && chapterSectionsToWrite(chapter).length === 0) return { ok: false, error: "This chapter has no sections for the AI to write." };
    if (request.type !== "chapter") {
      if (!chapter.sections.some((section) => section.id === request.sectionId)) return { ok: false, error: "The section is not in this chapter." };
      if (request.type === "refine" && request.mode === "custom" && !request.instruction?.trim()) return { ok: false, error: "A custom refinement needs an instruction." };
    }
  }
  return { ok: true, request };
}

export class HandbookOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandbookOutputError";
  }
}

function paragraphs(values: string[]): RichTextBlock[] {
  return values.map((text) => text.trim()).filter(Boolean).map((text) => ({ id: createSopId("block"), type: "paragraph", text }));
}

function countWords(value: unknown, key = ""): number {
  if (typeof value === "string") return ["id", "kind", "type", "title"].includes(key) ? 0 : value.split(/\s+/).filter(Boolean).length;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + countWords(item, key), 0);
  if (value && typeof value === "object") return Object.entries(value).reduce((sum, [name, item]) => sum + countWords(item, name), 0);
  return 0;
}

function targetSection(request: Extract<HandbookAiRequest, { sectionId: string }>): SopSection {
  const section = request.manual.chapters.find((chapter) => chapter.id === request.chapterId)?.sections.find((candidate) => candidate.id === request.sectionId);
  if (!section) throw new HandbookOutputError("The section is no longer in this chapter.");
  return section;
}

const MIN_WORDS_PER_SECTION = 15;
const MAX_FIELD_PARAGRAPHS = 8;
const MAX_STATEMENT_CHARS = 1_200;

/** Validates the model's JSON against the request's schema and maps it to the contract result. */
export function finalizeHandbookOutput(request: HandbookAiRequest, value: unknown): HandbookAiResult {
  switch (request.type) {
    case "chapter": {
      const chapter = request.manual.chapters.find((candidate) => candidate.id === request.chapterId);
      if (!chapter) throw new HandbookOutputError("The chapter is no longer in this handbook.");
      const requested = chapterSectionsToWrite(chapter);
      const parsed = chapterOutputSchema(requested).safeParse(value);
      if (!parsed.success) throw new HandbookOutputError("The AI response did not match the chapter format.");
      const sections = wireToChapterSections(parsed.data.sections, requested);
      if (!sections.length) throw new HandbookOutputError("The AI response had no sections.");
      if (countWords(sections) < MIN_WORDS_PER_SECTION * sections.length) throw new HandbookOutputError("The AI response was too short. Try again.");
      return { type: "chapter", chapter: { sections } };
    }
    case "chapter-section":
    case "refine": {
      const current = targetSection(request);
      const parsed = chapterSectionsSchema([current]).safeParse(value);
      if (!parsed.success) throw new HandbookOutputError("The AI response did not match the section format.");
      const [written] = wireToChapterSections(parsed.data.sections, [current]);
      if (!written) throw new HandbookOutputError("The AI response did not match the section format.");
      return { type: request.type, section: written };
    }
    case "front-matter": {
      const parsed = handbookFrontMatterSchema.safeParse(value);
      if (!parsed.success) throw new HandbookOutputError("The AI response did not match the front matter format.");
      return {
        type: "front-matter",
        frontMatter: {
          welcome: paragraphs(parsed.data.welcome),
          about: paragraphs(parsed.data.about),
          vision: parsed.data.vision.trim(),
          mission: parsed.data.mission.trim(),
          coreValues: parsed.data.coreValues.filter((item) => item.title.trim()),
          purpose: paragraphs(parsed.data.purpose),
        },
      };
    }
    case "closing": {
      const parsed = handbookClosingSchema.safeParse(value);
      if (!parsed.success) throw new HandbookOutputError("The AI response did not match the closing format.");
      return {
        type: "closing",
        acknowledgement: parsed.data.acknowledgement.trim().slice(0, MAX_STATEMENT_CHARS),
      };
    }
    case "manual-field": {
      const parsed = handbookFieldSchema(request.field).safeParse(value);
      if (!parsed.success) throw new HandbookOutputError("The AI response did not match the field format.");
      const field = request.field;
      const raw = (parsed.data as Record<string, unknown>)[field];
      if (isStatementField(field)) {
        const statement = String(raw).trim().slice(0, MAX_STATEMENT_CHARS);
        if (!statement) throw new HandbookOutputError("The AI response was empty. Try again.");
        return { type: "manual-field", field, statement };
      }
      const blocks = paragraphs((raw as string[]).slice(0, MAX_FIELD_PARAGRAPHS));
      if (!blocks.length) throw new HandbookOutputError("The AI response was empty. Try again.");
      return { type: "manual-field", field, blocks };
    }
  }
}

export type HandbookGenerationRun = {
  result: HandbookAiResult;
  usage?: Anthropic.Messages.Usage;
  totalMs: number;
};

export type HandbookGenerationOptions = {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  /** Seed corpus folder; defaults to data/seed-handbooks. */
  seedDirectory?: string;
};

/** Runs one request, streaming the model's JSON through `onDelta`. */
export async function runHandbookGeneration(request: HandbookAiRequest, options: HandbookGenerationOptions = {}): Promise<HandbookGenerationRun> {
  const started = Date.now();
  if (!hasClaudeKey()) throw new ClaudeKeyMissingError();
  const prompt = buildHandbookPrompt(request, collectHandbookReferences(request, { directory: options.seedDirectory }));
  const { text, stopReason, usage } = await streamClaudeText({
    system: prompt.system,
    cachedContext: prompt.cachedContext,
    reusableContext: prompt.reusableContext,
    user: prompt.user,
    maxTokens: prompt.maxTokens,
    effort: "low",
    format: zodOutputFormat(prompt.schema),
  }, (delta) => options.onDelta?.(delta), options.signal);
  if (stopReason === "max_tokens") throw new HandbookOutputError("The AI answer was cut off before it finished. Try again or shorten the instruction.");
  let value: unknown;
  try {
    value = JSON.parse(cleanJsonText(text));
  } catch {
    throw new HandbookOutputError("The AI response could not be read. Try again.");
  }
  return { result: finalizeHandbookOutput(request, value), usage, totalMs: Date.now() - started };
}

export type { HandbookManual };
