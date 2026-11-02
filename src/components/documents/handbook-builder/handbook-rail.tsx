"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, BookOpen, Check, ChevronRight, ClipboardSignature, Eye, EyeOff, GripVertical, Loader2, MoreHorizontal, Plus, Trash2, ArrowDown, ArrowUp } from "lucide-react";
import { clsx } from "clsx";
import shell from "@/components/builder/shell.module.css";
import { useHandbookBuilder, type HandbookRailSelection } from "@/lib/handbook/store";
import type { HandbookChapter, HandbookManual } from "@/lib/handbook/types";
import { chapterGroups, chapterOrder, isChapterWritten, moveChapterBefore, moveChapterByOffset } from "@/components/documents/handbook-helpers";
import styles from "@/components/documents/builder/builder.module.css";

const markerTransition = { duration: 0.2, ease: "easeOut" as const };

export function handbookSelectionKey(selection: HandbookRailSelection): string {
  return selection.kind === "chapter" ? `chapter:${selection.chapterId}` : selection.kind;
}

type ChapterState = "off" | "busy" | "failed" | "written" | "empty";

function chapterState(chapter: HandbookChapter, status: string | undefined): ChapterState {
  if (!chapter.enabled) return "off";
  if (status === "writing" || status === "queued") return "busy";
  if (status === "failed") return "failed";
  return isChapterWritten(chapter) ? "written" : "empty";
}

/** A status circle: dashed while empty, filled with a check once written. */
function ChapterMark({ state }: { state: ChapterState }) {
  return (
    <span className={styles.railMark} data-state={state}>
      {state === "off" ? <EyeOff size={10} aria-hidden="true" />
        : state === "busy" ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          : state === "failed" ? <AlertTriangle size={9} strokeWidth={2.6} aria-hidden="true" />
            : state === "written" ? <Check size={9} strokeWidth={3} aria-hidden="true" /> : null}
    </span>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "H";
}

/** The handbook's identity and how far the writing has got. */
export function HandbookSummary({ title }: { title: string }) {
  const manual = useHandbookBuilder((state) => state.manual!);
  const generation = useHandbookBuilder((state) => state.generation);
  const states = manual.chapters.filter((chapter) => chapter.enabled).map((chapter) => chapterState(chapter, generation[chapter.id]?.status));
  const total = states.length;
  const written = states.filter((state) => state === "written").length;
  const failed = states.filter((state) => state === "failed").length;
  const busy = states.filter((state) => state === "busy").length;
  const percent = total ? Math.round((written / total) * 100) : 0;
  const status = !total ? "No chapters yet" : busy ? `Writing ${busy} of ${total}` : failed ? `${failed} not written` : written === total ? "All chapters written" : `${written} of ${total} written`;
  const logo = manual.company.companyLogo;
  return (
    <div className={styles.railSummary}>
      <div className={styles.railIdentity}>
        <span className={styles.railLogo} data-logo={logo ? true : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or uploaded file */}
          {logo ? <img src={logo} alt="" /> : initials(title)}
        </span>
        <span className="min-w-0">
          <span className={styles.railSummaryTitle} title={title}>{title}</span>
          <span className={styles.railSummaryMeta}>Employee handbook, {total} {total === 1 ? "chapter" : "chapters"}</span>
        </span>
      </div>
      <div className={styles.railProgress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${written} of ${total} chapters written${failed ? `, ${failed} not written` : ""}`} aria-label="Writing progress">
        <div className={styles.railProgressHead}>
          <span data-tone={failed ? "error" : undefined}>{status}</span>
          <span>{written}/{total}</span>
        </div>
        <div className={styles.railProgressTrack}><span style={{ width: `${percent}%` }} data-tone={failed ? "error" : undefined} /></div>
      </div>
    </div>
  );
}

const COLLAPSED_KEY = "policycraft_handbook_rail_collapsed";
function readCollapsed(): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(COLLAPSED_KEY) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeCollapsed(keys: Set<string>) {
  try { window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...keys])); } catch { /* optional */ }
}

function statusText(chapter: HandbookChapter, status: string | undefined) {
  if (!chapter.enabled) return "turned off";
  if (status === "writing") return "being written";
  if (status === "queued") return "queued";
  if (status === "failed") return "not written, retry available";
  return isChapterWritten(chapter) ? "written" : "not written yet";
}

/** The handbook outline: opening pages, chapters under part headers, closing. */
export function HandbookRail({ onAddChapter, onDeleteChapter }: { onAddChapter: () => void; onDeleteChapter: (chapterId: string) => void }) {
  const manual = useHandbookBuilder((state) => state.manual!);
  const selection = useHandbookBuilder((state) => state.selection);
  const generation = useHandbookBuilder((state) => state.generation);
  const select = useHandbookBuilder((state) => state.select);
  const setChapters = useHandbookBuilder((state) => state.setChapters);
  const updateChapter = useHandbookBuilder((state) => state.updateChapter);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const [menuFor, setMenuFor] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const groups = chapterGroups(manual);
  const order = groups.flatMap((group) => group.chapters);
  const current = handbookSelectionKey(selection);
  const [collapsed, setCollapsed] = React.useState<Set<string>>(readCollapsed);
  const toggleGroup = (key: string) => setCollapsed((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key); else next.add(key);
    writeCollapsed(next);
    return next;
  });
  // Moving to a chapter (Next, Review, a fix link) opens the part it sits in.
  const [seen, setSeen] = React.useState(current);
  if (seen !== current) {
    setSeen(current);
    const owner = selection.kind === "chapter" ? groups.find((group) => group.chapters.some((chapter) => chapter.id === selection.chapterId)) : undefined;
    if (owner && collapsed.has(owner.key)) { const next = new Set(collapsed); next.delete(owner.key); writeCollapsed(next); setCollapsed(next); }
  }

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

  // Opening pages and the closing read like chapter rows: a status circle, the title, then what they hold.
  const railButton = (key: string, label: string, written: boolean, onSelect: () => void, detail: string) => (
    <button type="button" data-rail-item={key} onClick={onSelect} aria-current={current === key ? "step" : undefined} aria-label={`${label}, ${written ? "written" : "not written yet"}`} className={clsx(shell.navButton, styles.railItem)}>
      {current === key ? <motion.span layoutId="handbook-rail-selection" aria-hidden="true" className={shell.workflowMarker} transition={markerTransition} /> : null}
      <ChapterMark state={written ? "written" : "empty"} />
      <span className={styles.railText}>
        <span className={styles.railTitle}>{label}</span>
        <span className={styles.railCode}>{detail}</span>
      </span>
    </button>
  );
  const hasText = (blocks: readonly { text: string }[]) => blocks.some((block) => block.text.trim());
  const frontWritten = hasText(manual.frontMatter.welcome) && hasText(manual.frontMatter.about);
  const closingWritten = Boolean(manual.closing.acknowledgement.trim());

  return (
    <nav className={clsx(shell.nav, styles.railNav)} aria-label="Handbook outline" onKeyDown={onKeyDown}>
      <div ref={listRef} className={styles.railScroll} data-lenis-prevent="">
        <ul className={clsx(shell.navList, styles.railOpening)}>
          <li>{railButton("front", "Opening pages", frontWritten, () => select({ kind: "front" }), "Welcome, company, values, sites")}</li>
        </ul>
        {groups.map((group) => {
          const open = !collapsed.has(group.key);
          const included = group.chapters.filter((chapter) => chapter.enabled);
          const done = included.filter((chapter) => chapterState(chapter, generation[chapter.id]?.status) === "written").length;
          const listId = `rail-group-${group.key}`;
          return (
          <section key={group.key} className={styles.railGroup} aria-label={group.label}>
            {manual.grouping !== "none" ? (
              <h3 className={styles.railGroupHeading}>
                <button type="button" className={styles.railGroupTitle} aria-expanded={open} aria-controls={listId} data-holds-current={!open && selection.kind === "chapter" && group.chapters.some((chapter) => chapter.id === selection.chapterId) || undefined} onClick={() => toggleGroup(group.key)}>
                  <ChevronRight size={13} aria-hidden="true" className={styles.railGroupChevron} />
                  <span className={styles.railGroupLabel}>{group.label}</span>
                  <span className={styles.railGroupCount} title={`${done} of ${included.length} written`}>{done === included.length ? included.length : `${done}/${included.length}`}</span>
                </button>
              </h3>
            ) : null}
            <AnimatePresence initial={false}>
            {open ? (
            <motion.ul id={listId} className={clsx(shell.navList, styles.railGroupList)} initial={{ height: 0, opacity: 0, overflow: "hidden" }} animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }} exit={{ height: 0, opacity: 0, overflow: "hidden" }} transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}>
              {group.chapters.map((chapter) => {
                const key = `chapter:${chapter.id}`;
                const index = order.indexOf(chapter);
                const label = chapter.title || "Untitled chapter";
                return (
                  <li
                    key={chapter.id}
                    className={styles.railRow}
                    data-disabled={!chapter.enabled || undefined}
                    data-dragging={dragging === chapter.id || undefined}
                    data-drop-target={over === chapter.id && dragging && dragging !== chapter.id || undefined}
                    draggable
                    onDragStart={(event) => { setDragging(chapter.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", chapter.id); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    onDragOver={(event) => { if (!dragging) return; event.preventDefault(); setOver(chapter.id); }}
                    onDrop={(event) => { event.preventDefault(); if (dragging) setChapters(moveChapterBefore(manual.chapters, dragging, chapter.id, manual.grouping)); setDragging(null); setOver(null); }}
                  >
                    <button type="button" data-rail-item={key} onClick={() => select({ kind: "chapter", chapterId: chapter.id })} aria-current={current === key ? "step" : undefined} aria-label={`${label}, ${statusText(chapter, generation[chapter.id]?.status)}`} title={label} className={clsx(shell.navButton, styles.railItem)}>
                      {current === key ? <motion.span layoutId="handbook-rail-selection" aria-hidden="true" className={shell.workflowMarker} transition={markerTransition} /> : null}
                      <ChapterMark state={chapterState(chapter, generation[chapter.id]?.status)} />
                      <span className={styles.railText}>
                        <span className={styles.railTitle}>{label}</span>
                      </span>
                    </button>
                    <span className={styles.railGrip} aria-hidden="true"><GripVertical size={13} /></span>
                    <div className={styles.railMenuWrap} data-rail-menu={chapter.id}>
                      <button type="button" className={styles.railMenuButton} aria-label={`Options for ${label}`} aria-expanded={menuFor === chapter.id} onClick={() => setMenuFor(menuFor === chapter.id ? null : chapter.id)}><MoreHorizontal size={15} aria-hidden="true" /></button>
                      <AnimatePresence>
                        {menuFor === chapter.id ? (
                          <motion.div role="menu" aria-label={`Options for ${label}`} className={styles.railMenu} initial={{ opacity: 0, y: -4, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ duration: 0.14 }}>
                            <button type="button" role="menuitem" disabled={index === 0} onClick={() => { setChapters(moveChapterByOffset(manual, chapter.id, -1)); setMenuFor(null); }}><ArrowUp size={14} aria-hidden="true" />Move up</button>
                            <button type="button" role="menuitem" disabled={index === order.length - 1} onClick={() => { setChapters(moveChapterByOffset(manual, chapter.id, 1)); setMenuFor(null); }}><ArrowDown size={14} aria-hidden="true" />Move down</button>
                            <button type="button" role="menuitem" onClick={() => { updateChapter(chapter.id, (item) => ({ ...item, enabled: !item.enabled })); setMenuFor(null); }}>{chapter.enabled ? <><EyeOff size={14} aria-hidden="true" />Leave out of handbook</> : <><Eye size={14} aria-hidden="true" />Include in handbook</>}</button>
                            <button type="button" role="menuitem" data-tone="danger" onClick={() => { setMenuFor(null); onDeleteChapter(chapter.id); }}><Trash2 size={14} aria-hidden="true" />Delete chapter</button>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  </li>
                );
              })}
            </motion.ul>
            ) : null}
            </AnimatePresence>
          </section>
          );
        })}
        <ul className={clsx(shell.navList, styles.railClosing)}>
          <li>{railButton("closing", "Closing and acknowledgement", closingWritten, () => select({ kind: "closing" }), "Review, revisions, sign-off")}</li>
        </ul>
      </div>
      <div className={styles.railFoot}>
        <button type="button" className={styles.railAdd} onClick={onAddChapter}><Plus size={14} aria-hidden="true" />Add chapter</button>
      </div>
    </nav>
  );
}

/** Collapsed rail: numbered marks only. */
export function HandbookRailMini() {
  const manual: HandbookManual = useHandbookBuilder((state) => state.manual!);
  const selection = useHandbookBuilder((state) => state.selection);
  const select = useHandbookBuilder((state) => state.select);
  const current = handbookSelectionKey(selection);
  const order = chapterOrder(manual);
  return (
    <nav className={shell.miniNav} aria-label="Handbook outline">
      <button type="button" onClick={() => select({ kind: "front" })} aria-current={current === "front" ? "step" : undefined} aria-label="Opening pages" title="Opening pages" className={shell.stepIcon}><BookOpen size={14} aria-hidden="true" /></button>
      {order.map((chapter, index) => (
        <button key={chapter.id} type="button" onClick={() => select({ kind: "chapter", chapterId: chapter.id })} aria-current={current === `chapter:${chapter.id}` ? "step" : undefined} aria-label={chapter.title || "Untitled chapter"} title={chapter.title} className={clsx(shell.stepIcon, !chapter.enabled && styles.miniOff)}>
          {current === `chapter:${chapter.id}` ? <motion.span layoutId="handbook-rail-selection" aria-hidden="true" className={shell.workflowMarkerCompact} transition={markerTransition} /> : null}
          {isChapterWritten(chapter) ? <Check size={13} aria-hidden="true" /> : String(index + 1).padStart(2, "0")}
        </button>
      ))}
      <button type="button" onClick={() => select({ kind: "closing" })} aria-current={current === "closing" ? "step" : undefined} aria-label="Closing and acknowledgement" title="Closing and acknowledgement" className={shell.stepIcon}><ClipboardSignature size={14} aria-hidden="true" /></button>
    </nav>
  );
}
