/**
 * Browser-side client for the handbook AI route: one streamed request, and
 * the generation queue (shared with SOP manuals) writing many chapters at once.
 */
import { streamManualAi, type StreamSopOptions } from "../sop/ai-client";
import { createGenerationQueue, type GenerationAdapter, type GenerationQueueHandle } from "../sop/generation-queue";
import type { SopGenerationState } from "../sop/ai-contract";
import type { HandbookAiRequest, HandbookAiResult } from "./ai-contract";
import { chapterSectionsToWrite, partialChapterSections } from "./apply-ai-result";
import type { HandbookManual } from "./types";

export function handbookAiUrl(orgId: number, manualId: string) {
  return `/api/documents/handbook/ai?orgId=${encodeURIComponent(String(orgId))}&manualId=${encodeURIComponent(manualId)}`;
}

export function streamHandbookAi(request: HandbookAiRequest, options: StreamSopOptions): Promise<HandbookAiResult> {
  return streamManualAi<HandbookAiResult>(handbookAiUrl(options.orgId, options.manualId), request, options);
}

type ChapterResult = Extract<HandbookAiResult, { type: "chapter" }>;
type FrontResult = Extract<HandbookAiResult, { type: "front-matter" }>;

export const HANDBOOK_GENERATION_ADAPTER: GenerationAdapter<HandbookManual, HandbookAiRequest, HandbookAiResult, ChapterResult, FrontResult> = {
  itemRequest: (manual, chapterId) => ({ type: "chapter", manual, chapterId }),
  frontMatterRequest: (manual) => ({ type: "front-matter", manual }),
  isItemResult: (result): result is ChapterResult => result.type === "chapter",
  isFrontMatterResult: (result): result is FrontResult => result.type === "front-matter",
  partialSections: (partial, manual, chapterId) => {
    const chapter = manual.chapters.find((item) => item.id === chapterId);
    return chapter ? partialChapterSections(partial, chapterSectionsToWrite(chapter)) : [];
  },
};

/** Writes the given chapters (and the front matter, when asked) a few at a time. */
export function startHandbookGeneration(options: {
  orgId: number;
  manualId: string;
  getManual: () => HandbookManual;
  chapterIds: string[];
  includeFrontMatter: boolean;
  concurrency?: number;
  onState: (state: SopGenerationState) => void;
  onChapterDone: (chapterId: string, result: ChapterResult) => void;
  onFrontMatterDone?: (result: FrontResult) => void;
}): GenerationQueueHandle {
  const { orgId, manualId, chapterIds, onChapterDone, ...rest } = options;
  return createGenerationQueue<HandbookManual, HandbookAiRequest, HandbookAiResult, ChapterResult, FrontResult>({
    ...rest,
    sopIds: chapterIds,
    onSopDone: onChapterDone,
    adapter: HANDBOOK_GENERATION_ADAPTER,
    stream: (request, { signal, onPartial }) => streamHandbookAi(request, { orgId, manualId, signal, onPartial }),
  });
}
