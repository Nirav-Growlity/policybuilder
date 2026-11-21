/**
 * Reads the Sustainable Development Goal tiles of a loaded policy when its SDG
 * section holds them as pictures. Server-side only. The model returns goal
 * numbers (1 to 17) and nothing else; they are validated before use. A missing
 * key, a refusal, a timeout or an unreadable answer leaves the goals empty so
 * the user picks them in the SDG step.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { DocxImage } from "../docx/parse";
import { sdgNumbersFromText, validSdgNumbers } from "../docx/sdg-numbers";
import type { ImportedPolicyContext, ImportedPolicySection } from "../types";
import { cleanJsonText, createClaudeText, hasClaudeKey } from "./claude";

export const SDG_VISION_MAX_IMAGES = 4;
/** Larger pictures are downscaled first; goal strips are tens of kilobytes. */
export const SDG_VISION_MAX_BYTES = 1_500_000;
const SDG_VISION_TIMEOUT_MS = 30_000;

const SYSTEM = `Each image comes from the Sustainable Development Goals section of a company policy document. It shows official UN SDG tiles, each with a goal number and name.
Return the numbers of the goals whose tiles you can read, from 1 to 17, without repeats. Return an empty list when no tile is legible or the image is not about the SDGs. Never guess.`;

const answerSchema = z.object({ sdgs: z.array(z.number().int()) });

export interface PreparedImage { mediaType: "image/png" | "image/jpeg" | "image/webp"; data: string }
export type SdgVisionRunner = (images: PreparedImage[], signal?: AbortSignal) => Promise<unknown>;

const DIRECT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** At most four pictures, each under the byte limit and in a format the model reads; others are converted or skipped. */
export async function prepareSdgImages(images: DocxImage[]): Promise<PreparedImage[]> {
  const prepared: PreparedImage[] = [];
  for (const image of images) {
    if (prepared.length >= SDG_VISION_MAX_IMAGES) break;
    if (!image.data) continue;
    if (DIRECT_TYPES.has(image.contentType) && image.data.length <= SDG_VISION_MAX_BYTES) {
      prepared.push({ mediaType: image.contentType as PreparedImage["mediaType"], data: image.data.toString("base64") });
      continue;
    }
    try {
      const sharp = (await import("sharp")).default;
      const resized = sharp(image.data).resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true });
      let out = await resized.clone().png().toBuffer();
      let mediaType: PreparedImage["mediaType"] = "image/png";
      if (out.length > SDG_VISION_MAX_BYTES) {
        out = await resized.clone().jpeg({ quality: 80 }).toBuffer();
        mediaType = "image/jpeg";
      }
      if (out.length <= SDG_VISION_MAX_BYTES) prepared.push({ mediaType, data: out.toString("base64") });
    } catch {
      // A format sharp cannot read (EMF, WMF) is skipped.
    }
  }
  return prepared;
}

const defaultRunner: SdgVisionRunner = async (images, signal) => {
  const { text } = await createClaudeText({
    system: SYSTEM,
    user: "Which SDG goal numbers do these images show?",
    images,
    maxTokens: 400,
    effort: "low",
    format: zodOutputFormat(answerSchema),
  }, signal);
  return JSON.parse(cleanJsonText(text));
};

/** Goal numbers the model reads from the pictures; empty when it cannot. */
export async function readSdgGoalsFromImages(
  images: DocxImage[],
  options: { signal?: AbortSignal; run?: SdgVisionRunner } = {},
): Promise<number[]> {
  const prepared = await prepareSdgImages(images);
  if (!prepared.length) return [];
  const answer = answerSchema.safeParse(await (options.run ?? defaultRunner)(prepared, options.signal));
  return answer.success ? validSdgNumbers(answer.data.sdgs) : [];
}

function sectionText(section: ImportedPolicySection): string {
  return [section.title, ...(section.imageAlts ?? []), ...section.blocks.map((block) => (block.type === "paragraph" ? block.text : block.type === "list" ? block.items.join("\n") : block.rows.map((row) => row.join(" ")).join("\n")))].join("\n");
}

/**
 * Fills `sdgGoals` on the SDG section that holds the pictures. Free signals come
 * first: when the section's text or the pictures' alt text already names goals,
 * no model call is made. Any failure leaves the reference unchanged.
 */
export async function addSdgGoalsFromImages(
  reference: ImportedPolicyContext,
  sdgImages: DocxImage[],
  options: { signal?: AbortSignal; run?: SdgVisionRunner; enabled?: boolean } = {},
): Promise<{ reference: ImportedPolicyContext; read: boolean }> {
  const unchanged = { reference, read: false };
  const sections = reference.sections.filter((section) => section.kind === "sdg");
  const target = sections.find((section) => (section.imageAlts?.length ?? 0) > 0);
  if (!target || !sdgImages.length) return unchanged;
  if (sections.some((section) => sdgNumbersFromText(sectionText(section)).length > 0)) return unchanged;
  if (!(options.enabled ?? hasClaudeKey())) return unchanged;
  try {
    const signal = options.signal ?? AbortSignal.timeout(SDG_VISION_TIMEOUT_MS);
    const goals = await readSdgGoalsFromImages(sdgImages, { signal, run: options.run });
    if (!goals.length) return unchanged;
    return {
      reference: { ...reference, sections: reference.sections.map((section) => (section === target ? { ...section, sdgGoals: goals } : section)) },
      read: true,
    };
  } catch {
    return unchanged;
  }
}
