"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { StepRoot, WritingField } from "@/components/builder/steps/authoring-ui";
import { useRevealText } from "@/components/ui/ai-stream";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { useSopBuilder } from "@/lib/sop/store";
import type { ManualAiField } from "@/lib/sop/ai-contract";
import type { RevisionEntry, RichTextBlock } from "@/lib/types";
import type { SopApproval, SopClosing, SopManual } from "@/lib/sop/types";
import { companyFacts } from "@/lib/sop/company-facts";
import { isEmptyTable, richTextToPlain } from "../manual-helpers";
import { SectionAiActions } from "./section-ai-actions";
import { LinesField, NarrativeField, RowsTable } from "./section-editors";
import { useManualFieldAi, type ManualFieldAi, type ManualPart } from "./use-section-ai";
import { useSopBuilderActions } from "./builder-context";
import styles from "./builder.module.css";

function useManualPart<K extends "frontMatter" | "closing">(key: K): [SopManual[K], (patch: Partial<SopManual[K]>) => void] {
  const value = useSopBuilder((state) => state.manual![key]);
  const setManual = useSopBuilder((state) => state.setManual);
  const update = React.useCallback((patch: Partial<SopManual[K]>) => setManual((manual) => ({ ...manual, [key]: { ...manual[key], ...patch } })), [key, setManual]);
  return [value, update];
}

const hasText = (blocks: RichTextBlock[]) => richTextToPlain(blocks).trim() !== "" || blocks.some((block) => block.type === "table" && !isEmptyTable(block));

/** Panel heading, the same treatment as an SOP section's title (no icon). */
const heading = (text: string) => <span className={styles.sectionTitle}>{text}</span>;

/**
 * A panel whose text the AI writes: the AI control sits in the header as on an
 * SOP section, and the panel dims until its text starts to stream in.
 */
function FieldPanel({ part, field, title, description, ai, hasContent, children }: {
  part: ManualPart;
  field: ManualAiField;
  title: string;
  description?: string;
  ai: ManualFieldAi;
  hasContent: boolean;
  children: React.ReactNode;
}) {
  const streamed = useRevealText(ai.reveal(field));
  const pending = ai.writing === part && ai.busy(field) && !streamed;
  return (
    <Panel
      className={clsx(pending && styles.sectionPending)}
      title={heading(title)}
      description={description}
      actions={<SectionAiActions hasContent={hasContent} busy={ai.busy(field)} onRun={(action, instruction) => void ai.run(action, field, instruction)} onStop={() => ai.stop(field)} />}
    >
      {children}
    </Panel>
  );
}

/** The notice for an empty part, as on an empty SOP: writing, failed (with Retry), or the one-click write. */
function PartNotice({ part, empty, ai, subject }: { part: ManualPart; empty: boolean; ai: ManualFieldAi; subject: string }) {
  if (ai.writing === part) {
    return <p className={styles.sopNotice} role="status"><Loader2 size={15} className="animate-spin" aria-hidden="true" />{`AI is writing the ${subject}. Fields appear as they are ready.`}</p>;
  }
  const error = ai.failed[part];
  if (error) {
    return (
      <div className={styles.sopNotice} data-tone="error" role="alert">
        <AlertTriangle size={15} aria-hidden="true" /><span>{error}</span>
        <Button variant="secondary" size="sm" icon={<RefreshCw size={13} aria-hidden="true" />} onClick={() => void ai.writePart(part)}>Retry</Button>
      </div>
    );
  }
  if (!empty) return null;
  return (
    <div className={styles.sopNotice}>
      <Sparkles size={15} aria-hidden="true" /><span>{`The ${subject} is empty. Write it at once from your company profile.`}</span>
      <Button variant="primary" size="sm" icon={<Sparkles size={13} aria-hidden="true" />} onClick={() => void ai.writePart(part)}>{`Write ${subject}`}</Button>
    </div>
  );
}

/** Introduction, objective, benefits, sites, core values, how to use, glossary. */
export function FrontMatterWriter() {
  const [front, update] = useManualPart("frontMatter");
  const company = useSopBuilder((state) => state.manual!.company);
  const storedFacts = useSopBuilder((state) => state.manual!.facts);
  const facts = companyFacts({ facts: storedFacts });
  const ai = useManualFieldAi();
  const { openDetails } = useSopBuilderActions();
  const empty = !hasText(front.introduction) && !hasText(front.objective) && !hasText(front.howToUse) && !front.benefits.length && !front.coreValues.length;
  return (
    <StepRoot>
      <PartNotice part="front-matter" empty={empty} ai={ai} subject="front matter" />
      <FieldPanel part="front-matter" field="introduction" title="Introduction" ai={ai} hasContent={hasText(front.introduction)}>
        <NarrativeField blocks={front.introduction} onChange={(introduction) => update({ introduction })} label="Introduction" placeholder="Who the company is and why this manual exists." busy={ai.busy("introduction")} stream={ai.reveal("introduction")} />
      </FieldPanel>
      <FieldPanel part="front-matter" field="objective" title="Objective" ai={ai} hasContent={hasText(front.objective)}>
        <NarrativeField blocks={front.objective} onChange={(objective) => update({ objective })} label="Objective" placeholder="What following these procedures achieves." busy={ai.busy("objective")} stream={ai.reveal("objective")} />
      </FieldPanel>
      <Panel title={heading("Benefits")} description="One benefit per line.">
        <LinesField lines={front.benefits} onChange={(benefits) => update({ benefits })} label="Benefits" placeholder={"Consistent practice across sites\nAudit-ready records"} className={styles.linesWriting} />
      </Panel>
      <Panel title={heading("Sites covered")} description="From the company details." actions={<Button variant="ghost" size="sm" icon={<Pencil size={13} aria-hidden="true" />} onClick={openDetails}>Edit sites</Button>}>
        {(company.sites ?? []).length ? (
          <ul className={styles.siteList}>{(company.sites ?? []).map((site, index) => <li key={index}><strong>{site.location || `Site ${index + 1}`}</strong><span>{[site.address, site.primaryFunction].filter(Boolean).join(" · ")}</span></li>)}</ul>
        ) : <p className="text-[13px] text-[var(--pc-muted)]">No sites yet. Add them in the company details.</p>}
      </Panel>
      <Panel title={heading("Contacts and certifications")} description="From the company details. Printed after Scope and Applicability." actions={<Button variant="ghost" size="sm" icon={<Pencil size={13} aria-hidden="true" />} onClick={openDetails}>Edit facts</Button>}>
        {facts.contacts.length || facts.certifications.length ? (
          <ul className={styles.siteList}>
            {facts.contacts.map((contact, index) => <li key={`contact-${index}`}><strong>{contact.purpose || "Contact"}</strong><span>{[contact.name, contact.phone, contact.email].filter(Boolean).join(" · ")}</span></li>)}
            {facts.certifications.length ? <li><strong>Certifications</strong><span>{facts.certifications.join(", ")}</span></li> : null}
          </ul>
        ) : <p className="text-[13px] text-[var(--pc-muted)]">No contacts or certifications yet. Add them in the company details to print Key Contacts and Certifications and Standards.</p>}
      </Panel>
      <Panel title={heading("Core values")}>
        <RowsTable caption="Core values" rows={front.coreValues} onChange={(coreValues) => update({ coreValues })} newRow={() => ({ title: "", description: "" })} addLabel="Add value" columns={[{ key: "title", label: "Value", width: "28%", placeholder: "Safety first" }, { key: "description", label: "What it means here", width: "auto" }]} />
      </Panel>
      <FieldPanel part="front-matter" field="howToUse" title="How to use this manual" ai={ai} hasContent={hasText(front.howToUse)}>
        <NarrativeField blocks={front.howToUse} onChange={(howToUse) => update({ howToUse })} label="How to use this manual" placeholder="How staff find, read and follow an SOP, and who holds the controlled copy." busy={ai.busy("howToUse")} stream={ai.reveal("howToUse")} />
      </FieldPanel>
      <Panel title={heading("Glossary")}>
        <RowsTable caption="Glossary" rows={front.glossary} onChange={(glossary) => update({ glossary })} newRow={() => ({ term: "", definition: "" })} addLabel="Add term" columns={[{ key: "term", label: "Term", width: "28%" }, { key: "definition", label: "Definition", width: "auto" }]} />
      </Panel>
    </StepRoot>
  );
}

/** Review mechanism, revision history and the approval page. */
export function ClosingWriter() {
  const [closing, update] = useManualPart("closing");
  const control = useSopBuilder((state) => state.manual!.control);
  const ai = useManualFieldAi();
  const setApproval = (patch: Partial<SopApproval>) => update({ approval: { ...closing.approval, ...patch } } as Partial<SopClosing>);
  const empty = !hasText(closing.reviewMechanism) && !closing.approval.statement.trim();
  return (
    <StepRoot>
      <PartNotice part="closing" empty={empty} ai={ai} subject="closing" />
      <FieldPanel part="closing" field="reviewMechanism" title="Review mechanism" ai={ai} hasContent={hasText(closing.reviewMechanism)}>
        <NarrativeField blocks={closing.reviewMechanism} onChange={(reviewMechanism) => update({ reviewMechanism })} label="Review mechanism" placeholder={`How the manual is reviewed (${control.reviewFrequency.toLowerCase() || "yearly"}), who approves changes and how revisions are issued.`} busy={ai.busy("reviewMechanism")} stream={ai.reveal("reviewMechanism")} />
      </FieldPanel>
      <Panel title={heading("Revision history")}>
        <RowsTable<RevisionEntry & Record<string, unknown>> caption="Revision history" rows={closing.revisionHistory as (RevisionEntry & Record<string, unknown>)[]} onChange={(revisionHistory) => update({ revisionHistory })} newRow={() => ({ revisionNo: String(closing.revisionHistory.length + 1).padStart(2, "0"), date: new Date().toISOString().slice(0, 10), description: "", source: "custom" })} addLabel="Add revision" columns={[{ key: "revisionNo", label: "Rev", width: "9%" }, { key: "date", label: "Date (YYYY-MM-DD)", width: "17%" }, { key: "description", label: "Change", width: "auto" }, { key: "reviewedBy", label: "Reviewed by", width: "17%", placeholder: "Plant Head" }, { key: "approvedBy", label: "Approved by", width: "17%", placeholder: "Managing Director" }]} />
      </Panel>
      <FieldPanel part="closing" field="approvalStatement" title="Approval" description="Printed on the closing page above the signatures." ai={ai} hasContent={closing.approval.statement.trim() !== ""}>
        <WritingField value={closing.approval.statement} onChange={(event) => setApproval({ statement: event.target.value })} label="Approval statement" placeholder={`This manual has been reviewed and approved by ${control.approvedBy || "the Managing Director"} for implementation across all sites.`} busy={ai.busy("approvalStatement")} stream={ai.reveal("approvalStatement")} />
        <div className="mt-4">
          <RowsTable caption="Signatories" rows={closing.approval.signatories} onChange={(signatories) => setApproval({ signatories })} newRow={() => ({ role: "", name: "", designation: "", date: "" })} addLabel="Add signatory" columns={[{ key: "role", label: "Role", width: "22%", placeholder: "Approved by" }, { key: "name", label: "Name", width: "26%" }, { key: "designation", label: "Designation", width: "26%" }, { key: "date", label: "Date", width: "auto" }]} />
        </div>
      </FieldPanel>
    </StepRoot>
  );
}
