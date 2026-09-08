from pathlib import Path
root=Path('D:/Policy PoC/src')
def edit(name,old,new):
 p=root/name;s=p.read_text(encoding='utf-8');assert old in s,(name,old[:60]);p.write_text(s.replace(old,new),encoding='utf-8')
edit('components/policy/policy-preview.tsx','"--policy-font": typography.fontFamily,','"--policy-font": JSON.stringify(typography.fontFamily),')
edit('components/policy/policy-preview.tsx','"--policy-heading-font": typography.headingFontFamily || typography.fontFamily,','"--policy-heading-font": JSON.stringify(typography.headingFontFamily || typography.fontFamily),')
p=root/'components/policy/policy-preview.tsx';s=p.read_text(encoding='utf-8');a=s.rfind('`;');s=s[:a]+'''
  [data-collection="professional"] .policy-section-heading { justify-content: flex-start; text-align: left; border-top: none; padding: 0 0 3mm; }
  [data-collection="professional"] .policy-section-heading h2 { text-transform: none; letter-spacing: -.01em; font-weight: 600; order: 1; }
  [data-collection="professional"] .policy-section-heading > span { order: 0; }
  [data-collection="professional"] .policy-section-heading > i { display: none; }
  [data-collection="professional"] .policy-section-body > div > p:first-child::first-letter { float: none; margin: 0; font-size: inherit; line-height: inherit; font-family: inherit; color: inherit; }
''' +s[a:];p.write_text(s,encoding='utf-8')
edit('lib/document-themes.ts','export type CoverScene =','export type CoverScene =\n  | "professional-corporate" | "professional-executive" | "professional-governance" | "professional-modern" | "professional-sustainability" | "professional-institutional"')
p=root/'lib/document-themes.ts';s=p.read_text(encoding='utf-8');import re
for id,scene in [('corporate-standard-v1','corporate'),('executive-editorial-v1','executive'),('governance-manual-v1','governance'),('modern-minimal-v1','modern'),('sustainability-report-v1','sustainability'),('institutional-classic-v1','institutional')]:
 lines=s.splitlines(True)
 s=''.join(re.sub(r'cover: "[^"]+"',f'cover: "professional-{scene}"',line) if f'id: "{id}"' in line else line for line in lines)
p.write_text(s,encoding='utf-8')
edit('lib/docx/generate.ts','function sectionContentWidth(section: DocumentRenderSection, theme: DocumentThemeDefinition) {','function sectionContentWidth(section: DocumentRenderSection, theme: DocumentThemeDefinition) {\n  if (theme.collection === "professional") return contentWidth();')
edit('lib/docx/generate.ts','  if (theme.layout.acknowledgement === "approval-block") {','  if (theme.collection === "professional") return [title, statement, ...acknowledgementFields(model, contentWidth())];\n  if (theme.layout.acknowledgement === "approval-block") {')
for name in ['lib/document-themes.test.ts','lib/universal-templates.test.ts']:
 p=root/name;s=p.read_text(encoding='utf-8').replace('25 universal','31 universal').replace('25 x 5','31 x 5').replace(', 25)', ', 31)').replace(', 125)', ', 155)');s=s.replace('families.get("Core"), 4','families.get("Core"), 6');s=s.replace('assert.equal(families.get(family), 3)','assert.equal(families.get(family), ["Leadership", "Control", "Institutional", "Impact"].includes(family) ? 4 : 3)');s=s.replace('{ ...current, documentTheme: "evergreen-heritage" }','{ ...current, documentTemplate: undefined, documentTheme: "evergreen-heritage" }');p.write_text(s,encoding='utf-8')
edit('lib/theme-library.test.ts','{ ...current, baseThemeId: "evergreen-heritage" }','{ ...current, baseTemplateId: undefined, baseThemeId: "evergreen-heritage" }')
edit('scripts/generate-professional-previews.ts','main().catch(error => { console.error(error); process.exitCode = 1; });','main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });')
# Render the professional TOC as a quiet editable list in Word.
edit('lib/docx/generate.ts','function buildToc(model: DocumentRenderModel): DocBlock[] {','function buildToc(model: DocumentRenderModel): DocBlock[] {\n  if (model.theme.collection === "professional") return [new Paragraph({ text: "Contents", style: "PolicyHeading", spacing: { after: 500 } }), ...model.tocEntries.map(entry => tocParagraph(entry, model, "leaders"))];')
