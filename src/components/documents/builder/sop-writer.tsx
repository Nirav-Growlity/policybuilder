"use client";

import * as React from "react";
import { AlertTriangle, EyeOff, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { clsx } from "clsx";
import { StepRoot, authoring as ui } from "@/components/builder/steps/authoring-ui";
import { Panel } from "@/components/ui/panel";
import { Field, Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/ui/button";
import { addSopAppendix } from "@/lib/sop/initial-manual";
import { useSopBuilder } from "@/lib/sop/store";
import type { Sop, SopPillar, SopSection } from "@/lib/sop/types";
import { PILLAR_LABELS, PILLAR_ORDER, sectionHasContent } from "../manual-helpers";
import { useSopBuilderActions } from "./builder-context";
import { SectionAiActions } from "./section-ai-actions";
import { SectionBody } from "./section-editors";
import { useSectionAi } from "./use-section-ai";
import styles from "./builder.module.css";

/** One SOP in Write mode: its header facts, then every section as a sheet. */
export function SopWriter({ sop }: { sop: Sop }) {
  const updateSop = useSopBuilder((state) => state.updateSop);
  const generation = useSopBuilder((state) => state.generation[sop.id]);
  const { generate, retry } = useSopBuilderActions();
  const ai = useSectionAi();
  const writing = generation?.status === "writing" || generation?.status === "queued";
  const partial = writing ? generation?.partialSections : undefined;
  const failed = generation?.status === "failed";
  const enabledSections = sop.sections.filter((section) => section.enabled);
  const empty = !sop.sections.some((section) => section.enabled && sectionHasContent(section));

  const setSection = (next: SopSection) => updateSop(sop.id, (current) => ({ ...current, sections: current.sections.map((section) => (section.id === next.id ? next : section)) }));
  const removeSection = (id: string) => updateSop(sop.id, (current) => ({ ...current, sections: current.sections.filter((section) => section.id !== id) }));
  const appendixCount = sop.sections.filter((section) => section.kind === "appendix").length;

  return (
    <StepRoot>
      <Panel className={styles.sopHeader} bodyClassName={styles.sopHeaderBody}>
        <div className={styles.sopHeaderGrid}>
          <Field label="SOP title" className={styles.sopTitleField}>
            <Input value={sop.title} onChange={(event) => updateSop(sop.id, (current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Waste Segregation and Disposal" />
          </Field>
          <Field label="Code">
            <Input value={sop.code} onChange={(event) => updateSop(sop.id, (current) => ({ ...current, code: event.target.value }))} placeholder="ACME-EHS-001" />
          </Field>
          <Field label="Pillar">
            <SelectMenu size="compact" value={sop.pillar} onValueChange={(value) => updateSop(sop.id, (current) => ({ ...current, pillar: value as SopPillar }))} options={PILLAR_ORDER.map((pillar) => ({ value: pillar, label: PILLAR_LABELS[pillar] }))} aria-label="Pillar" />
          </Field>
          <Field label="Department">
            <Input value={sop.department} onChange={(event) => updateSop(sop.id, (current) => ({ ...current, department: event.target.value }))} placeholder="EHS" />
          </Field>
          <Field label="Owner">
            <Input value={sop.owner} onChange={(event) => updateSop(sop.id, (current) => ({ ...current, owner: event.target.value }))} placeholder="EHS Manager" />
          </Field>
          <Field label="Version">
            <Input value={sop.version} onChange={(event) => updateSop(sop.id, (current) => ({ ...current, version: event.target.value }))} placeholder="01" />
          </Field>
        </div>
        {writing ? (
          <p className={styles.sopNotice} role="status"><Loader2 size={15} className="animate-spin" aria-hidden="true" />{generation?.status === "queued" ? "Queued. AI starts on this SOP in a moment." : "AI is writing this SOP. Sections appear as they are ready."}</p>
        ) : failed ? (
          <div className={styles.sopNotice} data-tone="error" role="alert">
            <AlertTriangle size={15} aria-hidden="true" /><span>{/not wired up/i.test(generation?.error ?? "") ? "AI writing is not available yet. Write this SOP yourself, or retry later." : `This SOP was not written${generation?.error ? `: ${generation.error}` : "."}`}</span>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={13} aria-hidden="true" />} onClick={() => retry(sop.id)}>Retry</Button>
          </div>
        ) : empty ? (
          <div className={styles.sopNotice}>
            <Sparkles size={15} aria-hidden="true" /><span>This SOP is empty. Write every section at once from your company profile.</span>
            <Button variant="primary" size="sm" icon={<Sparkles size={13} aria-hidden="true" />} onClick={() => generate([sop.id])}>Write this SOP</Button>
          </div>
        ) : null}
      </Panel>

      {sop.sections.map((section) => {
        const number = enabledSections.indexOf(section) + 1;
        const shown = partial?.find((item) => item.kind === section.kind);
        const display = shown ? { ...shown, id: section.id, title: section.title, enabled: section.enabled } as SopSection : section;
        const busy = ai.busy(sop.id, section.id);
        if (!section.enabled) {
          return (
            <div key={section.id} className={styles.sectionOff}>
              <span>{section.title}<span className={styles.sectionOffNote}>Not in the document</span></span>
              <button type="button" className={styles.linkButton} onClick={() => setSection({ ...section, enabled: true })}>Include</button>
            </div>
          );
        }
        return (
          <Panel
            key={section.id}
            className={clsx(writing && !shown && styles.sectionPending)}
            title={<span className={styles.sectionTitle}><span className={styles.sectionNumber}>{number}.0</span><input value={section.title} onChange={(event) => setSection({ ...section, title: event.target.value })} aria-label="Section heading" size={Math.max(6, section.title.length + 1)} className={styles.sectionTitleInput} /></span>}
            actions={
              <>
                {section.kind === "appendix" && appendixCount > 1 && !sectionHasContent(section) ? (
                  <button type="button" className={ui.iconButton} data-tone="danger" aria-label={`Remove ${section.title}`} title="Remove this empty appendix" onClick={() => removeSection(section.id)}><Trash2 size={15} aria-hidden="true" /></button>
                ) : null}
                <button type="button" className={ui.iconButton} aria-label={`Leave ${section.title} out of the document`} title="Leave out of the document" onClick={() => setSection({ ...section, enabled: false })}><EyeOff size={15} aria-hidden="true" /></button>
                <SectionAiActions hasContent={sectionHasContent(section)} busy={busy} onRun={(action, instruction) => void ai.run(action, sop.id, section, instruction)} onStop={() => ai.stop(sop.id, section.id)} />
              </>
            }
          >
            <SectionBody section={display} sectionNumber={number} onChange={setSection} busy={busy} stream={ai.reveal(sop.id, section.id)} />
          </Panel>
        );
      })}
      <div className={styles.addRow}>
        <Button variant="ghost" size="sm" icon={<Plus size={14} aria-hidden="true" />} onClick={() => updateSop(sop.id, addSopAppendix)}>Add appendix</Button>
      </div>
    </StepRoot>
  );
}
