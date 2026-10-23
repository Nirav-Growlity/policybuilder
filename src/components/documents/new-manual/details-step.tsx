"use client";

import * as React from "react";
import { ArrowRight, FileBadge, ShieldCheck } from "lucide-react";
import { CompanyInfoForm } from "@/components/builder/company-info-form";
import { Panel } from "@/components/ui/panel";
import { Field, Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/calendar";
import { SelectMenu } from "@/components/ui/select-menu";
import type { Company } from "@/lib/types";
import type { SopCompanyFacts, SopManualControl } from "@/lib/sop/types";
import { CompanyFactsPanel } from "./company-facts-panel";
import { WizardHeading } from "./wizard-chrome";

export const REVIEW_FREQUENCIES = ["Yearly", "Half-yearly", "Quarterly", "Every 2 years", "Every 3 years"] as const;

/** Next review date from the effective date and how often the manual is reviewed. */
export function nextReviewDate(effectiveDate: string, frequency: string): string {
  const date = new Date(`${effectiveDate}T00:00:00Z`);
  if (!effectiveDate || Number.isNaN(date.valueOf())) return "";
  const months = frequency === "Quarterly" ? 3 : frequency === "Half-yearly" ? 6 : frequency === "Every 2 years" ? 24 : frequency === "Every 3 years" ? 36 : 12;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function detailsErrors(company: Company, control: SopManualControl, documentNoun = "manual") {
  return {
    name: company.name.trim() ? "" : "Enter the company name.",
    approvedBy: control.approvedBy.trim() ? "" : `Enter who approves the ${documentNoun}.`,
  };
}

/** Manual control fields; the company form above it is the policy setup form. */
export function ManualDetailsPanel({ control, onChange, showErrors, titlePlaceholder = "SOP Manual", documentNoun = "manual" }: { control: SopManualControl; onChange: (patch: Partial<SopManualControl>) => void; showErrors: boolean; titlePlaceholder?: string; documentNoun?: string }) {
  const approvedError = showErrors && !control.approvedBy.trim() ? `Enter who approves the ${documentNoun}.` : undefined;
  const title = `${documentNoun.charAt(0).toUpperCase()}${documentNoun.slice(1)} details`;
  return (
    <Panel title={title} description="Document control printed on the cover and in every page header." icon={<FileBadge size={17} strokeWidth={1.8} />}>
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Manual title" hint="Printed on the cover and in page headers">
          <Input value={control.title ?? ""} onChange={(event) => onChange({ title: event.target.value })} placeholder={titlePlaceholder} />
        </Field>
        <Field label="Subtitle" hint="Shown under the title on the cover">
          <Input value={control.subtitle ?? ""} onChange={(event) => onChange({ subtitle: event.target.value })} placeholder="Environmental, Social and Governance procedures" />
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Document number" hint="Suggested from your organization code">
          <Input value={control.docNo} onChange={(event) => onChange({ docNo: event.target.value })} placeholder="ACME/SOP/01" />
        </Field>
        <Field label="Revision">
          <Input value={control.revision} onChange={(event) => onChange({ revision: event.target.value })} placeholder="01" />
        </Field>
        <Field label="Classification">
          <SelectMenu size="compact" value={control.classification || "Internal"} onValueChange={(classification) => onChange({ classification })} options={["Internal", "Confidential", "Public", "Controlled copy"].map((value) => ({ value, label: value }))} aria-label="Classification" />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Supersedes" hint="The issue this manual replaces">
          <Input value={control.supersedes} onChange={(event) => onChange({ supersedes: event.target.value })} placeholder="Rev 00" />
        </Field>
        <Field label="Issue date">
          <DatePicker value={control.issueDate ?? ""} onChange={(issueDate) => onChange({ issueDate })} placeholder="DD-MM-YYYY" ariaLabel="Issue date" />
        </Field>
        <Field label="Last review date">
          <DatePicker value={control.lastReviewDate ?? ""} maxDate={control.nextReviewDate || undefined} onChange={(lastReviewDate) => onChange({ lastReviewDate })} placeholder="DD-MM-YYYY" ariaLabel="Last review date" />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Effective date">
          <DatePicker value={control.effectiveDate} onChange={(effectiveDate) => onChange({ effectiveDate, nextReviewDate: nextReviewDate(effectiveDate, control.reviewFrequency) })} placeholder="DD-MM-YYYY" ariaLabel="Effective date" />
        </Field>
        <Field label="Review frequency">
          <SelectMenu size="compact" value={control.reviewFrequency || "Yearly"} onValueChange={(reviewFrequency) => onChange({ reviewFrequency, nextReviewDate: nextReviewDate(control.effectiveDate, reviewFrequency) })} options={REVIEW_FREQUENCIES.map((value) => ({ value, label: value }))} aria-label="Review frequency" />
        </Field>
        <Field label="Next review date">
          <DatePicker value={control.nextReviewDate} minDate={control.effectiveDate || undefined} onChange={(nextReviewDate) => onChange({ nextReviewDate })} placeholder="DD-MM-YYYY" ariaLabel="Next review date" />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Prepared by">
          <Input value={control.preparedBy} onChange={(event) => onChange({ preparedBy: event.target.value })} placeholder="EHS Manager" />
        </Field>
        <Field label="Reviewed by">
          <Input value={control.reviewedBy} onChange={(event) => onChange({ reviewedBy: event.target.value })} placeholder="Plant Head" />
        </Field>
        <Field label="Approved by" required error={approvedError}>
          <Input value={control.approvedBy} onChange={(event) => onChange({ approvedBy: event.target.value })} placeholder="Managing Director" aria-invalid={approvedError ? true : undefined} />
        </Field>
      </div>
    </Panel>
  );
}

export const DEFAULT_NEXT_HINT = "Next, choose the SOPs your teams follow. We suggest a set for your industry.";

export function DetailsStep({ company, control, facts, onCompanyChange, onControlChange, onFactsChange, onContinue, continueLabel = "Continue to choose SOPs", nextHint = DEFAULT_NEXT_HINT, documentNoun = "manual", titlePlaceholder, extra }: {
  company: Company;
  control: SopManualControl;
  facts: SopCompanyFacts;
  onCompanyChange: (updater: (company: Company) => Company | undefined) => void;
  onControlChange: (patch: Partial<SopManualControl>) => void;
  onFactsChange: (patch: Partial<SopCompanyFacts>) => void;
  onContinue: () => void;
  continueLabel?: string;
  nextHint?: string;
  /** "manual" or "handbook"; names the document in messages. */
  documentNoun?: string;
  titlePlaceholder?: string;
  /** Rendered after the company facts, e.g. the handbook's employment terms. */
  extra?: React.ReactNode;
}) {
  const [attempted, setAttempted] = React.useState(false);
  const errors = detailsErrors(company, control, documentNoun);
  const missing = [errors.name, errors.approvedBy].filter(Boolean);

  return (
    <section className="mx-auto max-w-5xl px-4 pt-8 sm:px-6">
      <div className="mb-8">
        <WizardHeading title="Enter company and manual details." description="We filled in what your organization profile already has. Only the company name and the approver are required; everything else can change later." />
      </div>
      <div className="flex flex-col gap-5">
        <CompanyInfoForm company={company} onCompanyChange={onCompanyChange} documentLabel={documentNoun} />
        <ManualDetailsPanel control={control} onChange={onControlChange} showErrors={attempted} documentNoun={documentNoun} titlePlaceholder={titlePlaceholder} />
        <CompanyFactsPanel facts={facts} onChange={onFactsChange} />
        {extra}
      </div>
      <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-[var(--color-line)] bg-[var(--pc-panel)] p-4 sm:flex-row">
        <div className="flex items-center gap-2 text-[14px] text-[var(--color-muted)]" role={attempted && missing.length ? "alert" : undefined}>
          <ShieldCheck size={16} className="shrink-0 text-[var(--color-forest)]" aria-hidden="true" />
          <span>{attempted && missing.length ? missing.join(" ") : nextHint}</span>
        </div>
        <button
          type="button"
          onClick={() => { setAttempted(true); if (!missing.length) onContinue(); }}
          className="inline-flex min-h-11 w-full shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--color-forest)] px-5 text-[14px] font-semibold text-[var(--pc-primary-text)] transition-colors hover:bg-[var(--color-forest-deep)] sm:w-auto"
        >
          {continueLabel} <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
