/**
 * Reads a .docx into a flat, style-resolved stream of paragraphs and tables.
 *
 * This is the raw-XML layer under the SOP manual parser. Unlike mammoth it keeps
 * the cached TOC, bookmarks, outline levels, numbering, text boxes and the
 * header/footer part of every section, which SOP manuals rely on.
 */
import JSZip from "jszip";
import {
  attr,
  childElements,
  childVal,
  findDescendant,
  findDescendants,
  firstChild,
  isElement,
  onOff,
  parseXml,
  type XmlNode,
} from "./ooxml";

export type DocParagraph = {
  type: "paragraph";
  /** Position in the flat paragraph list (`DocxModel.paragraphs`). */
  index: number;
  text: string;
  styleId?: string;
  styleName?: string;
  /** 0-based outline level from direct formatting or the style chain; undefined for body text. */
  outlineLevel?: number;
  numId?: string;
  ilvl?: number;
  /** Numbering format of the paragraph's list level, e.g. "decimal", "bullet". */
  numFormat?: string;
  align?: string;
  /** Every visible text run is bold. */
  bold: boolean;
  /** Largest run size in half-points. */
  size?: number;
  bookmarks: string[];
  /** TOC entries: internal hyperlink anchor and TOC level (1-based). */
  tocAnchor?: string;
  tocLevel?: number;
  isToc: boolean;
  /** Paragraph sits inside a table cell. */
  table?: { tableIndex: number; row: number; col: number; rows: number; cols: number };
  fromTextBox: boolean;
  /** Section index (0-based) this paragraph belongs to. */
  section: number;
  pageBreakBefore: boolean;
};

export type DocTableCell = { paragraphs: DocParagraph[]; text: string; gridSpan: number; vMergeContinue: boolean; shaded: boolean };

export type DocTable = {
  type: "table";
  tableIndex: number;
  rows: DocTableCell[][];
  section: number;
};

export type DocBlock = DocParagraph | DocTable;

export type DocSection = {
  index: number;
  headerText: string[];
  footerText: string[];
  /** Header/footer tables as cell text grids. */
  headerTables: string[][][];
  footerTables: string[][][];
};

export type DocxModel = {
  /** Body in document order; table cells keep their paragraphs. */
  blocks: DocBlock[];
  /** All body paragraphs in order, including table-cell and text-box paragraphs. */
  paragraphs: DocParagraph[];
  sections: DocSection[];
  styles: StyleTable;
  coreTitle?: string;
};

type StyleInfo = {
  id: string;
  name: string;
  type: string;
  basedOn?: string;
  outlineLevel?: number;
  numId?: string;
  ilvl?: number;
  bold?: boolean;
  size?: number;
  align?: string;
};

export type StyleTable = {
  byId: Map<string, StyleInfo>;
  defaultParagraphStyle?: string;
  defaultSize?: number;
};

type NumberingTable = Map<string, Map<number, { format: string; text: string }>>;

const PRIVATE_USE = /[-]/g;

export async function readDocxModel(buffer: Buffer | Uint8Array | ArrayBuffer): Promise<DocxModel> {
  const zip = await JSZip.loadAsync(buffer);
  const read = async (path: string) => {
    const file = zip.file(path);
    return file ? file.async("string") : undefined;
  };

  const documentXml = await read("word/document.xml");
  if (!documentXml) throw new Error("Not a Word document: word/document.xml is missing.");

  const [stylesXml, numberingXml, relsXml, coreXml] = await Promise.all([
    read("word/styles.xml"),
    read("word/numbering.xml"),
    read("word/_rels/document.xml.rels"),
    read("docProps/core.xml"),
  ]);

  const styles = readStyles(stylesXml);
  const numbering = readNumbering(numberingXml);
  const rels = readRels(relsXml);

  const reader = new BodyReader(styles, numbering);
  const document = parseXml(documentXml);
  const body = findDescendant(document, "w:body");
  if (body) reader.readContainer(body, true);

  const sectionRefs = reader.sectionProps.map((sectPr) => ({
    header: pickReference(sectPr, "w:headerReference"),
    footer: pickReference(sectPr, "w:footerReference"),
  }));

  // Word inherits a missing header/footer reference from the previous section.
  const partCache = new Map<string, Promise<PartText>>();
  const loadPart = (relId?: string): Promise<PartText> => {
    const target = relId ? rels.get(relId) : undefined;
    if (!target) return Promise.resolve({ lines: [], tables: [] });
    let pending = partCache.get(target);
    if (!pending) {
      pending = read(`word/${target.replace(/^\/?word\//, "")}`).then((xml) => (xml ? readPartText(xml, styles, numbering) : { lines: [], tables: [] }));
      partCache.set(target, pending);
    }
    return pending;
  };

  const sections: DocSection[] = [];
  let lastHeader: string | undefined;
  let lastFooter: string | undefined;
  for (let i = 0; i < sectionRefs.length; i += 1) {
    lastHeader = sectionRefs[i].header ?? lastHeader;
    lastFooter = sectionRefs[i].footer ?? lastFooter;
    const [header, footer] = await Promise.all([loadPart(lastHeader), loadPart(lastFooter)]);
    sections.push({
      index: i,
      headerText: header.lines,
      footerText: footer.lines,
      headerTables: header.tables,
      footerTables: footer.tables,
    });
  }
  if (sections.length === 0) sections.push({ index: 0, headerText: [], footerText: [], headerTables: [], footerTables: [] });

  const coreTitle = coreXml ? textOf(findDescendant(parseXml(coreXml), "dc:title")) : undefined;

  return { blocks: reader.blocks, paragraphs: reader.paragraphs, sections, styles, coreTitle: coreTitle?.trim() || undefined };
}

function pickReference(sectPr: XmlNode, name: string): string | undefined {
  const refs = childElements(sectPr, name);
  const byType = (type: string) => refs.find((ref) => attr(ref, "w:type") === type);
  const chosen = byType("default") ?? byType("first") ?? refs[0];
  return chosen ? attr(chosen, "r:id") : undefined;
}

type PartText = { lines: string[]; tables: string[][][] };

function readPartText(xml: string, styles: StyleTable, numbering: NumberingTable): PartText {
  const reader = new BodyReader(styles, numbering);
  const root = parseXml(xml);
  const container = childElements(root)[0];
  if (container) reader.readContainer(container, false);
  const lines = reader.paragraphs.map((p) => p.text).filter(Boolean);
  const tables = reader.blocks
    .filter((block): block is DocTable => block.type === "table")
    .map((table) => table.rows.map((row) => row.map((cell) => cell.text)));
  return { lines, tables };
}

function readRels(xml?: string): Map<string, string> {
  const rels = new Map<string, string>();
  if (!xml) return rels;
  for (const rel of findDescendants(parseXml(xml), "Relationship")) {
    if (rel.attrs.Id && rel.attrs.Target) rels.set(rel.attrs.Id, rel.attrs.Target);
  }
  return rels;
}

function readStyles(xml?: string): StyleTable {
  const byId = new Map<string, StyleInfo>();
  const table: StyleTable = { byId };
  if (!xml) return table;
  const root = parseXml(xml);

  const docDefaults = findDescendant(root, "w:docDefaults");
  const defaultSize = childVal(findDescendant(docDefaults ?? root, "w:rPr"), "w:sz");
  if (docDefaults && defaultSize) table.defaultSize = Number(defaultSize);

  for (const style of findDescendants(root, "w:style")) {
    const id = attr(style, "w:styleId");
    if (!id) continue;
    const pPr = firstChild(style, "w:pPr");
    const rPr = firstChild(style, "w:rPr");
    const numPr = firstChild(pPr, "w:numPr");
    const outline = childVal(pPr, "w:outlineLvl");
    const info: StyleInfo = {
      id,
      name: childVal(style, "w:name") ?? id,
      type: attr(style, "w:type") ?? "paragraph",
      basedOn: childVal(style, "w:basedOn"),
      outlineLevel: outline !== undefined ? Number(outline) : undefined,
      numId: childVal(numPr, "w:numId"),
      ilvl: childVal(numPr, "w:ilvl") !== undefined ? Number(childVal(numPr, "w:ilvl")) : undefined,
      bold: onOff(rPr, "w:b"),
      size: childVal(rPr, "w:sz") !== undefined ? Number(childVal(rPr, "w:sz")) : undefined,
      align: childVal(pPr, "w:jc"),
    };
    byId.set(id, info);
    if (info.type === "paragraph" && attr(style, "w:default") === "1") table.defaultParagraphStyle = id;
  }
  return table;
}

/** Walks the basedOn chain and returns the first defined value. */
function styleProp<K extends keyof StyleInfo>(styles: StyleTable, styleId: string | undefined, key: K): StyleInfo[K] | undefined {
  let current = styleId ? styles.byId.get(styleId) : undefined;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current[key] !== undefined) return current[key];
    current = current.basedOn ? styles.byId.get(current.basedOn) : undefined;
  }
  return undefined;
}

function readNumbering(xml?: string): NumberingTable {
  const table: NumberingTable = new Map();
  if (!xml) return table;
  const root = parseXml(xml);
  const abstracts = new Map<string, Map<number, { format: string; text: string }>>();
  for (const abstract of findDescendants(root, "w:abstractNum")) {
    const levels = new Map<number, { format: string; text: string }>();
    for (const level of childElements(abstract, "w:lvl")) {
      levels.set(Number(attr(level, "w:ilvl") ?? 0), {
        format: childVal(level, "w:numFmt") ?? "decimal",
        text: childVal(level, "w:lvlText") ?? "",
      });
    }
    const id = attr(abstract, "w:abstractNumId");
    if (id !== undefined) abstracts.set(id, levels);
  }
  for (const num of findDescendants(root, "w:num")) {
    const id = attr(num, "w:numId");
    const abstractId = childVal(num, "w:abstractNumId");
    if (id && abstractId !== undefined && abstracts.has(abstractId)) table.set(id, abstracts.get(abstractId)!);
  }
  return table;
}

function textOf(node?: XmlNode): string {
  if (!node) return "";
  let out = "";
  for (const child of node.children) out += typeof child === "string" ? child : textOf(child);
  return out;
}

type Field = { instr: string; isToc: boolean };

type RunState = {
  text: string;
  boldChars: number;
  visibleChars: number;
  size?: number;
  bookmarks: string[];
  anchor?: string;
  textBoxes: XmlNode[];
};

/** Elements whose content is never visible text. */
const SKIP_ELEMENTS = new Set([
  "w:del",
  "w:moveFrom",
  "w:delText",
  "w:instrText",
  "w:delInstrText",
  "w:rPr",
  "w:pPr",
  "w:tblPr",
  "w:trPr",
  "w:tcPr",
  "w:sectPr",
  "w:footnoteReference",
  "w:endnoteReference",
  "w:commentReference",
  "mc:Fallback",
  "w:sdtPr",
  "w:sdtEndPr",
  "w:proofErr",
  "w:lastRenderedPageBreak",
]);

class BodyReader {
  blocks: DocBlock[] = [];
  paragraphs: DocParagraph[] = [];
  sectionProps: XmlNode[] = [];
  private section = 0;
  private tableCount = 0;
  private fields: Field[] = [];

  constructor(private styles: StyleTable, private numbering: NumberingTable) {}

  /** Reads block-level content (body, cell, text box, sdtContent). */
  readContainer(node: XmlNode, isBody: boolean, sink: DocBlock[] = this.blocks, cellContext?: DocParagraph["table"], fromTextBox = false) {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      switch (child.name) {
        case "w:p": {
          const produced = this.readParagraph(child, cellContext, fromTextBox);
          for (const p of produced) sink.push(p);
          break;
        }
        case "w:tbl":
          sink.push(this.readTable(child, fromTextBox));
          break;
        case "w:sectPr":
          if (isBody) this.sectionProps.push(child);
          break;
        case "w:sdt": {
          const content = firstChild(child, "w:sdtContent");
          if (content) this.readContainer(content, isBody, sink, cellContext, fromTextBox);
          break;
        }
        case "w:customXml":
        case "w:ins":
        case "w:moveTo":
        case "mc:AlternateContent": {
          const inner = child.name === "mc:AlternateContent" ? firstChild(child, "mc:Choice") : child;
          if (inner) this.readContainer(inner, isBody, sink, cellContext, fromTextBox);
          break;
        }
        default:
          break;
      }
    }
  }

  private readTable(tbl: XmlNode, fromTextBox: boolean): DocTable {
    const tableIndex = this.tableCount++;
    const table: DocTable = { type: "table", tableIndex, rows: [], section: this.section };
    const rowNodes = collectRows(tbl);
    const rowCount = rowNodes.length;
    rowNodes.forEach((tr, rowIndex) => {
      const cells = collectCells(tr);
      const row: DocTableCell[] = [];
      cells.forEach((tc, colIndex) => {
        const tcPr = firstChild(tc, "w:tcPr");
        const vMerge = firstChild(tcPr, "w:vMerge");
        const shd = firstChild(tcPr, "w:shd");
        const fill = shd ? attr(shd, "w:fill") : undefined;
        const blocks: DocBlock[] = [];
        this.readContainer(tc, false, blocks, { tableIndex, row: rowIndex, col: colIndex, rows: rowCount, cols: cells.length }, fromTextBox);
        const paragraphs = flattenParagraphs(blocks);
        row.push({
          paragraphs,
          text: paragraphs.map((p) => p.text).filter(Boolean).join("\n"),
          gridSpan: Number(childVal(tcPr, "w:gridSpan") ?? 1),
          vMergeContinue: Boolean(vMerge) && attr(vMerge, "w:val") !== "restart",
          shaded: Boolean(fill && fill !== "auto" && fill.toUpperCase() !== "FFFFFF"),
        });
      });
      table.rows.push(row);
    });
    return table;
  }

  private readParagraph(p: XmlNode, cellContext: DocParagraph["table"], fromTextBox: boolean): DocParagraph[] {
    const pPr = firstChild(p, "w:pPr");
    const styleId = childVal(pPr, "w:pStyle") ?? this.styles.defaultParagraphStyle;
    const style = styleId ? this.styles.byId.get(styleId) : undefined;
    const numPr = firstChild(pPr, "w:numPr");
    const directOutline = childVal(pPr, "w:outlineLvl");
    const numId = childVal(numPr, "w:numId") ?? styleProp(this.styles, styleId, "numId");
    const ilvlRaw = childVal(numPr, "w:ilvl");
    const ilvl = ilvlRaw !== undefined ? Number(ilvlRaw) : styleProp(this.styles, styleId, "ilvl") ?? 0;
    const outlineRaw = directOutline !== undefined ? Number(directOutline) : styleProp(this.styles, styleId, "outlineLevel");
    const outlineLevel = outlineRaw !== undefined && outlineRaw < 9 ? outlineRaw : undefined;
    const level = numId && numId !== "0" ? this.numbering.get(numId)?.get(ilvl) : undefined;

    const fieldTocAtStart = this.fields.some((field) => field.isToc);
    const state: RunState = { text: "", boldChars: 0, visibleChars: 0, bookmarks: [], textBoxes: [] };
    const paragraphBold = styleProp(this.styles, styleId, "bold") ?? false;
    const paragraphSize = styleProp(this.styles, styleId, "size") ?? this.styles.defaultSize;
    this.readInline(p, state, paragraphBold, paragraphSize);
    const inTocField = fieldTocAtStart || this.fields.some((field) => field.isToc);

    const styleName = style?.name;
    const tocStyle = styleName ? /^toc\s*(\d)/i.exec(styleName) : null;
    const text = normalizeText(state.text);
    const isToc = Boolean(tocStyle) || (inTocField && Boolean(state.anchor || /\t\s*\d+\s*$/.test(state.text)));

    const paragraph: DocParagraph = {
      type: "paragraph",
      index: -1,
      text,
      styleId,
      styleName,
      outlineLevel,
      numId: numId && numId !== "0" ? numId : undefined,
      ilvl: numId && numId !== "0" ? ilvl : undefined,
      numFormat: level?.format,
      align: childVal(pPr, "w:jc") ?? styleProp(this.styles, styleId, "align"),
      bold: state.visibleChars > 0 && state.boldChars >= state.visibleChars,
      size: state.size ?? paragraphSize,
      bookmarks: state.bookmarks,
      tocAnchor: isToc ? state.anchor : undefined,
      tocLevel: isToc ? (tocStyle ? Number(tocStyle[1]) : undefined) : undefined,
      isToc,
      table: cellContext,
      fromTextBox,
      section: this.section,
      pageBreakBefore: Boolean(onOff(pPr, "w:pageBreakBefore")),
    };
    if (isToc) paragraph.text = stripTocPageNumber(state.text);

    paragraph.index = this.paragraphs.length;
    this.paragraphs.push(paragraph);

    const produced: DocParagraph[] = [paragraph];
    for (const box of state.textBoxes) {
      const boxBlocks: DocBlock[] = [];
      this.readContainer(box, false, boxBlocks, cellContext, true);
      produced.push(...flattenParagraphs(boxBlocks));
    }

    // A paragraph-level sectPr closes the current section.
    const sectPr = firstChild(pPr, "w:sectPr");
    if (sectPr && !cellContext && !fromTextBox) {
      this.sectionProps.push(sectPr);
      this.section += 1;
    }
    return produced;
  }

  private readInline(node: XmlNode, state: RunState, paragraphBold: boolean, paragraphSize: number | undefined) {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      if (SKIP_ELEMENTS.has(child.name)) continue;
      switch (child.name) {
        case "w:r":
          this.readRun(child, state, paragraphBold, paragraphSize);
          break;
        case "w:bookmarkStart": {
          const name = attr(child, "w:name");
          if (name) state.bookmarks.push(name);
          break;
        }
        case "w:hyperlink": {
          const anchor = attr(child, "w:anchor");
          if (anchor && !state.anchor) state.anchor = anchor;
          this.readInline(child, state, paragraphBold, paragraphSize);
          break;
        }
        case "w:fldSimple": {
          const instr = attr(child, "w:instr") ?? "";
          if (/^\s*TOC\b/i.test(instr)) this.fields.push({ instr, isToc: true });
          this.readInline(child, state, paragraphBold, paragraphSize);
          break;
        }
        case "mc:AlternateContent": {
          const choice = firstChild(child, "mc:Choice");
          if (choice) this.readInline(choice, state, paragraphBold, paragraphSize);
          break;
        }
        default:
          this.readInline(child, state, paragraphBold, paragraphSize);
      }
    }
  }

  private readRun(run: XmlNode, state: RunState, paragraphBold: boolean, paragraphSize: number | undefined) {
    const rPr = firstChild(run, "w:rPr");
    if (onOff(rPr, "w:vanish") && !onOff(rPr, "w:webHidden")) return;
    const runStyle = childVal(rPr, "w:rStyle");
    const bold = onOff(rPr, "w:b") ?? styleProp(this.styles, runStyle, "bold") ?? paragraphBold;
    const sizeRaw = childVal(rPr, "w:sz");
    const size = sizeRaw !== undefined ? Number(sizeRaw) : styleProp(this.styles, runStyle, "size") ?? paragraphSize;

    let piece = "";
    const visit = (node: XmlNode) => {
      for (const child of node.children) {
        if (!isElement(child)) continue;
        switch (child.name) {
          case "w:t":
            piece += textOf(child);
            break;
          case "w:tab":
          case "w:ptab":
            piece += "\t";
            break;
          case "w:br":
          case "w:cr":
            piece += "\n";
            break;
          case "w:noBreakHyphen":
            piece += "-";
            break;
          case "w:softHyphen":
            break;
          case "w:sym": {
            const code = parseInt(attr(child, "w:char") ?? "", 16);
            // Symbol-font glyphs live in the private-use area; keep only real characters.
            if (Number.isFinite(code) && (code < 0xe000 || code > 0xf8ff)) piece += String.fromCodePoint(code);
            break;
          }
          case "w:fldChar": {
            const type = attr(child, "w:fldCharType");
            if (type === "begin") this.fields.push({ instr: "", isToc: false });
            else if (type === "end") this.fields.pop();
            break;
          }
          case "w:instrText": {
            const field = this.fields[this.fields.length - 1];
            if (field) {
              field.instr += textOf(child);
              if (/^\s*TOC\b/i.test(field.instr)) field.isToc = true;
            }
            break;
          }
          case "w:txbxContent":
            state.textBoxes.push(child);
            break;
          case "mc:AlternateContent": {
            const choice = firstChild(child, "mc:Choice");
            if (choice) visit(choice);
            break;
          }
          default:
            if (!SKIP_ELEMENTS.has(child.name) || child.name === "w:instrText") visit(child);
        }
      }
    };
    visit(run);

    if (!piece) return;
    state.text += piece;
    const visible = piece.replace(/\s+/g, "").replace(PRIVATE_USE, "").length;
    state.visibleChars += visible;
    if (bold) state.boldChars += visible;
    if (visible > 0 && size !== undefined && (state.size === undefined || size > state.size)) state.size = size;
  }
}

function collectRows(tbl: XmlNode): XmlNode[] {
  const rows: XmlNode[] = [];
  for (const child of childElements(tbl)) {
    if (child.name === "w:tr") rows.push(child);
    else if (child.name === "w:sdt" || child.name === "w:customXml" || child.name === "w:ins") {
      const inner = child.name === "w:sdt" ? firstChild(child, "w:sdtContent") : child;
      if (inner) rows.push(...collectRows(inner));
    }
  }
  return rows;
}

function collectCells(tr: XmlNode): XmlNode[] {
  const cells: XmlNode[] = [];
  for (const child of childElements(tr)) {
    if (child.name === "w:tc") cells.push(child);
    else if (child.name === "w:sdt" || child.name === "w:customXml") {
      const inner = child.name === "w:sdt" ? firstChild(child, "w:sdtContent") : child;
      if (inner) cells.push(...collectCells(inner));
    }
  }
  return cells;
}

export function flattenParagraphs(blocks: DocBlock[]): DocParagraph[] {
  const out: DocParagraph[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") out.push(block);
    else for (const row of block.rows) for (const cell of row) out.push(...cell.paragraphs);
  }
  return out;
}

/** Collapses whitespace, drops private-use glyphs (Wingdings bullets) and zero-width marks. */
export function normalizeText(value: string): string {
  return value
    .replace(PRIVATE_USE, "")
    .replace(/[​-‍﻿­]/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Removes the trailing page number (and dot leader) from a cached TOC entry. */
export function stripTocPageNumber(raw: string): string {
  let value = raw.replace(PRIVATE_USE, "");
  const lastTab = value.lastIndexOf("\t");
  if (lastTab !== -1 && /^\s*[\divxlcdmIVXLCDM]*\s*$/.test(value.slice(lastTab + 1))) {
    value = value.slice(0, lastTab);
  } else {
    value = value.replace(/(?:\s*\.{2,}\s*|\s+)\d+\s*$/, "");
  }
  return normalizeText(value.replace(/\.{3,}\s*$/, ""));
}
