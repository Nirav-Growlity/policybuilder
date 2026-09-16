import { coverDesign } from "../cover-designs";
import {
  AlignmentType,
  Bookmark,
  BorderStyle,
  Document,
  Footer,
  Header,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImportedXmlComponent,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextDirection,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionAlign,
  VerticalPositionRelativeFrom,
  WidthType,
  type ParagraphChild,
} from "docx";
import { AsyncLocalStorage } from "node:async_hooks";
import { A4, pageMarginMm } from "../page-geometry";
import { getPolicyDocumentTheme, logoScaleFactor } from "../document-themes";
import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildDocumentRenderModel, getRunningHeaderBrand, type DocumentRenderModel, type DocumentRenderSection } from "../document-render-model";
import { documentHex, type DocumentThemeDefinition } from "../document-themes";
import { motifSvg, type CoverMotifScene, type MotifColors } from "../cover-motifs";
import { normalizePolicyQuantitative } from "../quantitative";
import { getCoverBindingValue } from "../cover-composition";
import type { Policy, QuantitativeArea, RichTextBlock } from "../types";
import { DEFAULT_TYPOGRAPHY } from "../typography";
import { embeddedDocumentFonts } from "./document-fonts";
import { createCoverCompositionSvg } from "../cover-renderer";

type Typography = NonNullable<Policy["typography"]>;
type DocBlock = Paragraph | Table;
type LogoImage = { data: Uint8Array; type: "png" | "jpg" } | null;

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
// docx ImageRun transformations are expressed in pixels, while the page
// dimensions above are Word twips. Use the 96-DPI A4 pixel canvas so a
// custom cover reaches the page edges in Word just as it does in preview.
const A4_WIDTH_PX = Math.round(A4.widthMm / 25.4 * 96);
const A4_HEIGHT_PX = Math.round(A4.heightMm / 25.4 * 96);
const geometry = new AsyncLocalStorage<number>();
const pageMargin = () => geometry.getStore() ?? 1000;
const contentWidth = () => PAGE_WIDTH - pageMargin() * 2;
const CELL_MARGIN = 120;

export async function generateDocx(inputPolicy: Policy): Promise<Buffer> {
  const theme = getPolicyDocumentTheme(inputPolicy);
  const margin = theme.collection === "professional" || theme.pageBorder.enabled ? Math.round(pageMarginMm(theme.pageBorder) * A4.pointsPerMm * 20) : 1000;
  return geometry.run(margin, () => generateDocxDocument(inputPolicy));
}
async function generateDocxDocument(inputPolicy: Policy): Promise<Buffer> {
  const policy = normalizePolicyQuantitative(inputPolicy);
  const model = buildDocumentRenderModel(policy);
  const { theme, typography } = model;
  const spacingScale = densityScale(theme.density);
  const logoImage = await logoFromDataUrl(policy.company.companyLogo);
  const featureImage = await logoFromDataUrl(model.featureImage?.dataUrl);
  const logoAlignment = policy.logoPosition === "right" ? AlignmentType.RIGHT : policy.logoPosition === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
  const sdgImages = policy.sdgDisplay === "tiles" ? await loadSdgImages(policy.sdgs) : new Map<number, Uint8Array>();
  const children: DocBlock[] = [];

  const customCover = model.cover.composition ? await customCoverImage(policy, model, false) : null;
  const customCoverElements = customCover ? await buildEditableCustomCoverElements(policy, model) : [];
  if (!customCover) {
    // Keep the cover clean. The logo is supplied by the default running header.
    children.push(...buildCover(model, null, logoAlignment));
  }
  if (model.featureImage?.placement === "cover" && featureImage) {
    children.push(imageParagraph(featureImage, AlignmentType.CENTER, 520, 220, 120, model.featureImage.altText));
  }
  if (policy.showTableOfContents) {
    // A custom cover already ends with a NEXT_PAGE section break. Adding a
    // leading page break here would create an entirely blank page after it.
    if (!customCover) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(...buildToc(model), new Paragraph({ children: [new PageBreak()] }));
  } else if (!customCover) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
  }

  if (model.featureImage?.placement === "section" && featureImage) {
    children.push(imageParagraph(featureImage, AlignmentType.CENTER, 520, 230, 220, model.featureImage.altText));
  }

  model.sections.forEach((section) => {
    const content = renderSectionContent(section, model, policy, sdgImages, sectionContentWidth(section, theme));
    children.push(...wrapSection(section, content, theme, typography, spacingScale));
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
  const pageBorders = theme.pageBorder.enabled ? {
    pageBorders: { display: theme.pageBorder.scope === "cover" ? "firstPage" as const : "allPages" as const, offsetFrom: "page" as const },
    // Native Word page-edge borders support at most 31 points of spacing.
    // Text-relative offsets can exceed that limit and hug the content.
    ...Object.fromEntries(["pageBorderTop", "pageBorderRight", "pageBorderBottom", "pageBorderLeft"].map(side => [side, { style: BorderStyle.SINGLE, color: documentHex(theme.pageBorder.color || theme.colors.primary), size: theme.pageBorder.widthPt * 8, space: Math.min(31, Math.round(theme.pageBorder.insetMm * A4.pointsPerMm)) }]))
  } : undefined;
  const pageSize = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
  const regularPage = {
    size: pageSize,
    ...(pageBorders ? { borders: pageBorders } : {}),
    margin: { top: pageMargin(), right: pageMargin(), bottom: pageMargin(), left: pageMargin() },
  };
  const doc = new Document({
    fonts: await embeddedDocumentFonts([typography.fontFamily, typography.headingFontFamily || typography.fontFamily]),
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
          run: { font: typography.headingFontFamily || typography.fontFamily, size: Math.round(typography.headingSize * 2), bold: true, color: documentHex(theme.colors.primaryDark) },
          paragraph: { keepNext: true, spacing: { before: Math.round(300 * spacingScale), after: Math.round(180 * spacingScale) } },
        },
        {
          id: "PolicyBody",
          name: "Policy Body",
          basedOn: "Normal",
          next: "PolicyBody",
          quickFormat: true,
          run: { font: typography.fontFamily, size: Math.round(typography.paragraphSize * 2), color: ink },
          paragraph: { spacing: { after: Math.round(150 * spacingScale), line: Math.round(240 * typography.lineSpacing) } },
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
    sections: customCover ? [
      {
        properties: {
          page: { size: pageSize, ...(pageBorders ? { borders: pageBorders } : {}), margin: { top: 0, right: 0, bottom: 0, left: 0 } },
          titlePage: true,
        },
        // Keep the full-page background and editable cover objects in one
        // anchored paragraph. Placing the overlays after an inline full-page
        // image makes Word flow them onto a second, otherwise blank page.
        children: [customCoverParagraph(customCover, customCoverElements)],
      },
      {
        properties: { type: SectionType.NEXT_PAGE, page: regularPage },
        headers: { default: buildHeader(model, logoImage, logoAlignment) },
        footers: { default: buildFooter(model) },
        children,
      },
    ] : [{
      properties: { page: regularPage, titlePage: true },
      // The preview keeps the cover free of running furniture; Word needs an
      // explicit first-page header/footer to achieve the same composition.
      headers: { first: buildPageBackgroundHeader(model), default: buildHeader(model, logoImage, logoAlignment) },
      footers: { first: new Footer({ children: [new Paragraph("")] }), default: buildFooter(model) },
      children,
    }],
  });

  return (await Packer.toBuffer(doc)) as Buffer;
}

const COVER_KICKERS: Record<string, string> = {
  "sample-quiet-title": "POLICY · CONTROLLED COPY",
  "sample-control-grid": "DOCUMENT CONTROL · APPROVAL",
  "sample-table-ledger": "POLICY REGISTER · EVIDENCE",
  "sample-editorial-image": "SUSTAINABILITY · COMMITMENT",
  "sample-framework-map": "FRAMEWORK · RESPONSIBILITY",
  "sample-compact-strip": "OPERATING STANDARD",
  "sample-heritage-crest": "POLICY · ESTABLISHED PRACTICE",
  "sample-operating-tabs": "IMS · CONTROLLED DOCUMENT",
  "civic-plain": "SUSTAINABILITY CHARTER",
  "signal-split": "MODERN STANDARD - ASYMMETRIC SIGNAL",
  "open-broad": "ACCESSIBLE - BROAD MEASURE",
  "swiss-poster": "SWISS POSTER - GRID 01",
  "ledger-rail": "EXECUTIVE LEDGER - BOARD EDITION",
  "decision-stamp": "DECISION RECORD - STAMPED",
  "routing-slip": "MEMORANDUM - ROUTING SLIP",
  "seal-medallion": "GOVERNANCE MANUAL - SEAL",
  "clause-code": "COMPLIANCE CODE - CONTROLLED CLAUSES",
  "exhibit-file": "AUDIT EXHIBITS - TRACEABILITY FILE",
  "gazette-masthead": "OFFICIAL GAZETTE - PROCLAMATION",
  "colonnade-rule": "INSTITUTIONAL REPORT - COLONNADE",
  "indenture-margin": "LEGAL INDENTURE - CONTROLLED REGISTER",
  "chapterhouse-drop": "EDITORIAL - CHAPTER",
  "broadsheet-columns": "BROADSHEET - PUBLIC EDITION",
  "fieldbook-grid": "FIELDBOOK - SURVEY GRID",
  "canopy-band": "IMPACT CANOPY - SUSTAINABILITY",
  "summit-target": "SUMMIT - OUTCOMES AND IMPACT",
  "commons-card": "COMMONS BRIEF - OPEN CARD",
  "scoreboard-tiles": "SCOREBOARD - KPI TILES",
  "tape-ledger": "TAPE LEDGER - METRICS",
  "dial-review": "DIAL REVIEW - PERFORMANCE",
  "proceedings-abstract": "PROCEEDINGS - ABSTRACT",
  "blueprint-spec": "BLUEPRINT - TECHNICAL STANDARD",
  "docket-matrix": "DOCKET - FINDINGS MATRIX",
};

/** Native aspect ratio (width, height) of each motif viewBox for Word sizing. */
const MOTIF_ASPECT: Record<CoverMotifScene, [number, number]> = {
  "sample-quiet-title": [240, 70], "sample-control-grid": [220, 120], "sample-table-ledger": [240, 96],
  "sample-editorial-image": [220, 120], "sample-framework-map": [240, 110], "sample-compact-strip": [240, 58],
  "sample-heritage-crest": [130, 140], "sample-operating-tabs": [240, 100],
  "civic-plain": [220, 28], "signal-split": [200, 120], "open-broad": [220, 72], "swiss-poster": [120, 120],
  "ledger-rail": [120, 160], "decision-stamp": [180, 120], "routing-slip": [220, 96],
  "seal-medallion": [140, 140], "clause-code": [160, 120], "exhibit-file": [200, 110],
  "gazette-masthead": [120, 140], "colonnade-rule": [200, 90], "indenture-margin": [160, 140],
  "chapterhouse-drop": [120, 120], "broadsheet-columns": [220, 110], "fieldbook-grid": [160, 120],
  "canopy-band": [220, 84], "summit-target": [140, 140], "commons-card": [200, 110],
  "scoreboard-tiles": [200, 120], "tape-ledger": [220, 100], "dial-review": [160, 100],
  "proceedings-abstract": [200, 120], "blueprint-spec": [160, 120], "docket-matrix": [180, 120],
};

function motifColorsFor(theme: DocumentThemeDefinition): MotifColors {
  return {
    primary: `#${documentHex(theme.colors.primary)}`,
    accent: `#${documentHex(theme.colors.accent)}`,
    soft: `#${documentHex(theme.colors.soft)}`,
    line: `#${documentHex(theme.colors.line)}`,
    paper: `#${documentHex(theme.colors.paper)}`,
    ink: `#${documentHex(theme.colors.ink)}`,
  };
}

function motifCoverParagraph(scene: CoverMotifScene, theme: DocumentThemeDefinition, width: number, alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT): Paragraph {
  const [viewWidth, viewHeight] = MOTIF_ASPECT[scene];
  return svgParagraph(
    motifSvg(scene, motifColorsFor(theme)),
    width,
    Math.max(24, Math.round((width * viewHeight) / viewWidth)),
    alignment,
    `${scene} cover motif`,
  );
}

function coverKickerParagraph(text: string, theme: DocumentThemeDefinition, typography: Typography, color?: string, alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT): Paragraph {
  return new Paragraph({
    alignment,
    spacing: { before: 160, after: 200 },
    children: [new TextRun({ text, bold: true, color: color || documentHex(theme.colors.primary), size: 18, characterSpacing: 70, font: typography.fontFamily })],
  });
}

function coverTitleParagraph(text: string, theme: DocumentThemeDefinition, typography: Typography, size = 64, color?: string, alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT): Paragraph {
  return new Paragraph({
    alignment,
    spacing: { after: 140 },
    children: [new TextRun({ text, bold: true, color: color || documentHex(theme.colors.primaryDark), size, font: typography.headingFontFamily || typography.fontFamily })],
  });
}

function coverCompanyParagraph(text: string, theme: DocumentThemeDefinition, typography: Typography, color?: string, alignment: typeof AlignmentType[keyof typeof AlignmentType] = AlignmentType.LEFT): Paragraph {
  return new Paragraph({
    alignment,
    spacing: { after: 280 },
    children: [new TextRun({ text, color: color || documentHex(theme.colors.muted), size: 25, font: typography.fontFamily })],
  });
}

function verticalLabelParagraph(text: string, color: string, font: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: true, color, size: 18, characterSpacing: 80, font })],
  });
}

function buildCover(model: DocumentRenderModel, logo: LogoImage, logoAlignment: typeof AlignmentType[keyof typeof AlignmentType]): DocBlock[] {
  const { theme, typography, cover } = model;
  const scene = theme.layout.cover as CoverMotifScene;
  const primary = documentHex(theme.colors.primary);
  const paper = documentHex(theme.colors.paper);
  const soft = documentHex(theme.colors.soft);
  const accent = documentHex(theme.colors.accent);
  const ink = documentHex(theme.colors.ink);
  const muted = documentHex(theme.colors.muted);
  const line = documentHex(theme.colors.line);
  const onPrimary = documentHex(theme.colors.onPrimary);
  const headingFont = typography.headingFontFamily || typography.fontFamily;
  const logoScale = theme.logoScale === "small" ? .72 : theme.logoScale === "large" ? 1.28 : 1;
  const logoParagraph = logo ? imageParagraph(logo, logoAlignment, Math.round(165 * logoScale), Math.round(76 * logoScale), 100) : spacer(80);
  const kicker = COVER_KICKERS[scene] || "POLICY";

  if (theme.collection === "professional") {
    const design = coverDesign(scene);
    const alignment = design.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT;
    const rule = new Paragraph({ border: { bottom: border(primary, 6) }, spacing: { after: 360 }, children: [] });
    const columnWidth = Math.floor(contentWidth() / design.columns);
    const metadata = fixedTable(chunk(cover.metadata, design.columns).map(items => new TableRow({ cantSplit: true, children: items.map(item => tableCell([
      new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: item.label.toUpperCase(), color: muted, size: 15, font: typography.fontFamily })] }),
      new Paragraph({ spacing: { after: 180 }, children: [new TextRun({ text: item.value, color: muted, size: 20, font: typography.fontFamily })] }),
    ], columnWidth)) })), Array.from({ length: design.columns }, () => columnWidth));
    return [
      coverCompanyParagraph(cover.companyName, theme, typography, undefined, alignment),
      spacer(Math.round(design.spaceMm * 56.7)),
      ...(design.rule === "top" ? [rule] : []),
      coverTitleParagraph(cover.policyLabel, theme, typography, design.titlePt * 2, undefined, alignment),
      ...(design.rule === "bottom" ? [rule] : []),
      spacer(900),
      new Paragraph({ border: { top: border(line, 4) }, spacing: { after: 220 }, children: [] }),
      metadata,
    ];
  }
  const centeredHead = (titleSize = 64): Paragraph[] => [
    logoParagraph,
    coverKickerParagraph(kicker, theme, typography, undefined, AlignmentType.CENTER),
    coverTitleParagraph(cover.policyLabel, theme, typography, titleSize, undefined, AlignmentType.CENTER),
    coverCompanyParagraph(cover.companyName, theme, typography, undefined, AlignmentType.CENTER),
  ];
  const leftHead = (titleSize = 64): Paragraph[] => [
    logoParagraph,
    coverKickerParagraph(kicker, theme, typography),
    coverTitleParagraph(cover.policyLabel, theme, typography, titleSize),
    coverCompanyParagraph(cover.companyName, theme, typography),
  ];

  switch (scene) {
    case "civic-plain": {
      const inner = contentWidth() - 520;
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [tableCell([
          new Paragraph({ border: { top: border(primary, 14) }, spacing: { after: 60 }, children: [new TextRun({ text: " ", size: 2 })] }),
          ...centeredHead(),
          motifCoverParagraph(scene, theme, 330, AlignmentType.CENTER),
          spacer(320),
          metadataTable(model, inner, "colophon"),
        ], inner, { margins: { top: 260, bottom: 300, left: 360, right: 360 } })],
      })], [inner], { width: inner, alignment: AlignmentType.CENTER })];
    }
    case "signal-split": {
      const panelWidth = 3400;
      const bodyWidth = contentWidth() - panelWidth;
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [
          tableCell([...leftHead(), metadataTable(model, bodyWidth, "strip")], bodyWidth, {
            fill: paper, borders: { top: undefined, bottom: undefined, left: undefined, right: border(accent, 18), insideHorizontal: undefined, insideVertical: undefined } as never,
          }),
          tableCell([spacer(700), motifCoverParagraph(scene, theme, 300, AlignmentType.CENTER)], panelWidth, { fill: soft }),
        ],
      })], [bodyWidth, panelWidth])];
    }
    case "open-broad": {
      return [
        new Paragraph({ shading: { type: ShadingType.SOLID, fill: primary }, spacing: { after: 320 }, children: [new TextRun({ text: " ", size: 2 })] }),
        ...leftHead(72),
        motifCoverParagraph(scene, theme, 420),
        spacer(240),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "swiss-poster": {
      const railWidth = 1500;
      const bodyWidth = contentWidth() - railWidth;
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [
          tableCell([spacer(1600), verticalLabelParagraph("GRID - 01", "FFFFFF", typography.fontFamily), spacer(500)], railWidth, { fill: ink, textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
          tableCell([
            ...leftHead(80),
            motifCoverParagraph(scene, theme, 200),
            spacer(200),
            metadataTable(model, bodyWidth, "strip"),
          ], bodyWidth, { fill: paper }),
        ],
      })], [railWidth, bodyWidth])];
    }
    case "ledger-rail": {
      const railWidth = 2400;
      const bodyWidth = contentWidth() - railWidth;
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [
          tableCell([
            verticalLabelParagraph("EXECUTIVE LEDGER", onPrimary, typography.fontFamily),
            spacer(500),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "01", color: onPrimary, size: 72, font: headingFont })] }),
            spacer(300),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "BOARD EDITION", color: onPrimary, size: 15, characterSpacing: 45, font: typography.fontFamily })] }),
          ], railWidth, { fill: primary, textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
          tableCell([...leftHead(), motifCoverParagraph(scene, theme, 200), spacer(160), metadataTable(model, bodyWidth, "strip")], bodyWidth, { fill: paper }),
        ],
      })], [railWidth, bodyWidth])];
    }
    case "decision-stamp": {
      const inner = contentWidth() - 520;
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [tableCell([
          ...centeredHead(),
          motifCoverParagraph(scene, theme, 300, AlignmentType.CENTER),
          spacer(280),
          metadataTable(model, inner, "strip"),
        ], inner, { margins: { top: 300, bottom: 300, left: 360, right: 360 }, borders: allBorders(primary, BorderStyle.DOUBLE, 10) })],
      })], [inner], { width: inner, alignment: AlignmentType.CENTER })];
    }
    case "routing-slip": {
      const slipWidth = contentWidth();
      const half = Math.floor(slipWidth / 2);
      return [
        new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "MEMORANDUM", bold: true, color: ink, size: 60, characterSpacing: 40, font: headingFont })] }),
        fixedTable([new TableRow({
          cantSplit: true,
          children: [
            tableCell([slipLine("TO", "Leadership", theme, typography), slipLine("FROM", cover.companyName, theme, typography)], half),
            tableCell([slipLine("DATE", cover.metadata[1]?.value || "-", theme, typography), slipLine("SUBJECT", cover.policyLabel, theme, typography)], slipWidth - half),
          ],
        })], [half, slipWidth - half]),
        spacer(240),
        ...leftHead(),
        motifCoverParagraph(scene, theme, 380),
        spacer(200),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "seal-medallion": {
      const inner = contentWidth() - 520;
      return [
        motifCoverParagraph(scene, theme, 260, AlignmentType.CENTER),
        spacer(120),
        ...centeredHead(68),
        spacer(240),
        fixedTable([new TableRow({
          cantSplit: true,
          children: chunk(cover.metadata, 2).flatMap((items) => items.map((item) => tableCell([
            new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 25 }, children: [new TextRun({ text: item.label.toUpperCase(), bold: true, color: muted, size: 13, characterSpacing: 25, font: typography.fontFamily })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: item.value, bold: true, color: ink, size: 17, font: typography.fontFamily })] }),
          ], Math.floor(inner / 2)))),
        })], [Math.floor(inner / 2), Math.ceil(inner / 2)]),
      ];
    }
    case "clause-code": {
      const numWidth = 1300;
      const bodyWidth = contentWidth() - numWidth;
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [
          tableCell(["§1", "§2", "§3", "§4"].map((mark, index) => new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: index === 0 ? 200 : 420 },
            children: [new TextRun({ text: mark, bold: true, color: index === 3 ? accent : primary, size: 30, font: headingFont })],
          })), numWidth),
          tableCell([...leftHead(), motifCoverParagraph(scene, theme, 280), spacer(160), metadataTable(model, bodyWidth, "strip")], bodyWidth, {
            margins: { top: 240, bottom: 240, left: 300, right: 300 }, borders: allBorders(primary, BorderStyle.SINGLE, 12),
          }),
        ],
      })], [numWidth, bodyWidth])];
    }
    case "exhibit-file": {
      const tab = Math.floor(contentWidth() / 3);
      return [
        fixedTable([new TableRow({
          cantSplit: true,
          children: [
            tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "EXHIBIT A", bold: true, color: onPrimary, size: 18, font: typography.fontFamily })] })], tab, { fill: primary }),
            tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "EXHIBIT B", bold: true, color: "FFFFFF", size: 18, font: typography.fontFamily })] })], tab, { fill: accent }),
            tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "EXHIBIT C", bold: true, color: muted, size: 18, font: typography.fontFamily })] })], contentWidth() - tab * 2, { fill: soft }),
          ],
        })], [tab, tab, contentWidth() - tab * 2]),
        fixedTable([new TableRow({
          cantSplit: true,
          children: [tableCell([...leftHead(), motifCoverParagraph(scene, theme, 340), spacer(160), metadataTable(model, contentWidth(), "strip")], contentWidth(), {
            margins: { top: 240, bottom: 240, left: 300, right: 300 }, borders: allBorders(line, BorderStyle.SINGLE, 6),
          })],
        })], [contentWidth()]),
      ];
    }
    case "gazette-masthead": {
      const inner = contentWidth() - 520;
      return [
        motifCoverParagraph(scene, theme, 190, AlignmentType.CENTER),
        spacer(100),
        ...centeredHead(68),
        spacer(240),
        metadataTable(model, inner, "colophon"),
      ];
    }
    case "colonnade-rule": {
      return [
        new Paragraph({ shading: { type: ShadingType.SOLID, fill: primary }, spacing: { after: 300 }, children: [new TextRun({ text: " ", size: 2 })] }),
        ...leftHead(),
        motifCoverParagraph(scene, theme, 380),
        spacer(200),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "indenture-margin": {
      const bodyWidth = contentWidth() - 1900;
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [
          tableCell([...leftHead(), motifCoverParagraph(scene, theme, 280), spacer(160), metadataTable(model, bodyWidth, "strip")], bodyWidth),
          tableCell(["¶1", "¶2", "¶3"].map((mark, index) => new Paragraph({
            spacing: { before: index === 0 ? 200 : 480 },
            children: [new TextRun({ text: mark, bold: true, color: accent, size: 26, font: headingFont })],
          })), 1900, { borders: { top: undefined, bottom: undefined, left: border(accent, 12), right: undefined, insideHorizontal: undefined, insideVertical: undefined } as never }),
        ],
      })], [bodyWidth, 1900])];
    }
    case "chapterhouse-drop": {
      const artWidth = 2300;
      const headWidth = contentWidth() - artWidth;
      return [
        fixedTable([new TableRow({
          cantSplit: true,
          children: [
            tableCell([motifCoverParagraph(scene, theme, 210, AlignmentType.CENTER)], artWidth, { fill: primary }),
            tableCell([...leftHead(68)], headWidth),
          ],
        })], [artWidth, headWidth]),
        spacer(240),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "broadsheet-columns": {
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          shading: { type: ShadingType.SOLID, fill: ink },
          spacing: { after: 280 },
          children: [
            new TextRun({ text: `${cover.companyName}   |   `, color: "FFFFFF", size: 17, font: typography.fontFamily }),
            new TextRun({ text: "POLICY BROADSHEET", bold: true, color: "FFFFFF", size: 26, characterSpacing: 30, font: headingFont }),
            new TextRun({ text: `   |   ${cover.metadata[1]?.value || ""}`, color: "FFFFFF", size: 17, font: typography.fontFamily }),
          ],
        }),
        ...leftHead(70),
        motifCoverParagraph(scene, theme, 400),
        spacer(200),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "fieldbook-grid": {
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [tableCell([
          ...leftHead(),
          motifCoverParagraph(scene, theme, 340),
          new Paragraph({ spacing: { before: 120, after: 160 }, children: [new TextRun({ text: "Survey · Plot 01 · Annotated in the field", italics: true, color: accent, size: 19, font: typography.fontFamily })] }),
          metadataTable(model, contentWidth(), "strip"),
        ], contentWidth(), { margins: { top: 260, bottom: 260, left: 320, right: 320 }, borders: allBorders(line, BorderStyle.SINGLE, 6) })],
      })], [contentWidth()])];
    }
    case "canopy-band": {
      return [
        motifCoverParagraph(scene, theme, 640, AlignmentType.CENTER),
        spacer(200),
        ...leftHead(68),
        spacer(120),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "summit-target": {
      return [
        motifCoverParagraph(scene, theme, 250, AlignmentType.CENTER),
        spacer(100),
        ...centeredHead(68),
        spacer(200),
        metadataTable(model, contentWidth() - 520, "strip"),
      ];
    }
    case "commons-card": {
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [tableCell([
          ...leftHead(),
          motifCoverParagraph(scene, theme, 340),
          spacer(160),
          metadataTable(model, contentWidth(), "strip"),
        ], contentWidth(), { fill: paper, margins: { top: 280, bottom: 280, left: 340, right: 340 } })],
      })], [contentWidth()], { width: contentWidth() })];
    }
    case "scoreboard-tiles": {
      const tile = Math.floor(contentWidth() / 4);
      const tiles: Array<[string, string, string]> = [["01", "COVERAGE", primary], ["02", "TARGETS", soft], ["03", "OWNERS", soft], ["04", "REVIEW", accent]];
      return [
        fixedTable([new TableRow({
          cantSplit: true,
          children: tiles.map(([number, label, fill], index) => tableCell([
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: number, bold: true, color: index === 1 || index === 2 ? primary : "FFFFFF", size: 44, font: headingFont })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: label, bold: true, color: index === 1 || index === 2 ? muted : "FFFFFF", size: 14, characterSpacing: 30, font: typography.fontFamily })] }),
          ], index === 3 ? contentWidth() - tile * 3 : tile, { fill })),
        })], [tile, tile, tile, contentWidth() - tile * 3]),
        spacer(240),
        ...leftHead(),
        spacer(120),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "tape-ledger": {
      return [
        new Paragraph({ shading: { type: ShadingType.SOLID, fill: ink }, spacing: { after: 300 }, children: [new TextRun({ text: " ", size: 2 })] }),
        ...leftHead(),
        motifCoverParagraph(scene, theme, 400),
        spacer(200),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "dial-review": {
      const headWidth = contentWidth() - 3600;
      return [
        fixedTable([new TableRow({
          cantSplit: true,
          children: [
            tableCell([...leftHead()], headWidth),
            tableCell([spacer(300), motifCoverParagraph(scene, theme, 300, AlignmentType.CENTER)], 3600),
          ],
        })], [headWidth, 3600]),
        spacer(200),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "proceedings-abstract": {
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [tableCell([
          ...leftHead(),
          new Paragraph({ spacing: { before: 160, after: 160 }, children: [new TextRun({ text: `Keywords · ${cover.companyName} · ${cover.metadata[0]?.value || ""}`, color: muted, size: 16, font: typography.fontFamily })] }),
          motifCoverParagraph(scene, theme, 340),
        ], contentWidth(), { margins: { top: 260, bottom: 260, left: 320, right: 320 }, borders: allBorders(primary, BorderStyle.SINGLE, 14) })],
      })], [contentWidth()]),
        spacer(220),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
    case "blueprint-spec": {
      const white = "FFFFFF";
      return [fixedTable([new TableRow({
        cantSplit: true,
        children: [tableCell([
          new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `SPEC · ${cover.metadata[0]?.value || "STD-01"}`, bold: true, color: white, size: 18, characterSpacing: 60, font: typography.fontFamily })] }),
          logoParagraph,
          coverKickerParagraph(kicker, theme, typography, `#${accent}`),
          coverTitleParagraph(cover.policyLabel, theme, typography, 64, white),
          coverCompanyParagraph(cover.companyName, theme, typography, white),
          motifCoverParagraph(scene, theme, 330),
          spacer(220),
          ...cover.metadata.map((item) => new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `${item.label.toUpperCase()}  `, bold: true, color: white, size: 15, font: typography.fontFamily }),
              new TextRun({ text: item.value, color: white, size: 18, font: typography.fontFamily }),
            ],
          })),
        ], contentWidth(), { fill: primary, margins: { top: 300, bottom: 300, left: 360, right: 360 } })],
      })], [contentWidth()])];
    }
    case "docket-matrix":
    default: {
      const half = Math.floor(contentWidth() / 2);
      return [
        fixedTable([
          new TableRow({
            cantSplit: true,
            children: [
              tableCell([new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "F-01 · FINDING", bold: true, color: onPrimary, size: 20, font: typography.fontFamily })] })], half, { fill: primary }),
              tableCell([new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "SRC · SOURCE", bold: true, color: muted, size: 20, font: typography.fontFamily })] })], contentWidth() - half, { fill: soft }),
            ],
          }),
          new TableRow({
            cantSplit: true,
            children: [
              tableCell([new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 200, after: 200 }, children: [new TextRun({ text: "F-02 · FINDING", bold: true, color: muted, size: 20, font: typography.fontFamily })] })], half, { fill: soft }),
              tableCell([motifCoverParagraph(scene, theme, 300, AlignmentType.CENTER)], contentWidth() - half, { borders: allBorders(primary, BorderStyle.SINGLE, 12) }),
            ],
          }),
        ], [half, contentWidth() - half]),
        spacer(240),
        ...leftHead(),
        spacer(120),
        metadataTable(model, contentWidth(), "strip"),
      ];
    }
  }
}

function slipLine(label: string, value: string, theme: DocumentThemeDefinition, typography: Typography): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label} · `, bold: true, color: documentHex(theme.colors.muted), size: 16, font: typography.fontFamily }),
      new TextRun({ text: value, color: documentHex(theme.colors.ink), size: 18, font: typography.fontFamily }),
    ],
  });
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
  if (model.theme.collection === "professional") {
    const variant = model.theme.layout.professionalVariant || "corporate";
    const alignment = variant === "institutional" ? AlignmentType.CENTER : AlignmentType.LEFT;
    return [new Paragraph({ text: "Contents", style: "PolicyHeading", alignment, spacing: { after: 360 } }), ...model.tocEntries.map(entry => tocParagraph(entry, model, "leaders"))];
  }
  const entries = model.acknowledgement
    ? [...model.tocEntries, { id: "acknowledgement", index: model.tocEntries.length + 1, title: model.acknowledgement.title }]
    : model.tocEntries;
  const { theme, typography } = model;
  const primary = documentHex(theme.colors.primary);
  const accent = documentHex(theme.colors.accent);
  const onPrimary = documentHex(theme.colors.onPrimary);

  if (theme.layout.toc === "rail-index") {
    const rail = 2700;
    const body = contentWidth() - rail;
    return [fixedTable([new TableRow({ children: [
      tableCell([
        new Paragraph({ children: [new TextRun({ text: "DOCUMENT", color: onPrimary, size: 15, characterSpacing: 55, font: typography.fontFamily })] }),
        spacer(520),
        new Paragraph({ children: [new TextRun({ text: "INDEX", bold: true, color: onPrimary, size: 44, font: typography.headingFontFamily || typography.fontFamily })] }),
        spacer(580),
        new Paragraph({ children: [new TextRun({ text: `${String(entries.length).padStart(2, "0")} SECTIONS`, color: onPrimary, size: 15, characterSpacing: 45, font: typography.fontFamily })] }),
      ], rail, { fill: primary }),
      tableCell([
        new Paragraph({ spacing: { after: 280 }, children: [new TextRun({ text: "Contents", bold: true, size: 38, color: documentHex(theme.colors.primaryDark), font: typography.headingFontFamily || typography.fontFamily })] }),
        ...entries.map((entry) => tocParagraph(entry, model, "rail")),
      ], body),
    ] })], [rail, body])];
  }

  if (theme.layout.toc === "tile-index") {
    const tileWidth = Math.floor((contentWidth() - 180) / 2);
    const rows = chunk(entries, 2).map((pair) => new TableRow({
      cantSplit: true,
      children: [0, 1].map((slot) => {
        const entry = pair[slot];
        return entry ? tableCell([
          new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: String(entry.index).padStart(2, "0"), color: primary, size: 36, font: typography.headingFontFamily || typography.fontFamily })] }),
          new Paragraph({ spacing: { after: 70 }, children: [new InternalHyperlink({ anchor: entry.id, children: [new TextRun({ text: entry.title, bold: true, color: documentHex(theme.colors.primaryDark), size: 20, font: typography.fontFamily })] })] }),
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
    const half = Math.floor((contentWidth() - 240) / 2);
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
        new TextRun({ text: entry.title, color: documentHex(theme.colors.primaryDark), size: 20, font: typography.fontFamily }),
      ],
    })],
  });
}

function wrapSection(section: DocumentRenderSection, content: DocBlock[], theme: DocumentThemeDefinition, typography: Typography, spacingScale = 1): DocBlock[] {
  const frame = theme.layout.pageFrame;
  const title = sectionTitle(section, typography, theme);
  if (theme.collection === "professional") {
    // Sample-based documents stay in one readable column; variants only tune
    // typography and alignment.
    return [title, ...content, spacer(Math.round(140 * spacingScale))];
    const variant = theme.layout.professionalVariant || "corporate";
    if (variant === "governance" && section.density !== "dense") {
      const rail = 1100;
      const body = contentWidth() - rail;
      return [fixedTable([new TableRow({ children: [tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(section.index).padStart(2, "0"), color: documentHex(theme.colors.onPrimary), size: 46, font: typography.headingFontFamily || typography.fontFamily })] })], rail, { fill: documentHex(theme.colors.primary) }), tableCell([title, ...content], body, { margins: { top: 180, bottom: 210, left: 260, right: 180 } })] })], [rail, body]), spacer(Math.round(70 * spacingScale))];
    }
    if (variant === "editorial" && section.density !== "dense") {
      const margin = 1450;
      const body = contentWidth() - margin;
      return [fixedTable([new TableRow({ children: [tableCell([new Paragraph({ children: [new TextRun({ text: String(section.index).padStart(2, "0"), color: documentHex(theme.colors.accent), size: 62, font: typography.headingFontFamily || typography.fontFamily })] })], margin), tableCell([title, ...content], body, { margins: { top: 0, bottom: 120, left: 120, right: 0 } })] })], [margin, body]), spacer(Math.round(100 * spacingScale))];
    }
    return [title, ...content, spacer(Math.round(180 * spacingScale))];
  }
  if (frame === "numbered-rail" && section.density !== "dense") {
    const rail = 1100;
    const body = contentWidth() - rail;
    return [fixedTable([new TableRow({ children: [
      tableCell([
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(section.index).padStart(2, "0"), color: documentHex(theme.colors.onPrimary), size: 46, font: typography.headingFontFamily || typography.fontFamily })] }),
        spacer(300),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: section.kind.toUpperCase(), color: documentHex(theme.colors.onPrimary), size: 13, characterSpacing: 40, font: typography.fontFamily })] }),
      ], rail, { fill: documentHex(theme.colors.primary), textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
      tableCell([title, ...content, spacer(80)], body, { margins: { top: 180, bottom: 210, left: 260, right: 180 } }),
    ] })], [rail, body]), spacer(Math.round(70 * spacingScale))];
  }
  if (frame === "editorial-margin" && section.density !== "dense") {
    const margin = 1550;
    const body = contentWidth() - margin;
    return [fixedTable([new TableRow({ children: [
      tableCell([
        new Paragraph({ children: [new TextRun({ text: String(section.index).padStart(2, "0"), color: documentHex(theme.colors.accent), size: 62, font: typography.headingFontFamily || typography.fontFamily })] }),
        new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: section.kind.toUpperCase(), color: documentHex(theme.colors.muted), size: 13, characterSpacing: 45, font: typography.fontFamily })] }),
      ], margin),
      tableCell([title, ...content, spacer(90)], body, { margins: { top: 0, bottom: 120, left: 100, right: 0 } }),
    ] })], [margin, body]), spacer(Math.round(100 * spacingScale))];
  }
  return [title, ...content, spacer(Math.round((frame === "modular-grid" ? 80 : 120) * spacingScale))];
}

function sectionTitle(section: DocumentRenderSection, typography: Typography, theme: DocumentThemeDefinition) {
  const layout = theme.layout.sectionOpener;
  const primary = documentHex(theme.colors.primary);
  const accent = documentHex(theme.colors.accent);
  const onPrimary = documentHex(theme.colors.onPrimary);
  const children: ParagraphChild[] = [new Bookmark({ id: section.id, children: [] })];
  const number = String(section.index).padStart(2, "0");
  if (theme.collection === "professional") {
    children.push(new TextRun({ text: number + "   ", color: documentHex(theme.colors.muted), size: 20, font: typography.fontFamily }), new TextRun({ text: section.title, color: documentHex(theme.colors.primaryDark), bold: true, size: Math.round(typography.headingSize * 2), font: typography.headingFontFamily || typography.fontFamily }));
    return new Paragraph({ style: "PolicyHeading", alignment: theme.layout.professionalVariant === "institutional" ? AlignmentType.CENTER : AlignmentType.LEFT, border: { bottom: border(documentHex(theme.colors.primary), 4) }, spacing: { before: 260, after: 180 }, children });
  }
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
  if (theme.collection === "professional") return contentWidth();
  if (section.density === "dense") return contentWidth();
  if (theme.layout.pageFrame === "numbered-rail") return contentWidth() - 1100 - 440;
  if (theme.layout.pageFrame === "editorial-margin") return contentWidth() - 1550 - 100;
  return contentWidth();
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
    case "quantitative": return renderQuantitative(content.areas, section, model, availableWidth);
    case "sdg": return renderSdgs(content.goals, model, policy, sdgImages, availableWidth);
    case "responsibilities": return renderResponsibilities(content.entries, section, model, availableWidth);
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
      new TextRun({ text: group.area, bold: true, color: documentHex(model.theme.colors.subheading), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily }),
    ] }),
    ...group.items.map((item) => listParagraph(item, "bullet", model.typography, model.theme)),
  ]);
  if ((layout === "numbered-rail" || layout === "modular-grid") && section.density !== "dense") {
    return [pairedCards(cards, availableWidth, model.theme, layout === "modular-grid")];
  }
  return cards.flatMap((card) => [...card, spacer(70)]);
}

function renderQuantitative(areas: QuantitativeArea[], section: DocumentRenderSection, model: DocumentRenderModel, availableWidth: number): DocBlock[] {
  const targets = areas.flatMap((area) => area.targets.filter((target) => target.target).map((target) => ({ ...target, area: area.area })));
  const intro = new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Targets are tracked against a defined period or reported annually as ongoing commitments.", italics: true, color: documentHex(model.theme.colors.muted), size: 17, font: model.typography.fontFamily })] });
  if (model.dataTreatment === "clean-bullets" && model.theme.layout.dataLayout === "target-bands" && section.density !== "dense") {
    return [intro, ...targets.map((target, index) => targetBand(target, index + 1, model, availableWidth))];
  }
  if (model.dataTreatment === "clean-bullets" && model.theme.layout.dataLayout === "quiet-rules" && section.density !== "dense") {
    return [intro, ...targets.map((target) => journalTarget(target, model))];
  }
  if (model.dataTreatment === "clean-bullets") {
    return [intro, ...targets.map((target, index) => entryRow(
      String(index + 1).padStart(2, "0"),
      `${target.area}\n${target.target}\n${target.reportingFrequency === "Annually" ? "Reported annually" : `Baseline ${target.baseline || "-"} · Due ${target.deadline || "-"}`}`,
      availableWidth,
      model.theme,
      model.theme.layout.pageFrame === "editorial-margin",
    ))];
  }
  return [intro, dataTable(
    ["#", "Focus Area", "Target", "Baseline", "Deadline", "Reporting"],
    targets.map((target, index) => [String(index + 1), target.area, target.target, target.reportingFrequency === "Annually" ? "-" : target.baseline, target.reportingFrequency === "Annually" ? "-" : target.deadline, target.reportingFrequency || "Target period"]),
    scaledWidths([450, 1800, 3300, 1250, 1250, 1856], availableWidth), model.theme,
  )];
}

function renderResponsibilities(entries: Policy["responsibilities"], section: DocumentRenderSection, model: DocumentRenderModel, availableWidth: number): DocBlock[] {
  if (model.dataTreatment === "formal-tables") {
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
      new Paragraph({ spacing: { after: 55 }, children: [new TextRun({ text: target.area, bold: true, color: documentHex(model.theme.colors.subheading), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily })] }),
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
      new TextRun({ text: `${target.area}\n`, bold: true, color: documentHex(model.theme.colors.subheading), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily }),
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
      new TextRun({ text: `  ${title}`, bold: true, color: documentHex(splitRole ? model.theme.colors.subheading : model.theme.colors.ink), size: Math.round(model.typography.subheadingSize * 2), font: model.typography.headingFontFamily || model.typography.fontFamily }),
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
  const professional = theme.collection === "professional";
  const numberWidth = professional ? Math.round(8 * A4.pointsPerMm * 20) : editorial ? 900 : 700;
  const [title, ...rest] = text.split("\n");
  return fixedTable([new TableRow({ cantSplit: true, children: [
    tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: number, bold: !editorial && !professional, color: documentHex(professional ? theme.colors.muted : editorial ? theme.colors.accent : theme.colors.onPrimary), size: professional || editorial ? 20 : 18, font: professional ? theme.defaults.typography.fontFamily : editorial ? "Georgia" : "Arial" })] })], numberWidth, { fill: professional || editorial ? undefined : documentHex(theme.colors.primary), borders: professional || editorial ? { top: border(documentHex(theme.colors.line), 5) } : noBorders(), margins: professional ? { top: CELL_MARGIN, bottom: CELL_MARGIN, left: 0, right: 0 } : undefined }),
    tableCell([
      new Paragraph({ children: [new TextRun({ text: title, bold: splitRole, color: documentHex(theme.colors.ink), size: 20 })] }),
      ...(rest.length ? [new Paragraph({ spacing: { before: 45 }, children: [new TextRun({ text: rest.join(" "), size: 19 })] })] : []),
    ], width - numberWidth, { borders: { top: border(documentHex(theme.colors.line), 5) } }),
  ] })], [numberWidth, width - numberWidth]);
}

function dataTable(headers: string[], rows: string[][], widths: number[], theme: DocumentThemeDefinition) {
  const lightHeader = theme.collection === "professional" || theme.layout.dataLayout === "compact-ledger" || theme.layout.dataLayout === "quiet-rules";
  const headerFill = lightHeader ? documentHex(theme.colors.soft) : documentHex(theme.colors.primary);
  const headerColor = lightHeader ? documentHex(theme.colors.subheading) : documentHex(theme.colors.onPrimary);
  const quiet = theme.collection !== "professional" && theme.layout.dataLayout === "quiet-rules";
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

  if (theme.collection === "professional") return [title, statement, acknowledgementFields(model, contentWidth())];
  if (theme.layout.acknowledgement === "approval-block") {
    const rail = 1350;
    const body = contentWidth() - rail;
    const fields = acknowledgementFields(model, body - 520);
    return [fixedTable([new TableRow({ children: [
      tableCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ACK", bold: true, color: documentHex(theme.colors.onPrimary), size: 36, characterSpacing: 40 })] })], rail, { fill: documentHex(theme.colors.primary), textDirection: TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT }),
      tableCell([kicker, title, statement, fields], body, { margins: { top: 280, bottom: 280, left: 300, right: 220 } }),
    ] })], [rail, body])];
  }
  if (theme.layout.acknowledgement === "legal-form") {
    const innerWidth = contentWidth() - 1240;
    const fields = acknowledgementFields(model, innerWidth);
    return [fixedTable([new TableRow({ children: [tableCell([kicker, title, statement, fields], contentWidth() - 520, { borders: allBorders(documentHex(theme.colors.primary), BorderStyle.DOUBLE, 8), margins: { top: 320, bottom: 320, left: 360, right: 360 } })] })], [contentWidth() - 520], { width: contentWidth() - 520, alignment: AlignmentType.CENTER })];
  }
  const fields = acknowledgementFields(model, contentWidth());
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
  const children: ParagraphChild[] = [];
  const brand = getRunningHeaderBrand({ name: model.cover.companyName, companyLogo: model.cover.logo });
  if (brand.kind === "logo" && logo) {
    const logoScale = logoScaleFactor(theme.logoScale);
    children.push(new ImageRun({ data: logo.data, type: logo.type, transformation: { width: Math.round(72 * logoScale), height: Math.round(34 * logoScale) } }));
  } else if (brand.kind === "name") {
    children.push(new TextRun({ text: brand.text, bold: true, color: documentHex(theme.colors.muted), size: 14, characterSpacing: 20, font: typography.fontFamily }));
  }
  return new Header({ children: [pageBackgroundParagraph(model), new Paragraph({
    alignment,
    border: { bottom: border(layout === "outer-folio" ? documentHex(theme.colors.accent) : documentHex(theme.colors.line), 5) },
    spacing: { after: 60 },
    children,
  })] });
}

function buildPageBackgroundHeader(model: DocumentRenderModel) {
  return new Header({ children: [pageBackgroundParagraph(model)] });
}

function buildFooter(model: DocumentRenderModel) {
  const { theme, typography } = model;
  const color = documentHex(theme.colors.muted);
  const footerAlignment = theme.layout.professionalVariant === "institutional" ? AlignmentType.CENTER : AlignmentType.LEFT;
  return new Footer({ children: [new Paragraph({
    alignment: footerAlignment,
    border: { top: border(documentHex(theme.colors.line), 5) },
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

function imageParagraph(logo: NonNullable<LogoImage>, alignment: typeof AlignmentType[keyof typeof AlignmentType], width: number, height: number, after = 80, description = "Policy image") {
  return new Paragraph({ alignment, spacing: { after }, children: [new ImageRun({ data: logo.data, type: logo.type, transformation: { width, height }, altText: { title: description, description, name: description } })] });
}

export async function customCoverImage(policy: Policy, model: DocumentRenderModel, includeElements = true): Promise<LogoImage> {
  const composition = model.cover.composition;
  if (!composition) return null;
  const svg = createCoverCompositionSvg(policy, composition, {
    includeText: includeElements,
    width: 2480,
    height: 3508,
    resolveAsset: (source) => source?.startsWith("data:image/") ? source : undefined,
  });
  return { data: await sharp(Buffer.from(svg)).png().toBuffer(), type: "png" };
}

function customCoverParagraph(background: NonNullable<LogoImage>, overlays: ParagraphChild[]) {
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new ImageRun({
      data: background.data,
      type: background.type,
      transformation: { width: A4_WIDTH_PX, height: A4_HEIGHT_PX },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
        behindDocument: true,
        allowOverlap: true,
        lockAnchor: true,
        layoutInCell: false,
        zIndex: 1,
        wrap: { type: TextWrappingType.NONE },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      },
      altText: { title: "Custom cover background", description: "Custom cover background", name: "Custom cover background" },
    }), ...overlays],
  });
}

async function buildEditableCustomCoverElements(policy: Policy, model: DocumentRenderModel): Promise<ParagraphChild[]> {
  const composition = model.cover.composition;
  if (!composition) return [];
  const elements: ParagraphChild[] = [];
  for (const element of composition.elements.filter((item) => item.visible)) {
    const x = Math.round(element.x * 36000);
    const y = Math.round(element.y * 36000);
    const width = Math.max(1, Math.round(element.width * 96 / 25.4));
    const height = Math.max(1, Math.round(element.height * 96 / 25.4));
    const floating = {
      horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: x },
      verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: y },
      allowOverlap: true,
      lockAnchor: true,
      layoutInCell: false,
      wrap: { type: TextWrappingType.NONE },
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      // Keep every editable overlay above the background drawing in Word's
      // floating-object stacking order.
      zIndex: 100 + Math.max(1, element.zIndex),
    } as const;
    if (element.type === "text") {
      const value = element.content.kind === "binding" ? getCoverBindingValue(policy, element.content.binding) : element.content.text;
      elements.push(editableCoverTextBox(element, value) as unknown as ParagraphChild);
      continue;
    }
    const source = element.type === "logo" ? element.assetId || policy.company.companyLogo : element.assetId;
    const image = await logoFromDataUrl(source);
    if (!image) continue;
    elements.push(new ImageRun({
      data: image.data,
      type: image.type,
      transformation: { width, height, rotation: element.rotation },
      floating,
      altText: { title: element.altText, description: element.altText, name: element.altText },
    }));
  }
  return elements;
}

function editableCoverTextBox(element: Extract<NonNullable<DocumentRenderModel["cover"]["composition"]>["elements"][number], { type: "text" }>, value: string) {
  const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&apos;");
  const pt = (mm: number) => `${(mm * 72 / 25.4).toFixed(2)}pt`;
  const color = documentHex(element.color);
  const font = escapeXml(element.fontFamily);
  const lines = value.split(/\r?\n/).slice(0, 40);
  const runs = lines.map((line, index) => `${index ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`).join("");
  const runProperties = `<w:rPr><w:rFonts w:ascii="${font}" w:cs="${font}" w:eastAsia="${font}" w:hAnsi="${font}"/>${element.bold ? "<w:b/><w:bCs/>" : ""}${element.italic ? "<w:i/><w:iCs/>" : ""}${element.underline ? '<w:u w:val="single"/>' : ""}<w:color w:val="${color}"/><w:sz w:val="${Math.round(element.fontSize * 2)}"/><w:szCs w:val="${Math.round(element.fontSize * 2)}"/></w:rPr>`;
  const alignment = element.align === "center" ? "center" : element.align === "right" ? "right" : "left";
  const style = [
    "position:absolute",
    `margin-left:${pt(element.x)}`,
    `margin-top:${pt(element.y)}`,
    `width:${pt(element.width)}`,
    `height:${pt(element.height)}`,
    `rotation:${element.rotation}`,
    `z-index:${100 + Math.max(1, element.zIndex)}`,
    "mso-position-horizontal-relative:page",
    "mso-position-vertical-relative:page",
    "mso-wrap-style:none",
  ].join(";");
  const xml = `<w:r><w:pict><v:shape id="cover-text-${escapeXml(element.id)}" type="#_x0000_t202" filled="f" stroked="f" style="${style}"><v:textbox inset="0,0,0,0"><w:txbxContent><w:p><w:pPr><w:jc w:val="${alignment}"/><w:spacing w:before="0" w:after="0" w:line="${Math.round(240 * element.lineHeight)}"/></w:pPr><w:r>${runProperties}${runs}</w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r>`;
  // docx's fromXmlString currently parses the XML fragment into a synthetic
  // wrapper whose rootKey is undefined. Attach its actual w:r child instead
  // of serializing that wrapper as an invalid <undefined> element.
  const imported = ImportedXmlComponent.fromXmlString(xml) as unknown as { root?: unknown[] };
  const root = imported.root?.[0];
  if (!root) throw new Error("Unable to import editable cover text box XML");
  return root as ParagraphChild;
}

function pageBackgroundParagraph(model: DocumentRenderModel) {
  const background = model.theme.background;
  const accent = documentHex(model.theme.colors.accent);
  const pageWidth = Math.round(PAGE_WIDTH / 15);
  const pageHeight = Math.round(PAGE_HEIGHT / 15);
  const fill = background.kind === "solid" ? `#${documentHex(background.color)}` : "url(#pageWash)";
  const coordinates = background.kind === "gradient" && background.direction === "horizontal"
    ? 'x1="0" y1="0" x2="1" y2="0"'
    : background.kind === "gradient" && background.direction === "vertical"
      ? 'x1="0" y1="0" x2="0" y2="1"'
      : 'x1="0" y1="0" x2="1" y2="1"';
  const gradient = background.kind === "gradient"
    ? `<defs><linearGradient id="pageWash" ${coordinates}><stop offset="0" stop-color="#${documentHex(background.from)}"/><stop offset="1" stop-color="#${documentHex(background.to)}"/></linearGradient></defs>`
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">${gradient}<rect width="${pageWidth}" height="${pageHeight}" fill="${fill}"/><path d="M0 116H178" stroke="#${accent}" stroke-width="2" opacity=".16"/></svg>`;
  return new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new ImageRun({
      data: Buffer.from(svg),
      type: "svg",
      fallback: { data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3zgAAAABJRU5ErkJggg==", "base64"), type: "png" },
      transformation: { width: pageWidth, height: pageHeight },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
        behindDocument: true,
        allowOverlap: true,
        lockAnchor: true,
        layoutInCell: false,
        wrap: { type: TextWrappingType.NONE },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      },
      altText: { title: "Document page background", description: "Theme-colored page background", name: "Document page background" },
    })],
  });
}

function densityScale(density: DocumentRenderModel["theme"]["density"]): number {
  return density === "compact" ? .82 : density === "spacious" ? 1.18 : 1;
}

function svgParagraph(svg: string, width: number, height: number, alignment: typeof AlignmentType[keyof typeof AlignmentType], description: string) {
  return new Paragraph({
    alignment,
    spacing: { after: 0 },
    children: [new ImageRun({
      data: Buffer.from(svg),
      type: "svg",
      fallback: { data: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3zgAAAABJRU5ErkJggg==", "base64"), type: "png" },
      transformation: { width, height },
      altText: { title: description, description, name: description },
    })],
  });
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

async function logoFromDataUrl(source?: string): Promise<LogoImage> {
  const match = source?.match(/^data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,([\s\S]+)$/i);
  if (!match) return null;
  const format = match[1].toLowerCase();
  const data = Buffer.from(match[2], "base64");
  if (format === "webp" || format === "svg+xml") {
    return { data: await sharp(data).png().toBuffer(), type: "png" };
  }
  return { data, type: format === "png" ? "png" : "jpg" };
}
