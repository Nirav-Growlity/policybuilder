import type { AIContext, AIEdit, AIRequestType, AIResponse } from "./prompts";

/** Request types whose existing text the AI edit menu can change. */
export const EDITABLE_TEXT_TYPES = ["preface", "declaration", "scope", "monitoring", "review"] as const satisfies readonly AIRequestType[];
export type EditableTextType = (typeof EDITABLE_TEXT_TYPES)[number];

const TEXT_SECTION_NAMES: Record<EditableTextType, string> = {
  preface: "Preface",
  declaration: "Policy declaration",
  scope: "Scope",
  monitoring: "Monitoring, reporting and transparency",
  review: "Review mechanism and continuous improvement",
};

export function isEditableTextType(type: AIRequestType): type is EditableTextType {
  return (EDITABLE_TEXT_TYPES as readonly string[]).includes(type);
}

export function textSectionName(type: EditableTextType) {
  return TEXT_SECTION_NAMES[type];
}

/** The text an edit works on: a section's text, one objective, or one target's sentence. */
export function editSourceText(existing: unknown): string {
  if (typeof existing === "string") return existing.trim();
  if (existing && typeof existing === "object" && typeof (existing as { target?: unknown }).target === "string") {
    return (existing as { target: string }).target.trim();
  }
  return "";
}

const EDIT_ACTIONS = ["improve", "shorten", "grammar", "rewrite", "custom"] as const satisfies readonly AIEdit["action"][];

/** Validates an edit from a request body. Instructions are capped so one field cannot flood the prompt. */
export function parseEdit(value: unknown): AIEdit | null {
  if (!value || typeof value !== "object") return null;
  const { action, instruction } = value as { action?: unknown; instruction?: unknown };
  if (!(EDIT_ACTIONS as readonly unknown[]).includes(action)) return null;
  if (instruction !== undefined && typeof instruction !== "string") return null;
  const trimmed = instruction?.trim().slice(0, 1_000);
  return { action: action as AIEdit["action"], ...(trimmed ? { instruction: trimmed } : {}) };
}

/** The toast verb once an edit lands: "Preface improved." */
export const EDIT_DONE: Record<AIEdit["action"], string> = { improve: "improved", shorten: "shortened", grammar: "checked", rewrite: "rewritten", custom: "updated" };

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** A hard word limit for shortening; "about half" alone barely shortens long text. */
export function shortenLimit(text: string) {
  return Math.max(8, Math.round(words(text) * 0.6));
}

/** What the model is asked to do to the current text. */
export function editDirective(edit: AIEdit, current: string): string {
  const instruction = edit.instruction?.trim();
  switch (edit.action) {
    case "improve":
      return "Improve clarity, completeness and professional tone. Keep every fact, role, number and commitment; do not invent new obligations. Keep roughly the same length.";
    case "shorten":
      return `Shorten this text: merge sentences that overlap and drop explanation. Keep the commitments, roles and figures. The current text is ${words(current)} words. Your answer must be ${shortenLimit(current)} words or fewer. This limit overrides the length guidance and the reference policies.`;
    case "grammar":
      return "Correct grammar, spelling and punctuation only. Keep the wording, meaning, structure and length as they are.";
    case "rewrite":
      return `The current text is being replaced: write a fresh draft with new wording and structure. Keep the facts, names and figures, but do not copy its sentences.${instruction ? ` Also follow this direction: "${instruction}".` : ""}`;
    case "custom":
      return `Revise the current text as the user instructs: "${instruction || "Improve clarity and professional tone."}". Keep its facts, names and figures unless the instruction says otherwise.`;
  }
}

/** The shared middle of every edit prompt: the current text, then the edit. */
export function editPromptBody(edit: AIEdit, label: string, current: string) {
  return `CURRENT ${label.toUpperCase()}:\n"""\n${current}\n"""\n\nEDIT: ${editDirective(edit, current)}\nReturn only the edited ${label}. Do not add new points beside it.`;
}

/** Keeps whole sentences until the word limit; always keeps the first one. */
function shortenLocally(text: string) {
  const limit = shortenLimit(text);
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g) ?? [text];
  let kept = "";
  for (const sentence of sentences) {
    if (kept && words(kept + sentence) > limit) break;
    kept += sentence;
  }
  return kept.trim();
}

/**
 * The offline answer to an edit, used without an API key. A rewrite falls back
 * to the normal mock text for that section, passed in as `fresh`.
 */
export function mockEdit(ctx: AIContext & { edit: AIEdit }, fresh: () => AIResponse): AIResponse {
  const current = editSourceText(ctx.existingContent);
  if (ctx.edit.action === "rewrite" && isEditableTextType(ctx.type)) return fresh();
  const text = ctx.edit.action === "shorten" ? shortenLocally(current) : current;
  if (ctx.type === "qualitative") return { source: "mock", objectives: [text] };
  if (ctx.type === "quantitative-refine" && ctx.existingContent && typeof ctx.existingContent === "object") {
    return { source: "mock", targets: [{ ...(ctx.existingContent as NonNullable<AIResponse["targets"]>[number]), target: text }] };
  }
  return { source: "mock", text };
}
