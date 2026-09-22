"use client";
import * as React from "react";
import { X } from "lucide-react";
import { ThemeInspector } from "./theme-inspector";
import { DockOptionsPanel, DockDocumentDesignPanel } from "./dock-sections";
import { AICoverLibraryPanel } from "./ai-cover-library";

export function DesignInspector({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = React.useState("templates");
  const tabs = ["templates", "design", "document", "ai-covers"];
  const panel = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const mobile = window.matchMedia("(max-width:1199px)").matches;
    if (mobile) panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (mobile && event.key === "Tab") {
        const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select,a[href],[tabindex="0"]') || []).filter(el => el.getClientRects().length);
        const first = elements[0], last = elements.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); if (mobile) previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return <>
    <button type="button" aria-label="Close design controls" onClick={onClose} className="fixed inset-0 z-30 bg-black/25 min-[1200px]:hidden" />
    <aside ref={panel} tabIndex={-1} id="design-inspector" aria-label="Document design controls" className="fixed inset-y-0 right-0 z-40 flex w-[min(100vw,360px)] shrink-0 flex-col border-l border-slate-200 bg-white min-[1200px]:static min-[1200px]:z-auto min-[1200px]:w-[360px]">
      <div className="flex h-[72px] items-center justify-between px-5"><h2 className="text-[16px] font-semibold">Document design</h2><button type="button" aria-label="Close controls" onClick={onClose} className="rounded-md p-2 hover:bg-slate-100"><X size={18}/></button></div>
      <div className="grid grid-cols-4 border-b border-slate-200 px-2" role="tablist" aria-label="Document controls">{tabs.map(value => <button type="button" key={value} role="tab" id={`inspector-tab-${value}`} aria-controls={`inspector-${value}`} aria-selected={tab === value} onClick={() => setTab(value)} className={`border-b-2 px-1 py-3 text-[11px] font-medium capitalize transition-colors ${tab === value ? "border-[var(--color-forest)] text-[var(--color-forest)]" : "border-transparent text-slate-500 hover:text-slate-900"}`}>{value === "ai-covers" ? "AI covers" : value}</button>)}</div>
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div id="inspector-templates" role="tabpanel" aria-labelledby="inspector-tab-templates" hidden={tab !== "templates"} className="h-full min-h-0 overflow-y-auto scrollbar-thin"><ThemeInspector /></div>
        <div id="inspector-design" role="tabpanel" aria-labelledby="inspector-tab-design" hidden={tab !== "design"} className="h-full min-h-0"><ThemeInspector designOnly /></div>
        <div id="inspector-document" role="tabpanel" aria-labelledby="inspector-tab-document" hidden={tab !== "document"} className="h-full min-h-0 space-y-5 overflow-y-auto scrollbar-thin"><DockOptionsPanel/><DockDocumentDesignPanel/></div>
        <div id="inspector-ai-covers" role="tabpanel" aria-labelledby="inspector-tab-ai-covers" hidden={tab !== "ai-covers"} className="h-full min-h-0"><AICoverLibraryPanel /></div>
      </div>
    </aside>
  </>;
}
