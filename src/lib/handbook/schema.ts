/**
 * Zod schemas mirroring `./types`, used for save validation and the render
 * and AI routes. Section, company, control, cover and theme shapes are the
 * SOP manual's own schemas.
 */
import { z } from "zod";
import {
  revisionEntrySchema,
  richTextBlockSchema,
  siteSchema,
  sopCompanyFactsSchema,
  sopCompanySchema,
  sopCoverSchema,
  sopDefinitionRowSchema,
  sopManualControlSchema,
  sopSectionSchema,
  sopTemplateIdSchema,
  sopThemeOptionsSchema,
} from "../sop/schema";
import { HANDBOOK_PART_IDS, type HandbookChapter, type HandbookManual, type HandbookPartId } from "./types";

export const handbookPartSchema = z.enum(HANDBOOK_PART_IDS as [HandbookPartId, ...HandbookPartId[]]);

export const handbookChapterSchema = z.object({
  id: z.string(),
  catalogId: z.string().optional(),
  code: z.string(),
  title: z.string(),
  part: handbookPartSchema,
  owner: z.string(),
  enabled: z.boolean(),
  status: z.enum(["empty", "generating", "draft", "reviewed"]),
  sections: z.array(sopSectionSchema),
});

export const handbookFrontMatterSchema = z.object({
  welcome: z.array(richTextBlockSchema),
  about: z.array(richTextBlockSchema),
  vision: z.string(),
  mission: z.string(),
  coreValues: z.array(z.object({ title: z.string(), description: z.string() })),
  purpose: z.array(richTextBlockSchema),
  howToUse: z.array(richTextBlockSchema),
  sites: z.array(siteSchema),
  glossary: z.array(sopDefinitionRowSchema),
});

export const handbookClosingSchema = z.object({
  reviewMechanism: z.array(richTextBlockSchema),
  revisionHistory: z.array(revisionEntrySchema),
  approval: z.object({
    statement: z.string(),
    signatories: z.array(z.object({ role: z.string(), name: z.string(), designation: z.string(), date: z.string() })),
  }),
  acknowledgement: z.string(),
});

export const handbookFactsSchema = z.object({
  workingHours: z.string(),
  weeklyOff: z.string(),
  probation: z.string(),
  noticePeriod: z.string(),
  payday: z.string(),
  leave: z.array(z.object({ type: z.string(), days: z.string(), notes: z.string() })),
});

export const handbookManualSchema = z.object({
  id: z.string(),
  company: sopCompanySchema,
  control: sopManualControlSchema,
  grouping: z.enum(["part", "none"]),
  frontMatter: handbookFrontMatterSchema,
  chapters: z.array(handbookChapterSchema),
  closing: handbookClosingSchema,
  theme: sopTemplateIdSchema,
  themeOptions: sopThemeOptionsSchema,
  cover: sopCoverSchema,
  facts: sopCompanyFactsSchema.optional(),
  handbookFacts: handbookFactsSchema.optional(),
});

/** True when a stored or posted manual looks like a handbook (it has chapters, not SOPs). */
export function looksLikeHandbook(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && Array.isArray((value as { chapters?: unknown }).chapters));
}

/* Compile-time guards: the schemas must stay in step with the types. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _HandbookChapterSchemaMatches = Assert<Equal<z.infer<typeof handbookChapterSchema>, HandbookChapter>>;
export type _HandbookManualSchemaMatches = Assert<Equal<z.infer<typeof handbookManualSchema>, HandbookManual>>;
