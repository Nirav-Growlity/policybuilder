import mammoth from "mammoth";
import type {
  ImportedPolicyContext,
  ImportedPolicySection,
  PolicyType,
  StandardSectionKind,
} from "../types";

type ParsedBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string; bold: boolean }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] };

type HtmlNode = { type: string; children: HtmlNode[]; text?: string };

const SECTION_TERMS: Record<StandardSectionKind, string[]> = {
  preface: ["preface", "preamble", "introduction", "background", "overview", "purpose", "context", "intent", "about this policy", "why this matters"],
  declaration: ["policy declaration", "policy statement", "statement of policy", "our commitment", "commitment", "pledge", "policy position", "guiding principle"],
  scope: ["scope", "applicability", "coverage", "application", "who this applies to", "where this applies", "persons covered"],
  definitions: ["definition", "definitions", "glossary", "terminology", "meaning of terms", "methodology"],
  focus: ["focus area", "key area", "priority area", "strategic priority", "material topic", "policy pillar", "core issue", "thematic area"],
  qualitative: ["qualitative", "objective", "commitment", "action framework", "our approach", "policy requirement", "guideline", "principles and commitments"],
  quantitative: ["quantitative", "measurable target", "performance target", "target and goal", "targets", "kpi", "metric"],
  sdg: ["sustainable development goal", "sdg", "global goals"],
  responsibilities: ["roles and responsibilities", "role and responsibility", "responsibility", "accountability", "governance", "policy owner", "ownership"],
  monitoring: ["monitoring and reporting", "monitoring", "reporting and transparency", "performance measurement", "assurance", "audit", "compliance tracking", "implementation and monitoring"],
  review: ["review mechanism", "continuous improvement", "policy review", "review and update", "review cycle", "periodic review"],
  revision: ["revision history", "version history", "change log", "document control", "amendment record", "revision record"],
};

const GENERIC_HEADING_WORDS = new Set(["policy", "section", "framework", "procedure", "standard", "our", "the", "and", "for", "of"]);

export async function parseDocxBuffer(
  buffer: Buffer,
  options: { fileName: string; policyType: PolicyType; importedAt?: string }
): Promise<ImportedPolicyContext> {
  const [rawResult, htmlResult] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Section Title'] => h2:fresh",
        ],
      }
    ),
  ]);

  return parseImportedPolicyHtml(htmlResult.value || "", {
    ...options,
    rawText: rawResult.value || "",
  });
}

export function parseImportedPolicyHtml(
  html: string,
  options: { fileName: string; policyType: PolicyType; rawText?: string; importedAt?: string }
): ImportedPolicyContext {
  const blocks = promoteImplicitHeadings(htmlToBlocks(html));
  const sections = buildSections(blocks);
  const extractedText = cleanText(options.rawText || blocks.map(blockToText).filter(Boolean).join("\n\n"));

  return {
    fileName: options.fileName,
    policyType: options.policyType,
    title: findDocumentTitle(blocks, options.fileName),
    text: extractedText,
    sections,
    importedAt: options.importedAt || new Date().toISOString(),
  };
}

function buildSections(blocks: ParsedBlock[]): ImportedPolicySection[] {
  const sections: ImportedPolicySection[] = [];
  let current: ImportedPolicySection | null = null;
  let introIndex = 0;

  const ensureIntro = () => {
    if (!current) {
      current = {
        id: `imported-introduction-${introIndex++}`,
        title: "Document introduction",
        level: 1,
        kind: "preface",
        blocks: [],
      };
      sections.push(current);
    }
    return current;
  };

  blocks.forEach((block, index) => {
    if (block.type === "heading") {
      current = {
        id: `imported-section-${index}`,
        title: block.text,
        level: block.level,
        kind: classifySectionHeading(block.text),
        blocks: [],
      };
      sections.push(current);
      return;
    }
    const target = ensureIntro();
    if (block.type === "paragraph") target.blocks.push({ type: "paragraph", text: block.text });
    if (block.type === "list") target.blocks.push({ type: "list", ordered: block.ordered, items: block.items });
    if (block.type === "table") target.blocks.push({ type: "table", rows: block.rows });
  });

  return sections.filter((section) => section.blocks.length > 0 || section.title !== "Document introduction");
}

export function classifySectionHeading(heading: string): StandardSectionKind | "custom" {
  const normalized = normalizeHeading(heading);
  let best: { kind: StandardSectionKind; score: number } | null = null;

  for (const [kind, terms] of Object.entries(SECTION_TERMS) as [StandardSectionKind, string[]][]) {
    for (const term of terms) {
      const score = headingMatchScore(normalized, term);
      if (score > 0 && (!best || score > best.score)) best = { kind, score };
    }
  }
  return best?.kind || "custom";
}

function headingMatchScore(heading: string, term: string): number {
  const normalizedTerm = normalizeHeading(term);
  if (heading === normalizedTerm) return 100 + normalizedTerm.length;
  if (heading.includes(normalizedTerm) && normalizedTerm.length >= 5) return 70 + normalizedTerm.length;

  const headingWords = meaningfulWords(heading);
  const termWords = meaningfulWords(normalizedTerm);
  if (!termWords.length) return 0;
  const overlap = termWords.filter((word) => headingWords.some((candidate) => wordStemMatches(word, candidate))).length;
  const ratio = overlap / termWords.length;
  return ratio >= 0.75 ? 40 + overlap : 0;
}

function meaningfulWords(value: string): string[] {
  return value.split(" ").filter((word) => word.length > 2 && !GENERIC_HEADING_WORDS.has(word));
}

function wordStemMatches(a: string, b: string): boolean {
  return a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));
}

function promoteImplicitHeadings(blocks: ParsedBlock[]): ParsedBlock[] {
  return blocks.map((block, index) => {
    if (block.type !== "paragraph" || !looksLikeHeading(block, blocks[index + 1])) return block;
    const numberDepth = block.text.match(/^\s*\d+(?:\.\d+){0,2}[.)]?\s+/)?.[0].split(".").length || 1;
    return { type: "heading", level: Math.min(3, numberDepth + (index === 0 ? 0 : 1)) as 1 | 2 | 3, text: block.text };
  });
}

function looksLikeHeading(block: Extract<ParsedBlock, { type: "paragraph" }>, next?: ParsedBlock): boolean {
  const text = block.text.trim();
  if (text.length < 3 || text.length > 140 || /[.!?;:]$/.test(text)) return false;
  if (/^\d+(?:\.\d+){0,3}[.)]?\s+\S+/.test(text)) return true;
  if (block.bold && text.split(/\s+/).length <= 14) return true;
  if (text === text.toUpperCase() && /[A-Z]/.test(text) && text.split(/\s+/).length <= 12) return true;
  return classifySectionHeading(text) !== "custom" && Boolean(next);
}

function findDocumentTitle(blocks: ParsedBlock[], fileName: string): string {
  const firstHeading = blocks.find((block) => block.type === "heading" && block.level === 1);
  if (firstHeading?.type === "heading") return stripHeadingNumber(firstHeading.text);
  const firstShortParagraph = blocks.find((block) => block.type === "paragraph" && block.text.length <= 140);
  if (firstShortParagraph?.type === "paragraph") return firstShortParagraph.text;
  return fileName.replace(/\.docx$/i, "").replace(/[-_]+/g, " ").trim();
}

function htmlToBlocks(html: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (const node of parseHtml(stripAnchors(html))) {
    if (/^h[1-6]$/.test(node.type)) {
      const text = inlineText(node.children).text;
      if (text) blocks.push({ type: "heading", level: Math.min(3, Number(node.type.slice(1))) as 1 | 2 | 3, text });
      continue;
    }
    if (node.type === "p") {
      const content = inlineText(node.children);
      if (content.text) blocks.push({ type: "paragraph", ...content });
      continue;
    }
    if (node.type === "ul" || node.type === "ol") {
      const items = descendants(node, "li").map((item) => inlineText(item.children).text).filter(Boolean);
      if (items.length) blocks.push({ type: "list", ordered: node.type === "ol", items });
      continue;
    }
    if (node.type === "table") {
      const rows = descendants(node, "tr").map((row) =>
        row.children.filter((cell) => cell.type === "td" || cell.type === "th").map((cell) => inlineText(cell.children).text)
      ).filter((row) => row.some(Boolean));
      if (rows.length) blocks.push({ type: "table", rows });
    }
  }
  return blocks;
}

function descendants(node: HtmlNode, type: string): HtmlNode[] {
  const found: HtmlNode[] = [];
  const visit = (candidate: HtmlNode) => {
    if (candidate.type === type) found.push(candidate);
    else candidate.children.forEach(visit);
  };
  node.children.forEach(visit);
  return found;
}

function stripAnchors(html: string): string {
  return html.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1").replace(/\u00a0/g, " ");
}

function parseHtml(html: string): HtmlNode[] {
  const root: HtmlNode = { type: "root", children: [] };
  const stack = [root];
  const token = /<\/?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;
  while ((match = token.exec(html))) {
    const [full, tag, attributes, text] = match;
    if (text) {
      const value = decodeEntities(text);
      if (value) stack.at(-1)!.children.push({ type: "text", children: [], text: value });
      continue;
    }
    const type = (tag || "").toLowerCase();
    if (full.startsWith("</")) {
      for (let index = stack.length - 1; index > 0; index--) {
        if (stack[index].type === type) { stack.length = index; break; }
      }
      continue;
    }
    if (["br", "hr", "img", "meta"].includes(type)) continue;
    const node: HtmlNode = { type, children: [] };
    stack.at(-1)!.children.push(node);
    if (!attributes?.trim().endsWith("/") && ["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "strong", "b", "em", "i", "span", "div"].includes(type)) stack.push(node);
  }
  return root.children;
}

function inlineText(nodes: HtmlNode[]): { text: string; bold: boolean } {
  const parts: string[] = [];
  let textCharacters = 0;
  let boldCharacters = 0;
  const visit = (node: HtmlNode, bold = false) => {
    const nextBold = bold || node.type === "strong" || node.type === "b";
    if (node.type === "text") {
      const value = node.text || "";
      parts.push(value);
      textCharacters += value.trim().length;
      if (nextBold) boldCharacters += value.trim().length;
      return;
    }
    if (node.type === "br") parts.push("\n");
    node.children.forEach((child) => visit(child, nextBold));
  };
  nodes.forEach((node) => visit(node));
  return {
    text: cleanText(parts.join(" ")),
    bold: textCharacters > 0 && boldCharacters / textCharacters >= 0.75,
  };
}

function blockToText(block: ParsedBlock): string {
  if (block.type === "heading" || block.type === "paragraph") return block.text;
  if (block.type === "list") return block.items.join("\n");
  return block.rows.map((row) => row.join(" | ")).join("\n");
}

function normalizeHeading(value: string): string {
  return stripHeadingNumber(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function stripHeadingNumber(value: string): string {
  return value.replace(/^\s*(?:section\s+)?\d+(?:\.\d+){0,3}[.):\-]?\s*/i, "").trim();
}

function cleanText(value: string): string {
  return decodeEntities(value).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
