"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { getEnabledSections, sectionHasContent } from "@/lib/sections";
import type { PolicySection } from "@/lib/types";
import { Field, Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/calendar";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, GripVertical, ChevronUp, ChevronDown, Plus, Trash2, X, ListTree, FileText } from "lucide-react";

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
  const sections = policy.sections || [];

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
      return { company: updatedCompany };
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
    <div className="space-y-8 animate-fade-in">
      {/* Document metadata fields at the start of document structure */}
      <Panel
        title="Document Header & Revision Metadata"
        description="Specify document control numbers, approver, and review schedule."
        icon={<FileText size={17} strokeWidth={1.8} />}
      >
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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
              onChange={(date) => updatePolicy((p) => ({ company: { ...p.company, lastReviewDate: date } }))}
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
        </div>
        <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-cream-2)]/50 p-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold text-[var(--color-ink-2)]">Responsible reviewer designation(s)</p>
              <p className="text-[11px] text-[var(--color-muted)]">Use named roles such as Sustainability Manager or Compliance Officer, not only a department.</p>
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
            {!(co.reviewerDesignations || []).length && <p className="text-[11px] text-amber-700">Add at least one designation before finalizing the review section.</p>}
          </div>
        </div>
      </Panel>

      {/* Document outline reordering & section customization */}
      <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-8 items-start">
        <div className="bg-[var(--color-paper)] border border-[var(--color-line)] rounded-2xl overflow-hidden shadow-[0_12px_34px_rgba(35,52,42,.06)]">
          <div className="px-6 py-5 border-b border-[var(--color-line)] flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[var(--color-forest)]">
                <ListTree size={17}/>
                <span className="text-[11px] uppercase tracking-[.15em] font-bold">Document outline</span>
              </div>
              <h2 className="font-display text-[24px] font-semibold tracking-tight mt-2">Shape the policy your way.</h2>
              <p className="text-[12.5px] text-[var(--color-muted)] mt-1">Rename, show, hide, and reorder sections. Preface always stays first.</p>
            </div>
            <Button variant="primary" size="sm" icon={<Plus size={14}/>} onClick={add}>Add section</Button>
          </div>
          <div className="p-3 sm:p-5 space-y-2">
            {sections.map((section, index) => {
              const locked = section.kind === "preface";
              const active = selected === section.id;
              return (
                <div
                  key={section.id}
                  draggable={!locked}
                  onDragStart={() => setDragged(section.id)}
                  onDragEnd={() => setDragged(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(section.id)}
                  onClick={() => setSelected(section.id)}
                  className={`group grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 items-center p-3 rounded-xl border transition-all ${
                    active
                      ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)]/45 shadow-sm"
                      : "border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-cream-2)]/70"
                  } ${dragged === section.id ? "opacity-45" : ""}`}
                >
                  <div className="flex items-center gap-1 text-[var(--color-muted)]">
                    <GripVertical size={16} className={locked ? "opacity-25" : "cursor-grab"}/>
                    <span className="font-mono text-[11px] w-5">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="min-w-0">
                    <Input
                      value={section.title}
                      onChange={(e) => update(section.id, { title: e.target.value })}
                      className="h-8 border-transparent bg-transparent px-2 font-semibold focus:bg-white"
                      aria-label={`${labelFor(section)} title`}
                    />
                    <div className="px-2 mt-1 text-[10.5px] uppercase tracking-wide text-[var(--color-muted)] flex gap-2">
                      <span>{labelFor(section)}</span>
                      {sectionHasContent(policy, section) && <span className="text-[var(--color-forest)]">Content added</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); if (!locked) update(section.id, { enabled: !section.enabled }); }}
                      disabled={locked}
                      className="p-2 rounded-lg text-[var(--color-muted)] hover:bg-white hover:text-[var(--color-forest)] disabled:opacity-40"
                      title={section.enabled ? "Hide from document" : "Show in document"}
                    >
                      {section.enabled ? <Eye size={16}/> : <EyeOff size={16}/>}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); move(index, -1); }}
                      disabled={locked || index <= 1}
                      className="p-1.5 disabled:opacity-25"
                      aria-label="Move section up"
                    >
                      <ChevronUp size={15}/>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); move(index, 1); }}
                      disabled={locked || index === sections.length - 1}
                      className="p-1.5 disabled:opacity-25"
                      aria-label="Move section down"
                    >
                      <ChevronDown size={15}/>
                    </button>
                    {section.kind === "custom" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); remove(section.id); }}
                        className="p-2 text-[var(--color-muted)] hover:text-red-700"
                        aria-label="Remove custom section"
                      >
                        <Trash2 size={15}/>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="xl:sticky xl:top-5 bg-[#fffdf7] border border-[var(--color-line)] rounded-2xl p-5 shadow-[0_12px_34px_rgba(35,52,42,.05)]">
          <div className="text-[10px] uppercase tracking-[.16em] text-[var(--color-muted)] font-bold">Table of contents</div>
          <h3 className="font-display text-[18px] font-semibold mt-1">Live outline</h3>
          <ol className="mt-5 space-y-3">
            {getEnabledSections(policy).map((section, index) => (
              <li key={section.id} className="flex gap-3 text-[12px]">
                <span className="font-mono text-[var(--color-forest)] font-bold">{String(index + 1).padStart(2,"0")}</span>
                <span>{section.title || "Untitled section"}</span>
              </li>
            ))}
            {policy.showAcknowledgement && (
              <li className="flex gap-3 text-[12px]">
                <span className="font-mono text-[var(--color-forest)] font-bold">{String(getEnabledSections(policy).length + 1).padStart(2,"0")}</span>
                <span>Employee Acknowledgement Form</span>
              </li>
            )}
          </ol>
          <div className="mt-6 pt-4 border-t border-[var(--color-line)] text-[11.5px] text-[var(--color-muted)]">
            Use the eye icon to remove a section from both the document and table of contents without deleting its content.
          </div>
        </aside>
      </div>
    </div>
  );
}
