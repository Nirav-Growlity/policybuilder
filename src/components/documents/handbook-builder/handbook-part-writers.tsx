"use client";

import * as React from "react";
import { AlertTriangle, Loader2, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { clsx } from "clsx";
import { StepRoot, WritingField } from "@/components/builder/steps/authoring-ui";
import { useRevealText } from "@/components/ui/ai-stream";
import { Panel } from "@/components/ui/panel";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useHandbookBuilder } from "@/lib/handbook/store";
import type { HandbookManual } from "@/lib/handbook/types";
import type { HandbookAiField } from "@/lib/handbook/ai-contract";
import type { RevisionEntry, RichTextBlock } from "@/lib/types";
import type { SopApproval, SopCoreValue, SopDefinitionRow } from "@/lib/sop/types";
import { companyFacts } from "@/lib/sop/company-facts";
import { isEmptyTable, richTextToPlain } from "@/components/documents/manual-helpers";
import { SectionAiActions } from "@/components/documents/builder/section-ai-actions";
import { NarrativeField, RowsTable } from "@/components/documents/builder/section-editors";
import { useHandbookBuilderActions } from "./handbook-builder-context";
import { useHandbookFieldAi, type HandbookFieldAi, type HandbookPart } from "./use-handbook-ai";
import styles from "@/components/documents/builder/builder.module.css";

function useHandbookPart<K extends "frontMatter" | "closing">(key: K): [HandbookManual[K], (patch: Partial<HandbookManual[K]>) => void] {
  const value = useHandbookBuilder((state) => state.manual![key]);
  const setManual = useHandbookBuilder((state) => state.setManual);
  const update = React.useCallback((patch: Partial<HandbookManual[K]>) => setManual((manual) => ({ ...manual, [key]: { ...manual[key], ...patch } })), [key, setManual]);
  return [value, update];
}

const hasText = (blocks: RichTextBlock[]) => richTextToPlain(blocks).trim() !== "" || blocks.some((block) => block.type === "table" && !isEmptyTable(block));

/** Panel heading, the same treatment as a chapter section's title (no icon). */
const heading = (text: string) => <span className={styles.sectionTitle}>{text}</span>;

/**
 * A panel whose text the AI writes: the AI control sits in the header as on a
 * chapter section, and the panel dims until its text starts to stream in.
 */
function FieldPanel({ part, field, title, description, ai, hasContent, children }: {
  part: HandbookPart;
  field: HandbookAiField;
  title: string;
  description?: string;
  ai: HandbookFieldAi;
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

/** The notice for an empty part: writing, failed (with Retry), or the one-click write. */
function PartNotice({ part, empty, ai, subject }: { part: HandbookPart; empty: boolean; ai: HandbookFieldAi; subject: string }) {
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

/** Welcome, about the company, vision and mission, values, purpose, how to use, sites, contacts and the glossary. */
export function OpeningWriter() {
  const [front, update] = useHandbookPart("frontMatter");
  const company = useHandbookBuilder((state) => state.manual!.company);
  const storedFacts = useHandbookBuilder((state) => state.manual!.facts);
  const facts = companyFacts({ facts: storedFacts });
  const ai = useHandbookFieldAi();
  const { openDetails } = useHandbookBuilderActions();
  const empty = !hasText(front.welcome) && !hasText(front.about) && !hasText(front.purpose) && !hasText(front.howToUse) && !front.vision.trim() && !front.mission.trim() && !front.coreValues.length;
  return (
    <StepRoot>
      <PartNotice part="front-matter" empty={empty} ai={ai} subject="opening pages" />
      <FieldPanel part="front-matter" field="welcome" title="Welcome" ai={ai} hasContent={hasText(front.welcome)}>
        <NarrativeField blocks={front.welcome} onChange={(welcome) => update({ welcome })} label="Welcome message" placeholder="A short welcome from the company to the people who read this handbook." busy={ai.busy("welcome")} stream={ai.reveal("welcome")} />
      </FieldPanel>
      <FieldPanel part="front-matter" field="about" title="About the company" ai={ai} hasContent={hasText(front.about)}>
        <NarrativeField blocks={front.about} onChange={(about) => update({ about })} label="About the company" placeholder="What the company does, where it works and how many people it employs." busy={ai.busy("about")} stream={ai.reveal("about")} />
      </FieldPanel>
      <Panel title={heading("Vision and mission")} description="One line each, printed on the opening pages.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Vision">
            <Input value={front.vision} onChange={(event) => update({ vision: event.target.value })} placeholder="To be the most trusted fabric finisher in India." />
          </Field>
          <Field label="Mission">
            <Input value={front.mission} onChange={(event) => update({ mission: event.target.value })} placeholder="To deliver consistent quality safely and fairly." />
          </Field>
        </div>
      </Panel>
      <Panel title={heading("Core values")}>
        <RowsTable<SopCoreValue> caption="Core values" rows={front.coreValues} onChange={(coreValues) => update({ coreValues })} newRow={() => ({ title: "", description: "" })} addLabel="Add value" columns={[{ key: "title", label: "Value", width: "28%", placeholder: "Safety first" }, { key: "description", label: "What it means here", width: "auto" }]} />
      </Panel>
      <FieldPanel part="front-matter" field="purpose" title="Purpose of this handbook" ai={ai} hasContent={hasText(front.purpose)}>
        <NarrativeField blocks={front.purpose} onChange={(purpose) => update({ purpose })} label="Purpose of this handbook" placeholder="What this handbook covers and what it does not replace, such as the appointment letter or the law." busy={ai.busy("purpose")} stream={ai.reveal("purpose")} />
      </FieldPanel>
      <FieldPanel part="front-matter" field="howToUse" title="How to use this handbook" ai={ai} hasContent={hasText(front.howToUse)}>
        <NarrativeField blocks={front.howToUse} onChange={(howToUse) => update({ howToUse })} label="How to use this handbook" placeholder="How employees find the chapters that apply to them and who to ask when something is unclear." busy={ai.busy("howToUse")} stream={ai.reveal("howToUse")} />
      </FieldPanel>
      <Panel title={heading("Sites covered")} description="From the company details." actions={<Button variant="ghost" size="sm" icon={<Pencil size={13} aria-hidden="true" />} onClick={openDetails}>Edit sites</Button>}>
        {(company.sites ?? []).length ? (
          <ul className={styles.siteList}>{(company.sites ?? []).map((site, index) => <li key={index}><strong>{site.location || `Site ${index + 1}`}</strong><span>{[site.address, site.primaryFunction].filter(Boolean).join(" · ")}</span></li>)}</ul>
        ) : <p className="text-[13px] text-[var(--pc-muted)]">No sites yet. Add them in the company details.</p>}
      </Panel>
      <Panel title={heading("Contacts and certifications")} description="From the company details. Printed on the opening pages." actions={<Button variant="ghost" size="sm" icon={<Pencil size={13} aria-hidden="true" />} onClick={openDetails}>Edit facts</Button>}>
        {facts.contacts.length || facts.certifications.length ? (
          <ul className={styles.siteList}>
            {facts.contacts.map((contact, index) => <li key={`contact-${index}`}><strong>{contact.purpose || "Contact"}</strong><span>{[contact.name, contact.phone, contact.email].filter(Boolean).join(" · ")}</span></li>)}
            {facts.certifications.length ? <li><strong>Certifications</strong><span>{facts.certifications.join(", ")}</span></li> : null}
          </ul>
        ) : <p className="text-[13px] text-[var(--pc-muted)]">No contacts or certifications yet. Add them in the company details to print them with the handbook.</p>}
      </Panel>
      <Panel title={heading("Glossary")}>
        <RowsTable<SopDefinitionRow> caption="Glossary" rows={front.glossary} onChange={(glossary) => update({ glossary })} newRow={() => ({ term: "", definition: "" })} addLabel="Add term" columns={[{ key: "term", label: "Term", width: "28%" }, { key: "definition", label: "Definition", width: "auto" }]} />
      </Panel>
    </StepRoot>
  );
}

/** Review mechanism, revision history, the approval page and the employee acknowledgement. */
export function ClosingWriter() {
  const [closing, update] = useHandbookPart("closing");
  const control = useHandbookBuilder((state) => state.manual!.control);
  const ai = useHandbookFieldAi();
  const setApproval = (patch: Partial<SopApproval>) => update({ approval: { ...closing.approval, ...patch } });
  const empty = !hasText(closing.reviewMechanism) && !closing.approval.statement.trim() && !closing.acknowledgement.trim();
  return (
    <StepRoot>
      <PartNotice part="closing" empty={empty} ai={ai} subject="closing" />
      <FieldPanel part="closing" field="reviewMechanism" title="Review mechanism" ai={ai} hasContent={hasText(closing.reviewMechanism)}>
        <NarrativeField blocks={closing.reviewMechanism} onChange={(reviewMechanism) => update({ reviewMechanism })} label="Review mechanism" placeholder={`How the handbook is reviewed (${control.reviewFrequency.toLowerCase() || "yearly"}), who approves changes and how employees are told.`} busy={ai.busy("reviewMechanism")} stream={ai.reveal("reviewMechanism")} />
      </FieldPanel>
      <Panel title={heading("Revision history")}>
        <RowsTable<RevisionEntry & Record<string, unknown>> caption="Revision history" rows={closing.revisionHistory as (RevisionEntry & Record<string, unknown>)[]} onChange={(revisionHistory) => update({ revisionHistory })} newRow={() => ({ revisionNo: String(closing.revisionHistory.length + 1).padStart(2, "0"), date: new Date().toISOString().slice(0, 10), description: "", source: "custom" })} addLabel="Add revision" columns={[{ key: "revisionNo", label: "Rev", width: "9%" }, { key: "date", label: "Date (YYYY-MM-DD)", width: "17%" }, { key: "description", label: "Change", width: "auto" }, { key: "reviewedBy", label: "Reviewed by", width: "17%", placeholder: "HR Manager" }, { key: "approvedBy", label: "Approved by", width: "17%", placeholder: "Managing Director" }]} />
      </Panel>
      <FieldPanel part="closing" field="approvalStatement" title="Approval" description="Printed on the closing page above the signatures." ai={ai} hasContent={closing.approval.statement.trim() !== ""}>
        <WritingField value={closing.approval.statement} onChange={(event) => setApproval({ statement: event.target.value })} label="Approval statement" placeholder={`This handbook has been reviewed and approved by ${control.approvedBy || "the Managing Director"} and applies from its effective date.`} busy={ai.busy("approvalStatement")} stream={ai.reveal("approvalStatement")} />
        <div className="mt-4">
          <RowsTable caption="Signatories" rows={closing.approval.signatories} onChange={(signatories) => setApproval({ signatories })} newRow={() => ({ role: "", name: "", designation: "", date: "" })} addLabel="Add signatory" columns={[{ key: "role", label: "Role", width: "22%", placeholder: "Approved by" }, { key: "name", label: "Name", width: "26%" }, { key: "designation", label: "Designation", width: "26%" }, { key: "date", label: "Date", width: "auto" }]} />
        </div>
      </FieldPanel>
      <FieldPanel part="closing" field="acknowledgement" title="Employee acknowledgement" description="Prints on its own page with signature lines, for each employee to sign on receipt." ai={ai} hasContent={closing.acknowledgement.trim() !== ""}>
        <WritingField value={closing.acknowledgement} onChange={(event) => update({ acknowledgement: event.target.value })} label="Acknowledgement statement" placeholder="I confirm that I have received, read and understood this handbook." busy={ai.busy("acknowledgement")} stream={ai.reveal("acknowledgement")} />
      </FieldPanel>
    </StepRoot>
  );
}

