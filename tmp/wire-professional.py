exec(Path('D:/Policy PoC/tmp/implement-professional.py').read_text().split("edit('lib/types.ts'")[0]) if False else None
from pathlib import Path
root=Path('D:/Policy PoC/src')
def edit(name, old, new):
 p=root/name; s=p.read_text(encoding='utf-8'); assert old in s,(name,old[:60]); p.write_text(s.replace(old,new),encoding='utf-8')
edit('components/builder/dock-sections.tsx','import { useBuilder }','import { policyPreviewKey, usePdfPreviewState } from "@/lib/pdf-preview-state";\nimport { getPolicyProfile } from "@/lib/constants";\nimport { useBuilder }')
edit('components/builder/dock-sections.tsx','  const { push } = useToast();','  const { push } = useToast();\n  const preview = usePdfPreviewState();\n  const pdfReady = preview.key === policyPreviewKey(policy) && !!preview.blob;')
edit('components/builder/dock-sections.tsx','      const res = await fetch(url, {','      if (kind === "pdf" && !pdfReady) throw new Error("Wait for the current preview.");\n      const res = kind === "pdf" ? null : await fetch(url, {')
edit('components/builder/dock-sections.tsx','      if (!res.ok) throw new Error("Export failed");\n      const blob = await res.blob();','      if (res && !res.ok) throw new Error("Export failed");\n      const blob = kind === "pdf" ? preview.blob! : await res!.blob();')
edit('components/builder/dock-sections.tsx','`Environmental-Policy_${fileBase}.${kind}`','`${getPolicyProfile(policy.policyType).exportName}_${fileBase}.${kind}`')
edit('components/builder/dock-sections.tsx','return { exporting, download };','return { exporting, download, pdfReady };')
edit('components/builder/shell.tsx','import { DockOptionsPanel, DockExportPanel, DockSummaryPanel } from "@/components/builder/dock-sections";','import { DesignInspector } from "@/components/builder/design-inspector";\nimport { usePolicyDownload } from "@/components/builder/dock-sections";')
p=root/'components/builder/shell.tsx'; s=p.read_text(); a=s.index('type DockSectionId'); b=s.index('export function BuilderShell'); s=s[:a]+s[b:]; a=s.index('  const [openSection'); b=s.index('  React.useLayoutEffect',a); s=s[:a]+'''  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const { download, exporting, pdfReady } = usePolicyDownload();
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") { event.preventDefault(); setInspectorOpen(value => !value); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
''' +s[b:]; s=s.replace('{showSidebar && (','{showSidebar && step !== "export" && (',1); a=s.index('            {showSidebar && (',s.index('{topActions}')); b=s.index('\n          </div>',a); s=s[:a]+'''            {step === "export" && <div className="flex gap-2"><button type="button" disabled={!pdfReady || !!exporting} onClick={() => download("pdf")} className="rounded-lg bg-[var(--color-forest)] px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40">{exporting === "pdf" ? "Downloading…" : "Download PDF"}</button><button type="button" disabled={!!exporting} onClick={() => download("docx")} className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-[13px]">Word</button></div>}
            {showSidebar && <button type="button" aria-expanded={inspectorOpen} aria-controls="design-inspector" onClick={() => setInspectorOpen(value => !value)} className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-[13px]">{inspectorOpen ? "Hide controls" : "Design controls"}</button>}
''' +s[b:]; a=s.index('\n      {showSidebar && (',s.index('</main>')); s=s[:a]+'''
      {showSidebar && <DesignInspector open={inspectorOpen} onClose={() => setInspectorOpen(false)} />}
    </div>
  );
}
'''; s=s.replace('import { ThemeInspector } from "@/components/builder/theme-inspector";\n',''); s=s.replace('Palette, SlidersHorizontal, Download, ClipboardList, X',''); s=s.replace('const pathname = usePathname();',''); s=s.replace('import { usePathname } from "next/navigation";\n',''); s=s.replace('flex items-center justify-between gap-4">','flex flex-wrap items-center justify-between gap-4">'); s=s.replace('flex items-center gap-2 flex-shrink-0','flex flex-wrap items-center gap-2'); p.write_text(s,encoding='utf-8')
edit('app/builder/BuilderClient.tsx','        Continue\n      </Button>','        Continue\n      </Button>')
p=root/'app/builder/BuilderClient.tsx'; s=p.read_text(); a=s.rfind('      <Button',0,s.index('        Continue')); b=s.index('</Button>',a)+len('</Button>'); s=s[:a]+'      {!isLast && ('+s[a:b].strip()+')}'+s[b:]; p.write_text(s,encoding='utf-8')
edit('components/builder/theme-inspector.tsx','export function ThemeInspector() {','export function ThemeInspector({ designOnly = false }: { designOnly?: boolean }) {')
edit('components/builder/theme-inspector.tsx','React.useState<"gallery" | "editor">("gallery")','React.useState<"gallery" | "editor">(designOnly ? "editor" : "gallery")')
edit('components/builder/theme-inspector.tsx','  const [search, setSearch]','  const [showLegacy, setShowLegacy] = React.useState(false);\n  const [search, setSearch]')
edit('components/builder/theme-inspector.tsx','  const filteredPublic = DOCUMENT_THEMES.filter((theme) => {','  const filteredPublic = DOCUMENT_THEMES.filter((theme) => {\n    if (!showLegacy && theme.collection !== "professional") return false;')
edit('components/builder/theme-inspector.tsx','  if (view === "editor") {','  if (view === "editor" || designOnly) {')
edit('components/builder/theme-inspector.tsx','import { ThemeContactSheet }','import { PageBorderControls } from "./page-border-controls";\nimport { PdfPolicyPreview } from "@/components/policy/pdf-policy-preview";\nimport { ThemeContactSheet }')
edit('components/builder/theme-inspector.tsx','documentThemeOverrides: transform(getFullThemeOverrides(current, themeName.trim() || undefined))','documentThemeOverrides: transform(getFullThemeOverrides(current, themeName.trim() || undefined)), templateBrandOverrides: transform(getFullThemeOverrides(current, themeName.trim() || undefined))')
edit('components/builder/theme-inspector.tsx','documentThemeOverrides: getFullThemeOverrides(current) }','documentThemeOverrides: getFullThemeOverrides(current), templateBrandOverrides: getFullThemeOverrides(current) }')
edit('components/builder/theme-inspector.tsx','              <InspectorHeading title="Design"','              <PageBorderControls />\n              <InspectorHeading title="Design"')
edit('components/builder/theme-inspector.tsx','Templates change composition only. Brand controls stay separate.','Choose a layout for your policy. Preview it with your content before applying.')
edit('components/builder/theme-inspector.tsx','      <div className="max-h-[58vh] overflow-y-auto p-3 scrollbar-thin">','      <label className="flex items-center gap-2 px-4 py-3 text-[13px]"><input type="checkbox" checked={showLegacy} onChange={event => setShowLegacy(event.target.checked)} /> Legacy templates</label>\n      <div className="p-3">')
edit('components/builder/theme-inspector.tsx','<ThemeContactSheet theme={previewTheme} companyName={policy.company.name} policyLabel={profile.label} />','<div className="max-h-[65vh] overflow-auto"><PdfPolicyPreview policy={{ ...policy, ...getDocumentTemplatePatch(previewTheme.id, policy) }} /></div>')
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
