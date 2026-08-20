import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextDirection,
  TextRun,
  VerticalAlign,
  WidthType,
  type ParagraphChild,
} from "docx";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildDocumentRenderModel, type DocumentRenderModel, type DocumentRenderSection } from "../document-render-model";
import { documentHex, type DocumentThemeDefinition } from "../document-themes";
import { normalizePolicyQuantitative } from "../quantitative";
import type { Policy, QuantitativeArea, RichTextBlock } from "../types";
import { DEFAULT_TYPOGRAPHY } from "../typography";

type Typography = NonNullable<Policy["typography"]>;
type DocBlock = Paragraph | Table;
type LogoImage = { data: Uint8Array; type: "png" | "jpg" } | null;

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1000;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const CELL_MARGIN = 120;

export async function generateDocx(inputPolicy: Policy): Promise<Buffer> {
  const policy = normalizePolicyQuantitative(inputPolicy);
  const model = buildDocumentRenderModel(policy);
  const { theme, typography } = model;
  const logoImage = logoFromDataUrl(policy.company.companyLogo);
  const logoAlignment = policy.logoPosition === "right" ? AlignmentType.RIGHT : policy.logoPosition === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const sdgImages = policy.sdgDisplay === "tiles" ? await loadSdgImages(policy.sdgs) : new Map<number, Uint8Array>();
  const children: DocBlock[] = [];

  children.push(...buildCover(model, logoImage, logoAlignment));
  if (policy.showTableOfContents) children.push(new Paragraph({ children: [new PageBreak()] }), ...buildToc(model));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  model.sections.forEach((section) => {
    const content = renderSectionContent(section, model, policy, sdgImages, sectionContentWidth(section, theme));
    children.push(...wrapSection(section, content, theme, typography));
  });

  children.push(
    spacer(100),
    new Paragraph({
      spacing: { before: 160, after: 120 },
      children: [
        new TextRun({ text: "Approved by: ", bold: true, font: typography.fontFamily, color: documentHex(theme.colors.primaryDark) }),
        new TextRun({ text: model.footer.approver, font: typography.fontFamily }),
      ],
    }),
  );

  if (model.acknowledgement) {
    children.push(new Paragraph({ children: [new PageBreak()] }), ...buildAcknowledgement(model));
  }

  const primary = documentHex(theme.colors.primary);
  const ink = documentHex(theme.colors.ink);
  const doc = new Document({
    creator: "PolicyCraft",
    title: `${model.cover.policyLabel} - ${model.cover.companyName}`,
    styles: {
      default: {
        document: { run: { font: typography.fontFamily, size: Math.round(typography.paragraphSize * 2), color: ink } },
      },
      paragraphStyles: [
        {
          id: "PolicyHeading",
          name: "Policy Heading",
          basedOn: "Normal",
          next: "PolicyBody",
          quickFormat: true,
          run: { font: typography.headingFontFamily || typography.fontFamily, size: Math.round(typography.headingSize * 2), bold: true, color: primary },
          paragraph: { keepNext: true, spacing: { before: 300, after: 180 } },
        },
        {
          id: "PolicyBody",
          name: "Policy Body",
          basedOn: "Normal",
          next: "PolicyBody",
          quickFormat: true,
          run: { font: typography.fontFamily, size: Math.round(typography.paragraphSize * 2), color: ink },
          paragraph: { spacing: { after: 150, line: Math.round(240 * typography.lineSpacing) } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "policy-bullets",
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              run: { color: primary, font: typography.fontFamily },
              paragraph: { indent: { left: 420, hanging: 220 }, spacing: { after: 90, line: Math.round(240 * typography.lineSpacing) } },
            },
          }],
        },
        {
          reference: "policy-numbering",
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: {
              run: { color: primary, bold: true, font: typography.fontFamily },
              paragraph: { indent: { left: 420, hanging: 220 }, spacing: { after: 90, line: Math.round(240 * typography.lineSpacing) } },
            },
          }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: PAGE_MARGIN, right: PAGE_MARGIN, bottom: PAGE_MARGIN, left: PAGE_MARGIN },
        },
        titlePage: true,
      },
      headers: { default: buildHeader(model, logoImage, logoAlignment) },
      footers: { default: buildFooter(model) },
      children,
    }],
  });

  return (await Packer.toBuffer(doc)) as Buffer;
}

function buildCover(model: DocumentRenderModel, logo: LogoImage, logoAlignment: typeof AlignmentType[keyof typeof AlignmentType]): DocBlock[] {
  const { theme, typography, cover } = model;
  const primary = documentHex(theme.colors.primary);
  const paper = documentHex(theme.colors.paper);
  const soft = documentHex(theme.colors.soft);
  const accent = documentHex(theme.colors.accent);
  const ink = documentHex(theme.colors.ink);
  const onPrimary = documentHex(theme.colors.onPrimary);
  const logoParagraph = logo ? imageParagraph(logo, logoAlignment, 165, 76, 100) : spacer(80);

  if (theme.layout.cover === "dossier-split") {
    const railWidth = 3467;
    const bodyWidth = CONTENT_WIDTH - railWidth;
    return [
      fixedTable([
        new TableRow({
          cantSplit: true,
          children: [
            tableCell([
              new Paragraph({ children: [new TextRun({ text: "POLICY", bold: true, color: onPrimary, size: 22, characterSpacing: 80, font: typography.fontFamily })] }),
              spacer(1500),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: "BOARDROOM DOSSIER", bold: true, color: onPrimary, size: 18, characterSpacing: 80, font: typography.fontFamily })],
              }),
              spacer(900),
              new Paragraph({ children: [new TextRun({ text: "EXECUTIVE EDITION", color: onPrimary, size: 16, characterSpacing: 50, font: typography.fontFamily })] }),
            ], railWidth, { fill: primary, textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
            tableCell([
              logoParagraph,
              new Paragraph({ spacing: { before: 160, after: 240 }, children: [new TextRun({ text: "SUSTAINABILITY GOVERNANCE", bold: true, color: accent, size: 18, characterSpacing: 70, font: typography.fontFamily })] }),
              new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: cover.policyLabel, bold: true, color: ink, size: 62, font: typography.headingFontFamily || typography.fontFamily })] }),
              new Paragraph({ spacing: { after: 360 }, children: [new TextRun({ text: cover.companyName, color: documentHex(theme.colors.muted), size: 26, font: typography.fontFamily })] }),
              metadataTable(model, bodyWidth, "strip"),
            ], bodyWidth, { fill: paper }),
          ],
        }),
      ], [railWidth, bodyWidth]),
    ];
  }

  if (theme.layout.cover === "atlas-modular") {
    const left = 3000;
    const right = CONTENT_WIDTH - left;
    return [
      fixedTable([
        new TableRow({
          cantSplit: true,
          children: [tableCell([
            logoParagraph,
            new Paragraph({ spacing: { before: 180, after: 180 }, children: [new TextRun({ text: "IMPACT ATLAS - POLICY 01", bold: true, color: primary, size: 18, characterSpacing: 70, font: typography.fontFamily })] }),
            new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: cover.policyLabel, bold: true, color: ink, size: 66, font: typography.headingFontFamily || typography.fontFamily })] }),
            new Paragraph({ border: { top: border(accent, 18) }, spacing: { before: 320, after: 120 }, children: [new TextRun({ text: "A living map of commitments, ownership, and measurable targets.", color: documentHex(theme.colors.muted), size: 20, font: typography.fontFamily })] }),
          ], CONTENT_WIDTH, { fill: soft, columnSpan: 2 })],
        }),
        new TableRow({
          cantSplit: true,
          children: [
            tableCell([
              new Paragraph({ children: [new TextRun({ text: "POLICY", bold: true, color: onPrimary, size: 18, characterSpacing: 60, font: typography.fontFamily })] }),
              new Paragraph({ spacing: { before: 280, after: 160 }, children: [new TextRun({ text: "01", color: onPrimary, size: 72, font: typography.headingFontFamily || typography.fontFamily })] }),
              new Paragraph({ children: [new TextRun({ text: "LIVING COMMITMENTS", color: onPrimary, size: 15, characterSpacing: 45, font: typography.fontFamily })] }),
            ], left, { fill: primary }),
            tableCell([
              new Paragraph({ spacing: { after: 140 }, children: [new TextRun({ text: cover.companyName, bold: true, color: ink, size: 24, font: typography.fontFamily })] }),
              metadataTable(model, right, "compact"),
            ], right, { fill: paper }),
          ],
        }),
      ], [left, right]),
    ];
  }

  if (theme.layout.cover === "journal-editorial") {
    const titleWidth = 7200;
    const metaWidth = CONTENT_WIDTH - titleWidth;
    return [
      new Paragraph({ border: { top: border(accent, 22) }, spacing: { after: 100 }, children: [new TextRun({ text: " ", size: 2 })] }),
      logoParagraph,
      spacer(1000),
      fixedTable([
        new TableRow({
          cantSplit: true,
          children: [
            tableCell([
              new Paragraph({ spacing: { after: 180 }, children: [new TextRun({ text: "FIELD JOURNAL - SUSTAINABILITY POLICY", bold: true, color: accent, size: 18, characterSpacing: 65, font: typography.fontFamily })] }),
              new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: cover.policyLabel, bold: true, color: ink, size: 68, font: typography.headingFontFamily || typography.fontFamily })] }),
              new Paragraph({ border: { bottom: border(documentHex(theme.colors.line), 7) }, spacing: { after: 160 }, children: [new TextRun({ text: cover.companyName, color: documentHex(theme.colors.muted), size: 25, font: typography.fontFamily })] }),
            ], titleWidth),
            tableCell(cover.metadata.flatMap((item) => [
              new Paragraph({ border: { top: border(accent, 6) }, spacing: { before: 40, after: 35 }, children: [new TextRun({ text: item.label.toUpperCase(), bold: true, color: documentHex(theme.colors.muted), size: 14, characterSpacing: 35, font: typography.fontFamily })] }),
              new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: item.value, bold: true, color: ink, size: 18, font: typography.fontFamily })] }),
            ]), metaWidth),
          ],
        }),
      ], [titleWidth, metaWidth]),
    ];
  }

  const innerWidth = CONTENT_WIDTH - 520;
  return [
    fixedTable([
      new TableRow({
        cantSplit: true,
        children: [tableCell([
          logoParagraph,
          spacer(180),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [
              new TextRun({ text: "--------  ", color: accent, size: 14, font: typography.fontFamily }),
              new TextRun({ text: "SUSTAINABILITY CHARTER", bold: true, color: primary, size: 18, characterSpacing: 70, font: typography.fontFamily }),
              new TextRun({ text: "  --------", color: accent, size: 14, font: typography.fontFamily }),
            ],
          }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 140 }, children: [new TextRun({ text: cover.policyLabel, bold: true, color: ink, size: 64, font: typography.headingFontFamily || typography.fontFamily })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 760 }, children: [new TextRun({ text: cover.companyName, color: documentHex(theme.colors.muted), size: 26, font: typography.fontFamily })] }),
          metadataTable(model, innerWidth, "colophon"),
        ], innerWidth, {
          margins: { top: 300, bottom: 300, left: 360, right: 360 },
          borders: allBorders(primary, BorderStyle.DOUBLE, 8),
        })],
      }),
    ], [innerWidth], { width: innerWidth, alignment: AlignmentType.CENTER }),
  ];
}

function metadataTable(model: DocumentRenderModel, width: number, mode: "strip" | "compact" | "colophon") {
  const theme = model.theme;
  const columns = mode === "compact" ? 2 : 4;
  const columnWidth = Math.floor(width / columns);
  const rows = chunk(model.cover.metadata, columns).map((items) => new TableRow({
    cantSplit: true,
    children: items.map((item) => tableCell([
      new Paragraph({ spacing: { after: 25 }, children: [new TextRun({ text: item.label.toUpperCase(), bold: true, color: documentHex(theme.colors.muted), size: 13, characterSpacing: 25 })] }),
      new Paragraph({ children: [new TextRun({ text: item.value, bold: true, color: documentHex(theme.colors.ink), size: 17 })] }),
    ], columnWidth, {
      fill: mode === "strip" ? documentHex(theme.colors.soft) : undefined,
      borders: mode === "colophon" ? { top: border(documentHex(theme.colors.primary), 8) } : allBorders(documentHex(theme.colors.line), BorderStyle.SINGLE, 5),
    })),
  }));
  return fixedTable(rows, Array(columns).fill(columnWidth), { width });
}

function buildToc(model: DocumentRenderModel): DocBlock[] {
  const entries = model.acknowledgement
    ? [...model.tocEntries, { id: "acknowledgement", index: model.tocEntries.length + 1, title: model.acknowledgement.title }]
    : model.tocEntries;
  const { theme, typography } = model;
  const primary = documentHex(theme.colors.primary);
  const accent = documentHex(theme.colors.accent);
  const onPrimary = documentHex(theme.colors.onPrimary);

  if (theme.layout.toc === "rail-index") {
    const rail = 2700;
    const body = CONTENT_WIDTH - rail;
    return [fixedTable([new TableRow({ children: [
      tableCell([
        new Paragraph({ children: [new TextRun({ text: "DOCUMENT", color: onPrimary, size: 15, characterSpacing: 55, font: typography.fontFamily })] }),
        spacer(520),
        new Paragraph({ children: [new TextRun({ text: "INDEX", bold: true, color: onPrimary, size: 44, font: typography.headingFontFamily || typography.fontFamily })] }),
        spacer(580),
        new Paragraph({ children: [new TextRun({ text: `${String(entries.length).padStart(2, "0")} SECTIONS`, color: onPrimary, size: 15, characterSpacing: 45, font: typography.fontFamily })] }),
      ], rail, { fill: primary }),
      tableCell([
        new Paragraph({ spacing: { after: 280 }, children: [new TextRun({ text: "Contents", bold: true, size: 38, color: documentHex(theme.colors.ink), font: typography.headingFontFamily || typography.fontFamily })] }),
        ...entries.map((entry) => tocParagraph(entry, model, "rail")),
      ], body),
    ] })], [rail, body])];
  }

  if (theme.layout.toc === "tile-index") {
    const tileWidth = Math.floor((CONTENT_WIDTH - 180) / 2);
    const rows = chunk(entries, 2).map((pair) => new TableRow({
      cantSplit: true,
      children: [0, 1].map((slot) => {
        const entry = pair[slot];
        return entry ? tableCell([
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: String(entry.index).padStart(2, "0"), color: primary, size: 36, font: typography.headingFontFamily || typography.fontFamily })] }),
          new Paragraph({ spacing: { after: 70 }, children: [new InternalHyperlink({ anchor: entry.id, children: [new TextRun({ text: entry.title, bold: true, color: documentHex(theme.colors.ink), size: 20, font: typography.fontFamily })] })] }),
          new Paragraph({ children: [new TextRun({ text: "SECTION", color: documentHex(theme.colors.muted), size: 13, characterSpacing: 35, font: typography.fontFamily })] }),
        ], tileWidth, { fill: documentHex(theme.colors.soft), margins: { top: 180, bottom: 180, left: 190, right: 190 } }) : tableCell([new Paragraph("")], tileWidth);
      }),
    }));
    return [
      new Paragraph({ spacing: { after: 90 }, children: [new TextRun({ text: "NAVIGATE THE POLICY", bold: true, color: primary, size: 16, characterSpacing: 60, font: typography.fontFamily })] }),
      new Paragraph({ spacing: { after: 260 }, children: [new TextRun({ text: "Contents", bold: true, color: documentHex(theme.colors.ink), size: 42, font: typography.headingFontFamily || typography.fontFamily })] }),
      fixedTable(rows, [tileWidth, tileWidth], { width: tileWidth * 2, cellSpacing: 120 }),
    ];
  }

  if (theme.layout.toc === "editorial-index") {
    const half = Math.floor((CONTENT_WIDTH - 240) / 2);
    const columns = [entries.filter((_, index) => index % 2 === 0), entries.filter((_, index) => index % 2 === 1)];
    return [
      new Paragraph({ border: { top: border(accent, 18) }, spacing: { after: 100 }, children: [new TextRun({ text: "INDEX", bold: true, color: accent, size: 15, characterSpacing: 60, font: typography.fontFamily })] }),
      new Paragraph({ spacing: { after: 360 }, children: [new TextRun({ text: "Inside this policy", bold: true, color: documentHex(theme.colors.ink), size: 44, font: typography.headingFontFamily || typography.fontFamily })] }),
      fixedTable([new TableRow({ children: columns.map((column) => tableCell(column.map((entry) => tocParagraph(entry, model, "editorial")), half)) })], [half, half], { width: half * 2, cellSpacing: 160 }),
    ];
  }

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({ text: "--------  ", color: accent, size: 14 }),
        new TextRun({ text: "CONTENTS", bold: true, color: primary, size: 32, characterSpacing: 65, font: typography.headingFontFamily || typography.fontFamily }),
        new TextRun({ text: "  --------", color: accent, size: 14 }),
      ],
    }),
    ...entries.map((entry) => tocParagraph(entry, model, "leaders")),
  ];
}

function tocParagraph(entry: { id: string; index: number; title: string }, model: DocumentRenderModel, mode: "leaders" | "rail" | "editorial") {
  const { theme, typography } = model;
  const numberSize = mode === "editorial" ? 30 : 20;
  return new Paragraph({
    border: { bottom: border(documentHex(theme.colors.line), mode === "leaders" ? 3 : 5, mode === "leaders" ? BorderStyle.DOTTED : BorderStyle.SINGLE) },
    spacing: { before: mode === "editorial" ? 100 : 60, after: mode === "editorial" ? 120 : 95 },
    children: [new InternalHyperlink({
      anchor: entry.id,
      children: [
        new TextRun({ text: `${String(entry.index).padStart(2, "0")}   `, bold: true, color: mode === "rail" ? documentHex(theme.colors.accent) : documentHex(theme.colors.primary), size: numberSize, font: typography.headingFontFamily || typography.fontFamily }),
        new TextRun({ text: entry.title, color: documentHex(theme.colors.ink), size: 20, font: typography.fontFamily }),
      ],
    })],
  });
}

function wrapSection(section: DocumentRenderSection, content: DocBlock[], theme: DocumentThemeDefinition, typography: Typography): DocBlock[] {
  const frame = theme.layout.pageFrame;
  const title = sectionTitle(section, typography, theme);
  if (frame === "numbered-rail" && section.density !== "dense") {
    const rail = 1100;
    const body = CONTENT_WIDTH - rail;
    return [fixedTable([new TableRow({ children: [
      tableCell([
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(section.index).padStart(2, "0"), color: documentHex(theme.colors.onPrimary), size: 46, font: typography.headingFontFamily || typography.fontFamily })] }),
        spacer(300),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: section.kind.toUpperCase(), color: documentHex(theme.colors.onPrimary), size: 13, characterSpacing: 40, font: typography.fontFamily })] }),
      ], rail, { fill: documentHex(theme.colors.primary), textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
      tableCell([title, ...content, spacer(80)], body, { margins: { top: 180, bottom: 210, left: 260, right: 180 } }),
    ] })], [rail, body]), spacer(70)];
  }
  if (frame === "editorial-margin" && section.density !== "dense") {
    const margin = 1550;
    const body = CONTENT_WIDTH - margin;
    return [fixedTable([new TableRow({ children: [
      tableCell([
        new Paragraph({ children: [new TextRun({ text: String(section.index).padStart(2, "0"), color: documentHex(theme.colors.accent), size: 62, font: typography.headingFontFamily || typography.fontFamily })] }),
        new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: section.kind.toUpperCase(), color: documentHex(theme.colors.muted), size: 13, characterSpacing: 45, font: typography.fontFamily })] }),
      ], margin),
      tableCell([title, ...content, spacer(90)], body, { margins: { top: 0, bottom: 120, left: 100, right: 0 } }),
    ] })], [margin, body]), spacer(100)];
  }
  return [title, ...content, spacer(frame === "modular-grid" ? 80 : 120)];
}

function sectionTitle(section: DocumentRenderSection, typography: Typography, theme: DocumentThemeDefinition) {
  const layout = theme.layout.sectionOpener;
  const primary = documentHex(theme.colors.primary);
  const accent = documentHex(theme.colors.accent);
  const onPrimary = documentHex(theme.colors.onPrimary);
  const children: ParagraphChild[] = [new Bookmark({ id: section.id, children: [] })];
  const number = String(section.index).padStart(2, "0");
  if (layout === "formal-ordinal") {
    children.push(new TextRun({ text: `${section.title.toUpperCase()}  -  ${number}`, bold: true, color: primary, size: Math.round(typography.headingSize * 2), characterSpacing: 45, font: typography.headingFontFamily || typography.fontFamily }));
    return new Paragraph({ style: "PolicyHeading", alignment: AlignmentType.CENTER, border: { bottom: border(accent, 6) }, spacing: { before: 300, after: 180 }, children });
  }
  if (layout === "statement-band") {
    children.push(new TextRun({ text: `${number}   ${section.title.toUpperCase()}`, bold: true, color: onPrimary, size: Math.round(typography.headingSize * 2), characterSpacing: 35, font: typography.headingFontFamily || typography.fontFamily }));
    return new Paragraph({ style: "PolicyHeading", shading: { type: ShadingType.SOLID, color: primary, fill: primary }, spacing: { before: 220, after: 180 }, indent: { left: 170, right: 170 }, children });
  }
  if (layout === "chapter-number") {
    children.push(new TextRun({ text: section.title, bold: true, italics: true, color: documentHex(theme.colors.primaryDark), size: Math.round(typography.headingSize * 2), font: typography.headingFontFamily || typography.fontFamily }));
    return new Paragraph({ style: "PolicyHeading", border: { top: border(accent, 12) }, spacing: { before: 260, after: 190 }, children });
  }
  children.push(new TextRun({ text: section.title, bold: true, color: primary, size: Math.round(typography.headingSize * 2), font: typography.headingFontFamily || typography.fontFamily }));
  return new Paragraph({ style: "PolicyHeading", border: { bottom: border(primary, 12) }, spacing: { before: 240, after: 180 }, children });
}

function sectionContentWidth(section: DocumentRenderSection, theme: DocumentThemeDefinition) {
  if (section.density === "dense") return CONTENT_WIDTH;
  if (theme.layout.pageFrame === "numbered-rail") return CONTENT_WIDTH - 1100 - 440;
  if (theme.layout.pageFrame === "editorial-margin") return CONTENT_WIDTH - 1550 - 100;
  return CONTENT_WIDTH;
}

function renderSectionContent(section: DocumentRenderSection, model: DocumentRenderModel, policy: Policy, sdgImages: Map<number, Uint8Array>, availableWidth: number): DocBlock[] {
  const { content } = section;
  switch (content.type) {
    case "narrative": return [
      ...bodyParagraphs(content.text, model.typography, model.theme.layout.pageFrame === "editorial-margin"),
      ...(content.sites?.length ? [dataTable(
        ["Location / Unit", "Address", "Primary Function"],
        content.sites.map((site, index) => [site.location || `Site ${index + 1}`, site.address, site.primaryFunction || "Operating Site"]),
        scaledWidths([2400, 5000, 2506], availableWidth), model.theme,
      )] : []),
    ];
    case "focus": return renderFocus(content.areas, section, model, availableWidth);
    case "qualitative": return renderQualitative(content.groups, section, model, availableWidth);
    case "quantitative": return renderQuantitative(content.areas, section, model, policy, availableWidth);
    case "sdg": return renderSdgs(content.goals, model, policy, sdgImages, availableWidth);
    case "responsibilities": return renderResponsibilities(content.entries, section, model, policy, availableWidth);
    case "revision": return [dataTable(
      ["Revision No.", "Date", "Description of Change"],
      content.entries.map((entry) => [entry.revisionNo, entry.date, entry.description]),
      scaledWidths([1800, 2200, 5906], availableWidth), model.theme,
    )];
    case "custom": return renderCustomBlocks(content.blocks, model, availableWidth);
  }
}

function renderFocus(areas: string[], section: DocumentRenderSection, model: DocumentRenderModel, availableWidth: number): DocBlock[] {
  const layout = model.theme.layout.pageFrame;
  if ((layout === "numbered-rail" || layout === "modular-grid") && section.density !== "dense") {
    return [pairedCards(areas.map((area, index) => numberedCard(index + 1, area, model, layout === "modular-grid")), availableWidth, model.theme, layout === "modular-grid")];
  }
  return areas.map((area, index) => entryRow(String(index + 1).padStart(2, "0"), area, availableWidth, model.theme, layout === "editorial-margin"));
}

function renderQualitative(groups: { area: string; items: string[] }[], section: DocumentRenderSection, model: DocumentRenderModel, availableWidth: number): DocBlock[] {
  const layout = model.theme.layout.pageFrame;
  const cards = groups.map((group, index) => [
    new Paragraph({ spacing: { after: 90 }, children: [
      new TextRun({ text: `${String(index + 1).padStart(2, "0")}  `, bold: true, color: documentHex(model.theme.colors.primary), size: 18, font: model.typography.fontFamily }),
      new TextRun({ text: group.area, bold: true, color: documentHex(model.theme.colors.ink), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily }),
    ] }),
    ...group.items.map((item) => listParagraph(item, "bullet", model.typography, model.theme)),
  ]);
  if ((layout === "numbered-rail" || layout === "modular-grid") && section.density !== "dense") {
    return [pairedCards(cards, availableWidth, model.theme, layout === "modular-grid")];
  }
  return cards.flatMap((card) => [...card, spacer(70)]);
}

function renderQuantitative(areas: QuantitativeArea[], section: DocumentRenderSection, model: DocumentRenderModel, policy: Policy, availableWidth: number): DocBlock[] {
  const targets = areas.flatMap((area) => area.targets.filter((target) => target.target).map((target) => ({ ...target, area: area.area })));
  const intro = new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Targets are tracked against a defined period or reported annually as ongoing commitments.", italics: true, color: documentHex(model.theme.colors.muted), size: 17, font: model.typography.fontFamily })] });
  if (model.theme.layout.dataLayout === "target-bands" && policy.visualStyle !== "corporate" && section.density !== "dense") {
    return [intro, ...targets.map((target, index) => targetBand(target, index + 1, model, availableWidth))];
  }
  if (model.theme.layout.dataLayout === "quiet-rules" && policy.visualStyle !== "corporate" && section.density !== "dense") {
    return [intro, ...targets.map((target) => journalTarget(target, model))];
  }
  return [intro, dataTable(
    ["#", "Focus Area", "Target", "Baseline", "Deadline", "Reporting"],
    targets.map((target, index) => [String(index + 1), target.area, target.target, target.reportingFrequency === "Annually" ? "-" : target.baseline, target.reportingFrequency === "Annually" ? "-" : target.deadline, target.reportingFrequency || "Target period"]),
    scaledWidths([450, 1800, 3300, 1250, 1250, 1856], availableWidth), model.theme,
  )];
}

function renderResponsibilities(entries: Policy["responsibilities"], section: DocumentRenderSection, model: DocumentRenderModel, policy: Policy, availableWidth: number): DocBlock[] {
  if (model.theme.layout.dataLayout === "formal-grid" && policy.visualStyle === "corporate") {
    return [dataTable(["Role / Department", "Responsibility"], entries.map((entry) => [entry.role, entry.duty]), scaledWidths([3000, 6906], availableWidth), model.theme)];
  }
  const cards = entries.map((entry, index) => numberedCard(index + 1, `${entry.role}\n${entry.duty}`, model, model.theme.layout.pageFrame === "modular-grid", true));
  if ((model.theme.layout.pageFrame === "numbered-rail" || model.theme.layout.pageFrame === "modular-grid") && section.density !== "dense") {
    return [pairedCards(cards, availableWidth, model.theme, model.theme.layout.pageFrame === "modular-grid")];
  }
  return entries.map((entry, index) => entryRow(String(index + 1).padStart(2, "0"), `${entry.role}\n${entry.duty}`, availableWidth, model.theme, model.theme.layout.pageFrame === "editorial-margin", true));
}

function renderSdgs(goals: { number: number; label: string; color: string }[], model: DocumentRenderModel, policy: Policy, images: Map<number, Uint8Array>, availableWidth: number): DocBlock[] {
  const intro = new Paragraph({ spacing: { after: 130 }, children: [new TextRun({ text: "This policy aligns with the following United Nations Sustainable Development Goals:", font: model.typography.fontFamily })] });
  if (policy.sdgDisplay === "tiles" && goals.every((goal) => images.has(goal.number))) {
    const columns = model.theme.layout.dataLayout === "target-bands" ? 3 : 4;
    const width = Math.floor(availableWidth / columns);
    const rows = chunk(goals, columns).map((row) => new TableRow({ cantSplit: true, children: Array.from({ length: columns }, (_, index) => {
      const goal = row[index];
      if (!goal) return tableCell([new Paragraph("")], width);
      return tableCell([
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: images.get(goal.number)!, type: "jpg", transformation: { width: 92, height: 92 } })] }),
        ...(model.theme.layout.dataLayout === "target-bands" ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: goal.label, bold: true, color: documentHex(model.theme.colors.ink), size: 14, font: model.typography.fontFamily })] })] : []),
      ], width, { fill: model.theme.layout.dataLayout === "target-bands" ? documentHex(model.theme.colors.soft) : undefined, margins: { top: 100, bottom: 100, left: 80, right: 80 } });
    }) }));
    return [intro, fixedTable(rows, Array(columns).fill(width))];
  }
  return [intro, ...goals.map((goal) => fixedTable([new TableRow({ children: [
    tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `SDG ${goal.number}`, bold: true, color: "FFFFFF", size: 17 })] })], 1400, { fill: documentHex(goal.color) }),
    tableCell([new Paragraph({ children: [new TextRun({ text: goal.label, bold: true, color: documentHex(goal.color), size: 19, font: model.typography.fontFamily })] })], availableWidth - 1400),
  ] })], [1400, availableWidth - 1400]))];
}

function renderCustomBlocks(blocks: RichTextBlock[], model: DocumentRenderModel, availableWidth: number): DocBlock[] {
  return blocks.flatMap((block) => {
    if (block.type === "paragraph") return bodyParagraphs(block.text, model.typography, model.theme.layout.pageFrame === "editorial-margin");
    if (block.type === "table") {
      const columns = block.columns || [];
      if (!columns.length) return [];
      const width = Math.floor(availableWidth / columns.length);
      return [dataTable(columns, block.rows || [], Array(columns.length).fill(width), model.theme)];
    }
    return block.text.split(/\r?\n+/).filter(Boolean).map((item) => listParagraph(item, block.type === "bullets" ? "bullet" : "number", model.typography, model.theme));
  });
}

function targetBand(target: { area: string; target: string; baseline: string; deadline: string; reportingFrequency?: string }, index: number, model: DocumentRenderModel, availableWidth: number) {
  const numberWidth = 750;
  const metaWidth = 1900;
  const bodyWidth = availableWidth - numberWidth - metaWidth;
  return fixedTable([new TableRow({ cantSplit: true, children: [
    tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(index).padStart(2, "0"), color: documentHex(model.theme.colors.primary), size: 30, font: model.typography.headingFontFamily || model.typography.fontFamily })] })], numberWidth, { fill: documentHex(model.theme.colors.soft) }),
    tableCell([
      new Paragraph({ spacing: { after: 55 }, children: [new TextRun({ text: target.area, bold: true, color: documentHex(model.theme.colors.primaryDark), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily })] }),
      new Paragraph({ children: [new TextRun({ text: target.target, size: Math.round(model.typography.paragraphSize * 2), font: model.typography.fontFamily })] }),
    ], bodyWidth, { fill: documentHex(model.theme.colors.soft), borders: { left: border(documentHex(model.theme.colors.line), 5), right: border(documentHex(model.theme.colors.line), 5) } }),
    tableCell([
      new Paragraph({ children: [new TextRun({ text: target.reportingFrequency === "Annually" ? "REPORTED ANNUALLY" : target.deadline || "TARGET PERIOD", bold: true, size: 14, color: documentHex(model.theme.colors.ink), font: model.typography.fontFamily })] }),
      new Paragraph({ spacing: { before: 45 }, children: [new TextRun({ text: target.reportingFrequency === "Annually" ? "Ongoing" : target.baseline || "No baseline", color: documentHex(model.theme.colors.muted), size: 14, font: model.typography.fontFamily })] }),
    ], metaWidth, { fill: documentHex(model.theme.colors.soft) }),
  ] })], [numberWidth, bodyWidth, metaWidth]);
}

function journalTarget(target: { area: string; target: string; baseline: string; deadline: string; reportingFrequency?: string }, model: DocumentRenderModel) {
  return new Paragraph({
    border: { top: border(documentHex(model.theme.colors.line), 5) },
    spacing: { before: 90, after: 120 },
    children: [
      new TextRun({ text: `${target.area}\n`, bold: true, color: documentHex(model.theme.colors.accent), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily }),
      new TextRun({ text: `${target.target}\n`, size: Math.round(model.typography.paragraphSize * 2), font: model.typography.fontFamily }),
      new TextRun({ text: target.reportingFrequency === "Annually" ? "Reported annually" : `Baseline ${target.baseline || "-"} - Due ${target.deadline || "-"}`, italics: true, color: documentHex(model.theme.colors.muted), size: 16, font: model.typography.fontFamily }),
    ],
  });
}

function numberedCard(index: number, text: string, model: DocumentRenderModel, filled: boolean, splitRole = false): DocBlock[] {
  const [title, ...rest] = text.split("\n");
  return [
    new Paragraph({ spacing: { after: 70 }, children: [
      new TextRun({ text: String(index).padStart(2, "0"), color: documentHex(model.theme.colors.primary), size: filled ? 30 : 20, font: model.typography.headingFontFamily || model.typography.fontFamily }),
      new TextRun({ text: `  ${title}`, bold: true, color: documentHex(model.theme.colors.ink), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily }),
    ] }),
    ...(splitRole && rest.length ? [new Paragraph({ children: [new TextRun({ text: rest.join(" "), size: Math.round(model.typography.paragraphSize * 2), font: model.typography.fontFamily })] })] : []),
  ];
}

function pairedCards(cards: (DocBlock[] | string)[], width: number, theme: DocumentThemeDefinition, filled: boolean) {
  const gap = 160;
  const cardWidth = Math.floor((width - gap) / 2);
  const rows = chunk(cards, 2).map((pair) => new TableRow({
    cantSplit: true,
    children: [0, 1].map((index) => {
      const card = pair[index];
      const contents = typeof card === "string" ? [new Paragraph(card)] : card || [new Paragraph("")];
      return tableCell(contents, cardWidth, {
        fill: filled ? documentHex(theme.colors.soft) : undefined,
        borders: filled ? noBorders() : allBorders(documentHex(theme.colors.line), BorderStyle.SINGLE, 5),
        margins: { top: 150, bottom: 150, left: 170, right: 170 },
      });
    }),
  }));
  return fixedTable(rows, [cardWidth, cardWidth], { width: cardWidth * 2, cellSpacing: gap / 2 });
}

function entryRow(number: string, text: string, width: number, theme: DocumentThemeDefinition, editorial = false, splitRole = false) {
  const numberWidth = editorial ? 900 : 700;
  const [title, ...rest] = text.split("\n");
  return fixedTable([new TableRow({ cantSplit: true, children: [
    tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: number, bold: !editorial, color: documentHex(editorial ? theme.colors.accent : theme.colors.onPrimary), size: editorial ? 28 : 18, font: editorial ? "Georgia" : "Arial" })] })], numberWidth, { fill: editorial ? undefined : documentHex(theme.colors.primary), borders: editorial ? { top: border(documentHex(theme.colors.line), 5) } : noBorders() }),
    tableCell([
      new Paragraph({ children: [new TextRun({ text: title, bold: splitRole, color: documentHex(theme.colors.ink), size: 20 })] }),
      ...(rest.length ? [new Paragraph({ spacing: { before: 45 }, children: [new TextRun({ text: rest.join(" "), size: 19 })] })] : []),
    ], width - numberWidth, { borders: { top: border(documentHex(theme.colors.line), 5) } }),
  ] })], [numberWidth, width - numberWidth]);
}

function dataTable(headers: string[], rows: string[][], widths: number[], theme: DocumentThemeDefinition) {
  const lightHeader = theme.layout.dataLayout === "compact-ledger" || theme.layout.dataLayout === "quiet-rules";
  const headerFill = lightHeader ? documentHex(theme.colors.soft) : documentHex(theme.colors.primary);
  const headerColor = lightHeader ? documentHex(theme.colors.primaryDark) : documentHex(theme.colors.onPrimary);
  const quiet = theme.layout.dataLayout === "quiet-rules";
  const borders = quiet ? {
    top: border(documentHex(theme.colors.accent), 7),
    bottom: border(documentHex(theme.colors.line), 5),
    left: border(documentHex(theme.colors.paper), 0, BorderStyle.NONE),
    right: border(documentHex(theme.colors.paper), 0, BorderStyle.NONE),
    insideHorizontal: border(documentHex(theme.colors.line), 5),
    insideVertical: border(documentHex(theme.colors.paper), 0, BorderStyle.NONE),
  } : allBorders(documentHex(theme.colors.line), BorderStyle.SINGLE, 5);
  return fixedTable([
    new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((header, index) => tableCell([
      new Paragraph({ children: [new TextRun({ text: header, bold: true, color: headerColor, size: 17 })] }),
    ], widths[index], { fill: quiet ? undefined : headerFill, borders })) }),
    ...rows.map((row, rowIndex) => new TableRow({ cantSplit: true, children: headers.map((_, columnIndex) => tableCell([
      new Paragraph({ children: [new TextRun({ text: row[columnIndex] || "", bold: columnIndex === 0 && headers.length <= 3, size: 17 })] }),
    ], widths[columnIndex], { fill: theme.layout.dataLayout === "target-bands" && rowIndex % 2 === 1 ? documentHex(theme.colors.soft) : undefined, borders })) })),
  ], widths);
}

function bodyParagraphs(text: string, typography: Typography = DEFAULT_TYPOGRAPHY, editorialLead = false): Paragraph[] {
  const parts = text.split(/\r?\n+/).map((paragraph) => paragraph.trim()).filter(Boolean);
  return parts.map((paragraph, index) => {
    const children: ParagraphChild[] = [];
    if (editorialLead && index === 0 && paragraph.length > 1) {
      children.push(new TextRun({ text: paragraph[0], bold: true, color: "9B4E2D", size: 46, font: typography.headingFontFamily || typography.fontFamily }));
      children.push(new TextRun({ text: paragraph.slice(1), size: Math.round(typography.paragraphSize * 2), font: typography.fontFamily }));
    } else {
      children.push(new TextRun({ text: paragraph, size: Math.round(typography.paragraphSize * 2), font: typography.fontFamily }));
    }
    return new Paragraph({ style: "PolicyBody", alignment: AlignmentType.JUSTIFIED, spacing: { after: 150, line: Math.round(240 * typography.lineSpacing) }, children });
  });
}

function listParagraph(text: string, kind: "bullet" | "number", typography: Typography, theme: DocumentThemeDefinition) {
  return new Paragraph({
    style: "PolicyBody",
    numbering: { reference: kind === "bullet" ? "policy-bullets" : "policy-numbering", level: 0 },
    spacing: { after: 90, line: Math.round(240 * typography.lineSpacing) },
    children: [new TextRun({ text, color: documentHex(theme.colors.ink), font: typography.fontFamily, size: Math.round(typography.paragraphSize * 2) })],
  });
}

function buildAcknowledgement(model: DocumentRenderModel): DocBlock[] {
  const acknowledgement = model.acknowledgement!;
  const { theme, typography } = model;
  const title = new Paragraph({ alignment: theme.layout.acknowledgement === "legal-form" ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 180 }, children: [new Bookmark({ id: "acknowledgement", children: [] }), new TextRun({ text: acknowledgement.title, bold: true, italics: theme.layout.acknowledgement === "affidavit", color: documentHex(theme.colors.primaryDark), size: 36, font: typography.headingFontFamily || typography.fontFamily })] });
  const statement = new Paragraph({ alignment: theme.layout.acknowledgement === "legal-form" ? AlignmentType.CENTER : AlignmentType.JUSTIFIED, spacing: { after: 260, line: Math.round(240 * typography.lineSpacing) }, children: [new TextRun({ text: acknowledgement.statement, size: Math.round(typography.paragraphSize * 2), font: typography.fontFamily })] });
  const kicker = new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: "ACKNOWLEDGEMENT - FINAL PAGE", bold: true, color: documentHex(theme.colors.primary), size: 15, characterSpacing: 50, font: typography.fontFamily })] });

  if (theme.layout.acknowledgement === "approval-block") {
    const rail = 1350;
    const body = CONTENT_WIDTH - rail;
    const fields = acknowledgementFields(model, body - 520);
    return [fixedTable([new TableRow({ children: [
      tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ACK", bold: true, color: documentHex(theme.colors.onPrimary), size: 36, characterSpacing: 40 })] })], rail, { fill: documentHex(theme.colors.primary), textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
      tableCell([kicker, title, statement, fields], body, { margins: { top: 280, bottom: 280, left: 300, right: 220 } }),
    ] })], [rail, body])];
  }
  if (theme.layout.acknowledgement === "legal-form") {
    const innerWidth = CONTENT_WIDTH - 1240;
    const fields = acknowledgementFields(model, innerWidth);
    return [fixedTable([new TableRow({ children: [tableCell([kicker, title, statement, fields], CONTENT_WIDTH - 520, { borders: allBorders(documentHex(theme.colors.primary), BorderStyle.DOUBLE, 8), margins: { top: 320, bottom: 320, left: 360, right: 360 } })] })], [CONTENT_WIDTH - 520], { width: CONTENT_WIDTH - 520, alignment: AlignmentType.CENTER })];
  }
  const fields = acknowledgementFields(model, CONTENT_WIDTH);
  if (theme.layout.acknowledgement === "signature-panel") {
    return [new Paragraph({ shading: { type: ShadingType.SOLID, color: documentHex(theme.colors.primary), fill: documentHex(theme.colors.primary) }, spacing: { after: 180 }, children: [new TextRun({ text: "FINAL COMMITMENT", bold: true, color: documentHex(theme.colors.onPrimary), size: 18, characterSpacing: 55 })] }), title, statement, fields];
  }
  return [new Paragraph({ border: { top: border(documentHex(theme.colors.accent), 18) }, children: [new TextRun({ text: "AFFIDAVIT OF ACKNOWLEDGEMENT", bold: true, color: documentHex(theme.colors.accent), size: 15, characterSpacing: 50 })] }), spacer(180), title, statement, fields];
}

function acknowledgementFields(model: DocumentRenderModel, availableWidth: number) {
  const fields = model.acknowledgement!.fields;
  const half = Math.floor(availableWidth / 2);
  const rows = chunk(fields, 2).map((pair) => new TableRow({ cantSplit: true, children: [0, 1].map((index) => {
    const field = pair[index];
    return field ? tableCell([
      new Paragraph({ spacing: { after: 100 }, children: [new TextRun({ text: field.toUpperCase(), bold: true, color: documentHex(model.theme.colors.muted), size: 14, characterSpacing: 35, font: model.typography.fontFamily })] }),
      new Paragraph({ border: { bottom: border(documentHex(model.theme.colors.muted), 6) }, spacing: { after: field === "Signature" ? 260 : 170 }, children: [new TextRun({ text: " " })] }),
    ], half, { fill: model.theme.layout.acknowledgement === "signature-panel" ? documentHex(model.theme.colors.soft) : undefined, margins: { top: 120, bottom: 120, left: 140, right: 140 } }) : tableCell([new Paragraph("")], half);
  }) }));
  return fixedTable(rows, [half, half]);
}

function buildHeader(model: DocumentRenderModel, logo: LogoImage, alignment: typeof AlignmentType[keyof typeof AlignmentType]) {
  const { theme, typography } = model;
  const layout = theme.layout.runningFurniture;
  const compact = layout === "breadcrumb-bar";
  const children: ParagraphChild[] = [];
  if (logo) children.push(new ImageRun({ data: logo.data, type: logo.type, transformation: { width: 72, height: 34 } }));
  children.push(new TextRun({ text: `${logo ? "   " : ""}${compact ? "POLICY / GOVERNANCE / CURRENT" : model.cover.companyName}`, bold: true, color: compact ? documentHex(theme.colors.onPrimary) : documentHex(theme.colors.muted), size: 14, characterSpacing: 28, font: typography.fontFamily }));
  return new Header({ children: [new Paragraph({
    alignment,
    shading: compact ? { type: ShadingType.SOLID, color: documentHex(theme.colors.primary), fill: documentHex(theme.colors.primary) } : undefined,
    border: compact ? undefined : { bottom: border(layout === "outer-folio" ? documentHex(theme.colors.accent) : documentHex(theme.colors.primary), layout === "edge-folio" ? 16 : 6) },
    spacing: { after: 60 },
    children,
  })] });
}

function buildFooter(model: DocumentRenderModel) {
  const { theme, typography } = model;
  const compact = theme.layout.runningFurniture === "breadcrumb-bar";
  const color = compact ? documentHex(theme.colors.onPrimary) : documentHex(theme.colors.muted);
  return new Footer({ children: [new Paragraph({
    alignment: theme.layout.runningFurniture === "centered-folio" ? AlignmentType.CENTER : AlignmentType.RIGHT,
    shading: compact ? { type: ShadingType.SOLID, color: documentHex(theme.colors.primary), fill: documentHex(theme.colors.primary) } : undefined,
    border: { top: border(theme.layout.runningFurniture === "outer-folio" ? documentHex(theme.colors.accent) : documentHex(theme.colors.line), compact ? 12 : 6) },
    spacing: { before: 80 },
    children: [
      new TextRun({ text: `Effective ${model.footer.effectiveDate}   -   Revision ${model.footer.revision}   -   Page `, color, size: 14, italics: theme.layout.runningFurniture === "outer-folio", font: typography.fontFamily }),
      new TextRun({ children: [PageNumber.CURRENT], color, size: 14, font: typography.fontFamily }),
    ],
  })] });
}

function fixedTable(rows: TableRow[], columnWidths: number[], options: { width?: number; alignment?: typeof AlignmentType[keyof typeof AlignmentType]; cellSpacing?: number } = {}) {
  const width = options.width || columnWidths.reduce((total, value) => total + value, 0);
  return new Table({
    rows,
    width: { size: width, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    alignment: options.alignment,
    cellSpacing: options.cellSpacing ? { value: options.cellSpacing, type: WidthType.DXA } : undefined,
    borders: noBorders(),
  });
}

function tableCell(children: DocBlock[], width: number, options: {
  fill?: string;
  textDirection?: typeof TextDirection[keyof typeof TextDirection];
  columnSpan?: number;
  margins?: { top: number; bottom: number; left: number; right: number };
  borders?: ReturnType<typeof allBorders> | Partial<ReturnType<typeof allBorders>>;
} = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.fill ? { type: ShadingType.SOLID, color: options.fill, fill: options.fill } : undefined,
    margins: options.margins || { top: CELL_MARGIN, bottom: CELL_MARGIN, left: CELL_MARGIN, right: CELL_MARGIN },
    verticalAlign: VerticalAlign.CENTER,
    textDirection: options.textDirection,
    columnSpan: options.columnSpan,
    borders: options.borders,
    children,
  });
}

function imageParagraph(logo: NonNullable<LogoImage>, alignment: typeof AlignmentType[keyof typeof AlignmentType], width: number, height: number, after = 80) {
  return new Paragraph({ alignment, spacing: { after }, children: [new ImageRun({ data: logo.data, type: logo.type, transformation: { width, height } })] });
}

function spacer(before: number) {
  return new Paragraph({ spacing: { before }, children: [new TextRun({ text: " ", size: 2 })] });
}

function border(color: string, size: number, style: typeof BorderStyle[keyof typeof BorderStyle] = BorderStyle.SINGLE) {
  return { color, size, style, space: 1 };
}

function allBorders(color: string, style: typeof BorderStyle[keyof typeof BorderStyle], size: number) {
  const value = border(color, size, style);
  return { top: value, bottom: value, left: value, right: value, insideHorizontal: value, insideVertical: value };
}

function noBorders() {
  const none = border("FFFFFF", 0, BorderStyle.NONE);
  return { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function scaledWidths(widths: number[], totalWidth: number) {
  const sourceTotal = widths.reduce((total, width) => total + width, 0);
  const scaled = widths.map((width) => Math.floor((width / sourceTotal) * totalWidth));
  scaled[scaled.length - 1] += totalWidth - scaled.reduce((total, width) => total + width, 0);
  return scaled;
}

async function loadSdgImages(numbers: number[]) {
  const entries = await Promise.all(numbers.map(async (number) => {
    try {
      const image = await readFile(path.join(process.cwd(), "public", "E SDG Icons PRINT", `E_SDG_PRINT-${String(number).padStart(2, "0")}.jpg`));
      return [number, image] as const;
    } catch {
      return null;
    }
  }));
  const images = new Map<number, Uint8Array>();
  entries.forEach((entry) => {
    if (entry) images.set(entry[0], entry[1]);
  });
  return images;
}

function logoFromDataUrl(source?: string): LogoImage {
  const match = source?.match(/^data:image\/(png|jpeg|jpg);base64,([\s\S]+)$/i);
  if (!match) return null;
  return { data: Buffer.from(match[2], "base64"), type: match[1].toLowerCase() === "png" ? "png" : "jpg" };
}
