import type { AIRequestType } from "./prompts";
import type { ImportedPolicyBlock, ImportedPolicyContext, ImportedPolicySection, StandardSectionKind } from "../types";

const MAX_IMPORTED_CONTEXT_CHARS = 36_000;

const REQUEST_KINDS: Partial<Record<AIRequestType, StandardSectionKind[]>> = {
  preface: ["preface"],
  declaration: ["declaration", "preface"],
  scope: ["scope"],
  focus: ["focus", "qualitative", "quantitative"],
  qualitative: ["qualitative", "focus"],
  quantitative: ["quantitative", "focus"],
  "quantitative-topic": ["quantitative", "focus"],
  "quantitative-refine": ["quantitative", "focus"],
  sdg: ["sdg", "focus", "qualitative", "quantitative"],
  responsibilities: ["responsibilities"],
  monitoring: ["monitoring", "responsibilities"],
  review: ["review", "revision", "monitoring"],
};

export function buildImportedPolicyContext(
  reference: ImportedPolicyContext | null | undefined,
  requestType: AIRequestType
): string {
  if (!reference) return "";

  const preferredKinds = new Set<StandardSectionKind | "custom">(REQUEST_KINDS[requestType] || []);
  const relevant = reference.sections.filter((section) => preferredKinds.has(section.kind));
  const remaining = reference.sections.filter((section) => !preferredKinds.has(section.kind));
  const ordered = relevant.length ? [...relevant, ...remaining] : reference.sections;
  const outline = reference.sections.map((section) => `${"  ".repeat(section.level - 1)}- ${section.title} [${section.kind}]`).join("\n");

  const header = [
    "PRIMARY IMPORTED POLICY CONTEXT",
    `File: ${reference.fileName}`,
    `Document title: ${reference.title}`,
    "This user-imported policy is the main reference. Preserve its intent, terminology, level of detail, and section relationships. Its headings may differ from PolicyCraft labels; bracketed labels are semantic matches, not replacements for the source headings.",
    `Document section outline:\n${outline}`,
    "Relevant source content:",
  ].join("\n");

  let output = header;
  for (const section of ordered) {
    const rendered = renderSection(section);
    if (!rendered) continue;
    if (output.length + rendered.length + 2 > MAX_IMPORTED_CONTEXT_CHARS) break;
    output += `\n\n${rendered}`;
  }

  if (output === header && reference.text) {
    output += `\n\n${reference.text.slice(0, MAX_IMPORTED_CONTEXT_CHARS - header.length - 2)}`;
  }
  return output;
}

function renderSection(section: ImportedPolicySection): string {
  const content = section.blocks.map(renderBlock).filter(Boolean).join("\n");
  return content ? `${"#".repeat(section.level)} ${section.title} [${section.kind}]\n${content}` : "";
}

function renderBlock(block: ImportedPolicyBlock): string {
  if (block.type === "paragraph") return block.text;
  if (block.type === "list") return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${item}`).join("\n");
  return block.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
}
