import mammoth from "mammoth";
import type {
  ImportedPolicyContext,
  ImportedPolicySection,
  PolicyType,
} from "../types";
import { classifySectionHeading, normalizeHeading, stripHeadingNumber, strictSectionKind } from "./heading-kinds";

export { classifySectionHeading } from "./heading-kinds";

type ParsedBlock =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string; bold: boolean }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "image"; index: number; alt: string };

type HtmlNode = { type: string; children: HtmlNode[]; text?: string };

/** A picture found in the document, as mammoth read it. Bytes are kept only for sizes worth sending to a reader. */
export interface DocxImage {
  index: number;
  contentType: string;
  alt: string;
  size: number;
  data: Buffer | null;
}

/** Pictures larger than this are never kept: they are cover and brochure art, not goal tiles. */
const MAX_KEPT_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_SRC = "docx-image:";

export async function parseDocxBuffer(
  buffer: Buffer,
  options: { fileName: string; policyType: PolicyType; importedAt?: string }
): Promise<ImportedPolicyContext> {
  return (await parseDocxWithImages(buffer, options)).reference;
}

/**
 * The parse, plus the pictures of the document. `sdgImages` are the pictures
 * inside SDG sections only (never the logo or cover), at most four, which is
 * where goal tiles live when the goals are not written out.
 */
export async function parseDocxWithImages(
  buffer: Buffer,
  options: { fileName: string; policyType: PolicyType; importedAt?: string }
): Promise<{ reference: ImportedPolicyContext; images: DocxImage[]; sdgImages: DocxImage[] }> {
  const images: DocxImage[] = [];
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
        convertImage: mammoth.images.imgElement(async (image) => {
          const data = await image.readAsBuffer();
          const index = images.length;
          const alt = (image as { altText?: string }).altText || "";
          images.push({ index, contentType: image.contentType, alt, size: data.length, data: data.length <= MAX_KEPT_IMAGE_BYTES ? data : null });
          return { src: `${IMAGE_SRC}${index}`, alt } as { src: string };
        }),
      }
    ),
  ]);

  const { reference, imageIndexes } = parseImportedPolicyHtmlWithImages(htmlResult.value || "", {
    ...options,
    rawText: rawResult.value || "",
  });
  const sdgImages = reference.sections
    .filter((section) => section.kind === "sdg")
    .flatMap((section) => imageIndexes.get(section.id) ?? [])
    .map((index) => images[index])
    .filter((image): image is DocxImage => Boolean(image?.data) && image.size >= 500)
    .slice(0, 4);
  return { reference, images, sdgImages };
}

export function parseImportedPolicyHtml(
  html: string,
  options: { fileName: string; policyType: PolicyType; rawText?: string; importedAt?: string }
): ImportedPolicyContext {
  return parseImportedPolicyHtmlWithImages(html, options).reference;
}

/** The parse, plus which pictures (by index) sit inside each section. */
export function parseImportedPolicyHtmlWithImages(
  html: string,
  options: { fileName: string; policyType: PolicyType; rawText?: string; importedAt?: string }
): { reference: ImportedPolicyContext; imageIndexes: Map<string, number[]> } {
  const blocks = dropTableOfContents(promoteImplicitHeadings(htmlToBlocks(html)));
  const imageIndexes = new Map<string, number[]>();
  const sections = buildSections(blocks, imageIndexes);
  const extractedText = cleanText(options.rawText || blocks.map(blockToText).filter(Boolean).join("\n\n"));

  return {
    reference: {
      fileName: options.fileName,
      policyType: options.policyType,
      title: findDocumentTitle(blocks, options.fileName),
      text: extractedText,
      sections,
      importedAt: options.importedAt || new Date().toISOString(),
    },
    imageIndexes,
  };
}

function buildSections(blocks: ParsedBlock[], imageIndexes: Map<string, number[]>): ImportedPolicySection[] {
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
    if (block.type === "image") {
      imageIndexes.set(target.id, [...(imageIndexes.get(target.id) ?? []), block.index]);
      target.imageAlts = [...(target.imageAlts ?? []), block.alt];
      return;
    }
    if (block.type === "paragraph") target.blocks.push({ type: "paragraph", text: block.text });
    if (block.type === "list") target.blocks.push({ type: "list", ordered: block.ordered, items: block.items });
    if (block.type === "table") target.blocks.push({ type: "table", rows: block.rows });
  });

  return sections.filter((section) => section.blocks.length > 0 || section.title !== "Document introduction");
}

/**
 * "Alignment with SDGs:" or "Review Mechanism:" written as a plain line inside another
 * section: it names a policy section on its own, so it starts that section at the level
 * of the heading it sits under. Pictures after it (SDG tiles) then belong to it.
 */
function labelHeadingText(block: ParsedBlock): string | null {
  if (block.type !== "paragraph") return null;
  const text = block.text.trim();
  if (!/:$/.test(text) || text.split(/\s+/).length > 8) return null;
  const label = text.replace(/\s*:$/, "");
  return strictSectionKind(label) || classifySectionHeading(label) === "sdg" ? label : null;
}

function promoteImplicitHeadings(blocks: ParsedBlock[]): ParsedBlock[] {
  let lastLevel: 1 | 2 | 3 | null = null;
  return blocks.map((block, index) => {
    if (block.type === "heading") { lastLevel = block.level; return block; }
    const label = labelHeadingText(block);
    if (label && lastLevel) return { type: "heading", level: lastLevel, text: label };
    if (block.type !== "paragraph" || !looksLikeHeading(block, blocks[index + 1])) return block;
    const numberDepth = block.text.match(/^\s*\d+(?:\.\d+){0,2}[.)]?\s+/)?.[0].split(".").length || 1;
    lastLevel = Math.min(3, numberDepth + (index === 0 ? 0 : 1)) as 1 | 2 | 3;
    return { type: "heading", level: lastLevel, text: block.text };
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

const TOC_MARKER = /^(?:table of contents|contents?|index|list of contents)\s*:?$/i;
const TRAILING_PAGE_NUMBER = /[\s.…]+\d{1,3}\s*$/;

function isTocMarker(block: ParsedBlock): boolean {
  return (block.type === "heading" || block.type === "paragraph") && TOC_MARKER.test(block.text.trim());
}

function isTocEntry(block: ParsedBlock): boolean {
  if (block.type !== "heading" && block.type !== "paragraph") return false;
  const text = block.text.trim();
  return text.length <= 160 && TRAILING_PAGE_NUMBER.test(text) && /[A-Za-z]{3}/.test(text);
}

/**
 * A Word table of contents arrives as a "Contents" marker followed by headings
 * and paragraphs that end in page numbers. They would otherwise duplicate every
 * real section as an empty one, so the marker and its run of entries are dropped.
 * Entries without a marker are dropped only when the same heading appears again
 * later without the page number.
 */
function dropTableOfContents(blocks: ParsedBlock[]): ParsedBlock[] {
  const drop = new Set<number>();
  for (let index = 0; index < blocks.length; index++) {
    if (!isTocMarker(blocks[index])) continue;
    drop.add(index);
    for (let next = index + 1; next < blocks.length && isTocEntry(blocks[next]); next++) drop.add(next);
  }
  const headingKeys = blocks.map((block) => (block.type === "heading" ? normalizeHeading(block.text) : ""));
  blocks.forEach((block, index) => {
    if (drop.has(index) || block.type !== "heading" || !isTocEntry(block)) return;
    const key = normalizeHeading(block.text.replace(TRAILING_PAGE_NUMBER, ""));
    if (key && headingKeys.slice(index + 1).includes(key)) drop.add(index);
  });
  return blocks.filter((_, index) => !drop.has(index));
}

const TITLE_WORDS = /\b(?:polic(?:y|ies)|charter|manual|code|commitment|statement|framework|standard|handbook|roadmap|guidelines?)\b/i;

/**
 * Whether a heading can be the document title. A heading no section claims is a
 * title. One that fuzzy-matches a section but carries a title word ("Governance
 * Policy", "Human Rights Commitment") is a title too, unless it is exactly a
 * standard section name ("Preface", "Policy Declaration"), which means there is no
 * title page. A longer heading that says "policy" ("Environmental Policy Statement")
 * is a title even though it contains a section phrase.
 */
function isTitleHeading(text: string): boolean {
  if (classifySectionHeading(text) === "custom") return true;
  if (!TITLE_WORDS.test(text)) return false;
  if (!strictSectionKind(text)) return true;
  return /\bpolic(?:y|ies)\b/i.test(text) && normalizeHeading(text).split(" ").length >= 3;
}

function findDocumentTitle(blocks: ParsedBlock[], fileName: string): string {
  // Only the title page can hold a title: the first heading decides.
  const firstHeadingIndex = blocks.findIndex((block) => block.type === "heading");
  const firstHeading = firstHeadingIndex >= 0 ? blocks[firstHeadingIndex] : undefined;
  if (firstHeading?.type === "heading" && firstHeading.level === 1 && isTitleHeading(firstHeading.text)) return stripHeadingNumber(firstHeading.text);
  const titlePage = firstHeadingIndex >= 0 ? blocks.slice(0, firstHeadingIndex) : blocks;
  const firstShortParagraph = titlePage.find((block) => block.type === "paragraph" && block.text.length <= 140 && classifySectionHeading(block.text) === "custom");
  if (firstShortParagraph?.type === "paragraph") return firstShortParagraph.text;
  return fileName.replace(/\.docx$/i, "").replace(/[-_]+/g, " ").trim();
}

function htmlToBlocks(html: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  for (const node of parseHtml(stripAnchors(html))) {
    if (/^h[1-6]$/.test(node.type)) {
      const text = inlineText(node.children).text.replace(/\s*\n\s*/g, " ");
      if (text) blocks.push({ type: "heading", level: Math.min(3, Number(node.type.slice(1))) as 1 | 2 | 3, text });
      continue;
    }
    if (node.type === "p") {
      const content = inlineText(node.children);
      if (content.text) blocks.push({ type: "paragraph", ...content });
      for (const image of descendants(node, "img")) {
        const found = readImageAttributes(image.text || "");
        if (found) blocks.push({ type: "image", ...found });
      }
      continue;
    }
    if (node.type === "ul" || node.type === "ol") {
      blocks.push(...listToBlocks(node));
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

const isList = (node: HtmlNode) => node.type === "ul" || node.type === "ol";

/**
 * Flattens a possibly nested list into list blocks. An item that introduces a
 * sublist ("Water" over its objectives) becomes a one-item list followed by the
 * sublist's block, so a flat reader sees the label directly above its items.
 * Wrapper items that only hold a sublist add nothing of their own.
 */
function listToBlocks(list: HtmlNode): Extract<ParsedBlock, { type: "list" }>[] {
  const ordered = list.type === "ol";
  const blocks: Extract<ParsedBlock, { type: "list" }>[] = [];
  let items: string[] = [];
  const flush = () => {
    if (items.length) blocks.push({ type: "list", ordered, items });
    items = [];
  };
  for (const item of list.children.filter((child) => child.type === "li")) {
    const own = inlineText(item.children.filter((child) => !isList(child))).text;
    const nested = item.children.filter(isList);
    if (!nested.length) {
      if (own) items.push(own);
      continue;
    }
    flush();
    if (own) blocks.push({ type: "list", ordered, items: [own] });
    for (const sublist of nested) blocks.push(...listToBlocks(sublist));
  }
  flush();
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
    // A line break keeps its place as a newline instead of vanishing.
    if (type === "br") { stack.at(-1)!.children.push({ type: "text", children: [], text: "\n" }); continue; }
    if (type === "img") {
      stack.at(-1)!.children.push({ type: "img", children: [], text: attributes });
      continue;
    }
    if (["hr", "meta"].includes(type)) continue;
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

/** The index and alt text of a picture that convertImage tagged `docx-image:N`. */
function readImageAttributes(attributes: string): { index: number; alt: string } | null {
  const src = new RegExp(`src="${IMAGE_SRC}(\\d+)"`).exec(attributes);
  if (!src) return null;
  const alt = /\balt="([^"]*)"/.exec(attributes)?.[1] ?? "";
  return { index: Number(src[1]), alt: decodeEntities(alt).trim() };
}

function blockToText(block: ParsedBlock): string {
  if (block.type === "image") return "";
  if (block.type === "heading" || block.type === "paragraph") return block.text;
  if (block.type === "list") return block.items.join("\n");
  return block.rows.map((row) => row.join(" | ")).join("\n");
}

function cleanText(value: string): string {
  return decodeEntities(value).replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
}
