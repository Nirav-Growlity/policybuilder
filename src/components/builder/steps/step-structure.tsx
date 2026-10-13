"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { sectionHasContent } from "@/lib/sections";
import type { PolicySection } from "@/lib/types";
import { Field, Input, Select } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/calendar";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, GripVertical, ChevronUp, ChevronDown, Plus, Trash2, X, ListTree, FileText } from "lucide-react";
import { resolveRevisionHistory } from "@/lib/revision-history";

const labelFor = (section: PolicySection) => section.kind === "custom" ? "Custom section" : section.kind.replaceAll("-", " ");

export function StepStructure() {
  const { policy, updatePolicy } = useBuilder();
  const co = policy.company;
  const lastReviewError =
    co.effectiveDate && co.lastReviewDate && co.lastReviewDate < co.effectiveDate
      ? "Cannot precede effective date"
      : undefined;
  const nextReviewError =
    co.effectiveDate && co.reviewDate && co.reviewDate < co.effectiveDate
      ? "Cannot precede effective date"
      : undefined;

  const [selected, setSelected] = React.useState<string | null>(null);
  const [dragged, setDragged] = React.useState<string | null>(null);
  // The metadata shows as a summary once it is filled in. A blank document
  // number means the header still needs attention, so the form starts open.
  const [detailsOpen, setDetailsOpen] = React.useState(() => !co.docNum);
  const detailsId = React.useId();
  const sections = policy.sections || [];
  const reviewersMissing = !(co.reviewerDesignations || []).length;

  // Numbers follow the rendered table of contents: hidden sections take no number.
  const outlineNumbers: Array<number | null> = [];
  let visibleCount = 0;
  for (const section of sections) {
    if (section.enabled) {
      visibleCount += 1;
      outlineNumbers.push(visibleCount);
    } else {
      outlineNumbers.push(null);
    }
  }

  const handleEffectiveDateChange = (date: string) => {
    updatePolicy((p) => {
      const updatedCompany = { ...p.company, effectiveDate: date };
      // Effective date is the baseline for both last review and next review:
      // Clear or adjust any previously selected dates that precede the new baseline
      if (date && updatedCompany.lastReviewDate && updatedCompany.lastReviewDate < date) {
        updatedCompany.lastReviewDate = "";
      }
      if (date && updatedCompany.reviewDate && updatedCompany.reviewDate < date) {
        updatedCompany.reviewDate = "";
      }
      return {
        company: updatedCompany,
        revisionHistory: resolveRevisionHistory(p.revisionHistory, date, updatedCompany.lastReviewDate, updatedCompany.reviewFrequency),
      };
    });
  };

  const move = (index: number, direction: -1 | 1) => updatePolicy((p) => {
    const next = [...(p.sections || [])];
    const target = index + direction;
    if (index <= 0 || target <= 0 || target >= next.length) return {};
    [next[index], next[target]] = [next[target], next[index]];
    return { sections: next };
  });

  const update = (id: string, patch: Partial<PolicySection>) => updatePolicy((p) => ({
    sections: (p.sections || []).map((s) => s.id === id ? { ...s, ...patch } : s),
  }));

  const add = () => updatePolicy((p) => {
    const next = [...(p.sections || [])];
    const at = Math.max(0, next.findIndex((s) => s.id === selected));
    const id = `custom-${Date.now()}`;
    next.splice(at + 1, 0, { id, kind: "custom", title: "Custom section", enabled: true, blocks: [{ id: `${id}-p1`, type: "paragraph", text: "" }] });
    return { sections: next };
  });

  const remove = (id: string) => updatePolicy((p) => ({ sections: (p.sections || []).filter((s) => s.id !== id) }));

  const drop = (targetId: string) => updatePolicy((p) => {
    if (!dragged || dragged === targetId) return {};
    const next = [...(p.sections || [])]; const from = next.findIndex((s) => s.id === dragged); const to = next.findIndex((s) => s.id === targetId);
    if (from <= 0 || to < 0) return {};
    const [item] = next.splice(from, 1); next.splice(to, 0, item); return { sections: next };
  });

  return (
    <div className="space-y-5">
      {/* Document metadata: a summary by default, with the full form behind "Edit details". */}
      <Panel
        title="Document Header & Revision Metadata"
        icon={<FileText size={17} strokeWidth={1.8} />}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-[12px] text-[var(--color-muted)]">Document number</dt>
              <dd className="truncate font-medium text-[var(--color-ink)]">{co.docNum || "Not set"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] text-[var(--color-muted)]">Revision number</dt>
              <dd className="truncate font-medium text-[var(--color-ink)]">{co.revNum || "Not set"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] text-[var(--color-muted)]">Revision frequency</dt>
              <dd className="truncate font-medium text-[var(--color-ink)]">{co.reviewFrequency || "Yearly"}</dd>
            </div>
          </dl>
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            Edit details
          </Button>
        </div>
        {reviewersMissing && <p className="mt-3 text-[11px] text-amber-700">Add at least one designation before finalizing the review section.</p>}

        {detailsOpen && <div id={detailsId} className="mt-5 border-t border-[var(--color-line)] pt-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Document number">
              <Input
                value={co.docNum || ""}
                onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, docNum: e.target.value } }))}
                placeholder="ASC-ENV-001"
              />
            </Field>
            <Field label="Revision number">
              <Input
                value={co.revNum || ""}
                onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, revNum: e.target.value } }))}
                placeholder="01"
              />
            </Field>
            <Field label="Approved by">
              <Input
                value={co.approver || ""}
                onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, approver: e.target.value } }))}
                placeholder="Managing Director"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            <Field label="Effective date">
              <DatePicker
                value={co.effectiveDate || ""}
                onChange={handleEffectiveDateChange}
                placeholder="DD-MM-YYYY"
                ariaLabel="Effective date"
              />
            </Field>
            <Field label="Last review date" error={lastReviewError}>
              <DatePicker
                value={co.lastReviewDate || ""}
                minDate={co.effectiveDate || undefined}
                disabled={!co.effectiveDate}
                hasError={!!lastReviewError}
                onChange={(date) => updatePolicy((p) => ({
                  company: { ...p.company, lastReviewDate: date },
                  revisionHistory: resolveRevisionHistory(p.revisionHistory, p.company.effectiveDate, date, p.company.reviewFrequency),
                }))}
                placeholder="DD-MM-YYYY"
                ariaLabel="Last review date"
              />
            </Field>
            <Field label="Next review date" error={nextReviewError}>
              <DatePicker
                value={co.reviewDate || ""}
                minDate={co.effectiveDate || undefined}
                disabled={!co.effectiveDate}
                hasError={!!nextReviewError}
                onChange={(date) => updatePolicy((p) => ({ company: { ...p.company, reviewDate: date } }))}
                placeholder="DD-MM-YYYY"
                ariaLabel="Next review date"
              />
            </Field>
            <Field label="Revision frequency">
              <Select
                value={co.reviewFrequency || "Yearly"}
                onChange={(event) => updatePolicy((p) => {
                  const reviewFrequency = event.target.value as NonNullable<typeof p.company.reviewFrequency>;
                  return {
                    company: { ...p.company, reviewFrequency },
                    revisionHistory: resolveRevisionHistory(p.revisionHistory, p.company.effectiveDate, p.company.lastReviewDate, reviewFrequency),
                  };
                })}
                aria-label="Revision frequency"
                className="h-9 px-2.5 text-[12.5px]"
              >
                <option>Quarterly</option>
                <option>Half-Yearly</option>
                <option>Yearly</option>
                <option>Bi-Yearly</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-cream-2)]/50 p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-semibold text-[var(--color-ink-2)]">Responsible reviewer designation(s)</p>
              </div>
              <Button variant="ghost" size="sm" icon={<Plus size={13} />} onClick={() => updatePolicy((p) => ({ company: { ...p.company, reviewerDesignations: [...(p.company.reviewerDesignations || []), ""] } }))}>Add designation</Button>
            </div>
            <div className="space-y-2">
              {(co.reviewerDesignations || []).map((designation, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={designation}
                    onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, reviewerDesignations: (p.company.reviewerDesignations || []).map((value, i) => i === index ? e.target.value : value) } }))}
                    placeholder="Sustainability Manager"
                    aria-label={`Reviewer designation ${index + 1}`}
                  />
                  <button type="button" onClick={() => updatePolicy((p) => ({ company: { ...p.company, reviewerDesignations: (p.company.reviewerDesignations || []).filter((_, i) => i !== index) } }))} className="rounded-md p-2 text-[var(--color-muted)] hover:bg-[#fdecec] hover:text-[#9b2929]" aria-label={`Remove reviewer designation ${index + 1}`}><X size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>}
      </Panel>

      {/* Document outline reordering & section customization. Full width; the duplicate live outline is gone. */}
      <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-[14px] overflow-hidden">
        <div className="px-4 py-4 border-b border-[var(--color-line)] flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[var(--color-forest)]">
              <ListTree size={17}/>
              <span className="text-[12px] uppercase tracking-[.1em] font-semibold">Document outline</span>
            </div>
          </div>
          <Button variant="primary" size="sm" className="shrink-0 whitespace-nowrap" icon={<Plus size={14}/>} onClick={add}>Add section</Button>
        </div>
        <div className="p-3 sm:p-5 space-y-2">
          {sections.map((section, index) => {
            const locked = section.kind === "preface";
            const active = selected === section.id;
            const number = outlineNumbers[index];
            return (
              <div
                key={section.id}
                draggable={!locked}
                onDragStart={() => setDragged(section.id)}
                onDragEnd={() => setDragged(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => drop(section.id)}
                onClick={() => setSelected(section.id)}
                className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] gap-2 items-center p-2.5 rounded-lg border transition-colors ${
                  active
                    ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)]"
                    : "border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-cream-2)]/70"
                } ${dragged === section.id ? "opacity-45" : ""}`}
              >
                <div className="flex items-center gap-1 text-[var(--color-muted)]">
                  <GripVertical size={16} className={locked ? "opacity-25" : "cursor-grab"}/>
                  <span className="font-mono text-[11px] w-5">{number === null ? "" : String(number).padStart(2, "0")}</span>
                </div>
                <div className="min-w-0">
                  <Input
                    value={section.title}
                    onChange={(e) => update(section.id, { title: e.target.value })}
                    className="h-10 border-transparent bg-transparent px-2 font-semibold focus:bg-[var(--pc-panel)]"
                    aria-label={`${labelFor(section)} title`}
                  />
                  <div className="px-2 mt-1 text-[12px] text-[var(--color-muted)] flex flex-wrap gap-2">
                    <span>{labelFor(section)}</span>
                    {!section.enabled && <span className="rounded bg-[var(--pc-inset)] px-1.5 font-medium text-[var(--pc-muted)]">Hidden</span>}
                    {sectionHasContent(policy, section) && <span className="text-[var(--color-forest)]">Content added</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); if (!locked) update(section.id, { enabled: !section.enabled }); }}
                    disabled={locked}
                    className="min-h-10 min-w-10 rounded-lg text-[var(--color-muted)] hover:bg-[var(--pc-panel)] hover:text-[var(--color-forest)] disabled:opacity-40"
                    title={section.enabled ? "Hide from document" : "Show in document"}
                  >
                    {section.enabled ? <Eye size={16}/> : <EyeOff size={16}/>}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); move(index, -1); }}
                    disabled={locked || index <= 1}
                    className="min-h-10 min-w-10 rounded-md disabled:opacity-25"
                    aria-label="Move section up"
                  >
                    <ChevronUp size={15}/>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); move(index, 1); }}
                    disabled={locked || index === sections.length - 1}
                    className="min-h-10 min-w-10 rounded-md disabled:opacity-25"
                    aria-label="Move section down"
                  >
                    <ChevronDown size={15}/>
                  </button>
                  {section.kind === "custom" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(section.id); }}
                      className="min-h-10 min-w-10 rounded-md text-[var(--color-muted)] hover:text-[var(--pc-error)]"
                      aria-label="Remove custom section"
                    >
                      <Trash2 size={15}/>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {policy.showAcknowledgement && (
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 items-center p-2.5 text-[var(--color-muted)]">
              <span className="font-mono text-[11px] w-5 pl-[calc(16px+4px)]">{String(visibleCount + 1).padStart(2, "0")}</span>
              <p className="px-2 text-[13px] text-[var(--color-ink)]">Employee Acknowledgement Form <span className="text-[12px] text-[var(--color-muted)]">· added at the end of the document</span></p>
            </div>
          )}
          <p className="mt-4 border-t border-[var(--color-line)] pt-4 px-1 text-[11.5px] text-[var(--color-muted)]">
            Use the eye icon to remove a section from both the document and table of contents without deleting its content.
          </p>
        </div>
      </div>
    </div>
  );
}
