/**
 * Server-side core of the SOP AI route: validates a request, builds the
 * prompt, streams Claude's structured JSON and turns it into a SopAiResult.
 * Without an API key a deterministic mock answer is used so the UI works
 * offline. Kept outside the route file so scripts and tests can call it.
 */
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { AI_WRITTEN_SECTION_KINDS, MANUAL_AI_FIELDS, type ManualAiField, type SopAiRequest, type SopAiResult } from "../sop/ai-contract";
import { manualFieldText, wireSectionsToSop } from "../sop/apply-ai-result";
import { getCatalogTopic } from "../sop/catalog";
import { companyFacts } from "../sop/company-facts";
import { createSopId } from "../sop/initial-manual";
import { sopManualSchema, type GeneratedSopSection } from "../sop/schema";
import type { RichTextBlock } from "../types";
import type { Sop, SopManual, SopSection } from "../sop/types";
import { cleanJsonText, hasClaudeKey, streamClaudeText } from "./claude";
import {
  buildSopPrompt,
  closingOutputSchema,
  collectSopPromptSources,
  frontMatterOutputSchema,
  manualFieldOutputSchema,
  sectionsOutputSchema,
  sectionsToWrite,
  sopOutputSchema,
  type SopPrompt,
} from "./sop-prompts";

/* ------------------------------------------------------------------ */
/* Request validation                                                  */
/* ------------------------------------------------------------------ */

const instructionSchema = z.string().max(4_000).optional();

const requestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sop"), manual: sopManualSchema, sopId: z.string().min(1), instruction: instructionSchema }),
  z.object({ type: z.literal("sop-section"), manual: sopManualSchema, sopId: z.string().min(1), sectionId: z.string().min(1), instruction: instructionSchema }),
  z.object({
    type: z.literal("refine"),
    manual: sopManualSchema,
    sopId: z.string().min(1),
    sectionId: z.string().min(1),
    mode: z.enum(["expand", "shorten", "formal", "custom"]),
    instruction: instructionSchema,
  }),
  z.object({ type: z.literal("front-matter"), manual: sopManualSchema, instruction: instructionSchema }),
  z.object({ type: z.literal("closing"), manual: sopManualSchema, instruction: instructionSchema }),
  z.object({
    type: z.literal("manual-field"),
    manual: sopManualSchema,
    field: z.enum(MANUAL_AI_FIELDS),
    mode: z.enum(["generate", "shorten", "custom"]),
    instruction: instructionSchema,
  }),
]);

export function parseSopAiRequest(body: unknown): { ok: true; request: SopAiRequest } | { ok: false; error: string } {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Invalid request${issue ? ` at ${issue.path.join(".") || "body"}: ${issue.message}` : "."}` };
  }
  const request = parsed.data as SopAiRequest;
  if (request.type === "manual-field") {
    if (request.mode !== "generate" && !manualFieldText(request.manual, request.field)) return { ok: false, error: "Write this part before refining it with AI." };
    if (request.mode === "custom" && !request.instruction?.trim()) return { ok: false, error: "A custom refinement needs an instruction." };
  }
  if (request.type === "sop" || request.type === "sop-section" || request.type === "refine") {
    const sop = request.manual.sops.find((candidate) => candidate.id === request.sopId);
    if (!sop) return { ok: false, error: "The SOP is not in this manual." };
    if (request.type === "sop" && sectionsToWrite(sop).length === 0) return { ok: false, error: "This SOP has no enabled sections for the AI to write." };
    if (request.type !== "sop") {
      const section = sop.sections.find((candidate) => candidate.id === request.sectionId);
      if (!section) return { ok: false, error: "The section is not in this SOP." };
      if (request.type === "refine" && request.mode === "custom" && !request.instruction?.trim()) {
        return { ok: false, error: "A custom refinement needs an instruction." };
      }
    }
  }
  return { ok: true, request };
}

/* ------------------------------------------------------------------ */
/* Model output -> SopAiResult                                         */
/* ------------------------------------------------------------------ */

export class SopOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SopOutputError";
  }
}

function paragraphs(values: string[]): RichTextBlock[] {
  return values.map((text) => text.trim()).filter(Boolean).map((text) => ({ id: createSopId("block"), type: "paragraph", text }));
}

function targetSection(request: Extract<SopAiRequest, { sectionId: string }>): SopSection {
  const sop = request.manual.sops.find((candidate) => candidate.id === request.sopId);
  const section = sop?.sections.find((candidate) => candidate.id === request.sectionId);
  if (!section) throw new SopOutputError("The section is no longer in this SOP.");
  return section;
}

const MIN_WORDS_PER_SECTION = 20;
/** Caps on one written manual field; the model's answer is untrusted. */
const MAX_FIELD_PARAGRAPHS = 8;
const MAX_STATEMENT_CHARS = 1_200;

/** Words of content, leaving out ids, kinds, block types and headings. */
function countWords(value: unknown, key = ""): number {
  if (typeof value === "string") return ["id", "kind", "type", "title"].includes(key) ? 0 : value.split(/\s+/).filter(Boolean).length;
  if (Array.isArray(value)) return value.reduce((sum: number, item) => sum + countWords(item, key), 0);
  if (value && typeof value === "object") return Object.entries(value).reduce((sum, [name, item]) => sum + countWords(item, name), 0);
  return 0;
}

/** Validates the model's JSON (or the mock's) against the request's schema and maps it to the contract result. */
export function finalizeSopOutput(request: SopAiRequest, value: unknown): SopAiResult {
  switch (request.type) {
    case "sop": {
      const sop = request.manual.sops.find((candidate) => candidate.id === request.sopId);
      if (!sop) throw new SopOutputError("The SOP is no longer in this manual.");
      const requested = sectionsToWrite(sop);
      const parsed = sopOutputSchema(requested.map((section) => section.kind)).safeParse(value);
      if (!parsed.success) throw new SopOutputError("The AI response did not match the SOP format.");
      const titles = Object.fromEntries(requested.map((section) => [section.kind, section.title]));
      const sections = wireSectionsToSop(parsed.data.sections, { titles }).filter((section) => AI_WRITTEN_SECTION_KINDS.includes(section.kind));
      if (!sections.length) throw new SopOutputError("The AI response had no sections.");
      // A near-empty answer happens occasionally; failing it lets the queue's retry replace it.
      if (countWords(sections) < MIN_WORDS_PER_SECTION * sections.length) throw new SopOutputError("The AI response was too short. Try again.");
      return {
        type: "sop",
        sop: {
          sections,
          ...(parsed.data.department.trim() ? { department: parsed.data.department.trim() } : {}),
          ...(parsed.data.owner.trim() ? { owner: parsed.data.owner.trim() } : {}),
        },
      };
    }
    case "sop-section":
    case "refine": {
      const current = targetSection(request);
      const parsed = sectionsOutputSchema([current.kind]).safeParse(value);
      if (!parsed.success) throw new SopOutputError("The AI response did not match the section format.");
      const [written] = wireSectionsToSop(parsed.data.sections, { titles: { [current.kind]: current.title } });
      if (!written || written.kind !== current.kind) throw new SopOutputError("The AI response did not match the section format.");
      return { type: request.type, section: { ...written, id: current.id, title: current.title, enabled: current.enabled } as SopSection };
    }
    case "front-matter": {
      const parsed = frontMatterOutputSchema.safeParse(value);
      if (!parsed.success) throw new SopOutputError("The AI response did not match the front matter format.");
      return {
        type: "front-matter",
        frontMatter: {
          introduction: paragraphs(parsed.data.introduction),
          objective: paragraphs(parsed.data.objective),
          benefits: parsed.data.benefits.map((item) => item.trim()).filter(Boolean),
          coreValues: parsed.data.coreValues.filter((value) => value.title.trim()),
          howToUse: paragraphs(parsed.data.howToUse),
        },
      };
    }
    case "closing": {
      const parsed = closingOutputSchema.safeParse(value);
      if (!parsed.success) throw new SopOutputError("The AI response did not match the closing format.");
      return { type: "closing", reviewMechanism: paragraphs(parsed.data.reviewMechanism), approvalStatement: parsed.data.approvalStatement.trim() };
    }
    case "manual-field": {
      const parsed = manualFieldOutputSchema(request.field).safeParse(value);
      if (!parsed.success) throw new SopOutputError("The AI response did not match the field format.");
      if (request.field === "approvalStatement") {
        const statement = (parsed.data as { approvalStatement: string }).approvalStatement.trim().slice(0, MAX_STATEMENT_CHARS);
        if (!statement) throw new SopOutputError("The AI response was empty. Try again.");
        return { type: "manual-field", field: "approvalStatement", statement };
      }
      const blocks = paragraphs((parsed.data as Record<string, string[]>)[request.field].slice(0, MAX_FIELD_PARAGRAPHS));
      if (!blocks.length) throw new SopOutputError("The AI response was empty. Try again.");
      return { type: "manual-field", field: request.field, blocks };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Mock answers (no API key)                                           */
/* ------------------------------------------------------------------ */

function mockSites(manual: SopManual) {
  const sites = manual.frontMatter.sites.length ? manual.frontMatter.sites : (manual.company.sites ?? []);
  const names = sites.map((site) => site.location || site.address).filter(Boolean);
  return names.length ? names.join(", ") : "all sites";
}

function mockSection(manual: SopManual, sop: Sop, section: Pick<SopSection, "kind" | "title">): GeneratedSopSection {
  const company = manual.company.name || "the Company";
  const owner = sop.owner || getCatalogTopic(sop.catalogId)?.owner || "Department Head";
  const topic = sop.title.toLowerCase() || "this activity";
  const title = section.title;
  switch (section.kind) {
    case "introduction":
      return { kind: "introduction", title, blocks: [{ type: "paragraph", text: `${topic.charAt(0).toUpperCase()}${topic.slice(1)} affects how ${company} operates at ${mockSites(manual)}, and how it meets the expectations of regulators, customers and its own people. A single controlled procedure keeps the practice consistent at every site and gives auditors clear evidence.` }] };
    case "purpose":
      return { kind: "purpose", title, blocks: [{ type: "paragraph", text: `To define how ${company} plans, carries out, checks and records ${topic}, so that the activity is controlled, consistent across sites and compliant with applicable requirements.` }] };
    case "scope":
      return { kind: "scope", title, blocks: [{ type: "paragraph", text: `This procedure applies to ${topic} at ${mockSites(manual)}, and to all employees, contract workers and service providers involved in it.` }] };
    case "definitions":
      return { kind: "definitions", title, rows: [
        { term: "SOP", definition: "Standard Operating Procedure: a controlled document describing how a recurring activity is carried out." },
        { term: "Process Owner", definition: `The role accountable for ${topic}: the ${owner}.` },
        { term: "Record", definition: "Evidence, in paper or electronic form, that a step of this procedure has been completed." },
      ] };
    case "responsibilities":
      return { kind: "responsibilities", title, rows: [
        { role: owner, responsibilities: ["Owns this procedure and keeps it current.", "Reviews monitoring results monthly and agrees corrective actions."] },
        { role: "Section Supervisor", responsibilities: ["Ensures the steps are followed on each shift.", "Reports deviations to the process owner the same day."] },
        { role: "All Employees", responsibilities: ["Follow this procedure and report concerns promptly."] },
      ] };
    case "procedure":
      return { kind: "procedure", title, steps: [
        { heading: "Plan the activity", body: [{ type: "paragraph", text: `Identify the requirements for ${topic} and confirm resources, permits and responsibilities before work starts.` }], responsible: owner },
        { heading: "Carry out the activity", body: [{ type: "paragraph", text: "Perform the work as planned, following site work instructions and safety controls." }], responsible: "Section Supervisor", substeps: [{ text: "Brief the team before the shift." }, { text: "Record each completed task in the log." }] },
        { heading: "Check and record", body: [{ type: "paragraph", text: "Verify the result against the acceptance criteria and complete the record." }], responsible: "Section Supervisor" },
        { heading: "Handle deviations", body: [
          { type: "paragraph", text: "Report any deviation to the process owner, contain it and raise a corrective action. Escalate it as follows." },
          { type: "table", text: "", columns: ["Severity", "Example", "Response time", "Escalate to"], rows: [
            ["Minor", "Record incomplete or late", "[within 24 hours]", "Section Supervisor"],
            ["Major", "Requirement of this SOP not met", "[same shift]", owner],
            ["Critical", "Legal limit or safety control breached", "Immediately", "[Plant Head]"],
          ] },
        ], responsible: owner },
      ] };
    case "monitoring":
      return { kind: "monitoring", title, kpis: [
        { indicator: "Activities completed as per this SOP", target: "100%", frequency: "Monthly", owner },
        { indicator: "Open corrective actions older than 30 days", target: "Zero", frequency: "Monthly", owner },
      ], narrative: [{ type: "paragraph", text: "Results are reviewed in the monthly management meeting." }] };
    case "training":
      return { kind: "training", title, blocks: [{ type: "paragraph", text: `Everyone involved in ${topic} is trained on this procedure at induction and at an annual refresher, and again after any revision. Attendance is recorded in the training register.` }] };
    case "records":
      return { kind: "records", title, rows: [
        { code: "", record: "Activity log", owner: "Section Supervisor", retention: "3 years", format: "Register (electronic)" },
        { code: "", record: "Corrective action register", owner, retention: "3 years", format: "Register (electronic)" },
      ] };
    case "references":
      return { kind: "references", title, items: [...companyFacts(manual).certifications.slice(0, 3), "ISO 14001:2015 Environmental management systems", "ISO 45001:2018 Occupational health and safety management systems"].filter((item, index, all) => all.indexOf(item) === index) };
    case "compliance":
      return { kind: "compliance", title, blocks: [
        { type: "paragraph", text: `${company} carries out ${topic} in line with the legislation, permits and consents that apply ${manual.company.country ? `in ${manual.company.country}` : "in its country of operation"}, the management-system standards it follows and the codes of conduct of its customers.` },
        { type: "bullets", text: [
          // The laws and regulators the company listed come first.
          ...companyFacts(manual).regulations.slice(0, 3).map((law) => `${law}: the requirements that apply to ${topic} are identified and met.`),
          `Applicable legal and other requirements are listed in the legal register, which the ${owner} reviews at least once a year.`,
          "Permits and consents ([permit or consent number]) are kept valid and their conditions are checked during monthly inspections.",
          "Statutory returns are filed on time and copies are kept with the records of this SOP.",
          "Internal and external audits verify compliance, and findings are tracked to closure.",
        ].join("\n") },
      ] };
    case "corrective":
      return { kind: "corrective", title, blocks: [
        { type: "paragraph", text: `Any deviation from this procedure is reported to the ${owner} and recorded in the corrective action register the same day.` },
        { type: "bullets", text: [
          "The cause is investigated using a root-cause method such as the five whys.",
          "Corrective and preventive actions are given an owner and a due date: 24 hours for critical findings, 7 days for major and 30 days for minor ones.",
          "Actions not closed on time are escalated to the site head.",
          "Wilful or repeated breaches are dealt with under the Company's disciplinary procedure in the HR policy.",
        ].join("\n") },
      ] };
    case "review":
      return { kind: "review", title, blocks: [{ type: "paragraph", text: `This SOP is reviewed ${manual.control.reviewFrequency ? manual.control.reviewFrequency.toLowerCase() : "annually"} by the ${owner}, and earlier after an incident, audit finding or change in legal requirements. Changes are approved by ${manual.control.approvedBy || "the approver of this manual"}.` }] };
    default:
      return { kind: section.kind === "appendix" ? "appendix" : "custom", title, blocks: [{ type: "paragraph", text: `Additional information on ${topic}.` }] } as GeneratedSopSection;
  }
}

function expandSection(section: GeneratedSopSection): GeneratedSopSection {
  if (section.kind === "procedure") {
    return { ...section, steps: [...section.steps, { heading: "Review the outcome", body: [{ type: "paragraph", text: "Review the completed records weekly and confirm that actions are closed on time." }] }] };
  }
  if ("blocks" in section) {
    return { ...section, blocks: [...section.blocks, { type: "paragraph", text: "Supervisors confirm this at the start of every shift and record any exceptions." }] };
  }
  return section;
}

type GeneratedBlock = { type: string; text: string; columns?: string[]; rows?: string[][] };

/** A block as the model writes it: every block carries columns and rows. */
const wireBlocks = (blocks: GeneratedBlock[]) => blocks.map((block) => ({ type: block.type, text: block.text, columns: block.columns ?? [], rows: block.rows ?? [] }));

/** Generated sections in the compact keyed shape the model writes. */
function toWire(sections: GeneratedSopSection[]): Record<string, unknown> {
  const wire: Record<string, unknown> = {};
  for (const section of sections) {
    switch (section.kind) {
      case "definitions":
      case "responsibilities":
      case "records":
        wire[section.kind] = section.rows;
        break;
      case "procedure":
        wire.procedure = section.steps.map((step) => ({
          heading: step.heading,
          responsible: step.responsible ?? "",
          body: wireBlocks(step.body),
          substeps: (step.substeps ?? []).map((substep) => ({ text: substep.text, responsible: substep.responsible ?? "" })),
        }));
        break;
      case "monitoring":
        wire.monitoring = { kpis: section.kpis, narrative: wireBlocks(section.narrative) };
        break;
      case "references":
        wire.references = section.items;
        break;
      default:
        wire[section.kind] = wireBlocks(section.blocks);
    }
  }
  return wire;
}

/** Canned front matter and closing text for the offline mock. */
function mockNarrative(manual: SopManual): Record<Exclude<ManualAiField, "approvalStatement">, string[]> & { approvalStatement: string } {
  const company = manual.company.name || "The Company";
  const profile = companyFacts(manual).profile.replace(/\s+/g, " ");
  return {
    introduction: [
      ...(profile ? [profile] : []),
      `${company} operates in ${manual.company.industryDetail || manual.company.subCategory || manual.company.industry || "its sector"} at ${mockSites(manual)}.`,
      "This manual brings together the standard operating procedures that govern its environmental, social and governance performance and its day-to-day operations.",
    ],
    objective: ["To establish consistent, documented and controlled procedures across every site, so that responsibilities are clear and performance can be measured and improved."],
    howToUse: [`Each SOP has a code, an owner and a revision number. Follow the current controlled copy of manual ${manual.control.docNo || "[manual number]"} and raise change requests with the process owner.`],
    reviewMechanism: [
      `This manual is reviewed ${manual.control.reviewFrequency ? manual.control.reviewFrequency.toLowerCase() : "annually"}, and earlier after changes in law, significant incidents, audit findings or process changes. Process owners propose revisions, which are recorded in the revision history and communicated to all affected staff.`,
    ],
    approvalStatement: `This manual is approved by ${manual.control.approvedBy || "the undersigned"} and applies from its effective date.`,
  };
}

/** The first `count` sentences of a text. */
function firstSentences(text: string, count: number) {
  return text.split(/(?<=[.!?])\s+/).slice(0, count).join(" ");
}

/** The answer the model would give, in its generated (id-less) shape, without calling it. */
export function mockSopOutput(request: SopAiRequest): unknown {
  const manual = request.manual;
  switch (request.type) {
    case "sop": {
      const sop = manual.sops.find((candidate) => candidate.id === request.sopId)!;
      const topic = getCatalogTopic(sop.catalogId);
      return {
        sections: toWire(sectionsToWrite(sop).map((section) => mockSection(manual, sop, section))),
        department: sop.department || topic?.department || "",
        owner: sop.owner || topic?.owner || "",
      };
    }
    case "sop-section":
    case "refine": {
      const sop = manual.sops.find((candidate) => candidate.id === request.sopId)!;
      const section = targetSection(request);
      const written = mockSection(manual, sop, section);
      return { sections: toWire([request.type === "refine" && request.mode === "expand" ? expandSection(written) : written]) };
    }
    case "front-matter": {
      const narrative = mockNarrative(manual);
      return {
        introduction: narrative.introduction,
        objective: narrative.objective,
        benefits: ["Clear ownership of each process", "Consistent practice across sites", "Evidence for audits and customers", "Faster induction of new staff"],
        coreValues: [
          { title: "Safety first", description: "No task is so urgent that it cannot be done safely." },
          { title: "Integrity", description: "Records are complete, accurate and honest." },
          { title: "Continual improvement", description: "Every deviation is a chance to improve the procedure." },
        ],
        howToUse: narrative.howToUse,
      };
    }
    case "closing": {
      const narrative = mockNarrative(manual);
      return { reviewMechanism: narrative.reviewMechanism, approvalStatement: narrative.approvalStatement };
    }
    case "manual-field": {
      const narrative = mockNarrative(manual);
      // A shortened answer keeps the first sentences of what is there; otherwise the canned text.
      if (request.field === "approvalStatement") {
        return { approvalStatement: request.mode === "shorten" ? firstSentences(manualFieldText(manual, request.field), 1) : narrative.approvalStatement };
      }
      const paragraphs = request.mode === "shorten" ? manualFieldText(manual, request.field).split("\n\n").map((text) => firstSentences(text, 2)) : narrative[request.field];
      return { [request.field]: paragraphs };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Running a request                                                   */
/* ------------------------------------------------------------------ */

export type SopGenerationRun = {
  result: SopAiResult;
  source: "claude" | "mock";
  prompt?: Pick<SopPrompt, "estimatedTokens" | "maxTokens">;
  usage?: Anthropic.Messages.Usage;
  /** Milliseconds from the start of the request to the first text delta. */
  firstDeltaMs?: number;
  totalMs: number;
};

export type SopGenerationOptions = {
  importedContext?: unknown;
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  /** Seed corpus folder; defaults to data/seed-sops. */
  seedDirectory?: string;
  /** Pause between mock deltas, for a model-like pace. 0 streams the mock at once. */
  mockDelayMs?: number;
};

const pause = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (ms <= 0 || signal?.aborted) return resolve();
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

/** Builds the Claude prompt for a request (references and imported text included). */
export function prepareSopPrompt(request: SopAiRequest, options: Pick<SopGenerationOptions, "importedContext" | "seedDirectory"> = {}): SopPrompt {
  return buildSopPrompt(request, collectSopPromptSources(request, options.importedContext, { directory: options.seedDirectory }));
}

/**
 * Runs one request. Streams the model's JSON through `onDelta` and resolves
 * with the mapped result. Throws ClaudeRefusalError, SopOutputError or an
 * API error; the caller turns those into an error event.
 */
export async function runSopGeneration(request: SopAiRequest, options: SopGenerationOptions = {}): Promise<SopGenerationRun> {
  const started = Date.now();
  let firstDeltaMs: number | undefined;
  const onDelta = (delta: string) => {
    firstDeltaMs ??= Date.now() - started;
    options.onDelta?.(delta);
  };

  if (!hasClaudeKey()) {
    const output = mockSopOutput(request);
    const delay = options.mockDelayMs ?? 0;
    const pieces = JSON.stringify(output).match(/\s*\S{1,12}/g) ?? [];
    await pause(delay ? 400 : 0, options.signal);
    for (const piece of pieces) {
      if (options.signal?.aborted) break;
      onDelta(piece);
      await pause(delay, options.signal);
    }
    return { result: finalizeSopOutput(request, output), source: "mock", firstDeltaMs, totalMs: Date.now() - started };
  }

  const prompt = prepareSopPrompt(request, options);
  const { text, stopReason, usage } = await streamClaudeText({
    system: prompt.system,
    cachedContext: prompt.cachedContext,
    reusableContext: prompt.reusableContext,
    user: prompt.user,
    maxTokens: prompt.maxTokens,
    effort: "low",
    format: zodOutputFormat(prompt.schema),
  }, onDelta, options.signal);
  if (stopReason === "max_tokens") throw new SopOutputError("The AI answer was cut off before it finished. Try again or shorten the instruction.");
  let value: unknown;
  try {
    value = JSON.parse(cleanJsonText(text));
  } catch {
    throw new SopOutputError("The AI response could not be read. Try again.");
  }
  return {
    result: finalizeSopOutput(request, value),
    source: "claude",
    prompt: { estimatedTokens: prompt.estimatedTokens, maxTokens: prompt.maxTokens },
    usage,
    firstDeltaMs,
    totalMs: Date.now() - started,
  };
}
