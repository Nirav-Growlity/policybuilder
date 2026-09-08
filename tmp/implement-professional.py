from pathlib import Path
root=Path('D:/Policy PoC/src')
def edit(name, old, new):
 p=root/name; s=p.read_text(encoding='utf-8'); assert old in s, (name,old[:80]); p.write_text(s.replace(old,new),encoding='utf-8')
edit('lib/types.ts','export type DocumentTemplateId =','export type DocumentTemplateId =\n  | "corporate-standard-v1" | "executive-editorial-v1" | "governance-manual-v1"\n  | "modern-minimal-v1" | "sustainability-report-v1" | "institutional-classic-v1"')
edit('lib/types.ts','export type DocumentThemeOverrides = {','export type PageBorder = { enabled: boolean; widthPt: number; insetMm: number; color?: string; scope: "all" | "cover" };\n\nexport type DocumentThemeOverrides = {\n  pageBorder?: PageBorder;')
edit('lib/document-themes.ts','import type { CoverMotifScene }','import { normalizePageBorder } from "./page-geometry";\nimport type { PageBorder } from "./types";\nimport type { CoverMotifScene }')
edit('lib/document-themes.ts','  id: DocumentTemplateId;','  collection?: "professional";\n  id: DocumentTemplateId;')
edit('lib/document-themes.ts','  customThemeName?: string;','  pageBorder: PageBorder;\n  customThemeName?: string;')
edit('lib/document-themes.ts','DEFAULT_DOCUMENT_THEME_ID: DocumentTemplateId = "governance-manual"','DEFAULT_DOCUMENT_THEME_ID: DocumentTemplateId = "corporate-standard-v1"')
specs=[
('corporate-standard-v1','Corporate Standard','White paper, precise navy rules and a clear document hierarchy.','Clean essentials','Core','corporate','charter','civic','civic-plain','#233F59','balanced'),
('executive-editorial-v1','Executive Editorial','Generous spacing and serif headlines for executive review.','Executive','Leadership','editorial','journal','decision','decision-stamp','#333D47','spacious'),
('governance-manual-v1','Governance Manual','Numbered sections, formal tables and controlled document metadata.','Governance','Control','regulatory','dossier','exhibit','exhibit-file','#2D4351','balanced'),
('modern-minimal-v1','Modern Minimal','Clean sans-serif typography with quiet gray dividers.','Clean essentials','Core','minimal','charter','memo','routing-slip','#424C50','compact'),
('sustainability-report-v1','Sustainability Report','Muted green, editorial headings and optional company photography.','Impact','Impact','impact','journal','civic','canopy-band','#365E50','balanced'),
('institutional-classic-v1','Institutional Classic','Centered cover and a traditional serif hierarchy.','Institutional','Institutional','corporate','charter','colonnade','colonnade-rule','#45473E','balanced')]
lines=[]
for id,name,desc,fam,uf,intent,style,font,cover,color,density in specs:
 image='["cover", "section"]' if 'sustainability' in id else '[]'
 layout={'charter':'clean-essentials','journal':'editorial','dossier':'governance'}[style]
 lines.append(f'''  theme({{ id: "{id}", collection: "professional", name: "{name}", description: "{desc}", family: "{fam}", universalFamily: "{uf}", intent: "{intent}", tags: ["professional", "policy"], imageSupport: {image}, previewRecipe: "Actual document pages", colors: palette("{color}", "{color}", "#F1F3F2", "#FFFFFF", "#242B2E", "#626C70", "#D6DDDE", "{color}"), layout: makeLayout("{layout}", "{style}", "{desc}", ["Professional", "Readable", "Print ready"], "{'restrained-cover' if image!='[]' else 'none'}", {{ cover: "{cover}", motif: "{cover}", dataLayout: "{'formal-grid' if 'governance' in id else 'quiet-rules'}", acknowledgement: "approval-block" }}), defaults: {{ typography: {{ ...fonts.{font}, {'fontFamily: "Inter", headingFontFamily: "Inter", ' if 'modern' in id else ''}paragraphSize: 11 }}, visualStyle: "corporate", logoPosition: "{'center' if 'institutional' in id else 'left'}", sdgDisplay: "names", density: "{density}" }} }}),''')
edit('lib/document-themes.ts','export const DOCUMENT_THEMES: readonly DocumentThemeDefinition[] = [','export const DOCUMENT_THEMES: readonly DocumentThemeDefinition[] = [\n'+'\n'.join(lines))
edit('lib/document-themes.ts','return { ...base, customThemeName:', 'return { ...base, pageBorder: normalizePageBorder(overrides.pageBorder), customThemeName:')
edit('lib/document-themes.ts','...(policy?.typography !== undefined ? { typography: policy.typography } : {}),','typography: policy?.typography && JSON.stringify(policy.typography) !== JSON.stringify(getDocumentTheme((policy as Policy).documentTemplate ?? (policy as Policy).documentTheme).defaults.typography) ? policy.typography : { ...selected.defaults.typography },')
edit('lib/document-themes.ts','export function defaultThemeBackground(selected: DocumentThemeDefinition): ThemeBackground { return','export function defaultThemeBackground(selected: DocumentThemeDefinition): ThemeBackground { if (selected.collection === "professional") return { kind: "solid", color: selected.colors.paper }; return')
edit('lib/document-themes.ts','return { schemaVersion: 1, ...(typeof raw.customThemeName','return { schemaVersion: 1, ...(raw.pageBorder ? { pageBorder: normalizePageBorder(raw.pageBorder) } : {}), ...(typeof raw.customThemeName')
edit('lib/document-themes.ts','colors: { ...selected.colors }, background:','pageBorder: { ...selected.pageBorder }, colors: { ...selected.colors }, background:')
edit('components/policy/policy-preview.tsx','data-document-theme={theme.id}','data-collection={theme.collection}\n      data-document-theme={theme.id}')
edit('components/policy/policy-preview.tsx','`${typography.headingSize}px`','`${typography.headingSize}pt`')
edit('components/policy/policy-preview.tsx','`${typography.subheadingSize}px`','`${typography.subheadingSize}pt`')
edit('components/policy/policy-preview.tsx','`${typography.paragraphSize}px`','`${typography.paragraphSize}pt`')
edit('components/policy/policy-preview.tsx','  switch (scene) {','''  if (theme.collection === "professional") return <header className={`policy-cover professional-cover professional-${theme.id}`}>
    <div className="professional-brand" style={{ display: "flex", justifyContent: logoAlign }}>{logo || <span>{cover.companyName}</span>}</div>
    <div className="professional-title"><div className="professional-rule" /><h1>{cover.policyLabel}</h1><p>{cover.companyName}</p></div>
    {feature}
    <MetadataStrip metadata={meta} className="professional-meta" />
  </header>;
  switch (scene) {''')
edit('components/policy/policy-preview.tsx','  const layout = model.theme.layout.toc;','''  const layout = model.theme.layout.toc;
  if (model.theme.collection === "professional") return <section className="policy-toc professional-toc"><h2>Contents</h2><ol>{model.tocEntries.map(entry => <li key={entry.id}><a href={`#${entry.id}`}><span>{String(entry.index).padStart(2, "0")}</span>{entry.title}</a></li>)}</ol></section>;''')
edit('components/policy/policy-preview.tsx','<b>{layout === "breadcrumb-bar" ? "Policy / Governance / Current" : model.theme.name}</b>','<b>{model.cover.policyLabel}</b>')
edit('components/policy/policy-preview.tsx','<b>PolicyCraft · 01</b>','<b>{model.cover.companyName}</b>')
edit('components/policy/policy-preview.tsx','const previewStyles = `','''const previewStyles = `''')
# append after all existing CSS so old scene rules cannot override professional designs
p=root/'components/policy/policy-preview.tsx'; s=p.read_text(); at=s.rfind('`;'); s=s[:at]+'''
  [data-collection="professional"] .professional-cover { min-height: 230mm; display: flex; flex-direction: column; padding: 0; background: transparent; overflow: visible; }
  [data-collection="professional"] .professional-brand { font-size: 12pt; font-weight: 600; color: var(--doc-primary); min-height: 22mm; }
  [data-collection="professional"] .professional-title { margin-top: 38mm; margin-bottom: 16mm; }
  [data-collection="professional"] .professional-rule { width: 22mm; height: 2px; background: var(--doc-primary); margin-bottom: 10mm; }
  [data-collection="professional"] .professional-title h1 { font-size: 34pt; line-height: 1.15; font-weight: 600; letter-spacing: -.025em; max-width: 145mm; overflow-wrap: anywhere; color: var(--doc-primary); }
  [data-collection="professional"] .professional-title p { margin-top: 8mm; color: var(--doc-muted); font-size: 13pt; text-align: inherit; }
  [data-collection="professional"] .professional-meta { margin-top: auto; display: grid; grid-template-columns: repeat(2,1fr); gap: 7mm; border-top: 1px solid var(--doc-line); padding-top: 7mm; }
  [data-collection="professional"] .professional-meta span { font-size: 8pt; color: var(--doc-muted); text-transform: uppercase; letter-spacing: .07em; display: block; }
  [data-collection="professional"] .professional-meta strong { font-size: 10pt; font-weight: 500; }
  [data-collection="professional"] .professional-institutional-classic-v1 { text-align: center; }
  [data-collection="professional"] .professional-institutional-classic-v1 .professional-rule { margin-inline: auto; }
  [data-collection="professional"] .professional-institutional-classic-v1 h1 { margin-inline: auto; }
  [data-collection="professional"] .professional-executive-editorial-v1 .professional-title { margin-top: 48mm; border-left: 1px solid var(--doc-line); padding-left: 9mm; }
  [data-collection="professional"] .professional-governance-manual-v1 .professional-title { border-top: 3px solid var(--doc-primary); padding-top: 12mm; }
  [data-collection="professional"] .professional-governance-manual-v1 .professional-rule { display: none; }
  [data-collection="professional"] .professional-modern-minimal-v1 .professional-title { margin-top: 18mm; }
  [data-collection="professional"] .professional-modern-minimal-v1 h1 { font-size: 28pt; }
  [data-collection="professional"] .professional-sustainability-report-v1 .professional-title { margin-top: 26mm; }
  [data-collection="professional"] .policy-cover-feature { position: static; width: 100%; height: 52mm; object-fit: cover; margin-bottom: 10mm; opacity: 1; }
  [data-collection="professional"] .policy-main { padding: 0; }
  [data-collection="professional"] .policy-toc { padding: 0; background: transparent; border: none; }
  .professional-toc h2 { margin-bottom: 12mm; }
  .professional-toc ol { list-style: none; padding: 0; }
  .professional-toc li { border-bottom: 1px solid var(--doc-line); padding: 4mm 0; }
  .professional-toc a { text-decoration: none; color: var(--doc-ink); display: flex; gap: 6mm; }
  .professional-toc a span { color: var(--doc-muted); font-variant-numeric: tabular-nums; }
  [data-collection="professional"] .policy-section { padding: 0; margin-bottom: calc(9mm * var(--doc-density-factor)); border: 0; background: transparent; }
  [data-collection="professional"] .policy-section-heading { margin-bottom: 5mm; padding-bottom: 3mm; border-bottom: 1px solid var(--doc-line); }
  [data-collection="professional"] p { text-align: left; }
  [data-collection="professional"] .policy-table { font-size: 10.5pt; }
  [data-collection="professional"] .policy-table th { font-weight: 600; }
  [data-collection="professional"] .policy-table td { padding: 3mm; }
  [data-collection="professional"] .policy-focus-list, [data-collection="professional"] .policy-objective-groups { display: block; }
  [data-collection="professional"] .policy-focus-item { border: none; border-bottom: 1px solid var(--doc-line); }
  [data-collection="professional"] .policy-focus-item b { background: transparent; color: var(--doc-primary); }
  [data-collection="professional"] .policy-acknowledgement { padding: 0; border: 0; background: transparent; }
  [data-collection="professional"] .policy-section aside span { display: none; }
  [data-collection="professional"] .policy-section aside b { font-size: 18pt; }
''' + s[at:]; p.write_text(s,encoding='utf-8')
