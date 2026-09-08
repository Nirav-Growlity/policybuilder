from pathlib import Path
root=Path('D:/Policy PoC/src')
def edit(name, old, new):
 p=root/name; s=p.read_text(encoding='utf-8'); assert old in s,(name,old[:60]); p.write_text(s.replace(old,new),encoding='utf-8')
edit('components/builder/dock-sections.tsx','import { useBuilder }','import { policyPreviewKey, usePdfPreviewState } from "@/lib/pdf-preview-state";\nimport { getPolicyProfile } from "@/lib/constants";\nimport { useBuilder }')
p=root/'components/builder/theme-inspector.tsx'; s=p.read_text(); import re; s=re.sub(r'text-\[(?:9|9\.5|10|10\.5|11|11\.5|12|12\.5)px\]', 'text-[13px]', s); s=s.replace('max-h-[58vh] overflow-y-auto ',''); s=s.replace('rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] shadow-[var(--shadow-soft)]','bg-white'); p.write_text(s,encoding='utf-8')
for file in ['app/preview/[id]/page.tsx','components/templates/universal-template-catalog.tsx']:
 edit(file,'import { PolicyPreview } from "@/components/policy/policy-preview";','import { PdfPolicyPreview as PolicyPreview } from "@/components/policy/pdf-policy-preview";')
edit('components/templates/universal-template-catalog.tsx','  const [query, setQuery]','  const [legacy, setLegacy] = React.useState(false);\n  const [query, setQuery]')
edit('components/templates/universal-template-catalog.tsx','  const filtered = templates.filter((t) => {','  const filtered = templates.filter((t) => {\n    if (!legacy && t.collection !== "professional") return false;')
edit('components/templates/universal-template-catalog.tsx','        {filtered.length ? (','        <label className="mb-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={legacy} onChange={e => setLegacy(e.target.checked)} /> Include legacy templates</label>\n        {filtered.length ? (')
# Route older direct PDF imports through the same print implementation.
(root/'lib/pdf/preview-pdf.tsx').write_text('export { generatePreviewPdf } from "./print-document";\n')
# Per-request Word geometry; AsyncLocalStorage isolates concurrent exports.
edit('lib/docx/generate.ts','import { readFile }','import { AsyncLocalStorage } from "node:async_hooks";\nimport { A4, pageMarginMm } from "../page-geometry";\nimport { getPolicyDocumentTheme } from "../document-themes";\nimport { readFile }')
edit('lib/docx/generate.ts','const PAGE_MARGIN = 1000;\nconst CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;','const geometry = new AsyncLocalStorage<number>();\nconst pageMargin = () => geometry.getStore() ?? 1000;\nconst contentWidth = () => PAGE_WIDTH - pageMargin() * 2;')
p=root/'lib/docx/generate.ts'; s=p.read_text().replace('PAGE_MARGIN','pageMargin()').replace('CONTENT_WIDTH','contentWidth()'); s=s.replace('export async function generateDocx(inputPolicy: Policy): Promise<Buffer> {','''export async function generateDocx(inputPolicy: Policy): Promise<Buffer> {
  const theme = getPolicyDocumentTheme(inputPolicy);
  const margin = theme.collection === "professional" || theme.pageBorder.enabled ? Math.round(pageMarginMm(theme.pageBorder) * A4.pointsPerMm * 20) : 1000;
  return geometry.run(margin, () => generateDocxDocument(inputPolicy));
}
async function generateDocxDocument(inputPolicy: Policy): Promise<Buffer> {'''); s=s.replace('          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },','''          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          ...(theme.pageBorder.enabled ? { borders: {
            pageBorders: { display: theme.pageBorder.scope === "cover" ? "firstPage" as const : "allPages" as const, offsetFrom: "text" as const },
            ...Object.fromEntries(["pageBorderTop", "pageBorderRight", "pageBorderBottom", "pageBorderLeft"].map(side => [side, { style: BorderStyle.SINGLE, color: documentHex(theme.pageBorder.color || theme.colors.primary), size: theme.pageBorder.widthPt * 8, space: Math.round(pageMargin() / 20 - theme.pageBorder.insetMm * A4.pointsPerMm) }]))
          } } : {}),'''); marker='  const centeredHead = (titleSize = 64): Paragraph[] => ['; a=s.index(marker); s=s[:a]+'''  if (theme.collection === "professional") {
    const alignment = theme.id === "institutional-classic-v1" ? AlignmentType.CENTER : AlignmentType.LEFT;
    return [logoParagraph, spacer(theme.id === "modern-minimal-v1" ? 700 : 1700),
      coverTitleParagraph(cover.policyLabel, theme, typography, theme.id === "modern-minimal-v1" ? 56 : 68, undefined, alignment),
      coverCompanyParagraph(cover.companyName, theme, typography, undefined, alignment), spacer(700),
      ...cover.metadata.map(item => new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: item.label + "   ", color: muted, size: 18, font: typography.fontFamily }), new TextRun({ text: item.value, size: 22, font: typography.fontFamily })] }))];
  }
''' +s[a:]; s=s.replace('  const frame = theme.layout.pageFrame;\n  const title = sectionTitle(section, typography, theme);','  const frame = theme.layout.pageFrame;\n  const title = sectionTitle(section, typography, theme);\n  if (theme.collection === "professional") return [title, ...content, spacer(Math.round(180 * spacingScale))];'); p.write_text(s,encoding='utf-8')
