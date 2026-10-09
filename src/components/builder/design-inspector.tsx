"use client";
import * as React from "react";
import { X } from "lucide-react";
import { motion } from "motion/react";
import { ThemeInspector } from "./theme-inspector";
import { DockOptionsPanel, DockDocumentDesignPanel } from "./dock-sections";
import { AICoverLibraryPanel } from "./ai-cover-library";
import styles from "./design-inspector.module.css";

export function DesignInspector({ open, mobile, onClose }: { open: boolean; mobile: boolean; onClose: () => void }) {
  const [tab, setTab] = React.useState("templates");
  const tabs = ["templates", "design", "document", "ai-covers"];
  const tabLabels: Record<string, string> = { templates: "Templates", design: "Design", document: "Document", "ai-covers": "AI covers" };
  const panel = React.useRef<HTMLElement>(null);
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const selectTab = (value: string, focus = false) => {
    setTab(value);
    if (focus) requestAnimationFrame(() => tabRefs.current[tabs.indexOf(value)]?.focus());
  };
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const activeIndex = tabs.indexOf(tab);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (activeIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectTab(tabs[nextIndex], true);
  };
  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    if (mobile) panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Escape" && !(mobile && event.key === "Tab")) return;
      const visibleModals = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
        .filter((dialog) => dialog.getClientRects().length > 0 && dialog.getAttribute("aria-hidden") !== "true" && !dialog.closest("[inert]"));
      const topModal = visibleModals.at(-1);
      if (topModal && topModal !== panel.current) return;
      const targetElement = event.target instanceof Element ? event.target : null;
      const targetDialog = targetElement?.closest<HTMLElement>('[role="dialog"]');
      if (targetDialog && !panel.current?.contains(targetDialog)) return;
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
  }, [mobile, open, onClose]);
  if (!open) return null;
  return <div className={styles.inspector}>
    <button type="button" aria-label="Close design controls" onClick={onClose} className={styles.scrim} />
    <aside ref={panel} tabIndex={-1} id="design-inspector" role={mobile ? "dialog" : undefined} aria-modal={mobile || undefined} aria-label="Document design controls" className={styles.frame}>
      <div className={styles.header}><h2>Document design</h2><button type="button" aria-label="Close controls" onClick={onClose} className={styles.close}><X size={18} aria-hidden="true"/></button></div>
      <div className={styles.tabList} role="tablist" aria-label="Document controls" onKeyDown={onTabKeyDown}>{tabs.map((value, index) => <button type="button" key={value} ref={element => { tabRefs.current[index] = element; }} role="tab" id={`inspector-tab-${value}`} aria-controls={`inspector-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)} className={styles.tab}>{tabLabels[value]}{tab === value && <motion.span layoutId="builder-inspector-tab-marker" className={styles.tabMarker} transition={{ duration: 0.2, ease: "easeOut" }} />}</button>)}</div>
      <div className={styles.body}>
        <div id="inspector-templates" role="tabpanel" aria-labelledby="inspector-tab-templates" tabIndex={tab === "templates" ? 0 : -1} hidden={tab !== "templates"} className={styles.panel}><ThemeInspector /></div>
        <div id="inspector-design" role="tabpanel" aria-labelledby="inspector-tab-design" tabIndex={tab === "design" ? 0 : -1} hidden={tab !== "design"} className={styles.panel}><ThemeInspector designOnly /></div>
        <div id="inspector-document" role="tabpanel" aria-labelledby="inspector-tab-document" tabIndex={tab === "document" ? 0 : -1} hidden={tab !== "document"} className={styles.panel}><DockOptionsPanel/><DockDocumentDesignPanel/></div>
        <div id="inspector-ai-covers" role="tabpanel" aria-labelledby="inspector-tab-ai-covers" tabIndex={tab === "ai-covers" ? 0 : -1} hidden={tab !== "ai-covers"} className={styles.panel}><AICoverLibraryPanel /></div>
      </div>
    </aside>
  </div>;
}
