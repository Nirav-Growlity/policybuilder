/**
 * Zod schemas mirroring `./types`. Used for save validation, the import
 * normalizer and (via `generatedSopSchema`) Claude structured outputs.
 */
import { z } from "zod";
import type { Company, CoverComposition } from "../types";
import { SOP_TEMPLATE_IDS } from "./types";
import type { Sop, SopManual, SopSection } from "./types";

export const richTextBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["paragraph", "bullets", "numbered", "table"]),
  text: z.string(),
  columns: z.array(z.string()).optional(),
  rows: z.array(z.array(z.string())).optional(),
});

export const sopPillarSchema = z.enum(["E", "S", "G"]);
export const sopGroupingSchema = z.enum(["pillar", "department", "none"]);
export const sopStatusSchema = z.enum(["empty", "generating", "draft", "reviewed"]);
export const sopTemplateIdSchema = z.enum(SOP_TEMPLATE_IDS);

const sectionBase = {
  id: z.string(),
  title: z.string(),
  enabled: z.boolean(),
};

const narrative = <K extends "purpose" | "scope" | "training" | "review" | "custom">(kind: K) =>
  z.object({ ...sectionBase, kind: z.literal(kind), blocks: z.array(richTextBlockSchema) });

export const sopDefinitionRowSchema = z.object({ term: z.string(), definition: z.string() });
export const sopResponsibilityRowSchema = z.object({ role: z.string(), responsibilities: z.array(z.string()) });
export const sopProcedureSubstepSchema = z.object({ id: z.string(), text: z.string(), responsible: z.string().optional() });
export const sopProcedureStepSchema = z.object({
  id: z.string(),
  heading: z.string(),
  body: z.array(richTextBlockSchema),
  responsible: z.string().optional(),
  substeps: z.array(sopProcedureSubstepSchema).optional(),
});
export const sopKpiSchema = z.object({ indicator: z.string(), target: z.string(), frequency: z.string(), owner: z.string() });
export const sopRecordRowSchema = z.object({ record: z.string(), owner: z.string(), retention: z.string(), format: z.string() });

export const sopSectionSchema = z.discriminatedUnion("kind", [
  narrative("purpose"),
  narrative("scope"),
  narrative("training"),
  narrative("review"),
  narrative("custom"),
  z.object({ ...sectionBase, kind: z.literal("definitions"), rows: z.array(sopDefinitionRowSchema) }),
  z.object({ ...sectionBase, kind: z.literal("responsibilities"), rows: z.array(sopResponsibilityRowSchema) }),
  z.object({ ...sectionBase, kind: z.literal("procedure"), steps: z.array(sopProcedureStepSchema) }),
  z.object({ ...sectionBase, kind: z.literal("monitoring"), kpis: z.array(sopKpiSchema), narrative: z.array(richTextBlockSchema) }),
  z.object({ ...sectionBase, kind: z.literal("records"), rows: z.array(sopRecordRowSchema) }),
  z.object({ ...sectionBase, kind: z.literal("references"), items: z.array(z.string()) }),
  z.object({ ...sectionBase, kind: z.literal("appendix"), blocks: z.array(richTextBlockSchema) }),
]);

export const sopSchema = z.object({
  id: z.string(),
  catalogId: z.string().optional(),
  code: z.string(),
  title: z.string(),
  pillar: sopPillarSchema,
  department: z.string(),
  owner: z.string(),
  version: z.string(),
  enabled: z.boolean(),
  status: sopStatusSchema,
  sections: z.array(sopSectionSchema),
});

export const siteSchema = z.object({
  id: z.string().optional(),
  location: z.string().optional(),
  address: z.string(),
  primaryFunction: z.string().optional(),
});

/**
 * The company block is owned by the policy model; validate the fields the SOP
 * manual relies on and keep the rest as-is.
 */
export const sopCompanySchema = z.looseObject({
  name: z.string(),
  industry: z.string(),
  subCategory: z.string().optional(),
  industryDetail: z.string().optional(),
  country: z.string().optional(),
  companyLogo: z.string().optional(),
  sites: z.array(siteSchema).optional(),
  docNum: z.string(),
  revNum: z.string(),
  effectiveDate: z.string(),
  reviewDate: z.string(),
  approver: z.string(),
}) as unknown as z.ZodType<Company>;

export const sopManualControlSchema = z.object({
  docNo: z.string(),
  revision: z.string(),
  supersedes: z.string(),
  effectiveDate: z.string(),
  reviewFrequency: z.string(),
  nextReviewDate: z.string(),
  preparedBy: z.string(),
  reviewedBy: z.string(),
  approvedBy: z.string(),
  classification: z.string(),
  title: z.string().optional(),
  subtitle: z.string().optional(),
  issueDate: z.string().optional(),
  lastReviewDate: z.string().optional(),
});

export const sopFrontMatterSchema = z.object({
  introduction: z.array(richTextBlockSchema),
  objective: z.array(richTextBlockSchema),
  benefits: z.array(z.string()),
  sites: z.array(siteSchema),
  coreValues: z.array(z.object({ title: z.string(), description: z.string() })),
  howToUse: z.array(richTextBlockSchema),
  glossary: z.array(sopDefinitionRowSchema),
});

export const revisionEntrySchema = z.object({
  revisionNo: z.string(),
  date: z.string(),
  description: z.string(),
  source: z.enum(["scheduled", "custom"]).optional(),
  scheduleAnchor: z.number().optional(),
  reviewedBy: z.string().optional(),
  approvedBy: z.string().optional(),
});

export const sopClosingSchema = z.object({
  reviewMechanism: z.array(richTextBlockSchema),
  revisionHistory: z.array(revisionEntrySchema),
  approval: z.object({
    statement: z.string(),
    signatories: z.array(z.object({ role: z.string(), name: z.string(), designation: z.string(), date: z.string() })),
  }),
});

export const sopThemeOptionsSchema = z.object({
  accent: z.string(),
  fontPair: z.string(),
  pageSize: z.enum(["A4", "Letter"]),
  showSopHeaderCard: z.boolean(),
});

const coverCompositionSchema = z.custom<CoverComposition>(
  (value) => typeof value === "object" && value !== null && Array.isArray((value as { elements?: unknown }).elements),
  { message: "Invalid cover composition" }
);

export const sopCoverSchema = z.object({
  variant: z.enum(["template", "upload", "ai"]),
  imageUrl: z.string().optional(),
  composition: coverCompositionSchema.optional(),
  libraryTemplateId: z.string().optional(),
});

export const sopContactSchema = z.object({ purpose: z.string(), name: z.string(), phone: z.string(), email: z.string() });

export const sopCompanyFactsSchema = z.object({
  profile: z.string(),
  certifications: z.array(z.string()),
  regulations: z.array(z.string()),
  contacts: z.array(sopContactSchema),
});

export const sopManualSchema = z.object({
  id: z.string(),
  company: sopCompanySchema,
  control: sopManualControlSchema,
  grouping: sopGroupingSchema,
  frontMatter: sopFrontMatterSchema,
  sops: z.array(sopSchema),
  closing: sopClosingSchema,
  theme: sopTemplateIdSchema,
  themeOptions: sopThemeOptionsSchema,
  cover: sopCoverSchema,
  facts: sopCompanyFactsSchema.optional(),
});

/* ------------------------------------------------------------------ */
/* AI output: SOP content without client-side ids and workflow state.  */
/* ------------------------------------------------------------------ */

const generatedBlockSchema = richTextBlockSchema.omit({ id: true });

const generatedNarrative = <K extends "purpose" | "scope" | "training" | "review" | "custom">(kind: K) =>
  z.object({ kind: z.literal(kind), title: z.string(), blocks: z.array(generatedBlockSchema) });

export const generatedSopSectionSchema = z.discriminatedUnion("kind", [
  generatedNarrative("purpose"),
  generatedNarrative("scope"),
  generatedNarrative("training"),
  generatedNarrative("review"),
  generatedNarrative("custom"),
  z.object({ kind: z.literal("definitions"), title: z.string(), rows: z.array(sopDefinitionRowSchema) }),
  z.object({ kind: z.literal("responsibilities"), title: z.string(), rows: z.array(sopResponsibilityRowSchema) }),
  z.object({
    kind: z.literal("procedure"),
    title: z.string(),
    steps: z.array(
      z.object({
        heading: z.string(),
        body: z.array(generatedBlockSchema),
        responsible: z.string().optional(),
        substeps: z.array(z.object({ text: z.string(), responsible: z.string().optional() })).optional(),
      })
    ),
  }),
  z.object({ kind: z.literal("monitoring"), title: z.string(), kpis: z.array(sopKpiSchema), narrative: z.array(generatedBlockSchema) }),
  z.object({ kind: z.literal("records"), title: z.string(), rows: z.array(sopRecordRowSchema) }),
  z.object({ kind: z.literal("references"), title: z.string(), items: z.array(z.string()) }),
  z.object({ kind: z.literal("appendix"), title: z.string(), blocks: z.array(generatedBlockSchema) }),
]);

export const generatedSopSchema = z.object({
  title: z.string(),
  pillar: sopPillarSchema,
  department: z.string(),
  owner: z.string(),
  sections: z.array(generatedSopSectionSchema),
});

export type GeneratedSop = z.infer<typeof generatedSopSchema>;
export type GeneratedSopSection = z.infer<typeof generatedSopSectionSchema>;

/* Compile-time guards: the schemas must stay in step with the types. */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type _SopSectionSchemaMatches = Assert<Equal<z.infer<typeof sopSectionSchema>, SopSection>>;
export type _SopSchemaMatches = Assert<Equal<z.infer<typeof sopSchema>, Sop>>;
export type _SopManualSchemaMatches = Assert<Equal<z.infer<typeof sopManualSchema>, SopManual>>;
