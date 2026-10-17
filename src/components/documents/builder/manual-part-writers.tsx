"use client";

import * as React from "react";
import { BookOpen, ClipboardSignature, History, ListChecks, MapPin, Pencil, ShieldCheck, Target } from "lucide-react";
import { StepRoot, WritingField } from "@/components/builder/steps/authoring-ui";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { useSopBuilder } from "@/lib/sop/store";
import type { RevisionEntry } from "@/lib/types";
import type { SopApproval, SopClosing, SopFrontMatter, SopManual } from "@/lib/sop/types";
import { LinesField, NarrativeField, RowsTable } from "./section-editors";
import { useManualPartAi } from "./use-section-ai";
import { useSopBuilderActions } from "./builder-context";
import styles from "./builder.module.css";

function useManualPart<K extends "frontMatter" | "closing">(key: K): [SopManual[K], (patch: Partial<SopManual[K]>) => void] {
  const value = useSopBuilder((state) => state.manual![key]);
  const setManual = useSopBuilder((state) => state.setManual);
  const update = React.useCallback((patch: Partial<SopManual[K]>) => setManual((manual) => ({ ...manual, [key]: { ...manual[key], ...patch } })), [key, setManual]);
  return [value, update];
}

/** Introduction, objective, benefits, sites, core values, how to use, glossary. */
export function FrontMatterWriter() {
  const [front, update] = useManualPart("frontMatter");
  const company = useSopBuilder((state) => state.manual!.company);
  const ai = useManualPartAi();
  const { openDetails } = useSopBuilderActions();
  const busy = ai.busy === "front-matter";
  const action = <AIActionButton label="AI Write" loading={busy} onStop={ai.stop} onGenerate={(prompt) => void ai.run("front-matter", prompt)} placeholder="e.g. Mention our ISO 14001 certification and the two plants in Surat…" />;
  const narrative = (key: keyof Pick<SopFrontMatter, "introduction" | "objective" | "howToUse">, title: string, icon: React.ReactNode, hint: string, withAction = false) => (
    <Panel title={title} icon={icon} actions={withAction ? action : undefined}>
      <NarrativeField blocks={front[key]} onChange={(blocks) => update({ [key]: blocks } as Partial<SopFrontMatter>)} label={title} placeholder={hint} busy={busy} />
    </Panel>
  );
  return (
    <StepRoot>
      {narrative("introduction", "Introduction", <BookOpen size={17} strokeWidth={1.8} />, "Who the company is and why this manual exists.", true)}
      {narrative("objective", "Objective", <Target size={17} strokeWidth={1.8} />, "What following these procedures achieves.")}
      <Panel title="Benefits" icon={<ListChecks size={17} strokeWidth={1.8} />} description="One benefit per line.">
        <LinesField lines={front.benefits} onChange={(benefits) => update({ benefits })} label="Benefits" placeholder={"Consistent practice across sites\nAudit-ready records"} className={styles.linesWriting} />
      </Panel>
      <Panel title="Sites covered" icon={<MapPin size={17} strokeWidth={1.8} />} description="From the company details." actions={<Button variant="ghost" size="sm" icon={<Pencil size={13} aria-hidden="true" />} onClick={openDetails}>Edit sites</Button>}>
        {(company.sites ?? []).length ? (
          <ul className={styles.siteList}>{(company.sites ?? []).map((site, index) => <li key={index}><strong>{site.location || `Site ${index + 1}`}</strong><span>{[site.address, site.primaryFunction].filter(Boolean).join(" · ")}</span></li>)}</ul>
        ) : <p className="text-[13px] text-[var(--pc-muted)]">No sites yet. Add them in the company details.</p>}
      </Panel>
      <Panel title="Core values" icon={<ShieldCheck size={17} strokeWidth={1.8} />}>
        <RowsTable caption="Core values" rows={front.coreValues} onChange={(coreValues) => update({ coreValues })} newRow={() => ({ title: "", description: "" })} addLabel="Add value" columns={[{ key: "title", label: "Value", width: "28%", placeholder: "Safety first" }, { key: "description", label: "What it means here", width: "auto" }]} />
      </Panel>
      {narrative("howToUse", "How to use this manual", <BookOpen size={17} strokeWidth={1.8} />, "How staff find, read and follow an SOP, and who holds the controlled copy.")}
      <Panel title="Glossary" icon={<BookOpen size={17} strokeWidth={1.8} />}>
        <RowsTable caption="Glossary" rows={front.glossary} onChange={(glossary) => update({ glossary })} newRow={() => ({ term: "", definition: "" })} addLabel="Add term" columns={[{ key: "term", label: "Term", width: "28%" }, { key: "definition", label: "Definition", width: "auto" }]} />
      </Panel>
    </StepRoot>
  );
}

/** Review mechanism, revision history and the approval page. */
export function ClosingWriter() {
  const [closing, update] = useManualPart("closing");
  const control = useSopBuilder((state) => state.manual!.control);
  const ai = useManualPartAi();
  const busy = ai.busy === "closing";
  const setApproval = (patch: Partial<SopApproval>) => update({ approval: { ...closing.approval, ...patch } } as Partial<SopClosing>);
  return (
    <StepRoot>
      <Panel title="Review mechanism" icon={<History size={17} strokeWidth={1.8} />} actions={<AIActionButton label="AI Write" loading={busy} onStop={ai.stop} onGenerate={(prompt) => void ai.run("closing", prompt)} />}>
        <NarrativeField blocks={closing.reviewMechanism} onChange={(reviewMechanism) => update({ reviewMechanism })} label="Review mechanism" placeholder={`How the manual is reviewed (${control.reviewFrequency.toLowerCase() || "yearly"}), who approves changes and how revisions are issued.`} busy={busy} />
      </Panel>
      <Panel title="Revision history" icon={<History size={17} strokeWidth={1.8} />}>
        <RowsTable<RevisionEntry & Record<string, unknown>> caption="Revision history" rows={closing.revisionHistory as (RevisionEntry & Record<string, unknown>)[]} onChange={(revisionHistory) => update({ revisionHistory })} newRow={() => ({ revisionNo: String(closing.revisionHistory.length + 1).padStart(2, "0"), date: new Date().toISOString().slice(0, 10), description: "", source: "custom" })} addLabel="Add revision" columns={[{ key: "revisionNo", label: "Rev", width: "12%" }, { key: "date", label: "Date (YYYY-MM-DD)", width: "22%" }, { key: "description", label: "Change", width: "auto" }]} />
      </Panel>
      <Panel title="Approval" icon={<ClipboardSignature size={17} strokeWidth={1.8} />} description="Printed on the closing page above the signatures.">
        <WritingField value={closing.approval.statement} onChange={(event) => setApproval({ statement: event.target.value })} label="Approval statement" placeholder={`This manual has been reviewed and approved by ${control.approvedBy || "the Managing Director"} for implementation across all sites.`} busy={busy} />
        <div className="mt-4">
          <RowsTable caption="Signatories" rows={closing.approval.signatories} onChange={(signatories) => setApproval({ signatories })} newRow={() => ({ role: "", name: "", designation: "", date: "" })} addLabel="Add signatory" columns={[{ key: "role", label: "Role", width: "22%", placeholder: "Approved by" }, { key: "name", label: "Name", width: "26%" }, { key: "designation", label: "Designation", width: "26%" }, { key: "date", label: "Date", width: "auto" }]} />
        </div>
      </Panel>
    </StepRoot>
  );
}
