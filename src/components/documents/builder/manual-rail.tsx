"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowDown, ArrowUp, BookOpen, Check, ClipboardSignature, Eye, EyeOff, GripVertical, Loader2, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import shell from "@/components/builder/shell.module.css";
import { useSopBuilder, type RailSelection } from "@/lib/sop/store";
import type { Sop } from "@/lib/sop/types";
import { isSopWritten, moveSopBefore, moveSopByOffset, outlineGroups } from "../manual-helpers";
import styles from "./builder.module.css";

const markerTransition = { duration: 0.2, ease: "easeOut" as const };

export function selectionKey(selection: RailSelection): string {
  return selection.kind === "sop" ? `sop:${selection.sopId}` : selection.kind;
}

function SopMark({ sop, index }: { sop: Sop; index: number }) {
  const generation = useSopBuilder((state) => state.generation[sop.id]);
  if (!sop.enabled) return <span className={shell.stepNumber}><EyeOff size={11} aria-hidden="true" /></span>;
  if (generation?.status === "writing" || generation?.status === "queued") return <span className={clsx(shell.stepNumber, styles.markBusy)}><Loader2 size={12} className="animate-spin" aria-hidden="true" /></span>;
  if (generation?.status === "failed") return <span className={clsx(shell.stepNumber, styles.markFailed)}><AlertTriangle size={11} aria-hidden="true" /></span>;
  if (isSopWritten(sop)) return <span className={clsx(shell.stepNumber, shell.stepDone)}><Check size={12} aria-hidden="true" /></span>;
  return <span className={shell.stepNumber}>{String(index + 1).padStart(2, "0")}</span>;
}

function statusText(sop: Sop, status: string | undefined) {
  if (!sop.enabled) return "turned off";
  if (status === "writing") return "being written";
  if (status === "queued") return "queued";
  if (status === "failed") return "not written, retry available";
  return isSopWritten(sop) ? "written" : "not written yet";
}

/** The manual outline: front matter, SOPs under pillar or department headers, closing. */
export function ManualRail({ onAddSop, onDeleteSop }: { onAddSop: () => void; onDeleteSop: (sopId: string) => void }) {
  const manual = useSopBuilder((state) => state.manual!);
  const selection = useSopBuilder((state) => state.selection);
  const generation = useSopBuilder((state) => state.generation);
  const select = useSopBuilder((state) => state.select);
  const setSops = useSopBuilder((state) => state.setSops);
  const updateSop = useSopBuilder((state) => state.updateSop);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const groups = outlineGroups(manual);
  const order = groups.flatMap((group) => group.sops);
  const current = selectionKey(selection);

  React.useEffect(() => {
    if (!menuFor) return;
    const close = (event: PointerEvent) => { if (!(event.target as Element).closest?.(`[data-rail-menu="${menuFor}"]`)) setMenuFor(null); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuFor(null); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [menuFor]);

  // Up and down move through the outline the way they would in a file list.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-rail-item]") ?? []);
    const index = items.findIndex((item) => item === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = items[Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
    next?.focus();
    next?.click();
  };

  const railButton = (key: string, label: string, icon: React.ReactNode, onSelect: () => void, title?: string) => (
    <button type="button" data-rail-item={key} onClick={onSelect} aria-current={current === key ? "step" : undefined} className={shell.navButton} title={title}>
      {current === key ? <motion.span layoutId="sop-rail-selection" aria-hidden="true" className={shell.workflowMarker} transition={markerTransition} /> : null}
      <span className={shell.stepNumber}>{icon}</span>
      <span className={shell.stepTitle}>{label}</span>
    </button>
  );

  return (
    <nav className={shell.nav} aria-label="Manual outline" onKeyDown={onKeyDown}>
      <div ref={listRef}>
        <ul className={shell.navList}>
          <li>{railButton("front", "Front matter", <BookOpen size={11} aria-hidden="true" />, () => select({ kind: "front" }), "Introduction, objective, sites, values")}</li>
        </ul>
        {groups.map((group) => (
          <section key={group.key} className={styles.railGroup} aria-label={group.label}>
            {manual.grouping !== "none" ? <h3 className={styles.railGroupTitle}><span>{group.label}</span><span className={styles.railGroupCount}>{group.sops.filter((sop) => sop.enabled).length}</span></h3> : null}
            <ul className={shell.navList}>
              {group.sops.map((sop) => {
                const key = `sop:${sop.id}`;
                const index = order.indexOf(sop);
                const label = sop.title || "Untitled SOP";
                return (
                  <li
                    key={sop.id}
                    className={styles.railRow}
                    data-disabled={!sop.enabled || undefined}
                    data-dragging={dragging === sop.id || undefined}
                    data-drop-target={over === sop.id && dragging && dragging !== sop.id || undefined}
                    draggable
                    onDragStart={(event) => { setDragging(sop.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", sop.id); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onDragOver={(event) => { if (!dragging) return; event.preventDefault(); setOver(sop.id); }}
                    onDrop={(event) => { event.preventDefault(); if (dragging) setSops(moveSopBefore(manual.sops, dragging, sop.id, manual.grouping)); setDragging(null); setOver(null); }}
                  >
                    <button type="button" data-rail-item={key} onClick={() => select({ kind: "sop", sopId: sop.id })} aria-current={current === key ? "step" : undefined} aria-label={`${sop.code ? `${sop.code} ` : ""}${label}, ${statusText(sop, generation[sop.id]?.status)}`} className={shell.navButton}>
                      {current === key ? <motion.span layoutId="sop-rail-selection" aria-hidden="true" className={shell.workflowMarker} transition={markerTransition} /> : null}
                      <SopMark sop={sop} index={index} />
                      <span className={styles.railText}>
                        <span className={shell.stepTitle}>{label}</span>
                        {sop.code ? <span className={styles.railCode}>{sop.code}</span> : null}
                      </span>
                    </button>
                    <span className={styles.railGrip} aria-hidden="true"><GripVertical size={13} /></span>
                    <div className={styles.railMenuWrap} data-rail-menu={sop.id}>
                      <button type="button" className={styles.railMenuButton} aria-label={`Options for ${label}`} aria-expanded={menuFor === sop.id} onClick={() => setMenuFor(menuFor === sop.id ? null : sop.id)}><MoreHorizontal size={15} aria-hidden="true" /></button>
                      <AnimatePresence>
                        {menuFor === sop.id ? (
                          <motion.div role="menu" aria-label={`Options for ${label}`} className={styles.railMenu} initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}>
                            <button type="button" role="menuitem" disabled={index === 0} onClick={() => { setSops(moveSopByOffset(manual, sop.id, -1)); setMenuFor(null); }}><ArrowUp size={14} aria-hidden="true" />Move up</button>
                            <button type="button" role="menuitem" disabled={index === order.length - 1} onClick={() => { setSops(moveSopByOffset(manual, sop.id, 1)); setMenuFor(null); }}><ArrowDown size={14} aria-hidden="true" />Move down</button>
                            <button type="button" role="menuitem" onClick={() => { updateSop(sop.id, (item) => ({ ...item, enabled: !item.enabled })); setMenuFor(null); }}>{sop.enabled ? <><EyeOff size={14} aria-hidden="true" />Leave out of manual</> : <><Eye size={14} aria-hidden="true" />Include in manual</>}</button>
                            <button type="button" role="menuitem" data-tone="danger" onClick={() => { setMenuFor(null); onDeleteSop(sop.id); }}><Trash2 size={14} aria-hidden="true" />Delete SOP</button>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <button type="button" className={styles.railAdd} onClick={onAddSop}><Plus size={14} aria-hidden="true" />Add SOP</button>
        <ul className={clsx(shell.navList, styles.railClosing)}>
          <li>{railButton("closing", "Closing and approval", <ClipboardSignature size={11} aria-hidden="true" />, () => select({ kind: "closing" }), "Review mechanism, revisions, approval")}</li>
        </ul>
      </div>
    </nav>
  );
}

/** Collapsed rail: numbered marks only. */
export function ManualRailMini() {
  const manual = useSopBuilder((state) => state.manual!);
  const selection = useSopBuilder((state) => state.selection);
  const select = useSopBuilder((state) => state.select);
  const current = selectionKey(selection);
  const order = outlineGroups(manual).flatMap((group) => group.sops);
  return (
    <nav className={shell.miniNav} aria-label="Manual outline">
      <button type="button" onClick={() => select({ kind: "front" })} aria-current={current === "front" ? "step" : undefined} aria-label="Front matter" title="Front matter" className={shell.stepIcon}><BookOpen size={14} aria-hidden="true" /></button>
      {order.map((sop, index) => (
        <button key={sop.id} type="button" onClick={() => select({ kind: "sop", sopId: sop.id })} aria-current={current === `sop:${sop.id}` ? "step" : undefined} aria-label={sop.title || "Untitled SOP"} title={sop.title} className={clsx(shell.stepIcon, !sop.enabled && styles.miniOff)}>
          {current === `sop:${sop.id}` ? <motion.span layoutId="sop-rail-selection" aria-hidden="true" className={shell.workflowMarkerCompact} transition={markerTransition} /> : null}
          {isSopWritten(sop) ? <Check size={13} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}
        </button>
      ))}
      <button type="button" onClick={() => select({ kind: "closing" })} aria-current={current === "closing" ? "step" : undefined} aria-label="Closing and approval" title="Closing and approval" className={shell.stepIcon}><ClipboardSignature size={14} aria-hidden="true" /></button>
    </nav>
  );
}
