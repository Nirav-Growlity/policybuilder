/**
 * Word export for SOP manuals. Walks the same render model as the Typst
 * template (lib/typst/sop/manual.typ) and rebuilds every component from
 * Word primitives: tables, cell shading, borders, exact line spacing, tab
 * stops, header/footer tables with PAGE/NUMPAGES fields and anchored images.
 *
 * Layout is reproduced, not approximated. Typst draws each line in a 1em box
 * (baseline at 0.8em) and puts the leading between boxes; Word "exact" line
 * spacing gives each line the full pitch with the baseline at 0.8 x pitch.
 * The flow resolver below knows both models and Typst's spacing rules
 * (paragraph spacing between paragraphs, block above/below elsewhere, weak
 * spacing collapsing to the largest, strong v() adding), so each Word gap is
 * the Typst gap minus the extra room Word gives its lines. Word also adds
 * border thickness to rows and paragraphs where Typst centres strokes on the
 * edge, so cell margins absorb the borders.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeightRule,
  HorizontalPositionRelativeFrom,
  ImageRun,
  ImportedXmlComponent,
  InternalHyperlink,
  LeaderType,
  LevelFormat,
  LineRuleType,
  Packer,
  PageNumber,
  Paragraph,
  type ParagraphChild,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFRef, PDFString } from "pdf-lib";
import type { ManualAsset } from "../typst/compile";
import type { RenderBlock, RenderCell, RenderChapter, RenderSection, RenderSop, RenderStep, SopRenderModel } from "../sop/render-types";
import { embedDocumentFontStyles, embeddedDocumentFonts } from "./document-fonts";

// ---------------------------------------------------------------- units

const MM = 72 / 25.4;
/** Points to twentieths of a point. */
const tw = (pt: number) => Math.max(0, Math.round(pt * 20));
const hex = (color: string) => color.replace("#", "").toUpperCase();
/** Word lays images out at 96 px per inch. */
const px = (pt: number) => Math.max(1, Math.round((pt * 96) / 72));
/** Smallest exact line Word keeps: one twip. */
const HAIR = 0.05;

/** Typst `color.lighten(f)`: move each sRGB channel toward white. */
function lighten(color: string, factor: number) {
  const channels = hex(color).match(/../g)!.map((pair) => Number.parseInt(pair, 16));
  return channels.map((channel) => Math.round(channel + (255 - channel) * factor).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// ---------------------------------------------------------------- font metrics

/** Advance widths straight from the TTF (cmap + hmtx), enough to measure labels and estimate wraps. */
type FontMetrics = { unitsPerEm: number; advance: (codePoint: number) => number };
const metricsCache = new Map<string, FontMetrics | null>();

function readMetrics(file: string): FontMetrics | null {
  let data: Buffer;
  try {
    data = readFileSync(file);
  } catch {
    return null;
  }
  const tables = new Map<string, number>();
  for (let index = 0; index < data.readUInt16BE(4); index++) {
    const entry = 12 + index * 16;
    tables.set(data.toString("latin1", entry, entry + 4), data.readUInt32BE(entry + 8));
  }
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const hmtx = tables.get("hmtx");
  const cmap = tables.get("cmap");
  if (head === undefined || hhea === undefined || hmtx === undefined || cmap === undefined) return null;
  const unitsPerEm = data.readUInt16BE(head + 18);
  const metricCount = data.readUInt16BE(hhea + 34);
  const advanceOf = (glyph: number) => data.readUInt16BE(hmtx + Math.min(glyph, metricCount - 1) * 4);
  let lookup: ((codePoint: number) => number) | null = null;
  for (let index = 0; index < data.readUInt16BE(cmap + 2) && !lookup; index++) {
    const record = cmap + 4 + index * 8;
    const platform = data.readUInt16BE(record);
    const encoding = data.readUInt16BE(record + 2);
    const table = cmap + data.readUInt32BE(record + 4);
    const format = data.readUInt16BE(table);
    if (format === 12 && (platform === 3 || platform === 0)) {
      const groups = data.readUInt32BE(table + 12);
      lookup = (codePoint) => {
        for (let group = 0; group < groups; group++) {
          const at = table + 16 + group * 12;
          const start = data.readUInt32BE(at);
          if (codePoint >= start && codePoint <= data.readUInt32BE(at + 4)) return data.readUInt32BE(at + 8) + codePoint - start;
        }
        return 0;
      };
    } else if (format === 4 && ((platform === 3 && encoding === 1) || platform === 0)) {
      const segments = data.readUInt16BE(table + 6) / 2;
      const ends = table + 14;
      const starts = ends + segments * 2 + 2;
      const deltas = starts + segments * 2;
      const ranges = deltas + segments * 2;
      lookup = (codePoint) => {
        for (let segment = 0; segment < segments; segment++) {
          if (codePoint > data.readUInt16BE(ends + segment * 2)) continue;
          const start = data.readUInt16BE(starts + segment * 2);
          if (codePoint < start) return 0;
          const delta = data.readInt16BE(deltas + segment * 2);
          const range = data.readUInt16BE(ranges + segment * 2);
          if (range === 0) return (codePoint + delta) & 0xffff;
          const glyph = data.readUInt16BE(ranges + segment * 2 + range + (codePoint - start) * 2);
          return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
        }
        return 0;
      };
    }
  }
  if (!lookup) return null;
  const find = lookup;
  return { unitsPerEm, advance: (codePoint) => advanceOf(find(codePoint)) };
}

function fontMetrics(family: string, bold: boolean): FontMetrics | null {
  const key = `${family}|${bold}`;
  if (!metricsCache.has(key)) {
    const slug = family.toLowerCase().replaceAll(" ", "-");
    metricsCache.set(key, readMetrics(path.join(process.cwd(), "public", "fonts", "word", `${slug}-${bold ? "bold" : "regular"}.ttf`)));
  }
  return metricsCache.get(key)!;
}

function textWidth(text: string, family: string, size: number, bold = false, tracking = 0) {
  const metrics = fontMetrics(family, bold);
  let units = 0;
  let count = 0;
  for (const char of text) {
    units += metrics ? metrics.advance(char.codePointAt(0)!) : 500;
    count++;
  }
  return (units / (metrics?.unitsPerEm ?? 1000)) * size + tracking * count;
}

// ---------------------------------------------------------------- context

type Pages = { anchors: Record<string, number>; total: number };
type LoadedImage = { data: Buffer; width: number; height: number };

type Ctx = {
  m: SopRenderModel;
  d: SopRenderModel["design"];
  pal: SopRenderModel["design"]["palette"];
  sz: SopRenderModel["design"]["sizes"];
  heading: string;
  body: string;
  /** Space after a paragraph (Typst `after`), also the block spacing. */
  after: number;
  /** Absolute leading of the body text (pitch minus size). */
  lead: number;
  pageW: number;
  pageH: number;
  /** Text column width. */
  W: number;
  images: Map<string, LoadedImage>;
  pages?: Pages;
  listInstance: number;
  numbering: Map<string, { ordered: boolean; left: number; hanging: number }>;
};

/** Word stores exact line heights in twips; Typst rounds its pitch the same way. */
const pitchOf = (ctx: Ctx, size: number) => Math.round(size * ctx.d.leading * 20) / 20;
const leadOf = (ctx: Ctx, size: number) => pitchOf(ctx, size) - size;
/** Word font sizes are whole half points; Typst rounds derived sizes the same way. */
const half = (size: number) => Math.round(size * 2) / 2;
/**
 * Word puts a body line's box 0.8 x leading above Typst's 1em box. Section
 * top margins sit that much higher, so text at the top of a page lands on
 * Typst's baseline; tables carry the same room in their first row.
 */
const topShift = (ctx: Ctx) => 0.8 * ctx.lead;
/** Word rounds line positions by up to about half a point; a line Typst just fits must still fit. */
const BOTTOM_SLACK = 0;
const RULE = 0.6;
const CELL_X = 5;
const CELL_Y = 3.5;

// ---------------------------------------------------------------- runs

type RunStyle = {
  size?: number;
  bold?: boolean;
  color?: string;
  font?: "heading" | "body";
  tracking?: number;
  upper?: boolean;
  /** Baseline shift in points (Word w:position). */
  raise?: number;
};

type RunSpec =
  | ({ text: string } & RunStyle)
  | ({ field: "PAGE" | "NUMPAGES" } & RunStyle)
  | ({ pageRef: string } & RunStyle)
  | ({ tab: true } & RunStyle)
  | { link: string; runs: RunSpec[] }
  | { image: LoadedImage; heightPt: number };

const fontName = (ctx: Ctx, style: RunStyle) => (style.font === "heading" ? ctx.heading : ctx.body);
const runSize = (ctx: Ctx, style: RunStyle) => half(style.size ?? ctx.sz.body);

function runOptions(ctx: Ctx, style: RunStyle) {
  return {
    font: fontName(ctx, style),
    size: Math.round(runSize(ctx, style) * 2),
    bold: style.bold ?? false,
    color: hex(style.color ?? ctx.pal.ink),
    characterSpacing: style.tracking ? Math.round(style.tracking * 20) : undefined,
    kern: 2,
  };
}

function runPropertiesXml(ctx: Ctx, style: RunStyle) {
  const font = fontName(ctx, style);
  const size = Math.round(runSize(ctx, style) * 2);
  return `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/>${style.bold ? "<w:b/><w:bCs/>" : ""}<w:color w:val="${hex(style.color ?? ctx.pal.ink)}"/>${style.tracking ? `<w:spacing w:val="${Math.round(style.tracking * 20)}"/>` : ""}<w:kern w:val="2"/>${style.raise ? `<w:position w:val="${Math.round(style.raise * 2)}"/>` : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>`;
}

function importRun(xml: string): ParagraphChild {
  const imported = ImportedXmlComponent.fromXmlString(xml) as unknown as { root?: ParagraphChild[] };
  return imported.root![0];
}

/** A PAGEREF field whose cached result is the page Typst gave the anchor, so Word shows it before any field update. */
function pageRefRuns(ctx: Ctx, anchor: string, style: RunStyle): ParagraphChild[] {
  const rpr = runPropertiesXml(ctx, style);
  const cached = ctx.pages?.anchors[anchor];
  return [
    `<w:r>${rpr}<w:fldChar w:fldCharType="begin"/></w:r>`,
    `<w:r>${rpr}<w:instrText xml:space="preserve"> PAGEREF ${bookmarkName(anchor)} \\h </w:instrText></w:r>`,
    `<w:r>${rpr}<w:fldChar w:fldCharType="separate"/></w:r>`,
    `<w:r>${rpr}<w:t>${cached ?? ""}</w:t></w:r>`,
    `<w:r>${rpr}<w:fldChar w:fldCharType="end"/></w:r>`,
  ].map(importRun);
}

function buildRuns(ctx: Ctx, runs: RunSpec[]): ParagraphChild[] {
  return runs.flatMap((spec): ParagraphChild[] => {
    if ("image" in spec) {
      const height = spec.heightPt;
      const width = (spec.image.width / spec.image.height) * height;
      return [new ImageRun({ type: "png", data: spec.image.data, transformation: { width: px(width), height: px(height) } })];
    }
    if ("field" in spec) {
      return [new TextRun({ ...runOptions(ctx, spec), children: [spec.field === "PAGE" ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES] })];
    }
    if ("link" in spec) return [new InternalHyperlink({ anchor: bookmarkName(spec.link), children: buildRuns(ctx, spec.runs) as TextRun[] })];
    if ("pageRef" in spec) return pageRefRuns(ctx, spec.pageRef, spec);
    if ("tab" in spec) return [new TextRun({ ...runOptions(ctx, spec), children: ["\t"] })];
    const text = spec.upper ? spec.text.toUpperCase() : spec.text;
    if (spec.raise) return [importRun(`<w:r>${runPropertiesXml(ctx, spec)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`)];
    return [new TextRun({ ...runOptions(ctx, spec), text })];
  });
}

function escapeXml(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Width of a run sequence on one line (tabs and fields count as nothing). */
function runsWidth(ctx: Ctx, runs: RunSpec[]): number {
  return runs.reduce((sum: number, spec) => {
    if ("link" in spec) return sum + runsWidth(ctx, spec.runs);
    if ("image" in spec) return sum + (spec.image.width / spec.image.height) * spec.heightPt;
    if (!("text" in spec)) return sum;
    const text = spec.upper ? spec.text.toUpperCase() : spec.text;
    return sum + textWidth(text, fontName(ctx, spec), runSize(ctx, spec), spec.bold, spec.tracking ?? 0);
  }, 0);
}

/** Greedy word wrap estimate, the same rule Typst ("simple") and Word use. */
function estimateLines(ctx: Ctx, runs: RunSpec[], width: number) {
  if (width <= 0) return 1;
  const words: number[] = [];
  let space = 0;
  for (const spec of runs.flatMap((item) => ("link" in item ? item.runs : [item]))) {
    if ("image" in spec) { words.push(runsWidth(ctx, [spec])); continue; }
    if (!("text" in spec)) continue;
    const text = spec.upper ? spec.text.toUpperCase() : spec.text;
    const family = fontName(ctx, spec);
    const size = runSize(ctx, spec);
    space = textWidth(" ", family, size, spec.bold);
    text.split(/ +/).forEach((word, index) => {
      const w = textWidth(word, family, size, spec.bold, spec.tracking ?? 0);
      if (index === 0 && words.length) words[words.length - 1] += w;
      else words.push(w);
    });
  }
  let lines = 1;
  let current = 0;
  for (const word of words) {
    if (current > 0 && current + space + word > width + 0.01) {
      lines++;
      current = word;
    } else current += (current > 0 ? space : 0) + word;
  }
  return lines;
}

// ---------------------------------------------------------------- flow items

type Align = "left" | "center" | "right" | "justify";
type Border = { color: string; size: number };

type Line = { runs: RunSpec[]; size: number; indentRight?: number };

type ParItem = {
  t: "par";
  lines: Line[];
  /** Typst leading in effect (absolute). */
  lead: number;
  /** Spacing to a neighbouring paragraph (Typst par.spacing). */
  parSpacing: number;
  /** Spacing toward non-paragraph blocks; paragraphs use the block spacing. */
  above: number;
  below: number;
  /** A block-level element that only looks like a paragraph (pad(), grid row): never par-to-par spacing. */
  blockLike?: boolean;
  align?: Align;
  indentLeft?: number;
  indentRight?: number;
  hanging?: number;
  tabs?: Array<{ type: "left" | "right" | "center"; pos: number; leader?: boolean }>;
  keepNext?: boolean;
  bookmark?: string;
  outline?: number;
  numbering?: { reference: string; instance?: number };
  /** Overrides for boxes that are not plain text lines (contents rows with a leader box). */
  box?: { lineHeight: number; padTop: number; padBottom: number; typstHeight: number };
};

type TableItem = {
  t: "table";
  build: () => Table;
  /** Word height minus Typst height at the top and bottom edge. */
  padTop: number;
  padBottom: number;
  above: number;
  below: number;
  /** Typst height (used for header/footer geometry and spacers). */
  height: number;
  bookmarkHost?: boolean;
};

type RuleItem = { t: "rule"; color: string; thickness: number; left?: number; right?: number; above: number; below: number; keepNext?: boolean };
type VItem = { t: "v"; pt: number };
/** A Typst block around items; `transparent` groups (lists) only bundle paragraphs. */
type GroupItem = { t: "group"; items: FlowItem[]; above: number; below: number; keep?: boolean; transparent?: boolean };
type FlowItem = ParItem | TableItem | RuleItem | VItem | GroupItem;

/** Largest text size on a line (the height of Typst's line box); images count separately. */
function lineSize(ctx: Ctx, runs: RunSpec[]): number {
  const sizes = runs.flatMap((spec): number[] => ("link" in spec ? [lineSize(ctx, spec.runs)] : "image" in spec || "tab" in spec ? [] : [runSize(ctx, spec)]));
  return sizes.length ? Math.max(...sizes) : ctx.sz.body;
}

function imageHeight(runs: RunSpec[]) {
  return Math.max(0, ...runs.map((spec) => ("image" in spec ? spec.heightPt : 0)));
}

/**
 * Word clips an inline picture that rises above 0.8 of an exact line, so a
 * line with a picture gets a taller line and the room goes below it.
 */
function imageBox(ctx: Ctx, runs: RunSpec[], lead: number): ParItem["box"] {
  const picture = imageHeight(runs);
  if (!picture) return undefined;
  const text = runs.some((spec) => "text" in spec) ? lineSize(ctx, runs) : 0;
  const typstHeight = picture + 0.2 * text;
  const lineHeight = Math.max(picture / 0.8, text + lead);
  return { lineHeight, padTop: 0.8 * lineHeight - picture, padBottom: 0.2 * lineHeight - 0.2 * text, typstHeight };
}

function par(ctx: Ctx, runs: RunSpec[], options: Partial<Omit<ParItem, "t" | "lines">> & { size?: number } = {}): ParItem {
  const size = options.size ?? lineSize(ctx, runs);
  const box = options.box ?? imageBox(ctx, runs, options.lead ?? ctx.lead);
  return {
    t: "par",
    lead: ctx.lead,
    parSpacing: ctx.lead + ctx.after,
    above: ctx.after,
    below: ctx.after,
    align: "left",
    ...options,
    box,
    lines: [{ runs, size }],
  };
}

/** One Typst paragraph made of explicit lines (linebreaks between differently sized text). */
function stack(ctx: Ctx, lines: Array<RunSpec[] | null>, options: Partial<Omit<ParItem, "t" | "lines">> = {}): ParItem {
  const kept = lines.filter((line): line is RunSpec[] => Boolean(line && line.length));
  const item = par(ctx, kept[0] ?? [], options);
  item.lines = kept.map((runs) => ({ runs, size: lineSize(ctx, runs) }));
  return item;
}

const v = (pt: number): VItem => ({ t: "v", pt });
const rule = (color: string, thickness: number, extra: Partial<RuleItem> = {}): RuleItem => ({ t: "rule", color, thickness, above: 0, below: 0, ...extra });

// ---------------------------------------------------------------- resolver

type Atom = ParItem | TableItem | RuleItem;
type Token = { kind: "atom"; atom: Atom; keep: boolean } | { kind: "v"; pt: number } | { kind: "open"; above: number } | { kind: "close"; below: number };

function flatten(items: FlowItem[], keep = false, out: Token[] = []): Token[] {
  for (const item of items) {
    if (item.t === "v") out.push({ kind: "v", pt: item.pt });
    else if (item.t === "group" && item.transparent) flatten(item.items, keep || Boolean(item.keep), out);
    else if (item.t === "group") {
      out.push({ kind: "open", above: item.above });
      flatten(item.items, keep || Boolean(item.keep), out);
      out.push({ kind: "close", below: item.below });
    } else out.push({ kind: "atom", atom: item, keep });
  }
  return out;
}

const isPar = (atom: Atom) => atom.t === "par" && !atom.blockLike;

function atomPadTop(atom: Atom) {
  if (atom.t === "par") return atom.box ? atom.box.padTop : 0.8 * atom.lead;
  if (atom.t === "rule") return HAIR + atom.thickness / 2;
  return atom.padTop;
}

function atomPadBottom(atom: Atom) {
  if (atom.t === "par") return atom.box ? atom.box.padBottom : 0.2 * atom.lead;
  if (atom.t === "rule") return atom.thickness / 2;
  return atom.padBottom;
}

type Placed = { atom: Atom; before: number; after: number; keep: boolean; spacerBefore?: number };
type Resolved = { children: Array<Paragraph | Table>; padTop: number; padBottom: number; height: number };

/**
 * Lays out a flow the way Typst does and returns Word children with the
 * equivalent spacing. `height` is the Word height of the result.
 */
function resolveFlow(ctx: Ctx, items: FlowItem[], width: number, extra: { top?: number; bottom?: number; cell?: boolean } = {}): Resolved {
  const tokens = flatten(items);
  const placed: Placed[] = [];
  let strong = 0;
  let opens: number[] = [];
  let closes: number[] = [];
  let previous: Placed | null = null;
  let startAbsorbed = 0;
  let endAbsorbed = 0;
  for (const token of tokens) {
    if (token.kind === "v") { strong += token.pt; continue; }
    if (token.kind === "open") { opens.push(token.above); continue; }
    if (token.kind === "close") { closes.push(token.below); continue; }
    const atom = token.atom;
    const current: Placed = { atom, before: 0, after: 0, keep: token.keep };
    if (previous) {
      const prevAtom = previous.atom;
      let weak: number;
      // Typst: paragraph spacing between two paragraphs; next to any other
      // block the block's own above/below wins; two blocks take the larger.
      const prevBlock = closes.length > 0 || !isPar(prevAtom);
      const nextBlock = opens.length > 0 || !isPar(atom);
      const below = closes.length ? closes[0] : prevAtom.below;
      const above = opens.length ? opens[opens.length - 1] : atom.above;
      // Between two paragraphs Typst uses the spacing in effect for the second
      // (a list's item spacing applies before its first item).
      if (!prevBlock && !nextBlock) weak = (atom as ParItem).parSpacing;
      else if (!prevBlock) weak = above;
      else if (!nextBlock) weak = below;
      else weak = Math.max(below, above);
      const gap = strong + weak - atomPadBottom(prevAtom) - atomPadTop(atom);
      const word = Math.max(0, gap);
      // Inside a table cell Word only breaks a row after a paragraph whose space
      // after still fits on the page; Typst drops that space at a break. A spacer
      // paragraph can sit at the page foot instead, so cells use one.
      if (extra.cell && prevAtom.t === "par" && atom.t === "par" && word > HAIR) current.spacerBefore = word;
      else if (prevAtom.t !== "table") previous.after = word;
      else if (atom.t !== "table") current.before = word;
      else current.spacerBefore = word;
    } else if (strong > 0) {
      // Weak spacing at the start of a container collapses; strong spacing stays
      // and absorbs the room Word adds above the first line.
      const gap = strong - atomPadTop(atom);
      if (atom.t !== "table") current.before = Math.max(0, gap);
      else if (gap > 0) current.spacerBefore = gap;
      startAbsorbed = Math.min(strong, atomPadTop(atom));
    }
    placed.push(current);
    previous = current;
    strong = 0;
    opens = [];
    closes = [];
  }
  if (previous && strong > 0) {
    // Trailing strong spacing (a box's inset moved into the flow) absorbs the room below the last line.
    endAbsorbed = Math.min(strong, atomPadBottom(previous.atom));
    if (previous.atom.t !== "table") previous.after += strong - endAbsorbed;
    else placed.push({ atom: rule("FFFFFF", 0), before: strong - HAIR, after: 0, keep: false });
  }

  // Extra room at the edges (a cell's share of its row margin), outside the Typst pads.
  if (placed.length && extra.top) {
    const first = placed[0];
    if (first.atom.t !== "table") first.before += extra.top;
    else first.spacerBefore = (first.spacerBefore ?? 0) + extra.top;
  }
  if (placed.length && extra.bottom) {
    const last = placed[placed.length - 1];
    if (last.atom.t !== "table") last.after += extra.bottom;
    else placed.push({ atom: rule("FFFFFF", 0), before: Math.max(0, extra.bottom - HAIR), after: 0, keep: false });
  }

  const children: Array<Paragraph | Table> = [];
  let height = 0;
  placed.forEach((entry, index) => {
    const keepNext = entry.keep && index < placed.length - 1;
    if (entry.spacerBefore !== undefined) {
      const h = Math.max(HAIR, entry.spacerBefore);
      children.push(spacer(h));
      height += h;
    }
    const atom = entry.atom;
    if (atom.t === "table") {
      children.push(atom.build());
      height += atom.height + atom.padTop + atom.padBottom;
      return;
    }
    if (atom.t === "rule") {
      children.push(new Paragraph({
        spacing: { before: tw(entry.before), after: tw(entry.after), line: 1, lineRule: LineRuleType.EXACT },
        indent: { left: tw(atom.left ?? 0), right: tw(atom.right ?? 0) },
        keepNext: keepNext || atom.keepNext,
        border: atom.thickness > 0 ? { bottom: { style: BorderStyle.SINGLE, size: Math.max(2, Math.round(atom.thickness * 8)), color: hex(atom.color), space: 0 } } : undefined,
        children: [new TextRun({ text: "", size: 2 })],
      }));
      height += entry.before + entry.after + HAIR + atom.thickness;
      return;
    }
    const lines = atom.lines.length ? atom.lines : [{ runs: [], size: 1 }];
    const textWidthAvailable = width - (atom.indentLeft ?? 0) - (atom.indentRight ?? 0);
    lines.forEach((line, lineIndex) => {
      const first = lineIndex === 0;
      const last = lineIndex === lines.length - 1;
      const lineHeight = atom.box ? atom.box.lineHeight : line.size + atom.lead;
      const runs = buildRuns(ctx, line.runs);
      const marks = first && atom.bookmark ? [atom.bookmark, ...(extraBookmarks.get(atom) ?? [])] : [];
      const children2: ParagraphChild[] = [...marks.map((name) => new Bookmark({ id: bookmarkName(name), children: [] })), ...runs];
      const indentRight = line.indentRight ?? atom.indentRight ?? 0;
      children.push(new Paragraph({
        spacing: { before: first ? tw(entry.before) : 0, after: last ? tw(entry.after) : 0, line: Math.max(1, tw(lineHeight)), lineRule: LineRuleType.EXACT },
        alignment: atom.align === "justify" ? AlignmentType.JUSTIFIED : atom.align === "center" ? AlignmentType.CENTER : atom.align === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT,
        indent: atom.indentLeft || indentRight || atom.hanging
          ? { left: tw(atom.indentLeft ?? 0), right: tw(indentRight), hanging: atom.hanging ? tw(atom.hanging) : undefined }
          : undefined,
        tabStops: atom.tabs?.map((tab) => ({
          type: tab.type === "right" ? TabStopType.RIGHT : tab.type === "center" ? TabStopType.CENTER : TabStopType.LEFT,
          position: tw(tab.pos),
          leader: tab.leader ? LeaderType.DOT : undefined,
        })),
        keepNext: keepNext || atom.keepNext || !last,
        widowControl: true,
        outlineLevel: first && atom.outline !== undefined ? atom.outline : undefined,
        numbering: atom.numbering ? { reference: atom.numbering.reference, level: 0, instance: atom.numbering.instance } : undefined,
        children: children2.length ? children2 : [new TextRun({ text: "", size: 2 })],
      }));
      height += (first ? entry.before : 0) + (last ? entry.after : 0) + lineHeight * estimateLines(ctx, line.runs, textWidthAvailable - indentRight + (atom.indentRight ?? 0));
    });
  });
  const firstAtom = placed[0]?.atom;
  const lastAtom = placed[placed.length - 1]?.atom;
  return {
    children,
    padTop: firstAtom && !placed[0].spacerBefore ? Math.max(0, atomPadTop(firstAtom) - startAbsorbed) : 0,
    padBottom: lastAtom ? Math.max(0, atomPadBottom(lastAtom) - endAbsorbed) : 0,
    height,
  };
}

function spacer(height: number) {
  return new Paragraph({ spacing: { before: 0, after: 0, line: Math.max(1, tw(height)), lineRule: LineRuleType.EXACT }, children: [new TextRun({ text: "", size: 2 })] });
}

// ---------------------------------------------------------------- tables

type Inset = { l: number; r: number; t: number; b: number };
const inset = (x: number, y: number): Inset => ({ l: x, r: x, t: y, b: y });

type CellSpec = {
  items: FlowItem[];
  fill?: string;
  inset?: Inset;
  vAlign?: "top" | "center" | "bottom";
  span?: number;
  rowSpan?: number;
  borders?: { top?: Border | null; bottom?: Border | null; left?: Border | null; right?: Border | null };
};

type RowSpec = { cells: CellSpec[]; header?: boolean; height?: number; exact?: boolean };

type TableSpec = {
  widths: number[];
  rows: RowSpec[];
  indent?: number;
  above?: number;
  below?: number;
  /** Skip the page-top alignment room (tables placed at a fixed spot). */
  noShift?: boolean;
};

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "auto" };

function wordBorder(border: Border | null | undefined) {
  if (!border || border.size <= 0) return NO_BORDER;
  return { style: BorderStyle.SINGLE, size: Math.max(2, Math.round(border.size * 8)), color: hex(border.color) };
}

/**
 * Builds a Word table that occupies the same height as the Typst table:
 * cell margins take off the room Word adds around exact lines and the
 * thickness of horizontal borders.
 */
function table(ctx: Ctx, spec: TableSpec): TableItem {
  const total = spec.widths.reduce((sum, w) => sum + w, 0);
  // Columns still covered by a row span from a row above.
  const covered = spec.widths.map(() => 0);
  const resolvedRows = spec.rows.map((row) => {
    let column = 0;
    const cells = row.cells.map((cell) => {
      while (column < covered.length && covered[column] > 0) column++;
      const span = cell.span ?? 1;
      if ((cell.rowSpan ?? 1) > 1) for (let index = column; index < column + span; index++) covered[index] = cell.rowSpan!;
      const width = spec.widths.slice(column, column + span).reduce((sum, w) => sum + w, 0);
      column += span;
      const exact = Boolean(row.exact);
      const given = cell.inset ?? inset(CELL_X, CELL_Y);
      // Word does not count a cell's bottom margin inside an exact row height,
      // so fixed-height rows carry their vertical insets as spacing instead.
      const ins = exact ? { ...given, t: 0, b: 0 } : given;
      const items = exact ? [v(given.t), ...cell.items, ...(given.b ? [v(given.b)] : [])] : cell.items;
      const flow = resolveFlow(ctx, items, width - ins.l - ins.r, { cell: true });
      return { cell, width, ins, flow, items };
    });
    for (let index = 0; index < covered.length; index++) if (covered[index] > 0) covered[index]--;
    return cells;
  });
  // Edge thickness between rows (Word stacks horizontal borders into the row height).
  const edge = (rowIndex: number) => {
    const above = rowIndex > 0 ? resolvedRows[rowIndex - 1] : [];
    const below = rowIndex < resolvedRows.length ? resolvedRows[rowIndex] : [];
    const sizes = [...above.map((entry) => entry.cell.borders?.bottom?.size ?? 0), ...below.map((entry) => entry.cell.borders?.top?.size ?? 0)];
    return Math.max(0, ...sizes);
  };
  // Body text starts 0.8 x leading above its Typst box (see topShift); a table that
  // starts a page gets the same room inside its first row so both line up.
  const shift = spec.rows[0]?.height === undefined && !spec.noShift ? topShift(ctx) : 0;
  // Likewise a paragraph's box ends 0.2 x leading below Typst's; the last row matches it.
  const tail = spec.rows[spec.rows.length - 1]?.height === undefined && !spec.noShift ? 0.2 * ctx.lead : 0;
  let typstHeight = 0;
  const rows = resolvedRows.map((cells, rowIndex) => {
    const top = edge(rowIndex);
    const bottom = rowIndex === resolvedRows.length - 1 ? edge(rowIndex + 1) : 0;
    const spec2 = spec.rows[rowIndex];
    const rowTypst = spec2.height ?? Math.max(...cells.map((entry) => entry.ins.t + entry.ins.b + Math.max(0, entry.flow.height - entry.flow.padTop - entry.flow.padBottom)));
    typstHeight += rowTypst;
    // Word gives every cell of a row the row's largest top and bottom margin, so
    // the row takes the smallest wanted margin and each top-aligned cell gets the
    // rest as spacing around its content.
    const wanted = cells.map(({ ins, flow }) => ({
      top: Math.max(0, ins.t - flow.padTop - (spec2.height !== undefined ? 0 : top) + (rowIndex === 0 ? shift : 0)),
      bottom: Math.max(0, ins.b - flow.padBottom - (spec2.height !== undefined ? 0 : bottom) + (rowIndex === resolvedRows.length - 1 ? tail : 0)),
    }));
    const rowMarginTop = Math.min(...wanted.map((margin) => margin.top));
    const rowMarginBottom = Math.min(...wanted.map((margin) => margin.bottom));
    return new TableRow({
      tableHeader: spec2.header || undefined,
      height: spec2.height !== undefined ? { value: tw(spec2.height - (spec2.exact ? 0 : 0)), rule: spec2.exact ? HeightRule.EXACT : HeightRule.ATLEAST } : undefined,
      children: cells.map(({ cell, width, ins, flow, items }, cellIndex) => {
        const extraTop = (cell.vAlign ?? "top") === "top" ? wanted[cellIndex].top - rowMarginTop : 0;
        const extraBottom = (cell.vAlign ?? "top") === "top" ? wanted[cellIndex].bottom - rowMarginBottom : 0;
        if (extraTop > 0.02 || extraBottom > 0.02) flow = resolveFlow(ctx, items, width - ins.l - ins.r, { top: extraTop, bottom: extraBottom, cell: true });
        const borders = cell.borders ?? {};
        return new TableCell({
          width: { size: tw(width), type: WidthType.DXA },
          columnSpan: cell.span && cell.span > 1 ? cell.span : undefined,
          rowSpan: cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined,
          shading: cell.fill ? { type: ShadingType.CLEAR, fill: hex(cell.fill), color: "auto" } : undefined,
          verticalAlign: cell.vAlign === "center" ? VerticalAlign.CENTER : cell.vAlign === "bottom" ? VerticalAlign.BOTTOM : VerticalAlign.TOP,
          margins: { top: tw(rowMarginTop), bottom: tw(rowMarginBottom), left: tw(ins.l), right: tw(ins.r) },
          borders: { top: wordBorder(borders.top), bottom: wordBorder(borders.bottom), left: wordBorder(borders.left), right: wordBorder(borders.right) },
          children: flow.children.length ? flow.children : [spacer(HAIR)],
        });
      }),
    });
  });
  return {
    t: "table",
    build: () => new Table({
      rows,
      width: { size: tw(total), type: WidthType.DXA },
      columnWidths: spec.widths.map(tw),
      layout: TableLayoutType.FIXED,
      indent: spec.indent ? { size: tw(spec.indent), type: WidthType.DXA } : undefined,
      borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER },
    }),
    padTop: shift,
    padBottom: tail,
    above: spec.above ?? ctx.after,
    below: spec.below ?? ctx.after,
    height: typstHeight,
  };
}

/** A one-cell shaded or ruled box (Typst `table(columns: (1fr,), ...)`). */
function box(ctx: Ctx, width: number, items: FlowItem[], options: { fill?: string; inset?: Inset; borders?: CellSpec["borders"]; above?: number; below?: number; indent?: number } = {}): TableItem {
  return table(ctx, { widths: [width], indent: options.indent, above: options.above, below: options.below, rows: [{ cells: [{ items, fill: options.fill, inset: options.inset, borders: options.borders }] }] });
}

// ---------------------------------------------------------------- text components

/** Typst's smart quotes: the PDF shows typographic quotes and apostrophes, so Word gets the same characters. */
export function smartQuotes(text: string) {
  return text
    .replace(/(^|[\s([{\u2014\u2013-])"/g, "$1\u201C")
    .replace(/"/g, "\u201D")
    .replace(/(^|[\s([{\u2014\u2013-])'/g, "$1\u2018")
    .replace(/'/g, "\u2019");
}

function txt(ctx: Ctx, text: string, style: RunStyle = {}): RunSpec {
  return { text: smartQuotes(text), ...style };
}

function caps(ctx: Ctx, text: string, options: { size?: number; color?: string; bold?: boolean } = {}): RunSpec {
  return { text, upper: true, size: options.size ?? ctx.sz.small, color: options.color ?? ctx.pal.muted, bold: options.bold ?? true, tracking: 0.6 };
}

/** Typst `tight(size, …)`: leading and paragraph spacing of a smaller text size. */
function tightOptions(ctx: Ctx, size: number): Partial<ParItem> {
  return { lead: leadOf(ctx, size), parSpacing: leadOf(ctx, size) + ctx.after * 0.5 };
}

function logoOrName(ctx: Ctx, height: number, options: { size?: number } = {}): RunSpec {
  const logo = ctx.m.company.logo ? ctx.images.get(ctx.m.company.logo) : undefined;
  if (logo) return { image: logo, heightPt: height };
  return txt(ctx, ctx.m.company.name, { bold: true, color: ctx.pal.primary, font: "heading", size: options.size ?? ctx.sz.h3 });
}

// ---------------------------------------------------------------- blocks

function bulletMarker(ctx: Ctx) {
  return textWidth("•", ctx.body, ctx.sz.body);
}

function listItems(ctx: Ctx, items: string[], options: { ordered?: boolean; cell?: boolean; width: number }): GroupItem {
  const cell = options.cell ?? false;
  const spacing = cell ? ctx.lead + 2 : ctx.lead + ctx.after * 0.5;
  const indent = cell ? 0 : 4;
  const bodyIndent = cell ? 5 : 6;
  const marker = options.ordered
    ? Math.max(...items.map((_, index) => textWidth(`${index + 1}.`, ctx.body, ctx.sz.body)))
    : bulletMarker(ctx);
  const reference = `${options.ordered ? "sop-ol" : "sop-ul"}-${indent}-${bodyIndent}-${Math.round(marker * 100)}`;
  ctx.numbering.set(reference, { ordered: Boolean(options.ordered), left: indent + marker + bodyIndent, hanging: marker + bodyIndent });
  const instance = options.ordered ? ++ctx.listInstance : undefined;
  return {
    t: "group",
    transparent: true,
    above: spacing,
    below: ctx.after,
    items: items.map((item) => par(ctx, [txt(ctx, item)], { parSpacing: spacing, numbering: { reference, instance }, indentLeft: indent + marker + bodyIndent, hanging: marker + bodyIndent, ...(cell ? { lead: ctx.lead } : {}) })),
  };
}


function renderBlocks(ctx: Ctx, blocks: RenderBlock[], width: number): FlowItem[] {
  return blocks.map((block): FlowItem => {
    if (block.type === "p") return par(ctx, [txt(ctx, block.text)], { align: "justify" });
    if (block.type === "ul") return listItems(ctx, block.items, { width });
    if (block.type === "ol") return listItems(ctx, block.items, { ordered: true, width });
    return dataTable(ctx, block.columns, block.widths, block.rows, width);
  });
}

function headerCell(ctx: Ctx, text: string): CellSpec {
  const size = ctx.sz.small + 0.5;
  const header = ctx.d.table.header;
  return {
    fill: header === "primary-fill" ? ctx.pal.primary : header === "soft-fill" ? ctx.pal.soft : undefined,
    items: [par(ctx, [txt(ctx, text, { bold: true, size, color: header === "primary-fill" ? ctx.pal.onPrimary : header === "soft-fill" ? ctx.pal.primaryDark : ctx.pal.ink })])],
  };
}

/** Typst `table-stroke(rows)`: grid lines, or horizontal rules with a header rule. */
function strokeFor(ctx: Ctx, rowIndex: number, rowCount: number): CellSpec["borders"] {
  const line = { color: ctx.pal.line, size: RULE };
  if (ctx.d.table.borders === "grid") return { top: line, bottom: line, left: line, right: line };
  const headerRule = ctx.d.table.header === "rule-only" ? { color: ctx.pal.ink, size: 1 } : line;
  if (rowIndex === 0) return { top: null, bottom: headerRule, left: null, right: null };
  return { top: rowIndex === 1 ? headerRule : line, bottom: rowIndex === rowCount ? line : null, left: null, right: null };
}

function zebra(ctx: Ctx, rowIndex: number) {
  return ctx.d.table.zebra && rowIndex > 0 && rowIndex % 2 === 0 ? lighten(ctx.pal.soft, 0.45) : undefined;
}

function cellContent(ctx: Ctx, cell: RenderCell, width: number): FlowItem[] {
  const tight = tightOptions(ctx, ctx.sz.body);
  if (Array.isArray(cell)) return [listItems(ctx, cell, { cell: true, width })];
  return [par(ctx, [txt(ctx, cell)], tight)];
}

function dataTable(ctx: Ctx, columns: string[], widths: number[], rows: RenderCell[][], width: number): TableItem {
  const sum = widths.reduce((total, w) => total + w, 0);
  const columnWidths = widths.map((w) => (w / sum) * width);
  return table(ctx, {
    widths: columnWidths,
    rows: [
      { header: true, cells: columns.map((column) => ({ ...headerCell(ctx, column), borders: strokeFor(ctx, 0, rows.length) })) },
      ...rows.map((row, index) => ({
        cells: row.map((cell, column) => ({
          items: cellContent(ctx, cell, columnWidths[column] - 2 * CELL_X),
          fill: zebra(ctx, index + 1),
          borders: strokeFor(ctx, index + 1, rows.length),
        })),
      })),
    ],
  });
}

function callout(ctx: Ctx, items: FlowItem[], width: number): TableItem {
  if (ctx.d.callout === "soft-panel") return box(ctx, width, items, { fill: ctx.pal.soft, inset: inset(9, 7) });
  return box(ctx, width, items, { inset: { l: 9, r: 4, t: 4, b: 4 }, borders: { left: { color: ctx.pal.accent, size: 2.5 } } });
}

// ---------------------------------------------------------------- titles

function partTitle(ctx: Ctx, title: string, anchor: string): FlowItem[] {
  const opener = ctx.d.sopOpener;
  const size = ctx.sz.h1 * 0.85;
  if (opener === "pillar-banner" || opener === "title-banner") {
    const item = box(ctx, ctx.W, [par(ctx, [txt(ctx, title, { font: "heading", size, bold: true, color: ctx.pal.onPrimary })], { bookmark: anchor, outline: 0 })], {
      fill: opener === "title-banner" ? ctx.pal.primaryDark : ctx.pal.primary,
      inset: inset(10, 8),
    });
    return [item, v(ctx.after * 0.5)];
  }
  if (opener === "register-head") {
    const item = table(ctx, {
      widths: [5 * MM, ctx.W - 5 * MM],
      rows: [{ cells: [
        { items: [], fill: ctx.pal.primary, inset: inset(6, 5) },
        { items: [par(ctx, [txt(ctx, title, { font: "heading", size, bold: true, color: ctx.pal.primary })], { bookmark: anchor, outline: 0 })], inset: inset(6, 5) },
      ] }],
    });
    return [item, v(ctx.after * 0.5)];
  }
  return [
    par(ctx, [txt(ctx, title, { font: "heading", size: ctx.sz.h1, bold: true, color: ctx.pal.primary })], { bookmark: anchor, outline: 0, keepNext: true }),
    v(-2),
    rule(opener === "ruled-title" ? ctx.pal.accent : ctx.pal.primary, 1, { above: ctx.after, below: ctx.after }),
    v(ctx.after * 0.5),
  ];
}

const sectionLabel = (section: RenderSection) => (section.number ? `${section.number}  ${section.title}` : section.title);

function sectionTitle(ctx: Ctx, section: RenderSection, color: string, width: number): FlowItem[] {
  const group = (items: FlowItem[]): GroupItem => ({ t: "group", above: ctx.after * 2, below: ctx.after, keep: true, items });
  const heading = ctx.d.sectionHeading;
  if (heading === "numbered-rule") {
    return [group([
      par(ctx, [txt(ctx, sectionLabel(section), { font: "heading", size: ctx.sz.h2, bold: true, color: ctx.pal.primary })], { keepNext: true, outline: 2 }),
      v(-3),
      rule(ctx.pal.line, RULE, { above: ctx.after, below: ctx.after, keepNext: true }),
    ])];
  }
  if (heading === "pillar-bar") {
    return [group([box(ctx, width, [par(ctx, [caps(ctx, sectionLabel(section), { size: ctx.sz.h2, color })], { keepNext: true, outline: 2 })], {
      inset: { l: 7, r: 5, t: 2, b: 2 },
      borders: { left: { color, size: 3 } },
    })])];
  }
  if (heading === "number-chip") {
    const chip = 8 * MM;
    return [group([table(ctx, {
      widths: [chip, width - chip],
      rows: [{ cells: [
        { fill: ctx.pal.primary, vAlign: "center", inset: inset(5, 3), items: [par(ctx, [txt(ctx, section.number.replace(".0", ""), { bold: true, color: ctx.pal.onPrimary, size: ctx.sz.small + 1 })], { align: "center" })] },
        { vAlign: "center", inset: inset(5, 3), items: [par(ctx, [txt(ctx, section.title, { font: "heading", bold: true, color: ctx.pal.primaryDark, size: ctx.sz.h2 })], { keepNext: true, outline: 2 })] },
      ] }],
    })])];
  }
  // label-chip: a shaded chip as wide as its label.
  const label = caps(ctx, sectionLabel(section), { size: ctx.sz.small + 0.5, color: ctx.pal.primary });
  const chipWidth = Math.min(width, runsWidth(ctx, [label]) + 14 + 1);
  return [group([box(ctx, chipWidth, [par(ctx, [label], { keepNext: true, outline: 2 })], { fill: ctx.pal.soft, inset: inset(7, 3) })])];
}

// ---------------------------------------------------------------- SOP parts

function metaPair(ctx: Ctx, label: string, value: string, options: { color?: string; labelColor?: string } = {}): ParItem {
  return stack(ctx, [
    [caps(ctx, label, { size: ctx.sz.small - 0.5, color: options.labelColor })],
    [txt(ctx, value, { size: ctx.sz.small + 1, bold: true, color: options.color })],
  ], tightOptions(ctx, ctx.sz.small));
}

function metaCardRows(ctx: Ctx, sop: RenderSop, borderTop = true): RowSpec[] {
  const line = { color: ctx.pal.line, size: RULE };
  const fill = lighten(ctx.pal.soft, 0.4);
  const cell = (label: string, value: string, rowIndex: number): CellSpec => ({
    items: [metaPair(ctx, label, value)],
    fill,
    inset: inset(6, 4),
    borders: { top: rowIndex === 0 && !borderTop ? null : line, bottom: line, left: line, right: line },
  });
  return [
    { cells: [cell("SOP No.", sop.code, 0), cell("Version", sop.version, 0), cell("Department", sop.department, 0), cell("Owner", sop.owner, 0)] },
    { cells: [cell("Effective", sop.effectiveDate, 1), cell("Next review", sop.nextReviewDate, 1), cell("Prepared by", sop.preparedBy, 1), cell("Approved by", sop.approvedBy, 1)] },
  ];
}

function sopOpener(ctx: Ctx, sop: RenderSop, bookmarks: string[]): FlowItem[] {
  const out: FlowItem[] = [];
  const opener = ctx.d.sopOpener;
  const color = sop.color;
  const quarter = Array(4).fill(ctx.W / 4);
  const mark = <T extends ParItem>(item: T): T => {
    if (bookmarks.length) {
      item.bookmark = bookmarks[0];
      extraBookmarks.set(item, bookmarks.slice(1));
    }
    return item;
  };
  if (opener === "ruled-title") {
    out.push(
      mark(par(ctx, [caps(ctx, `SOP ${sop.code}   |   ${sop.department}`, { color: ctx.pal.accent })], { keepNext: true })),
      v(2),
      par(ctx, [txt(ctx, sop.title, { font: "heading", size: ctx.sz.h1, bold: true, color: ctx.pal.primary })], { keepNext: true, outline: 1 }),
      v(-2),
      rule(ctx.pal.primary, 1.2, { above: ctx.after, below: ctx.after, keepNext: true }),
      par(ctx, [txt(ctx, `Version ${sop.version}   |   Effective ${sop.effectiveDate}   |   Owner: ${sop.owner}`, { size: ctx.sz.small, color: ctx.pal.muted })]),
    );
  } else if (opener === "pillar-banner") {
    const label = caps(ctx, sop.pillarLabel, { color: ctx.pal.onPrimary });
    const labelWidth = runsWidth(ctx, [label]);
    const banner: CellSpec = {
      span: 4,
      fill: color,
      inset: inset(10, 8),
      items: [mark(stack(ctx, [
        [txt(ctx, sop.code, { size: ctx.sz.small, bold: true, color: ctx.pal.onPrimary, tracking: 0.6 }), { tab: true }, label],
        [txt(ctx, sop.title, { font: "heading", size: ctx.sz.h1, bold: true, color: ctx.pal.onPrimary })],
      ], { tabs: [{ type: "right", pos: ctx.W - 20 }], outline: 1 }))],
    };
    // The title wraps before the pillar label column, as in the Typst grid.
    (banner.items[0] as ParItem).lines[1].indentRight = labelWidth;
    const tightSmall = tightOptions(ctx, ctx.sz.small);
    const meta = (label2: string, value: string): CellSpec => ({ fill: ctx.pal.soft, inset: inset(10, 4), items: [{ ...metaPair(ctx, label2, value), ...tightSmall }] });
    out.push(table(ctx, {
      widths: quarter,
      rows: [
        { cells: [banner] },
        { cells: [meta("Department", sop.department), meta("Owner", sop.owner), meta("Version", sop.version), meta("Effective", sop.effectiveDate)] },
      ],
    }));
  } else if (opener === "header-card") {
    out.push(table(ctx, {
      widths: quarter,
      rows: [
        { cells: [{ span: 4, fill: ctx.pal.primary, inset: inset(10, 9), items: [mark(stack(ctx, [
          [txt(ctx, `SOP ${sop.number}`, { size: ctx.sz.small, bold: true, color: ctx.pal.accent, tracking: 0.6 })],
          [txt(ctx, sop.title, { font: "heading", size: ctx.sz.h1, bold: true, color: ctx.pal.onPrimary })],
        ], { outline: 1 }))] }] },
        ...metaCardRows(ctx, sop),
      ],
    }));
  } else if (opener === "register-head") {
    const codeWidth = 32 * MM;
    out.push(table(ctx, {
      widths: [codeWidth, ctx.W - codeWidth],
      rows: [{ cells: [
        { fill: ctx.pal.primary, vAlign: "center", inset: inset(6, 6), borders: { bottom: { color: ctx.pal.ink, size: 1 } }, items: [par(ctx, [txt(ctx, sop.code, { bold: true, color: ctx.pal.onPrimary, size: ctx.sz.small })], { align: "center" })] },
        { vAlign: "center", inset: inset(6, 6), borders: { bottom: { color: ctx.pal.ink, size: 1 } }, items: [mark(stack(ctx, [
          [txt(ctx, sop.title, { font: "heading", size: ctx.sz.h1, bold: true, color: ctx.pal.ink })],
          [txt(ctx, `${sop.department}  |  Owner: ${sop.owner}  |  Version ${sop.version}  |  Effective ${sop.effectiveDate}`, { size: ctx.sz.small, color: ctx.pal.muted })],
        ], { outline: 1 }))] },
      ] }],
    }));
  } else {
    out.push(box(ctx, ctx.W, [
      mark(par(ctx, [txt(ctx, `${sop.code}  |  ${sop.department}`.toUpperCase(), { size: ctx.sz.small + 0.5, bold: true, color: ctx.pal.accent, tracking: 0.8 })], { keepNext: true })),
      v(2),
      par(ctx, [txt(ctx, sop.title, { font: "heading", size: ctx.sz.h1, bold: true, color: ctx.pal.onPrimary })], { outline: 1 }),
    ], { fill: ctx.pal.primaryDark, inset: inset(12, 12) }));
  }
  if (ctx.d.showSopHeaderCard && opener !== "header-card" && opener !== "pillar-banner") {
    out.push(v(ctx.after * 0.5), table(ctx, { widths: quarter, rows: metaCardRows(ctx, sop) }));
  }
  out.push(v(ctx.after));
  return out;
}

/** Bookmarks that share a paragraph with the SOP anchor (chapter anchors without a visible opener). */
const extraBookmarks = new WeakMap<ParItem, string[]>();

function stepsBlocks(ctx: Ctx, steps: RenderStep[], width: number): FlowItem[] {
  const out: FlowItem[] = [];
  for (const step of steps) {
    out.push({
      t: "group",
      above: ctx.after * 1.2,
      below: ctx.after * 0.6,
      keep: true,
      items: [stack(ctx, [
        [txt(ctx, `${step.number}  ${step.heading}`, { bold: true, color: ctx.pal.primaryDark })],
        step.responsible ? [txt(ctx, `Responsible: ${step.responsible}`, { size: ctx.sz.small, color: ctx.pal.muted })] : null,
      ], { keepNext: true })],
    });
    out.push(...renderBlocks(ctx, step.body, width));
    for (const sub of step.substeps) {
      out.push(par(ctx, [
        txt(ctx, sub.number, { bold: true }),
        txt(ctx, " ", { tracking: 4 }),
        txt(ctx, sub.text),
        ...(sub.responsible ? [txt(ctx, `  (${sub.responsible})`, { size: ctx.sz.small, color: ctx.pal.muted })] : []),
      ], { blockLike: true, indentLeft: 14 }));
    }
  }
  return out;
}

function stepsTable(ctx: Ctx, steps: RenderStep[], width: number): TableItem {
  const widths = [13 * MM, width - 13 * MM - 34 * MM, 34 * MM];
  const actionWidth = widths[1] - 2 * CELL_X;
  return table(ctx, {
    widths,
    rows: [
      { header: true, cells: ["Step", "Action", "Responsible"].map((label) => ({ ...headerCell(ctx, label), borders: strokeFor(ctx, 0, steps.length) })) },
      ...steps.map((step, index) => {
        const rowIndex = index + 1;
        const base = { fill: zebra(ctx, rowIndex), borders: strokeFor(ctx, rowIndex, steps.length) };
        const action: FlowItem[] = [par(ctx, [txt(ctx, step.heading, { bold: true })])];
        for (const block of step.body) {
          if (block.type === "p") action.push(par(ctx, [txt(ctx, block.text)]));
          else action.push(...renderBlocks(ctx, [block], actionWidth));
        }
        for (const sub of step.substeps) action.push(par(ctx, [txt(ctx, sub.number, { bold: true }), txt(ctx, " ", { tracking: 3 }), txt(ctx, sub.text)]));
        return {
          cells: [
            { ...base, items: [par(ctx, [txt(ctx, step.number, { bold: true, color: ctx.pal.primary })])] },
            { ...base, items: action },
            { ...base, items: [par(ctx, [txt(ctx, step.responsible)], tightOptions(ctx, ctx.sz.body))] },
          ],
        };
      }),
    ],
  });
}

function sectionBody(ctx: Ctx, section: RenderSection, width: number): FlowItem[] {
  const out: FlowItem[] = [];
  if (section.steps) out.push(ctx.d.procedure === "step-table" ? stepsTable(ctx, section.steps, width) : { t: "group", above: 0, below: 0, items: stepsBlocks(ctx, section.steps, width) });
  out.push(...renderBlocks(ctx, section.blocks, width));
  // An unwrapped group keeps Typst's own spacing between its items.
  return out.flatMap((item) => (item.t === "group" && item.above === 0 && item.below === 0 ? item.items : [item]));
}

function renderSection(ctx: Ctx, section: RenderSection, color: string): FlowItem[] {
  if (ctx.d.sectionHeading === "side-label") {
    const labelWidth = 30 * MM;
    const bodyWidth = ctx.W - labelWidth;
    const line = { color: ctx.pal.line, size: RULE };
    const item = table(ctx, {
      widths: [labelWidth, bodyWidth],
      above: ctx.after * 1.6,
      below: ctx.after,
      rows: [{ cells: [
        { inset: { l: 0, r: 8, t: 5, b: 2 }, borders: { top: line }, items: [par(ctx, [caps(ctx, sectionLabel(section), { size: ctx.sz.small + 0.5, color: ctx.pal.primary })], { ...tightOptions(ctx, ctx.sz.small), outline: 2 })] },
        { inset: { l: 0, r: 0, t: 5, b: 2 }, borders: { top: line }, items: sectionBody(ctx, section, bodyWidth) },
      ] }],
    });
    return [item];
  }
  return [...sectionTitle(ctx, section, color, ctx.W), ...sectionBody(ctx, section, ctx.W)];
}

// ---------------------------------------------------------------- contents

function contentsRow(ctx: Ctx, lead: string, title: string, anchor: string, color: string): FlowItem[] {
  const variant = ctx.d.contents;
  const leadWidth = variant === "dotted-leaders" ? 10 * MM : 30 * MM;
  const leader = variant === "dotted-leaders" || variant === "pillar-index";
  const size = ctx.sz.body;
  const pageColor = variant === "dotted-leaders" ? ctx.pal.ink : ctx.pal.muted;
  const runs: RunSpec[] = [
    ...(lead ? [txt(ctx, lead, { bold: true, color })] : []),
    { tab: true },
    { link: anchor, runs: [txt(ctx, title)] },
    ...(leader ? [{ tab: true, color: ctx.pal.muted } as RunSpec] : []),
    { tab: true },
    { pageRef: anchor, color: pageColor },
  ];
  // Leader rows: the dot box sits on the baseline and reaches 1em above it.
  const lineHeight = leader ? size * 1.25 : size + ctx.lead;
  const item = par(ctx, runs, {
    blockLike: true,
    indentLeft: leadWidth,
    hanging: leadWidth,
    tabs: [
      ...(leader ? [{ type: "right" as const, pos: ctx.W - 10 * MM, leader: true }] : []),
      { type: "right", pos: ctx.W },
    ],
    box: leader
      ? { lineHeight, padTop: 0.8 * lineHeight - size, padBottom: 0.2 * lineHeight - 0.2 * size, typstHeight: size * 1.2 }
      : { lineHeight, padTop: 0.8 * ctx.lead, padBottom: 0.2 * ctx.lead, typstHeight: size },
  });
  return [item, v(variant === "register-columns" ? 1 : 3)];
}


function contentsPage(ctx: Ctx): FlowItem[] {
  const m = ctx.m;
  const variant = ctx.d.contents;
  const gap = variant === "register-columns" ? 2 : 4;
  const out: FlowItem[] = [...partTitle(ctx, "Contents", "contents")];
  for (const section of m.frontMatter) out.push(...contentsRow(ctx, "", section.title, section.anchor, ctx.pal.ink));
  out.push(v(gap * 2));
  for (const chapter of m.chapters) {
    if (chapter.label) {
      out.push(v(gap));
      if (variant === "pillar-index" || variant === "banner-index") {
        out.push(box(ctx, ctx.W, [par(ctx, [caps(ctx, chapter.label, { color: variant === "pillar-index" ? ctx.pal.onPrimary : ctx.pal.primary })])], {
          fill: variant === "pillar-index" ? chapter.color : ctx.pal.soft,
          inset: inset(7, 3),
        }));
      } else {
        out.push(par(ctx, [caps(ctx, chapter.label, { color: chapter.color, size: ctx.sz.small + 1 })]));
      }
      out.push(v(gap));
    }
    for (const sop of chapter.sops) {
      out.push(...contentsRow(ctx, variant === "dotted-leaders" ? `${sop.number}.` : sop.code, sop.title, sop.anchor, chapter.color));
    }
  }
  out.push(v(gap * 2));
  for (const section of m.closing.sections) out.push(...contentsRow(ctx, "", section.title, section.anchor, ctx.pal.ink));
  out.push(...contentsRow(ctx, "", "Revision history", m.closing.anchors.revisions, ctx.pal.ink));
  out.push(...contentsRow(ctx, "", "Approval", m.closing.anchors.approval, ctx.pal.ink));
  return out;
}

// ---------------------------------------------------------------- chapters

function chapterPage(ctx: Ctx, chapter: RenderChapter): FlowItem[] {
  const out: FlowItem[] = [
    box(ctx, ctx.W, [
      v(26 * MM),
      { ...stack(ctx, [
        [caps(ctx, "Chapter", { color: ctx.pal.onPrimary })],
        [txt(ctx, chapter.label, { font: "heading", size: ctx.sz.coverTitle * 0.9, bold: true, color: ctx.pal.onPrimary })],
      ]), bookmark: chapter.anchor, outline: 0 },
      v(4),
      par(ctx, [txt(ctx, chapter.summary, { color: ctx.pal.onPrimary })]),
    ], { fill: chapter.color, inset: { l: 16, r: 16, t: 18, b: 18 } }),
    v(ctx.after * 2),
  ];
  const codeWidth = 26 * MM;
  for (const sop of chapter.sops) {
    out.push(
      par(ctx, [txt(ctx, sop.code, { bold: true, color: chapter.color }), { tab: true }, txt(ctx, sop.title), { tab: true }, { pageRef: sop.anchor, color: ctx.pal.muted }], {
        blockLike: true,
        tabs: [{ type: "left", pos: codeWidth + 6 }, { type: "right", pos: ctx.W }],
      }),
      v(-2),
      rule(ctx.pal.line, RULE, { above: ctx.after, below: ctx.after }),
    );
  }
  return out;
}

function labelBand(ctx: Ctx, chapter: RenderChapter): FlowItem[] {
  const count = txt(ctx, `${chapter.sops.length} SOPs`, { size: ctx.sz.small, color: ctx.pal.muted });
  const countWidth = runsWidth(ctx, [count]) + 16;
  return [
    table(ctx, {
      widths: [ctx.W - countWidth, countWidth],
      rows: [{ cells: [
        { fill: ctx.pal.soft, inset: inset(8, 5), items: [{ ...par(ctx, [caps(ctx, chapter.label, { color: chapter.color, size: ctx.sz.small + 1 })]), bookmark: chapter.anchor, outline: 0 }] },
        { fill: ctx.pal.soft, inset: inset(8, 5), items: [par(ctx, [count])] },
      ] }],
    }),
    v(ctx.after * 0.5),
  ];
}

// ---------------------------------------------------------------- closing

function approvalBlock(ctx: Ctx): FlowItem[] {
  const approval = ctx.m.closing.approval;
  const out: FlowItem[] = [];
  if (approval.statement) out.push(callout(ctx, [par(ctx, [txt(ctx, approval.statement)], { align: "justify" })], ctx.W), v(ctx.after));
  if (ctx.d.approval === "signature-table") {
    out.push(dataTable(ctx, ["Role", "Name", "Designation", "Signature", "Date"], [1.1, 1.3, 1.3, 1.2, 0.9], approval.signatories.map((s) => [s.role, s.name, s.designation, "", s.date]), ctx.W));
    return out;
  }
  const count = Math.max(1, approval.signatories.length);
  const gutter = 8;
  const panelWidth = (ctx.W - gutter * (count - 1)) / count;
  const widths: number[] = [];
  const cells: CellSpec[] = [];
  approval.signatories.forEach((s, index) => {
    if (index > 0) { widths.push(gutter); cells.push({ items: [], inset: inset(0, 0) }); }
    widths.push(panelWidth);
    const tight = tightOptions(ctx, ctx.sz.body);
    cells.push({
      fill: ctx.pal.soft,
      inset: inset(9, 9),
      items: [
        par(ctx, [caps(ctx, s.role, { color: ctx.pal.primary })], tight),
        v(16 * MM),
        rule(ctx.pal.muted, RULE, { above: ctx.after, below: ctx.after }),
        stack(ctx, [
          [txt(ctx, s.name, { bold: true })],
          [txt(ctx, s.designation + (s.date ? `  |  ${s.date}` : ""), { size: ctx.sz.small, color: ctx.pal.muted })],
        ], tight),
      ],
    });
  });
  out.push(table(ctx, { widths, rows: [{ cells }] }));
  return out;
}

// ---------------------------------------------------------------- running header and footer

type SopMeta = { code: string; title: string; color: string; pillarLabel: string } | null;

function pageOf(ctx: Ctx, style: RunStyle): RunSpec[] {
  return [txt(ctx, "Page ", style), { field: "PAGE", ...style }, txt(ctx, " of ", style), { field: "NUMPAGES", ...style }];
}

/** Header content (Typst flow) for the page's current SOP. */
function headerItems(ctx: Ctx, sop: SopMeta): FlowItem[] {
  const m = ctx.m;
  const small = ctx.sz.small;
  const sopTitle = sop ? `${sop.code}  ${sop.title}` : m.cover.eyebrow;
  const sopColor = sop ? sop.color : ctx.pal.primary;
  const variant = ctx.d.runningHeader;
  if (variant === "control-table") {
    const W = ctx.W;
    const widths = [W * 0.24, W - W * 0.24 - W * 0.4, W * 0.2, W * 0.2];
    const line = { color: ctx.pal.line, size: RULE };
    const borders = { top: line, bottom: line, left: line, right: line };
    const tight = tightOptions(ctx, small);
    const ins = inset(5, 3);
    const smallText = (text: string) => par(ctx, [txt(ctx, text, { size: small })], tight);
    const logo = m.company.logo ? ctx.images.get(m.company.logo) : undefined;
    const nameRun = logo ? ({ image: logo, heightPt: 8 * MM } as RunSpec) : txt(ctx, m.company.name, { bold: true, color: ctx.pal.primary, font: "heading", size: small + 1 });
    const titleLines = stack(ctx, [[txt(ctx, m.title, { size: small, bold: true, color: ctx.pal.primary })], [txt(ctx, sopTitle, { size: small, color: ctx.pal.muted })]], tight);
    // Row heights follow Typst: the first row fits one line; the second takes what the spanning cells need.
    const lead = leadOf(ctx, small);
    const rowOne = small + 2 * ins.t;
    const nameLines = logo ? 1 : estimateLines(ctx, [nameRun], widths[0] - 2 * ins.l);
    const titleCount = estimateLines(ctx, titleLines.lines[0].runs, widths[1] - 10) + estimateLines(ctx, titleLines.lines[1].runs, widths[1] - 10);
    const nameHeight = logo ? 8 * MM + 2 * ins.t : nameLines * (small + 1) + (nameLines - 1) * lead + 2 * ins.t;
    const titleHeight = titleCount * small + (titleCount - 1) * lead + 2 * ins.t;
    const total = Math.max(2 * rowOne, nameHeight, titleHeight);
    return [table(ctx, {
      widths,
      rows: [
        { height: rowOne, cells: [
          { rowSpan: 2, vAlign: "center", inset: ins, borders, items: [{ ...par(ctx, [nameRun], tight), align: "center" }] },
          { rowSpan: 2, vAlign: "center", inset: ins, borders, items: [titleLines] },
          { vAlign: "center", inset: ins, borders, items: [smallText(`Doc No: ${m.control.docNo}`)] },
          { vAlign: "center", inset: ins, borders, items: [smallText(`Rev: ${m.control.revision}`)] },
        ] },
        { height: total - rowOne, cells: [
          { vAlign: "center", inset: ins, borders, items: [smallText(`Effective: ${m.control.effectiveDate}`)] },
          { vAlign: "center", inset: ins, borders, items: [par(ctx, pageOf(ctx, { size: small }), tight)] },
        ] },
      ],
    })];
  }
  if (variant === "pillar-rule") {
    return [
      par(ctx, [caps(ctx, m.title), { tab: true }, caps(ctx, sop ? sop.pillarLabel : m.company.name, { color: sopColor })], { blockLike: true, tabs: [{ type: "right", pos: ctx.W }] }),
      v(2),
      rule(sopColor, 1.5, { above: ctx.after, below: ctx.after }),
    ];
  }
  if (variant === "code-strip") {
    const code = txt(ctx, sop ? sop.code : m.control.docNo, { size: small, bold: true, color: ctx.pal.primary });
    const company = txt(ctx, m.company.name, { size: small, color: ctx.pal.muted });
    const codeWidth = runsWidth(ctx, [code]) + 12;
    const companyWidth = runsWidth(ctx, [company]) + 12;
    const cell = (run: RunSpec): CellSpec => ({ fill: ctx.pal.soft, inset: inset(6, 4), items: [par(ctx, [run], { blockLike: true })] });
    return [table(ctx, {
      widths: [codeWidth, ctx.W - codeWidth - companyWidth, companyWidth],
      rows: [{ cells: [cell(code), cell(txt(ctx, sop ? sop.title : m.title, { size: small, color: ctx.pal.ink })), cell(company)] }],
    })];
  }
  if (variant === "register-line") {
    return [
      par(ctx, [txt(ctx, `${m.company.name}  |  ${m.title}`, { size: small, color: ctx.pal.muted }), { tab: true }, txt(ctx, `${m.control.docNo}  Rev ${m.control.revision}`, { size: small, color: ctx.pal.muted })], { blockLike: true, tabs: [{ type: "right", pos: ctx.W }] }),
      v(2),
      rule(ctx.pal.line, RULE, { above: ctx.after, below: ctx.after }),
    ];
  }
  // banner-rule: logo or name on the left, manual title on the right, both centred on one row.
  const logo = m.company.logo ? ctx.images.get(m.company.logo) : undefined;
  const left: RunSpec = logo ? { image: logo, heightPt: 7 * MM } : txt(ctx, m.company.name, { bold: true, color: ctx.pal.primary, font: "heading", size: ctx.sz.h3 });
  const right = caps(ctx, m.title, { color: ctx.pal.primary });
  const rowHeight = logo ? 7 * MM : ctx.sz.h3;
  // Both cells are centred on the row, so the caps sit higher than the name's baseline.
  const leftBaseline = logo ? rowHeight : 0.8 * rowHeight;
  const rightBaseline = (rowHeight - small) / 2 + 0.8 * small;
  const rightRun: RunSpec = { ...right, raise: leftBaseline - rightBaseline };
  const lineBox = imageBox(ctx, [left], ctx.lead) ?? { lineHeight: rowHeight + ctx.lead, padTop: 0.8 * ctx.lead, padBottom: 0.2 * ctx.lead, typstHeight: rowHeight };
  return [
    par(ctx, [left, { tab: true }, rightRun], { blockLike: true, size: rowHeight, tabs: [{ type: "right", pos: ctx.W }], box: lineBox }),
    v(3),
    rule(ctx.pal.primary, 2, { above: ctx.after, below: ctx.after }),
  ];
}


function footerItems(ctx: Ctx, pageDigits: number): FlowItem[] {
  const m = ctx.m;
  const small = ctx.sz.small;
  const style = { size: small, color: ctx.pal.muted };
  const variant = ctx.d.runningFooter;
  if (variant === "prepared-approved") {
    const third = [txt(ctx, `Controlled copy | Page ${"8".repeat(pageDigits)} of ${"8".repeat(pageDigits)}`, style)];
    const thirdWidth = runsWidth(ctx, third);
    const column = (ctx.W - thirdWidth - 16) / 2;
    return [
      rule(ctx.pal.line, RULE, { above: ctx.after, below: ctx.after }),
      v(3),
      par(ctx, [
        txt(ctx, `Prepared by: ${m.control.preparedBy}`, style), { tab: true },
        txt(ctx, `Approved by: ${m.control.approvedBy}`, style), { tab: true },
        txt(ctx, "Controlled copy | ", style), ...pageOf(ctx, style),
      ], { blockLike: true, tabs: [{ type: "left", pos: column + 8 }, { type: "left", pos: ctx.W - thirdWidth }] }),
    ];
  }
  if (variant === "outer-folio") {
    return [par(ctx, [txt(ctx, `${m.company.name}  |  ${m.title}`, style), { tab: true }, { field: "PAGE", size: small + 1, bold: true, color: ctx.pal.primary }], { blockLike: true, tabs: [{ type: "right", pos: ctx.W }] })];
  }
  if (variant === "centered-folio") return [par(ctx, pageOf(ctx, style), { blockLike: true, align: "center" })];
  return [
    rule(ctx.pal.line, RULE, { above: ctx.after, below: ctx.after }),
    v(2),
    par(ctx, [
      txt(ctx, `${m.control.docNo}  |  Rev ${m.control.revision}  |  Effective ${m.control.effectiveDate}`, style), { tab: true },
      { field: "PAGE", ...style }, txt(ctx, " / ", style), { field: "NUMPAGES", ...style },
    ], { blockLike: true, tabs: [{ type: "right", pos: ctx.W }] }),
  ];
}

// ---------------------------------------------------------------- cover

function controlGrid(ctx: Ctx, width: number, indent?: number): TableItem {
  const c = ctx.m.control;
  const pairs: Array<[string, string]> = [
    ["Document No.", c.docNo], ["Revision", c.revision], ["Effective date", c.effectiveDate], ["Next review", c.nextReviewDate],
    ["Prepared by", c.preparedBy], ["Reviewed by", c.reviewedBy], ["Approved by", c.approvedBy], ["Classification", c.classification],
  ];
  const line = { color: ctx.pal.line, size: RULE };
  const borders = { top: line, bottom: line, left: line, right: line };
  return table(ctx, {
    widths: Array(4).fill(width / 4),
    indent,
    rows: [0, 1].map((row) => ({ cells: pairs.slice(row * 4, row * 4 + 4).map(([label, value]) => ({ inset: inset(6, 5), borders, items: [metaPair(ctx, label, value)] })) })),
  });
}

type CoverParts = {
  margins: { top: number; bottom: number; left: number; right: number };
  items: FlowItem[];
  /** Anchored pictures behind the text. */
  pictures: Array<{ image: LoadedImage; x: number; y: number; width: number; height: number }>;
  /** Bottom-anchored block (Typst `place(bottom …)` or `v(1fr)` before it), set in the cover footer. */
  bottom?: { items: FlowItem[]; distance: number };
};

async function solidPng(color: string): Promise<LoadedImage> {
  const data = await sharp({ create: { width: 8, height: 8, channels: 3, background: `#${hex(color)}` } }).png().toBuffer();
  return { data, width: 8, height: 8 };
}

function statsRows(ctx: Ctx, labels: [string, string, string], numberSize: number) {
  const values = [ctx.m.stats.sopCount, ctx.m.stats.departmentCount, ctx.m.stats.siteCount].map(String);
  return values.map((value, index) => stack(ctx, [
    [txt(ctx, value, { font: "heading", size: numberSize, bold: true, color: ctx.pal.primary })],
    [txt(ctx, labels[index], { size: ctx.sz.small + 0.5, color: ctx.pal.muted })],
  ]));
}

/** A white plate behind the logo or company name (Typst `box(fill: white, inset: 6pt, …)`). */
function logoPlate(ctx: Ctx, height: number, indent?: number): TableItem {
  const run = logoOrName(ctx, height);
  const width = runsWidth(ctx, [run]) + 12 + 1;
  return table(ctx, { widths: [width], indent, rows: [{ cells: [{ fill: "#FFFFFF", inset: inset(6, 6), items: [par(ctx, [run], { blockLike: true })] }] }] });
}

async function coverParts(ctx: Ctx): Promise<CoverParts> {
  const m = ctx.m;
  const d = ctx.d;
  const w = ctx.pageW;
  const h = ctx.pageH;
  const padX = d.page.marginXMm * MM;
  const inner = w - 2 * padX;
  const coverImage = m.cover.image ? ctx.images.get(m.cover.image) : undefined;
  const heading = (text: string, color: string, size = ctx.sz.coverTitle) => par(ctx, [txt(ctx, text, { font: "heading", size, bold: true, color })]);
  if (m.cover.image || d.cover === "image-banner") {
    const imageHeight = h * 0.58;
    const pictures = [coverImage
      ? { image: await coverCrop(coverImage, w, imageHeight), x: 0, y: 0, width: w, height: imageHeight }
      : { image: await solidPng(ctx.pal.primary), x: 0, y: 0, width: w, height: imageHeight }];
    const plate = logoPlate(ctx, 11 * MM, padX);
    const banner = box(ctx, w, [
      par(ctx, [caps(ctx, m.cover.eyebrow, { color: ctx.pal.accent, size: ctx.sz.small + 1 })]),
      v(4),
      heading(m.cover.title, ctx.pal.onPrimary),
      v(2),
      par(ctx, [txt(ctx, m.cover.subtitle, { size: ctx.sz.h2, color: ctx.pal.onPrimary })]),
    ], { fill: ctx.pal.primaryDark, inset: inset(padX, 14 * MM) });
    const plateGap = imageHeight - 14 * MM - plate.height;
    return {
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pictures,
      items: [v(14 * MM), { ...plate, above: 0, below: 0 }, v(plateGap), { ...banner, above: 0, below: 0 }],
      bottom: { items: [controlGrid(ctx, inner, padX)], distance: 14 * MM },
    };
  }
  if (d.cover === "control-sheet") {
    const boxWidth = 46 * MM;
    const top = table(ctx, {
      widths: [inner - boxWidth, boxWidth],
      rows: [{ cells: [
        { vAlign: "center", inset: inset(0, 0), items: [par(ctx, [logoOrName(ctx, 16 * MM)], { blockLike: true })] },
        {
          vAlign: "center", inset: inset(8, 5),
          borders: { top: { color: ctx.pal.primary, size: 1 }, bottom: { color: ctx.pal.primary, size: 1 }, left: { color: ctx.pal.primary, size: 1 }, right: { color: ctx.pal.primary, size: 1 } },
          items: [{ ...stack(ctx, [
            [caps(ctx, "Controlled copy", { color: ctx.pal.primary })],
            [txt(ctx, `${m.control.classification}  |  Rev ${m.control.revision}`, { size: ctx.sz.small, color: ctx.pal.muted })],
          ], tightOptions(ctx, ctx.sz.small)), align: "center" }],
        },
      ] }],
    });
    const stats = table(ctx, {
      widths: Array(3).fill(inner / 3),
      rows: [{ cells: statsRows(ctx, ["Standard operating procedures", "Departments covered", "Sites in scope"], ctx.sz.coverTitle * 0.8).map((item) => ({ fill: ctx.pal.soft, inset: inset(10, 9), items: [item] })) }],
    });
    return {
      margins: { top: 20 * MM, bottom: 18 * MM, left: padX, right: padX },
      pictures: [],
      items: [
        top,
        v(46 * MM),
        par(ctx, [caps(ctx, m.cover.eyebrow, { color: ctx.pal.accent, size: ctx.sz.small + 1.5 })]),
        v(4),
        heading(m.cover.title, ctx.pal.primary),
        v(4),
        par(ctx, [txt(ctx, m.cover.subtitle, { size: ctx.sz.h2 + 1, color: ctx.pal.muted })]),
        v(6),
        rule(ctx.pal.accent, 3, { above: ctx.after, below: ctx.after, right: inner - 32 * MM }),
        v(14 * MM),
        stats,
      ],
      bottom: { items: [controlGrid(ctx, inner)], distance: 18 * MM },
    };
  }
  if (d.cover === "pillar-bands") {
    const bandHeight = h * 0.36;
    const pillarCount = (key: "E" | "S" | "G") => m.chapters.filter((chapter) => chapter.sops.length > 0 && chapter.sops[0].pillar === key).reduce((sum, chapter) => sum + chapter.sops.length, 0);
    const pillars = [["E", "Environmental"], ["S", "Social"], ["G", "Governance"]] as const;
    const logo = par(ctx, [logoOrName(ctx, 12 * MM)], { blockLike: true, indentLeft: padX });
    const logoHeight = m.company.logo && ctx.images.get(m.company.logo) ? 12 * MM : ctx.sz.h3;
    const halfBand = bandHeight / 2;
    const bands = table(ctx, {
      widths: [w / 3, w / 3, w / 3],
      above: 0,
      below: 0,
      rows: [
        { height: halfBand, exact: true, cells: pillars.map(([key]) => ({ fill: ctx.pal.pillars[key], inset: { l: 8 * MM, r: 8 * MM, t: 10 * MM, b: 0 }, items: [par(ctx, [txt(ctx, String(pillarCount(key)), { font: "heading", size: ctx.sz.coverTitle * 1.1, bold: true, color: ctx.pal.onPrimary })])] })) },
        { height: bandHeight - halfBand, exact: true, cells: pillars.map(([key, label]) => ({ fill: ctx.pal.pillars[key], vAlign: "bottom" as const, inset: { l: 8 * MM, r: 8 * MM, t: 0, b: 10 * MM }, items: [stack(ctx, [
          [caps(ctx, label, { color: ctx.pal.onPrimary, size: ctx.sz.small + 2 })],
          [txt(ctx, pillarCount(key) === 1 ? "procedure" : "procedures", { size: ctx.sz.small + 0.5, color: ctx.pal.onPrimary })],
        ])] })) },
      ],
    });
    const indent = { indentLeft: padX, indentRight: padX };
    return {
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pictures: [],
      items: [
        v(16 * MM),
        { ...logo, below: 0 },
        v(44 * MM - 16 * MM - logoHeight),
        bands,
        v(16 * MM),
        { ...par(ctx, [caps(ctx, m.cover.eyebrow, { color: ctx.pal.primary, size: ctx.sz.small + 1.5 })]), ...indent, above: 0 },
        v(4),
        { ...heading(m.cover.title, ctx.pal.ink), ...indent },
        v(4),
        { ...par(ctx, [txt(ctx, m.cover.subtitle, { size: ctx.sz.h2 + 1, color: ctx.pal.muted })]), ...indent },
      ],
      bottom: { items: [controlGrid(ctx, inner, padX)], distance: 16 * MM },
    };
  }
  if (d.cover === "card-grid") {
    const blockHeight = h * 0.42;
    const plate = logoPlate(ctx, 11 * MM);
    const topRow = 20 * MM + plate.height;
    const block = table(ctx, {
      widths: [w],
      above: 0,
      below: 0,
      rows: [
        { height: topRow, exact: true, cells: [{ fill: ctx.pal.primary, inset: { l: padX, r: padX, t: 20 * MM, b: 0 }, items: [{ ...plate, above: 0, below: 0 }] }] },
        { height: blockHeight - topRow, exact: true, cells: [{ fill: ctx.pal.primary, vAlign: "bottom", inset: { l: padX, r: padX, t: 0, b: 14 * MM }, items: [
          par(ctx, [caps(ctx, m.cover.eyebrow, { color: ctx.pal.accent, size: ctx.sz.small + 1.5 })]),
          v(4),
          heading(m.cover.title, ctx.pal.onPrimary),
        ] }] },
      ],
    });
    const white = { color: "#FFFFFF", size: 4 };
    const cards = table(ctx, {
      widths: Array(3).fill(inner / 3),
      indent: padX,
      rows: [{ cells: statsRows(ctx, ["SOPs in this manual", "Departments", "Sites in scope"], ctx.sz.coverTitle).map((item) => ({ fill: ctx.pal.soft, inset: inset(10, 10), borders: { top: white, bottom: white, left: white, right: white }, items: [item] })) }],
    });
    return {
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      pictures: [],
      items: [
        block,
        v(12 * MM),
        { ...par(ctx, [txt(ctx, m.cover.subtitle, { size: ctx.sz.h2 + 1, color: ctx.pal.ink })]), indentLeft: padX, indentRight: padX, above: 0 },
        v(10 * MM),
        cards,
        v(4 * MM),
        controlGrid(ctx, inner, padX),
      ],
    };
  }
  // register-plate: a full-height strip, then the title and the SOP list.
  const strip = 14 * MM;
  const listed = m.chapters.flatMap((chapter) => chapter.sops);
  const tight = tightOptions(ctx, ctx.sz.small);
  const line = { color: ctx.pal.line, size: RULE };
  const contentWidth = w - 2 * strip - padX;
  const list = table(ctx, {
    widths: [24 * MM, contentWidth - 24 * MM],
    rows: listed.slice(0, 14).map((sop) => ({ cells: [
      { inset: inset(0, 3.5), borders: { bottom: line }, items: [par(ctx, [txt(ctx, sop.code, { size: ctx.sz.small, bold: true, color: ctx.pal.primary })], tight)] },
      { inset: inset(0, 3.5), borders: { bottom: line }, items: [par(ctx, [txt(ctx, sop.title, { size: ctx.sz.small })], tight)] },
    ] })),
  });
  return {
    margins: { top: 22 * MM, bottom: 18 * MM, left: 2 * strip, right: padX },
    pictures: [{ image: await solidPng(ctx.pal.primary), x: 0, y: 0, width: strip, height: h }],
    items: [
      par(ctx, [logoOrName(ctx, 12 * MM)]),
      v(30 * MM),
      par(ctx, [caps(ctx, m.cover.eyebrow, { color: ctx.pal.accent, size: ctx.sz.small + 1 })]),
      v(3),
      heading(m.cover.title, ctx.pal.ink),
      v(3),
      par(ctx, [txt(ctx, m.cover.subtitle, { size: ctx.sz.h2, color: ctx.pal.muted })]),
      v(10 * MM),
      list,
      ...(listed.length > 14 ? [par(ctx, [txt(ctx, `and ${listed.length - 14} more`, { size: ctx.sz.small, color: ctx.pal.muted })])] : []),
    ],
    bottom: { items: [controlGrid(ctx, contentWidth)], distance: 18 * MM },
  };
}

async function coverCrop(image: LoadedImage, widthPt: number, heightPt: number): Promise<LoadedImage> {
  const targetWidth = Math.min(2000, image.width);
  const targetHeight = Math.round((targetWidth * heightPt) / widthPt);
  const data = await sharp(image.data).resize({ width: targetWidth, height: targetHeight, fit: "cover", position: "centre" }).png().toBuffer();
  return { data, width: targetWidth, height: targetHeight };
}

function anchoredPicture(picture: CoverParts["pictures"][number]) {
  return new ImageRun({
    type: "png",
    data: picture.image.data,
    transformation: { width: px(picture.width), height: px(picture.height) },
    floating: {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: Math.round(picture.x * 12700) },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(picture.y * 12700) },
      allowOverlap: true,
      behindDocument: true,
      lockAnchor: true,
      layoutInCell: false,
      wrap: { type: TextWrappingType.NONE },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      zIndex: 1,
    },
  });
}

// ---------------------------------------------------------------- bookmarks and page numbers

/** Word bookmark names allow letters, digits and underscores, start with a letter and stop at 40 characters. */
export function bookmarkName(anchor: string) {
  const clean = anchor.replace(/[^A-Za-z0-9_]/g, "_");
  return (/^[A-Za-z]/.test(clean) ? clean : `a_${clean}`).slice(0, 40);
}

/** Every heading anchor in the order the Typst template emits it, with the outline title. */
export function sopManualAnchors(model: SopRenderModel): Array<{ anchor: string; title: string }> {
  const out: Array<{ anchor: string; title: string }> = [];
  const full = model.mode === "full";
  if (full) out.push({ anchor: "contents", title: "Contents" });
  for (const section of model.frontMatter) out.push({ anchor: section.anchor, title: section.title });
  for (const chapter of model.chapters) {
    if (chapter.label) out.push({ anchor: chapter.anchor, title: chapter.label });
    for (const sop of chapter.sops) out.push({ anchor: sop.anchor, title: `${sop.code} ${sop.title}` });
  }
  if (full) {
    for (const section of model.closing.sections) out.push({ anchor: section.anchor, title: section.title });
    out.push({ anchor: model.closing.anchors.revisions, title: "Revision history" });
    out.push({ anchor: model.closing.anchors.approval, title: "Approval" });
  }
  return out;
}

/**
 * Reads the page of every anchor from the Typst PDF's outline, so the Word
 * contents shows the same page numbers before Word recalculates its fields.
 */
export async function sopPagesFromPdf(pdf: Uint8Array, model: SopRenderModel): Promise<Pages> {
  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const pageRefs = doc.getPages().map((page) => page.ref.toString());
  const outline: Array<{ title: string; page: number }> = [];
  const walk = (item: PDFDict | undefined) => {
    while (item) {
      const title = item.lookup(PDFName.of("Title"));
      let dest = item.lookupMaybe(PDFName.of("Dest"), PDFArray);
      if (!dest) dest = item.lookupMaybe(PDFName.of("A"), PDFDict)?.lookupMaybe(PDFName.of("D"), PDFArray);
      const ref = dest?.get(0);
      if (title instanceof PDFString || title instanceof PDFHexString) {
        outline.push({ title: title.decodeText().trim(), page: ref instanceof PDFRef ? pageRefs.indexOf(ref.toString()) + 1 : 0 });
      }
      walk(item.lookupMaybe(PDFName.of("First"), PDFDict));
      item = item.lookupMaybe(PDFName.of("Next"), PDFDict);
    }
  };
  walk(doc.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict)?.lookupMaybe(PDFName.of("First"), PDFDict));
  const anchors: Record<string, number> = {};
  let cursor = 0;
  const normalise = (text: string) => text.replace(/\s+/g, " ").trim();
  for (const { anchor, title } of sopManualAnchors(model)) {
    const index = outline.findIndex((entry, position) => position >= cursor && normalise(entry.title) === normalise(title));
    if (index < 0) continue;
    if (outline[index].page > 0) anchors[anchor] = outline[index].page;
    cursor = index + 1;
  }
  return { anchors, total: doc.getPageCount() };
}

// ---------------------------------------------------------------- document

type SectionPlan = { items: FlowItem[]; sop: SopMeta; kind: "body" | "cover" };

async function loadImages(model: SopRenderModel, assets: ManualAsset[]) {
  const images = new Map<string, LoadedImage>();
  for (const asset of assets) {
    const key = `/${asset.path.replace(/^\/+/, "")}`;
    try {
      const pipeline = sharp(asset.content, { density: 300 });
      const data = await pipeline.png().toBuffer();
      const meta = await sharp(data).metadata();
      images.set(key, { data, width: meta.width ?? 1, height: meta.height ?? 1 });
    } catch {
      // An unreadable image falls back to the company name or a solid plate.
    }
  }
  return images;
}

export type SopDocxOptions = {
  /** Anchor pages and total page count from the Typst PDF (see sopPagesFromPdf). */
  pages?: Pages;
};

export async function generateSopDocx(model: SopRenderModel, assets: ManualAsset[], options: SopDocxOptions = {}): Promise<Buffer> {
  const d = model.design;
  const pageW = model.page.widthMm * MM;
  const pageH = model.page.heightMm * MM;
  const ctx: Ctx = {
    m: model,
    d,
    pal: d.palette,
    sz: d.sizes,
    heading: d.fonts.heading,
    body: d.fonts.body,
    after: d.paragraphSpacing,
    lead: Math.round(d.sizes.body * d.leading * 20) / 20 - d.sizes.body,
    pageW,
    pageH,
    W: pageW - 2 * d.page.marginXMm * MM,
    images: await loadImages(model, assets),
    pages: options.pages,
    listInstance: 0,
    numbering: new Map(),
  };
  const full = model.mode === "full";

  // Sections: one per forced page start, so the header can name the page's SOP.
  const plans: SectionPlan[] = [];
  if (full) {
    plans.push({ kind: "body", sop: null, items: contentsPage(ctx) });
  }
  const front: FlowItem[] = [];
  for (const section of model.frontMatter) front.push(...partTitle(ctx, section.title, section.anchor), ...renderBlocks(ctx, section.blocks, ctx.W), v(ctx.after));
  if (front.length) plans.push({ kind: "body", sop: null, items: front });

  let lastSop: SopMeta = null;
  const meta = (sop: RenderSop): SopMeta => ({ code: sop.code, title: sop.title, color: sop.color, pillarLabel: sop.pillarLabel });
  for (const chapter of model.chapters) {
    const pendingBookmarks: string[] = [];
    if (chapter.label && d.chapterDivider === "pillar-page") {
      plans.push({ kind: "body", sop: lastSop, items: chapterPage(ctx, chapter) });
    } else if (chapter.label && d.chapterDivider === "none") {
      pendingBookmarks.push(chapter.anchor);
    }
    chapter.sops.forEach((sop, index) => {
      const items: FlowItem[] = [];
      if (index === 0 && chapter.label && d.chapterDivider === "label-band") items.push(...labelBand(ctx, chapter));
      items.push(...sopOpener(ctx, sop, [sop.anchor, ...(index === 0 ? pendingBookmarks : [])]));
      for (const section of sop.sections) items.push(...renderSection(ctx, section, sop.color));
      lastSop = meta(sop);
      plans.push({ kind: "body", sop: lastSop, items });
    });
  }
  if (full) {
    const closing: FlowItem[] = [];
    for (const section of model.closing.sections) closing.push(...partTitle(ctx, section.title, section.anchor), ...renderBlocks(ctx, section.blocks, ctx.W), v(ctx.after));
    closing.push(...partTitle(ctx, "Revision history", model.closing.anchors.revisions));
    closing.push(dataTable(ctx, ["Revision", "Date", "Description"], [0.8, 1, 3.2], model.closing.revisions.map((r) => [r.revision, r.date, r.description]), ctx.W));
    closing.push(v(ctx.after * 2), ...partTitle(ctx, "Approval", model.closing.anchors.approval), ...approvalBlock(ctx));
    plans.push({ kind: "body", sop: null, items: closing });
  }

  const marginTop = d.page.marginTopMm * MM;
  const marginBottom = d.page.marginBottomMm * MM;
  const marginX = d.page.marginXMm * MM;
  const pageSize = { width: tw(pageW), height: tw(pageH) };
  const digits = String(options.pages?.total ?? 99).length;
  const footerFlow = () => resolveFlow(ctx, footerItems(ctx, digits), ctx.W);
  const footer = footerFlow();
  // Typst hangs the footer 5 mm below the body; Word stacks it up from the footer distance.
  const footerDistance = marginBottom - 5 * MM - (footer.height - footer.padTop);

  const headerFor = (sop: SopMeta) => {
    const flow = resolveFlow(ctx, headerItems(ctx, sop), ctx.W);
    // Typst puts the header's last line at the header gap above the body; Word grows headers downward.
    const distance = marginTop - d.page.headerGapMm * MM - (flow.height - flow.padBottom);
    return { header: new Header({ children: withTrailingParagraph(flow.children) }), distance };
  };

  const sections = [];
  if (full) {
    const cover = await coverParts(ctx);
    const flow = resolveFlow(ctx, cover.items, pageW - cover.margins.left - cover.margins.right);
    const children = [...flow.children];
    const anchor = cover.pictures.map(anchoredPicture);
    if (anchor.length) {
      // Pictures ride on a hairline paragraph so they do not move the text.
      children.unshift(new Paragraph({ spacing: { before: 0, after: 0, line: 1, lineRule: LineRuleType.EXACT }, children: anchor }));
    }
    const bottom = cover.bottom ? resolveFlow(ctx, cover.bottom.items, pageW - cover.margins.left - cover.margins.right) : null;
    sections.push({
      properties: {
        page: {
          size: pageSize,
          margin: {
            top: tw(cover.margins.top),
            bottom: tw(cover.margins.bottom),
            left: tw(cover.margins.left),
            right: tw(cover.margins.right),
            header: 0,
            footer: tw(bottom ? cover.bottom!.distance - bottom.padBottom - HAIR : 0),
          },
        },
      },
      headers: { default: new Header({ children: [spacer(HAIR)] }) },
      footers: { default: new Footer({ children: bottom ? withTrailingParagraph(bottom.children) : [spacer(HAIR)] }) },
      children,
    });
  }
  for (const plan of plans) {
    const flow = resolveFlow(ctx, plan.items, ctx.W);
    const header = headerFor(plan.sop);
    sections.push({
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: pageSize,
          // Word line boxes run 0.8 x leading above and 0.2 x leading below Typst's, so the
          // text area moves up and gains 0.2 x leading at the bottom: the same lines fit.
          // Word snaps positions to its layout grid, so it gets BOTTOM_SLACK extra room.
          margin: { top: tw(marginTop - topShift(ctx)), bottom: tw(marginBottom - 0.2 * ctx.lead - BOTTOM_SLACK), left: tw(marginX), right: tw(marginX), header: tw(header.distance), footer: tw(footerDistance) },
        },
      },
      headers: { default: header.header },
      footers: { default: new Footer({ children: withTrailingParagraph(footerFlow().children) }) },
      children: flow.children,
    });
  }

  const families = [ctx.heading, ctx.body];
  const doc = new Document({
    creator: "PolicyCraft",
    title: model.title,
    description: `${model.company.name} SOP manual`,
    fonts: await embeddedDocumentFonts(families),
    features: options.pages ? undefined : { updateFields: true },
    styles: {
      default: {
        document: {
          run: { font: ctx.body, size: Math.round(ctx.sz.body * 2), color: hex(ctx.pal.ink) },
          paragraph: { spacing: { before: 0, after: 0 } },
        },
      },
    },
    numbering: {
      config: [...ctx.numbering].map(([reference, need]) => ({
        reference,
        levels: [{
          level: 0,
          format: need.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
          text: need.ordered ? "%1." : "•",
          alignment: AlignmentType.LEFT,
          style: {
            run: { font: ctx.body, color: hex(ctx.pal.ink), size: Math.round(ctx.sz.body * 2), bold: false },
            paragraph: { indent: { left: tw(need.left), hanging: tw(need.hanging) }, tabStops: [{ type: TabStopType.LEFT, position: tw(need.left) }] },
          },
        }],
      })),
    },
    sections,
  });
  return embedDocumentFontStyles(await finishXml((await Packer.toBuffer(doc)) as Buffer), families);
}

/**
 * XML the docx API does not expose. Typst draws standard ligatures (fi, fl);
 * Word only does when asked, through the Word 2010 run property set once in
 * the document defaults.
 */
async function finishXml(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/styles.xml");
  if (!file) return buffer;
  let styles = await file.async("string");
  if (!styles.includes('xmlns:w14="')) styles = styles.replace("<w:styles ", '<w:styles xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" ');
  styles = styles.replace(/(<w:rPrDefault><w:rPr>[\s\S]*?)(<\/w:rPr>)/, '$1<w14:ligatures w14:val="standard"/>$2');
  zip.file("word/styles.xml", styles);
  // The docx package closes each section, and each nested table, with an empty
  // paragraph at the default line height; Typst has nothing there, so it is a hairline.
  const hairline = '<w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/>';
  for (const name of Object.keys(zip.files).filter((path) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(path))) {
    const xml = await zip.file(name)!.async("string");
    zip.file(name, xml.replaceAll("<w:p><w:pPr><w:sectPr", `<w:p><w:pPr>${hairline}<w:sectPr`).replaceAll("<w:p/>", `<w:p><w:pPr>${hairline}</w:pPr></w:p>`));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Word needs a paragraph after a table that ends a header, footer or cell. */
function withTrailingParagraph(children: Array<Paragraph | Table>) {
  return children.length && children[children.length - 1] instanceof Table ? [...children, spacer(HAIR)] : children.length ? children : [spacer(HAIR)];
}
