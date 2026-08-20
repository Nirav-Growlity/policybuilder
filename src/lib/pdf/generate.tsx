/* eslint-disable jsx-a11y/alt-text -- React PDF's Image component does not expose an alt prop. */
import { Document, Image, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as React from "react";
import { buildDocumentRenderModel, type DocumentRenderModel, type DocumentRenderSection } from "../document-render-model";
import { pdfFontFamily } from "../document-themes";
import { normalizePolicyQuantitative } from "../quantitative";
import type { Policy, RichTextBlock } from "../types";

type PdfFont = "Helvetica" | "Times-Roman" | "Courier";
type Fonts = { body: PdfFont; bodyBold: "Helvetica-Bold" | "Times-Bold" | "Courier-Bold"; headingBold: "Helvetica-Bold" | "Times-Bold" | "Courier-Bold" };
type Styles = ReturnType<typeof createStyles>;
type RenderContext = { model: DocumentRenderModel; policy: Policy; styles: Styles; fonts: Fonts; sdgImages: Map<number, string> };

export async function generatePdf(inputPolicy: Policy): Promise<Buffer> {
  const policy = normalizePolicyQuantitative(inputPolicy);
  const model = buildDocumentRenderModel(policy);
  const body = pdfFontFamily(model.typography.fontFamily);
  const heading = pdfFontFamily(model.typography.headingFontFamily);
  const fonts: Fonts = { body, bodyBold: boldPdfFont(body), headingBold: boldPdfFont(heading) };
  const styles = createStyles(model, fonts);
  const sdgImages = policy.sdgDisplay === "tiles" ? await loadSdgImages(policy.sdgs) : new Map<number, string>();
  const context: RenderContext = { model, policy, styles, fonts, sdgImages };
  const document = (
    <Document title={`${model.cover.policyLabel} - ${model.cover.companyName}`} author="PolicyCraft">
      <Page size="A4" style={styles.coverPage}><PdfCover context={context} /></Page>
      {policy.showTableOfContents ? <Page size="A4" style={styles.bodyPage}><RunningHeader context={context} /><PdfToc context={context} /><RunningFooter context={context} /></Page> : null}
      <Page size="A4" style={styles.bodyPage} wrap>
        <RunningHeader context={context} />
        {model.sections.map((section) => <PdfSection key={section.id} section={section} context={context} />)}
        <Text style={styles.approver} wrap={false}><Text style={styles.bold}>Approved by: </Text>{model.footer.approver}</Text>
        <RunningFooter context={context} />
      </Page>
      {model.acknowledgement ? <Page size="A4" style={styles.bodyPage}><RunningHeader context={context} /><PdfAcknowledgement context={context} /><RunningFooter context={context} /></Page> : null}
    </Document>
  );
  return (await pdf(document).toBuffer()) as unknown as Buffer;
}

function createStyles(model: DocumentRenderModel, fonts: Fonts) {
  const { theme, typography } = model;
  const lightHeader = theme.layout.dataLayout === "compact-ledger" || theme.layout.dataLayout === "quiet-rules";
  return StyleSheet.create({
    coverPage: { backgroundColor: theme.colors.paper, padding: 38, fontFamily: fonts.body, color: theme.colors.ink },
    bodyPage: { backgroundColor: theme.colors.paper, paddingTop: 58, paddingRight: 42, paddingBottom: 52, paddingLeft: 42, fontFamily: fonts.body, color: theme.colors.ink, fontSize: typography.paragraphSize },
    bold: { fontFamily: fonts.bodyBold },
    label: { fontFamily: fonts.bodyBold, fontSize: 8, letterSpacing: 1.2, color: theme.colors.muted, textTransform: "uppercase" },
    value: { fontFamily: fonts.bodyBold, fontSize: 9.5, color: theme.colors.ink, marginTop: 4 },
    paragraph: { fontSize: typography.paragraphSize, lineHeight: typography.lineSpacing, marginBottom: 9, textAlign: "justify" },
    section: { marginBottom: 18 },
    sectionTitle: { fontFamily: fonts.headingBold, fontSize: typography.headingSize, color: theme.colors.primaryDark, marginBottom: 12 },
    subheading: { fontFamily: fonts.headingBold, fontSize: typography.subheadingSize, color: theme.colors.primaryDark, marginBottom: 5 },
    twoColumn: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
    card: { width: "50%", padding: 4 },
    cardInner: { border: `1 solid ${theme.colors.line}`, padding: 10, minHeight: 48 },
    number: { fontFamily: fonts.headingBold, fontSize: 18, color: theme.colors.primary, marginBottom: 5 },
    bullet: { flexDirection: "row", marginBottom: 5, paddingLeft: 8 },
    bulletMark: { width: 12, color: theme.colors.primary, fontFamily: fonts.bodyBold },
    bulletText: { flex: 1, lineHeight: typography.lineSpacing },
    table: { width: "100%", borderTop: `1 solid ${theme.colors.line}`, borderLeft: `1 solid ${theme.colors.line}`, marginTop: 6, marginBottom: 12 },
    tableRow: { flexDirection: "row", borderBottom: `1 solid ${theme.colors.line}` },
    tableHeader: { backgroundColor: lightHeader ? theme.colors.soft : theme.colors.primary },
    tableCell: { padding: 5, borderRight: `1 solid ${theme.colors.line}`, fontSize: 8.5, lineHeight: 1.3 },
    tableHeaderText: { fontFamily: fonts.bodyBold, color: lightHeader ? theme.colors.primaryDark : theme.colors.onPrimary },
    header: { position: "absolute", top: 20, left: 42, right: 42, minHeight: 22, flexDirection: "row", alignItems: "center", borderBottom: `1 solid ${theme.colors.line}`, paddingBottom: 6, fontSize: 7.5, color: theme.colors.muted },
    headerDark: { backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, borderBottomColor: theme.colors.primary, paddingHorizontal: 8, paddingTop: 5 },
    headerLogo: { width: 42, height: 18, objectFit: "contain", marginRight: 8 },
    footer: { position: "absolute", bottom: 18, left: 42, right: 42, borderTop: `1 solid ${theme.colors.line}`, paddingTop: 6, fontSize: 7.5, color: theme.colors.muted, flexDirection: "row", justifyContent: "space-between" },
    footerDark: { backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, borderTopColor: theme.colors.primary, paddingHorizontal: 8, paddingBottom: 5 },
    approver: { marginTop: 12, fontSize: 9.5 },
    fieldGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6, marginTop: 14 },
    field: { width: "50%", paddingHorizontal: 6, marginBottom: 16 },
    fieldLine: { height: 24, borderBottom: `1 solid ${theme.colors.muted}` },
  });
}

function PdfCover({ context }: { context: RenderContext }) {
  const { model, policy, fonts, styles } = context;
  const { theme, cover } = model;
  const logo = cover.logo ? <Image src={cover.logo} style={{ width: 112, height: 46, objectFit: "contain", alignSelf: logoAlign(policy.logoPosition) }} /> : null;
  if (theme.layout.cover === "dossier-split") return (
    <View style={{ minHeight: 750, flexDirection: "row" }}>
      <View style={{ width: "35%", backgroundColor: theme.colors.primary, padding: 26, justifyContent: "space-between" }}><Text style={{ color: theme.colors.onPrimary, fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 2 }}>POLICY</Text><Text style={{ color: theme.colors.onPrimary, fontFamily: fonts.headingBold, fontSize: 26, transform: "rotate(-90deg)", marginHorizontal: -62 }}>BOARDROOM DOSSIER</Text><Text style={{ color: theme.colors.onPrimary, fontSize: 8, letterSpacing: 1.5 }}>EXECUTIVE EDITION</Text></View>
      <View style={{ width: "65%", padding: 34, justifyContent: "center" }}>{logo}<Text style={{ color: theme.colors.accent, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.5, marginTop: 38, marginBottom: 18 }}>SUSTAINABILITY GOVERNANCE</Text><Text style={{ fontFamily: fonts.headingBold, fontSize: 35, lineHeight: 1.05, marginBottom: 12 }}>{cover.policyLabel}</Text><Text style={{ color: theme.colors.muted, fontSize: 15, marginBottom: 34 }}>{cover.companyName}</Text><Metadata context={context} mode="strip" /></View>
    </View>
  );
  if (theme.layout.cover === "atlas-modular") return (
    <View style={{ minHeight: 750 }}>
      <View style={{ backgroundColor: theme.colors.soft, padding: 34, minHeight: 390, justifyContent: "center", overflow: "hidden" }}><View style={{ position: "absolute", width: 250, height: 250, borderRadius: 125, border: `18 solid ${theme.colors.primary}`, right: -90, top: -75, opacity: 0.13 }} /><View style={{ position: "absolute", width: 155, height: 155, borderRadius: 78, border: `9 solid ${theme.colors.accent}`, right: -20, top: 95, opacity: 0.22 }} />{logo}<Text style={{ color: theme.colors.primary, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.7, marginTop: 28, marginBottom: 15 }}>IMPACT ATLAS - POLICY 01</Text><Text style={{ fontFamily: fonts.headingBold, fontSize: 39, lineHeight: 1.03, width: "78%" }}>{cover.policyLabel}</Text><Text style={{ borderTop: `4 solid ${theme.colors.accent}`, color: theme.colors.muted, fontSize: 10.5, lineHeight: 1.4, marginTop: 26, paddingTop: 12, width: "72%" }}>A living map of commitments, ownership, and measurable targets.</Text></View>
      <View style={{ flexDirection: "row", minHeight: 285 }}><View style={{ width: "30%", backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, padding: 24, justifyContent: "space-between" }}><Text style={{ fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.5 }}>POLICY</Text><Text style={{ fontFamily: fonts.headingBold, fontSize: 50 }}>01</Text><Text style={{ fontSize: 8, letterSpacing: 1 }}>LIVING COMMITMENTS</Text></View><View style={{ width: "70%", padding: 26, justifyContent: "center" }}><Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, marginBottom: 18 }}>{cover.companyName}</Text><Metadata context={context} mode="compact" /></View></View>
    </View>
  );
  if (theme.layout.cover === "journal-editorial") return (
    <View style={{ minHeight: 750, borderTop: `7 solid ${theme.colors.accent}`, paddingTop: 24, overflow: "hidden" }}><View style={{ position: "absolute", width: 360, height: 360, borderRadius: 180, border: `1 solid ${theme.colors.line}`, right: -185, top: 95 }} /><View style={{ position: "absolute", width: 300, height: 300, borderRadius: 150, border: `1 solid ${theme.colors.line}`, right: -145, top: 125 }} />{logo}<View style={{ flexDirection: "row", marginTop: 150 }}><View style={{ width: "73%", paddingRight: 30 }}><Text style={{ color: theme.colors.accent, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1.6, marginBottom: 18 }}>FIELD JOURNAL - SUSTAINABILITY POLICY</Text><Text style={{ fontFamily: fonts.headingBold, fontSize: 41, lineHeight: 1.04, marginBottom: 16 }}>{cover.policyLabel}</Text><Text style={{ borderBottom: `1 solid ${theme.colors.line}`, paddingBottom: 14, color: theme.colors.muted, fontSize: 15 }}>{cover.companyName}</Text></View><View style={{ width: "27%", borderLeft: `1 solid ${theme.colors.line}`, paddingLeft: 18 }}>{cover.metadata.map((item) => <View key={item.label} style={{ borderTop: `2 solid ${theme.colors.accent}`, paddingTop: 6, marginBottom: 16 }}><Text style={styles.label}>{item.label}</Text><Text style={styles.value}>{item.value}</Text></View>)}</View></View></View>
  );
  return (
    <View style={{ minHeight: 750, border: `3 double ${theme.colors.primary}`, padding: 12 }}><View style={{ flex: 1, border: `1 solid ${theme.colors.primary}`, padding: 42, alignItems: "center", justifyContent: "center" }}>{logo}<Text style={{ color: theme.colors.primary, fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 2, marginTop: 38 }}>CORPORATE POLICY CHARTER</Text><View style={{ width: 105, borderTop: `1 solid ${theme.colors.accent}`, borderBottom: `1 solid ${theme.colors.accent}`, height: 7, marginVertical: 20 }} /><Text style={{ fontFamily: fonts.headingBold, fontSize: 37, lineHeight: 1.08, textAlign: "center", marginBottom: 15 }}>{cover.policyLabel}</Text><Text style={{ color: theme.colors.muted, fontSize: 14, textAlign: "center", marginBottom: 95 }}>{cover.companyName}</Text><Metadata context={context} mode="colophon" /></View></View>
  );
}

function Metadata({ context, mode }: { context: RenderContext; mode: "strip" | "compact" | "colophon" }) {
  const { model, styles } = context;
  return <View style={{ width: "100%", flexDirection: "row", flexWrap: "wrap" }}>{model.cover.metadata.map((item) => <View key={item.label} style={{ width: mode === "compact" ? "50%" : "25%", padding: 8, backgroundColor: mode === "strip" ? model.theme.colors.soft : undefined, borderTop: `1 solid ${mode === "colophon" ? model.theme.colors.primary : model.theme.colors.line}` }}><Text style={styles.label}>{item.label}</Text><Text style={styles.value}>{item.value}</Text></View>)}</View>;
}

function PdfToc({ context }: { context: RenderContext }) {
  const { model, styles, fonts } = context;
  const { theme } = model;
  const entries = model.acknowledgement ? [...model.tocEntries, { id: "acknowledgement", index: model.tocEntries.length + 1, title: model.acknowledgement.title }] : model.tocEntries;
  if (theme.layout.toc === "rail-index") return <View style={{ minHeight: 660, flexDirection: "row" }}><View style={{ width: "28%", backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, padding: 24, justifyContent: "space-between" }}><Text style={{ fontSize: 8, letterSpacing: 1.5 }}>DOCUMENT</Text><Text style={{ fontFamily: fonts.headingBold, fontSize: 29 }}>INDEX</Text><Text style={{ fontSize: 8, letterSpacing: 1.2 }}>{String(entries.length).padStart(2, "0")} SECTIONS</Text></View><View style={{ width: "72%", padding: 28 }}><Text style={{ fontFamily: fonts.headingBold, fontSize: 28, marginBottom: 22 }}>Contents</Text>{entries.map((entry) => <TocEntry key={entry.id} entry={entry} context={context} mode="rail" />)}</View></View>;
  if (theme.layout.toc === "tile-index") return <View><Text style={{ ...styles.label, color: theme.colors.primary, marginBottom: 8 }}>NAVIGATE THE POLICY</Text><Text style={{ fontFamily: fonts.headingBold, fontSize: 30, marginBottom: 18 }}>Contents</Text><View style={styles.twoColumn}>{entries.map((entry) => <View key={entry.id} style={styles.card}><Link src={`#${entry.id}`} style={{ ...styles.cardInner, backgroundColor: theme.colors.soft, textDecoration: "none", color: theme.colors.ink }}><Text style={styles.number}>{String(entry.index).padStart(2, "0")}</Text><Text style={{ fontFamily: fonts.bodyBold, fontSize: 10 }}>{entry.title}</Text><Text style={{ ...styles.label, marginTop: 8 }}>SECTION</Text></Link></View>)}</View></View>;
  if (theme.layout.toc === "editorial-index") return <View style={{ borderTop: `5 solid ${theme.colors.accent}`, paddingTop: 12 }}><Text style={{ ...styles.label, color: theme.colors.accent, marginBottom: 10 }}>INDEX</Text><Text style={{ fontFamily: fonts.headingBold, fontSize: 31, marginBottom: 30 }}>Inside this policy</Text><View style={styles.twoColumn}>{entries.map((entry) => <View key={entry.id} style={styles.card}><TocEntry entry={entry} context={context} mode="editorial" /></View>)}</View></View>;
  return <View style={{ width: "78%", alignSelf: "center" }}><Text style={{ fontFamily: fonts.headingBold, color: theme.colors.primary, fontSize: 27, letterSpacing: 1.8, textAlign: "center", marginBottom: 28 }}>-------- CONTENTS --------</Text>{entries.map((entry) => <TocEntry key={entry.id} entry={entry} context={context} mode="leaders" />)}</View>;
}

function TocEntry({ entry, context, mode }: { entry: { id: string; index: number; title: string }; context: RenderContext; mode: "leaders" | "rail" | "editorial" }) {
  const { model, fonts } = context;
  return <Link src={`#${entry.id}`} style={{ flexDirection: "row", alignItems: "baseline", borderBottom: `${mode === "leaders" ? 0.7 : 1} ${mode === "leaders" ? "dotted" : "solid"} ${model.theme.colors.line}`, paddingVertical: mode === "editorial" ? 10 : 7, textDecoration: "none", color: model.theme.colors.ink }}><Text style={{ width: mode === "editorial" ? 38 : 28, fontFamily: fonts.headingBold, fontSize: mode === "editorial" ? 18 : 10, color: mode === "rail" ? model.theme.colors.accent : model.theme.colors.primary }}>{String(entry.index).padStart(2, "0")}</Text><Text style={{ flex: 1, fontSize: 10 }}>{entry.title}</Text></Link>;
}

function PdfSection({ section, context }: { section: DocumentRenderSection; context: RenderContext }) {
  const { model, styles, fonts } = context;
  const { theme } = model;
  const content = <SectionContent section={section} context={context} />;
  if (theme.layout.pageFrame === "numbered-rail" && section.density !== "dense") return <View id={section.id} style={{ ...styles.section, flexDirection: "row" }} wrap={false}><View style={{ width: "13%", backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, padding: 10, justifyContent: "space-between", alignItems: "center" }}><Text style={{ fontFamily: fonts.headingBold, fontSize: 22 }}>{String(section.index).padStart(2, "0")}</Text><Text style={{ fontSize: 6.5, letterSpacing: 1, transform: "rotate(-90deg)", marginVertical: 28 }}>{section.kind.toUpperCase()}</Text></View><View style={{ width: "87%", padding: 16 }}><SectionTitle section={section} context={context} />{content}</View></View>;
  if (theme.layout.pageFrame === "editorial-margin" && section.density !== "dense") return <View id={section.id} style={{ ...styles.section, flexDirection: "row" }}><View style={{ width: "17%", paddingRight: 12 }}><Text style={{ fontFamily: fonts.headingBold, fontSize: 34, color: theme.colors.accent }}>{String(section.index).padStart(2, "0")}</Text><Text style={{ ...styles.label, marginTop: 8 }}>{section.kind}</Text></View><View style={{ width: "83%" }}><SectionTitle section={section} context={context} />{content}</View></View>;
  return <View id={section.id} style={styles.section}><SectionTitle section={section} context={context} />{content}</View>;
}

function SectionTitle({ section, context }: { section: DocumentRenderSection; context: RenderContext }) {
  const { model, styles } = context;
  const { theme } = model;
  const index = String(section.index).padStart(2, "0");
  if (theme.layout.sectionOpener === "formal-ordinal") return <Text style={{ ...styles.sectionTitle, textAlign: "center", letterSpacing: 1.1, borderBottom: `1 solid ${theme.colors.accent}`, paddingBottom: 7 }}>{section.title.toUpperCase()} - {index}</Text>;
  if (theme.layout.sectionOpener === "statement-band") return <Text style={{ ...styles.sectionTitle, backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, padding: 10, letterSpacing: 0.8 }}>{index}   {section.title.toUpperCase()}</Text>;
  if (theme.layout.sectionOpener === "chapter-number") return <Text style={{ ...styles.sectionTitle, borderTop: `4 solid ${theme.colors.accent}`, paddingTop: 8 }}>{section.title}</Text>;
  return <Text style={{ ...styles.sectionTitle, borderBottom: `3 solid ${theme.colors.primary}`, paddingBottom: 7 }}>{section.title}</Text>;
}

function SectionContent({ section, context }: { section: DocumentRenderSection; context: RenderContext }) {
  const { model, policy, styles, fonts, sdgImages } = context;
  const { content } = section;
  const modular = model.theme.layout.pageFrame === "modular-grid";
  const paired = (model.theme.layout.pageFrame === "numbered-rail" || modular) && section.density !== "dense";
  switch (content.type) {
    case "narrative": return <View>{content.text.split(/\r?\n+/).filter(Boolean).map((paragraph, index) => <Text key={index} style={[styles.paragraph, model.theme.layout.pageFrame === "editorial-margin" && index === 0 ? { fontSize: model.typography.paragraphSize + 1, lineHeight: 1.55 } : {}]}>{paragraph}</Text>)}{content.sites?.length ? <PdfTable headers={["Location / Unit", "Address", "Primary Function"]} rows={content.sites.map((site, index) => [site.location || `Site ${index + 1}`, site.address, site.primaryFunction || "Operating Site"])} widths={[24, 51, 25]} context={context} /> : null}</View>;
    case "focus": return paired ? <View style={styles.twoColumn}>{content.areas.map((area, index) => <PdfCard key={index} index={index + 1} title={area} context={context} filled={modular} />)}</View> : <View>{content.areas.map((area, index) => <EditorialRow key={index} index={index + 1} title={area} context={context} />)}</View>;
    case "qualitative": return paired ? <View style={styles.twoColumn}>{content.groups.map((group, index) => <PdfCard key={group.area} index={index + 1} title={group.area} lines={group.items} context={context} filled={modular} />)}</View> : <View>{content.groups.map((group, index) => <View key={group.area} wrap={false} style={{ marginBottom: 10 }}><Text style={styles.subheading}>{String(index + 1).padStart(2, "0")}  {group.area}</Text>{group.items.map((item, itemIndex) => <Bullet key={itemIndex} text={item} styles={styles} />)}</View>)}</View>;
    case "quantitative": {
      const targets = content.areas.flatMap((area) => area.targets.filter((target) => target.target).map((target) => ({ ...target, area: area.area })));
      return <View><Text style={{ ...styles.paragraph, color: model.theme.colors.muted, fontSize: 8.5 }}>Targets are tracked against a defined period or reported annually as ongoing commitments.</Text>{model.theme.layout.dataLayout === "target-bands" && policy.visualStyle !== "corporate" && section.density !== "dense" ? targets.map((target, index) => <TargetBand key={index} target={target} index={index + 1} context={context} />) : model.theme.layout.dataLayout === "quiet-rules" && policy.visualStyle !== "corporate" && section.density !== "dense" ? targets.map((target, index) => <JournalTarget key={index} target={target} context={context} />) : <PdfTable headers={["#", "Focus Area", "Target", "Baseline", "Deadline", "Reporting"]} rows={targets.map((target, index) => [String(index + 1), target.area, target.target, target.reportingFrequency === "Annually" ? "-" : target.baseline, target.reportingFrequency === "Annually" ? "-" : target.deadline, target.reportingFrequency || "Target period"])} widths={[5, 18, 33, 13, 13, 18]} context={context} />}</View>;
    }
    case "responsibilities":
      if (model.theme.layout.dataLayout === "formal-grid" && policy.visualStyle === "corporate") return <PdfTable headers={["Role / Department", "Responsibility"]} rows={content.entries.map((entry) => [entry.role, entry.duty])} widths={[30, 70]} context={context} />;
      return paired ? <View style={styles.twoColumn}>{content.entries.map((entry, index) => <PdfCard key={index} index={index + 1} title={entry.role} lines={[entry.duty]} context={context} filled={modular} />)}</View> : <View>{content.entries.map((entry, index) => <EditorialRow key={index} index={index + 1} title={entry.role} body={entry.duty} context={context} />)}</View>;
    case "sdg": return <View><Text style={styles.paragraph}>This policy aligns with the following United Nations Sustainable Development Goals:</Text>{policy.sdgDisplay === "tiles" && content.goals.every((goal) => sdgImages.has(goal.number)) ? <View style={styles.twoColumn}>{content.goals.map((goal) => <View key={goal.number} style={{ width: model.theme.layout.dataLayout === "target-bands" ? "33.33%" : "25%", padding: 4 }}><Image src={sdgImages.get(goal.number)!} style={{ width: "100%", aspectRatio: 1, objectFit: "contain" }} />{model.theme.layout.dataLayout === "target-bands" ? <Text style={{ fontFamily: fonts.bodyBold, fontSize: 7, textAlign: "center", marginTop: 4 }}>{goal.label}</Text> : null}</View>)}</View> : <View>{content.goals.map((goal) => <View key={goal.number} style={{ flexDirection: "row", marginBottom: 6 }}><Text style={{ width: 58, backgroundColor: goal.color, color: "#FFFFFF", fontFamily: fonts.bodyBold, fontSize: 8, padding: 6 }}>SDG {goal.number}</Text><Text style={{ flex: 1, borderBottom: `1 solid ${model.theme.colors.line}`, color: goal.color, fontFamily: fonts.bodyBold, fontSize: 9, padding: 6 }}>{goal.label}</Text></View>)}</View>}</View>;
    case "revision": return <PdfTable headers={["Revision No.", "Date", "Description of Change"]} rows={content.entries.map((entry) => [entry.revisionNo, entry.date, entry.description])} widths={[20, 25, 55]} context={context} />;
    case "custom": return <CustomBlocks blocks={content.blocks} context={context} />;
  }
}

function PdfCard({ index, title, lines = [], context, filled }: { index: number; title: string; lines?: string[]; context: RenderContext; filled: boolean }) {
  const { model, styles } = context;
  return <View style={styles.card} wrap={false}><View style={[styles.cardInner, filled ? { backgroundColor: model.theme.colors.soft, borderColor: model.theme.colors.soft } : {}]}><Text style={styles.number}>{String(index).padStart(2, "0")}</Text><Text style={styles.subheading}>{title}</Text>{lines.map((line, lineIndex) => <Bullet key={lineIndex} text={line} styles={styles} />)}</View></View>;
}

function EditorialRow({ index, title, body, context }: { index: number; title: string; body?: string; context: RenderContext }) {
  const { model, fonts } = context;
  const editorial = model.theme.layout.pageFrame === "editorial-margin";
  return <View style={{ flexDirection: "row", borderTop: `1 solid ${model.theme.colors.line}`, paddingVertical: 8 }} wrap={false}><Text style={{ width: 36, fontFamily: fonts.headingBold, color: editorial ? model.theme.colors.accent : model.theme.colors.primary, fontSize: editorial ? 17 : 10 }}>{String(index).padStart(2, "0")}</Text><View style={{ flex: 1 }}><Text style={{ fontFamily: body ? fonts.bodyBold : fonts.headingBold, fontSize: 10 }}>{title}</Text>{body ? <Text style={{ fontSize: 9, lineHeight: 1.4, marginTop: 4 }}>{body}</Text> : null}</View></View>;
}

function TargetBand({ target, index, context }: { target: { area: string; target: string; baseline: string; deadline: string; reportingFrequency?: string }; index: number; context: RenderContext }) {
  const { model, styles, fonts } = context;
  return <View style={{ flexDirection: "row", backgroundColor: model.theme.colors.soft, marginBottom: 7 }} wrap={false}><Text style={{ width: "10%", fontFamily: fonts.headingBold, color: model.theme.colors.primary, fontSize: 15, padding: 9 }}>{String(index).padStart(2, "0")}</Text><View style={{ width: "63%", padding: 9, borderLeft: `1 solid ${model.theme.colors.line}`, borderRight: `1 solid ${model.theme.colors.line}` }}><Text style={styles.subheading}>{target.area}</Text><Text style={{ fontSize: 9, lineHeight: 1.35 }}>{target.target}</Text></View><View style={{ width: "27%", padding: 9 }}><Text style={{ fontFamily: fonts.bodyBold, fontSize: 7.5 }}>{target.reportingFrequency === "Annually" ? "REPORTED ANNUALLY" : target.deadline || "TARGET PERIOD"}</Text><Text style={{ color: model.theme.colors.muted, fontSize: 7.5, marginTop: 5 }}>{target.reportingFrequency === "Annually" ? "Ongoing" : target.baseline || "No baseline"}</Text></View></View>;
}

function JournalTarget({ target, context }: { target: { area: string; target: string; baseline: string; deadline: string; reportingFrequency?: string }; context: RenderContext }) {
  const { model, styles } = context;
  return <View style={{ borderTop: `1 solid ${model.theme.colors.line}`, paddingVertical: 9 }} wrap={false}><Text style={{ ...styles.subheading, color: model.theme.colors.accent }}>{target.area}</Text><Text style={{ fontSize: 9, lineHeight: 1.4 }}>{target.target}</Text><Text style={{ color: model.theme.colors.muted, fontSize: 8, fontStyle: "italic", marginTop: 5 }}>{target.reportingFrequency === "Annually" ? "Reported annually" : `Baseline ${target.baseline || "-"} - Due ${target.deadline || "-"}`}</Text></View>;
}

function PdfTable({ headers, rows, widths, context }: { headers: string[]; rows: string[][]; widths: number[]; context: RenderContext }) {
  const { model, styles, fonts } = context;
  const quiet = model.theme.layout.dataLayout === "quiet-rules";
  return <View style={[styles.table, quiet ? { borderLeft: 0, borderTopColor: model.theme.colors.accent } : {}]}><View style={[styles.tableRow, styles.tableHeader, quiet ? { backgroundColor: model.theme.colors.paper } : {}]} fixed>{headers.map((header, index) => <Text key={header} style={[styles.tableCell, styles.tableHeaderText, { width: `${widths[index]}%` }]}>{header}</Text>)}</View>{rows.map((row, rowIndex) => <View key={rowIndex} style={[styles.tableRow, model.theme.layout.dataLayout === "target-bands" && rowIndex % 2 === 1 ? { backgroundColor: model.theme.colors.soft } : {}]} wrap={false}>{headers.map((_, columnIndex) => <Text key={columnIndex} style={[styles.tableCell, quiet ? { borderRight: 0 } : {}, { width: `${widths[columnIndex]}%`, fontFamily: columnIndex === 0 && headers.length <= 3 ? fonts.bodyBold : undefined }]}>{row[columnIndex] || ""}</Text>)}</View>)}</View>;
}

function CustomBlocks({ blocks, context }: { blocks: RichTextBlock[]; context: RenderContext }) {
  const { styles } = context;
  return <View>{blocks.map((block) => {
    if (block.type === "paragraph") return <Text key={block.id} style={styles.paragraph}>{block.text}</Text>;
    if (block.type === "table") { const columns = block.columns || []; return columns.length ? <PdfTable key={block.id} headers={columns} rows={block.rows || []} widths={columns.map(() => 100 / columns.length)} context={context} /> : null; }
    return <View key={block.id}>{block.text.split(/\r?\n+/).filter(Boolean).map((item, index) => <Bullet key={index} text={item} styles={styles} number={block.type === "numbered" ? index + 1 : undefined} />)}</View>;
  })}</View>;
}

function Bullet({ text, styles, number }: { text: string; styles: Styles; number?: number }) {
  return <View style={styles.bullet}><Text style={styles.bulletMark}>{number ? `${number}.` : "-"}</Text><Text style={styles.bulletText}>{text}</Text></View>;
}

function PdfAcknowledgement({ context }: { context: RenderContext }) {
  const { model, fonts } = context;
  const { theme } = model;
  const body = <AckBody context={context} />;
  if (theme.layout.acknowledgement === "approval-block") return <View id="acknowledgement" style={{ minHeight: 645, flexDirection: "row" }}><View style={{ width: "15%", backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, alignItems: "center", justifyContent: "center" }}><Text style={{ fontFamily: fonts.headingBold, fontSize: 23, transform: "rotate(-90deg)" }}>ACK</Text></View><View style={{ width: "85%", padding: 28 }}>{body}</View></View>;
  if (theme.layout.acknowledgement === "legal-form") return <View id="acknowledgement" style={{ minHeight: 645, border: `3 double ${theme.colors.primary}`, padding: 38, justifyContent: "center" }}>{body}</View>;
  if (theme.layout.acknowledgement === "signature-panel") return <View id="acknowledgement"><Text style={{ backgroundColor: theme.colors.primary, color: theme.colors.onPrimary, fontFamily: fonts.bodyBold, letterSpacing: 1.5, padding: 10, fontSize: 9 }}>FINAL COMMITMENT</Text><View style={{ paddingTop: 28 }}>{body}</View></View>;
  return <View id="acknowledgement" style={{ borderTop: `6 solid ${theme.colors.accent}`, paddingTop: 14 }}><Text style={{ color: theme.colors.accent, fontFamily: fonts.bodyBold, fontSize: 8, letterSpacing: 1.2, marginBottom: 24 }}>AFFIDAVIT OF ACKNOWLEDGEMENT</Text>{body}</View>;
}

function AckBody({ context }: { context: RenderContext }) {
  const { model, styles, fonts } = context;
  const acknowledgement = model.acknowledgement!;
  const centered = model.theme.layout.acknowledgement === "legal-form";
  return <View><Text style={{ fontFamily: fonts.headingBold, fontSize: 24, color: model.theme.colors.primaryDark, textAlign: centered ? "center" : "left", marginBottom: 18 }}>{acknowledgement.title}</Text><Text style={{ fontSize: 10, lineHeight: 1.6, textAlign: centered ? "center" : "justify", marginBottom: 15 }}>{acknowledgement.statement}</Text><View style={styles.fieldGrid}>{acknowledgement.fields.map((field) => <View key={field} style={[styles.field, model.theme.layout.acknowledgement === "signature-panel" ? { backgroundColor: model.theme.colors.soft, padding: 10 } : {}]}><Text style={styles.label}>{field}</Text><View style={[styles.fieldLine, field === "Signature" ? { height: 38 } : {}]} /></View>)}</View></View>;
}

function RunningHeader({ context }: { context: RenderContext }) {
  const { model, policy, styles } = context;
  const dark = model.theme.layout.runningFurniture === "breadcrumb-bar";
  return <View style={[styles.header, dark ? styles.headerDark : {}]} fixed>{model.cover.logo ? <Image src={model.cover.logo} style={styles.headerLogo} /> : null}<Text style={{ flex: 1, textAlign: policy.logoPosition === "right" ? "right" : policy.logoPosition === "center" ? "center" : "left", letterSpacing: 0.8 }}>{dark ? "POLICY / GOVERNANCE / CURRENT" : model.cover.companyName.toUpperCase()}</Text></View>;
}

function RunningFooter({ context }: { context: RenderContext }) {
  const { model, styles } = context;
  const dark = model.theme.layout.runningFurniture === "breadcrumb-bar";
  return <View style={[styles.footer, dark ? styles.footerDark : {}]} fixed><Text>Effective {model.footer.effectiveDate} - Revision {model.footer.revision}</Text><Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} /></View>;
}

function boldPdfFont(font: PdfFont): Fonts["bodyBold"] {
  if (font === "Times-Roman") return "Times-Bold";
  if (font === "Courier") return "Courier-Bold";
  return "Helvetica-Bold";
}

function logoAlign(position?: Policy["logoPosition"]): "flex-start" | "center" | "flex-end" {
  if (position === "right") return "flex-end";
  if (position === "center") return "center";
  return "flex-start";
}

async function loadSdgImages(numbers: number[]) {
  const images = new Map<number, string>();
  await Promise.all(numbers.map(async (number) => {
    try {
      const image = await readFile(path.join(process.cwd(), "public", "E SDG Icons PRINT", `E_SDG_PRINT-${String(number).padStart(2, "0")}.jpg`));
      images.set(number, `data:image/jpeg;base64,${image.toString("base64")}`);
    } catch {
      // The named fallback is print-safe when a local SDG tile is unavailable.
    }
  }));
  return images;
}
