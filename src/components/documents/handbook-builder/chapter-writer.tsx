"use client";

import * as React from "react";
import { AlertTriangle, EyeOff, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { StepRoot, authoring as ui } from "@/components/builder/steps/authoring-ui";
import { Panel } from "@/components/ui/panel";
import { Field, Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/ui/button";
import { useRevealText } from "@/components/ui/ai-stream";
import { createTextReveal, type TextReveal } from "@/lib/ai/text-reveal";
import { useHandbookBuilder } from "@/lib/handbook/store";
import { HANDBOOK_PARTS, HANDBOOK_SECTION_KINDS, type HandbookChapter, type HandbookPartId } from "@/lib/handbook/types";
import { createHandbookSection } from "@/lib/handbook/initial-handbook";
import type { SopSection } from "@/lib/sop/types";
import { richTextToPlain, sectionAnchorId, sectionHasContent, typedSoFar, writtenText } from "@/components/documents/manual-helpers";
import { useHandbookBuilderActions } from "./handbook-builder-context";
import { SectionAiActions } from "@/components/documents/builder/section-ai-actions";
import { SectionBody, StreamingSectionBody } from "@/components/documents/builder/section-editors";
import { useChapterSectionAi } from "./use-handbook-ai";
import styles from "@/components/documents/builder/builder.module.css";

/** A table, procedure or list section typing in as the AI writes it, inside its usual editor. */
function TypingSectionBody({ section, sectionNumber, reveal }: { section: SopSection; sectionNumber: number; reveal: TextReveal }) {
  const typed = useRevealText(reveal).length;
  return <StreamingSectionBody section={typedSoFar(section, { left: typed })} sectionNumber={sectionNumber} />;
}

/** While the chapter is written, the section being written streams its words in. A new reveal starts for each section. */
function useLiveReveal(key: string | undefined, text: string) {
  const reveal = React.useMemo<TextReveal | undefined>(() => (key ? createTextReveal() : undefined), [key]);
  React.useEffect(() => () => reveal?.dispose(), [reveal]);
  React.useEffect(() => { reveal?.set(text); }, [reveal, text]);
  return reveal;
}

const PART_OPTIONS = HANDBOOK_PARTS.map((part) => ({ value: part.id, label: part.label }));

/** One chapter in Write mode: its header facts, then every section as a sheet. */
export function ChapterWriter({ chapter }: { chapter: HandbookChapter }) {
  const updateChapter = useHandbookBuilder((state) => state.updateChapter);
  const generation = useHandbookBuilder((state) => state.generation[chapter.id]);
  const { generate, retry } = useHandbookBuilderActions();
  const ai = useChapterSectionAi();
  const [addingSection, setAddingSection] = React.useState(false);
  const writing = generation?.status === "writing" || generation?.status === "queued";
  const partial = writing ? generation?.partialSections : undefined;
  const failed = generation?.status === "failed";
  // Sections arrive in the order the AI writes them, so the last one is still being written.
  const current = partial?.at(-1);
  // Prose types in word by word; tables, steps and lists type into their cells.
  const prose = current && "blocks" in current ? current : undefined;
  const live = useLiveReveal(current?.id, prose ? richTextToPlain(prose.blocks) : current ? writtenText(current) : "");
  const enabledSections = chapter.sections.filter((section) => section.enabled);
  const empty = !chapter.sections.some((section) => section.enabled && sectionHasContent(section));

  const setSection = (next: SopSection) => updateChapter(chapter.id, (current) => ({ ...current, sections: current.sections.map((section) => (section.id === next.id ? next : section)) }));
  const removeSection = (id: string) => updateChapter(chapter.id, (current) => ({ ...current, sections: current.sections.filter((section) => section.id !== id) }));
  const addSection = (kind: (typeof HANDBOOK_SECTION_KINDS)[number]["kind"]) => {
    updateChapter(chapter.id, (current) => ({ ...current, sections: [...current.sections, createHandbookSection(kind)] }));
    setAddingSection(false);
  };

  return (
    <StepRoot>
      <Panel className={styles.sopHeader} bodyClassName={styles.sopHeaderBody}>
        <div className={styles.sopHeaderGrid}>
          <Field label="Chapter title" className={styles.sopTitleField}>
            <Input value={chapter.title} onChange={(event) => updateChapter(chapter.id, (current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Working Hours and Attendance" />
          </Field>
          <Field label="Code">
            <Input value={chapter.code} onChange={(event) => updateChapter(chapter.id, (current) => ({ ...current, code: event.target.value }))} placeholder="Optional" />
          </Field>
          <Field label="Part">
            <SelectMenu size="compact" value={chapter.part} onValueChange={(value) => updateChapter(chapter.id, (current) => ({ ...current, part: value as HandbookPartId }))} options={PART_OPTIONS} aria-label="Part" />
          </Field>
          <Field label="Owner">
            <Input value={chapter.owner} onChange={(event) => updateChapter(chapter.id, (current) => ({ ...current, owner: event.target.value }))} placeholder="HR Manager" />
          </Field>
        </div>
        {writing ? (
          <p className={styles.sopNotice} role="status"><Loader2 size={15} className="animate-spin" aria-hidden="true" />{generation?.status === "queued" ? "Queued. AI starts on this chapter in a moment." : "AI is writing this chapter. Sections appear as they are ready."}</p>
        ) : failed ? (
          <div className={styles.sopNotice} data-tone="error" role="alert">
            <AlertTriangle size={15} aria-hidden="true" /><span>{/not wired up/i.test(generation?.error ?? "") ? "AI writing is not available yet. Write this chapter yourself, or retry later." : `This chapter was not written${generation?.error ? `: ${generation.error}` : "."}`}</span>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} aria-hidden="true" />} onClick={() => retry(chapter.id)}>Retry</Button>
          </div>
        ) : empty ? (
          <div className={styles.sopNotice}>
            <Sparkles size={15} aria-hidden="true" /><span>This chapter is empty. Write every section at once from your company profile.</span>
            <Button variant="primary" size="sm" icon={<Sparkles size={13} aria-hidden="true" />} onClick={() => generate([chapter.id])}>Write this chapter</Button>
          </div>
        ) : null}
      </Panel>

      {chapter.sections.map((section) => {
        const number = enabledSections.indexOf(section) + 1;
        const shown = partial?.find((item) => item.id === section.id);
        const display = shown ? { ...shown, id: section.id, title: section.title, enabled: section.enabled } as SopSection : section;
        const busy = ai.busy(chapter.id, section.id);
        if (!section.enabled) {
          return (
            <div key={section.id} className={styles.sectionOff}>
              <span>{section.title}<span className={styles.sectionOffNote}>Not in the chapter</span></span>
              <button type="button" className={styles.linkButton} onClick={() => setSection({ ...section, enabled: true })}>Include</button>
            </div>
          );
        }
        return (
          <Panel
            key={section.id}
            id={sectionAnchorId(section.id)}
            className={clsx(writing && !shown && styles.sectionPending)}
            title={<span className={styles.sectionTitle}><span className={styles.sectionNumber}>{number}.0</span><input value={section.title} onChange={(event) => setSection({ ...section, title: event.target.value })} aria-label="Section heading" size={Math.max(6, section.title.length + 1)} className={styles.sectionTitleInput} /></span>}
            actions={
              <>
                <button type="button" className={ui.iconButton} data-tone="danger" aria-label={`Remove ${section.title}`} title="Remove this section" onClick={() => removeSection(section.id)}><Trash2 size={15} aria-hidden="true" /></button>
                <button type="button" className={ui.iconButton} aria-label={`Leave ${section.title} out of the chapter`} title="Leave out of the chapter" onClick={() => setSection({ ...section, enabled: false })}><EyeOff size={15} aria-hidden="true" /></button>
                <SectionAiActions hasContent={sectionHasContent(section)} busy={busy} onRun={(action, instruction) => void ai.run(action, chapter.id, section, instruction)} onStop={() => ai.stop(chapter.id, section.id)} />
              </>
            }
          >
            {live && shown && shown === current && !prose && !busy
              ? <TypingSectionBody section={display} sectionNumber={number} reveal={live} />
              : <SectionBody section={display} sectionNumber={number} onChange={setSection} busy={busy} stream={ai.reveal(chapter.id, section.id) ?? (live && shown && shown === prose ? live : undefined)} />}
          </Panel>
        );
      })}
      <div className={styles.addRow}>
        {addingSection ? (
          <div role="group" aria-label="Kind of section to add" className="flex flex-wrap gap-2">
            {HANDBOOK_SECTION_KINDS.map((item) => (
              <Button key={item.kind} variant="secondary" size="sm" onClick={() => addSection(item.kind)}>{item.label}</Button>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setAddingSection(false)}>Cancel</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => setAddingSection(true)}>Add section</Button>
        )}
      </div>
    </StepRoot>
  );
}
