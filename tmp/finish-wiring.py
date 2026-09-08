from pathlib import Path
root=Path('D:/Policy PoC/src')
for name in ['components/policy/policy-preview.tsx','components/builder/shell.tsx','app/builder/BuilderClient.tsx']:
 p=root/name; lines=p.read_text(encoding='utf-8').splitlines(True); result=[]
 for line in lines:
  if any(c in line for c in ['â','Ã','Â']):
   try: line=line.encode('cp1252').decode('utf-8')
   except (UnicodeEncodeError,UnicodeDecodeError): pass
  result.append(line)
 p.write_text(''.join(result),encoding='utf-8')
p=root/'components/builder/dock-sections.tsx'; s=p.read_text(encoding='utf-8'); lines=s.splitlines(True); seen=set(); out=[]
for line in lines:
 if line.startswith('import ') and line in seen: continue
 seen.add(line); out.append(line)
p.write_text(''.join(out),encoding='utf-8')
p=root/'components/builder/document-theme-picker.tsx'; s=p.read_text(encoding='utf-8'); s=s[:s.index('export function ThemeContactSheet')]+'''export function ThemeContactSheet({ theme, companyName: _companyName, policyLabel: _policyLabel }: { theme: DocumentThemeDefinition; companyName: string; policyLabel: string }) {
  const [missing, setMissing] = React.useState(false);
  return <figure className="m-0" data-template-id={theme.id}>
    {missing ? <div className="grid aspect-[1.5] place-items-center bg-slate-50 px-5 text-center text-[13px] text-slate-500">Open preview to view this legacy document.</div> : <div className="grid grid-cols-[1fr_.72fr] items-end gap-3 bg-[#eceeeb] p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/template-previews/${theme.id}/environmental-cover.png`} alt={`${theme.name} sample cover`} loading="lazy" onError={() => setMissing(true)} className="w-full shadow-sm" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/template-previews/${theme.id}/environmental-body.png`} alt={`${theme.name} sample content page`} loading="lazy" className="w-full shadow-sm" />
    </div>}
    <figcaption className="mt-2 text-[11px] text-slate-500">Sample content · Actual document pages</figcaption>
  </figure>;
}
'''; s=s.replace('import { CoverArt } from "@/components/policy/cover-art";\n','').replace('  documentThemeCssVariables,\n',''); p.write_text(s,encoding='utf-8')
p=root/'next.config.ts'; s=p.read_text(encoding='utf-8').replace('  /* config options here */','  serverExternalPackages: ["playwright-core"],\n  outputFileTracingIncludes: { "/api/export/pdf": ["./public/fonts/**/*"], "/api/pdf-worker": ["./node_modules/pdfjs-dist/build/pdf.worker.min.mjs"] },'); p.write_text(s,encoding='utf-8')
# Start sample policies with the selected template defaults, not the old sample typography.
p=root/'lib/sample-policies.ts'; s=p.read_text(encoding='utf-8').replace('import { upgradeDocumentThemeId }','import { getDocumentThemePatch, upgradeDocumentThemeId }'); s=s.replace('{ documentTemplate: upgradeDocumentThemeId(templateId), documentTheme: upgradeDocumentThemeId(templateId) }','getDocumentThemePatch(upgradeDocumentThemeId(templateId))'); p.write_text(s,encoding='utf-8')
