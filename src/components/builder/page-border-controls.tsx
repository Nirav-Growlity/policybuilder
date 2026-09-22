"use client";
import { useBuilder } from "@/lib/store";
import { getPolicyDocumentTheme, normalizeDocumentThemeOverrides } from "@/lib/document-themes";
import type { PageBorder } from "@/lib/types";

export function PageBorderControls() {
  const { policy, updatePolicy } = useBuilder();
  const theme = getPolicyDocumentTheme(policy);
  const border = theme.pageBorder;
  const update = (patch: Partial<PageBorder>) => updatePolicy(current => {
    const overrides = normalizeDocumentThemeOverrides({ ...(current.templateBrandOverrides ?? current.documentThemeOverrides), pageBorder: { ...getPolicyDocumentTheme(current).pageBorder, ...patch } });
    return { templateBrandOverrides: overrides, documentThemeOverrides: overrides };
  });
  return <fieldset className="mb-7 border-b border-slate-200 pb-6 text-[13px]">
    <legend className="mb-4 text-[14px] font-semibold">Page border</legend>
    <label className="flex items-center justify-between gap-3">Show page border<input type="checkbox" checked={border.enabled} onChange={e => update({ enabled: e.target.checked })}/></label>
    <div className={`mt-5 space-y-5 ${border.enabled ? "" : "opacity-50"}`}>
      <label className="block">Line thickness <span className="float-right tabular-nums">{border.widthPt} pt</span><input aria-label="Border thickness" type="range" className="mt-3 w-full" min="0.5" max="6" step="0.5" value={border.widthPt} disabled={!border.enabled} onChange={e => update({ widthPt: Number(e.target.value) })}/></label>
      <label className="block">Inset from edge <span className="float-right tabular-nums">{border.insetMm} mm</span><input aria-label="Border inset" type="range" className="mt-3 w-full" min="5" max="20" step="1" value={border.insetMm} disabled={!border.enabled} onChange={e => update({ insetMm: Number(e.target.value) })}/></label>
      <div><label htmlFor="border-color" className="mb-2 block">Border color</label><div className="flex items-center gap-2"><input id="border-color" aria-label="Border color picker" type="color" value={border.color || theme.colors.primary} disabled={!border.enabled} onChange={e => update({ color: e.target.value })}/><input key={border.color || theme.colors.primary} aria-label="Border HEX color" defaultValue={border.color || theme.colors.primary} maxLength={7} pattern="#[0-9A-Fa-f]{6}" disabled={!border.enabled} onBlur={e => { if (e.target.validity.valid) update({ color: e.target.value }); else e.target.reportValidity(); }} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-2 invalid:border-red-600"/></div><button type="button" onClick={() => update({ color: undefined })} className="mt-2 text-slate-500 underline">Use template color</button></div>
      <label className="block">Apply to<select aria-label="Border pages" className="mt-2 block w-full rounded border border-slate-200 p-2" value={border.scope} disabled={!border.enabled} onChange={e => update({ scope: e.target.value as PageBorder["scope"] })}><option value="all-except-cover">All pages except cover</option><option value="all">All pages</option><option value="cover">Cover only</option></select></label>
    </div>
  </fieldset>;
}
