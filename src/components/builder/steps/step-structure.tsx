"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { useBuilder } from "@/lib/store";
import { sectionHasContent } from "@/lib/sections";
import type { PolicySection } from "@/lib/types";
import { Field, Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { DatePicker } from "@/components/ui/calendar";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, GripVertical, ChevronUp, ChevronDown, Plus, Trash2, X, ListTree, FileText, LockKeyhole, TriangleAlert } from "lucide-react";
import { resolveRevisionHistory } from "@/lib/revision-history";
import { StepRoot, authoring as ui } from "./authoring-ui";

const labelFor = (section: PolicySection) => section.kind === "custom" ? "Custom section" : section.kind.replaceAll("-", " ");
const ease = [0.22, 1, 0.36, 1] as const;
const REVIEW_FREQUENCIES = ["Quarterly", "Half-Yearly", "Yearly", "Bi-Yearly"];

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
  // Visual only: the row a dragged section would land on.
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  // The metadata shows as a summary once it is filled in. A blank document
  // number means the header still needs attention, so the form starts open.
  const [detailsOpen, setDetailsOpen] = React.useState(() => !co.docNum);
  const detailsId = React.useId();
  const sections = policy.sections || [];
  const reviewersMissing = !(co.reviewerDesignations || []).length;
  const hiddenCount = sections.filter((section) => !section.enabled).length;

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

  const facts = [
    { label: "Document number", value: co.docNum },
    { label: "Revision number", value: co.revNum },
    { label: "Revision frequency", value: co.reviewFrequency || "Yearly" },
    { label: "Effective date", value: co.effectiveDate },
  ];

  return (
    <StepRoot>
      {/* Document metadata: a summary by default, with the full form behind "Edit details". */}
      <Panel
        title="Document Header & Revision Metadata"
        icon={<FileText size={17} strokeWidth={1.8} />}
      >
        <div className={ui.factsRow}>
          <dl className={ui.facts}>
            {facts.map((fact) => (
              <div key={fact.label} className={ui.fact}>
                <dt>{fact.label}</dt>
                <dd data-empty={fact.value ? undefined : ""}>{fact.value || "Not set"}</dd>
              </div>
            ))}
          </dl>
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
            trailingIcon={<ChevronDown size={14} aria-hidden="true" className={ui.chevron} />}
          >
            Edit details
          </Button>
        </div>
        {reviewersMissing && <p className={`${ui.warning} mt-3`}><TriangleAlert size={14} aria-hidden="true" />Add at least one designation before finalizing the review section.</p>}

        <AnimatePresence initial={false}>
          {detailsOpen && (
            <motion.div
              key="details"
              id={detailsId}
              initial={{ height: 0, opacity: 0, overflow: "hidden" }}
              animate={{ height: "auto", opacity: 1, transitionEnd: { overflow: "visible" } }}
              exit={{ height: 0, opacity: 0, overflow: "hidden" }}
              transition={{ duration: 0.3, ease }}
            >
              <div className={ui.details}>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mt-4">
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
                    <SelectMenu
                      size="compact"
                      value={co.reviewFrequency || "Yearly"}
                      onValueChange={(value) => updatePolicy((p) => {
                        const reviewFrequency = value as NonNullable<typeof p.company.reviewFrequency>;
                        return {
                          company: { ...p.company, reviewFrequency },
                          revisionHistory: resolveRevisionHistory(p.revisionHistory, p.company.effectiveDate, p.company.lastReviewDate, reviewFrequency),
                        };
                      })}
                      options={REVIEW_FREQUENCIES.map((frequency) => ({ value: frequency, label: frequency }))}
                      aria-label="Revision frequency"
                    />
                  </Field>
                </div>
                <div className={ui.reviewers}>
                  <div className={ui.groupHead}>
                    <span className={ui.groupTitle}>Responsible reviewer designation(s)</span>
                    <Button variant="ghost" size="sm" icon={<Plus size={14} />} onClick={() => updatePolicy((p) => ({ company: { ...p.company, reviewerDesignations: [...(p.company.reviewerDesignations || []), ""] } }))}>Add designation</Button>
                  </div>
                  <div className={ui.reviewerList}>
                    <AnimatePresence initial={false}>
                      {(co.reviewerDesignations || []).map((designation, index) => (
                        <motion.div key={index} className={ui.reviewerRow} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease }}>
                          <Input
                            value={designation}
                            onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, reviewerDesignations: (p.company.reviewerDesignations || []).map((value, i) => i === index ? e.target.value : value) } }))}
                            placeholder="Sustainability Manager"
                            aria-label={`Reviewer designation ${index + 1}`}
                          />
                          <button type="button" onClick={() => updatePolicy((p) => ({ company: { ...p.company, reviewerDesignations: (p.company.reviewerDesignations || []).filter((_, i) => i !== index) } }))} className={ui.iconButton} data-tone="danger" aria-label={`Remove reviewer designation ${index + 1}`}><X size={15} /></button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>

      {/* Document outline: reorder, rename, hide and add sections. */}
      <Panel
        title="Document outline"
        description={<span className={ui.outlineMeta}>{visibleCount} in the document{hiddenCount ? `, ${hiddenCount} hidden` : ""}</span>}
        icon={<ListTree size={17} strokeWidth={1.8} />}
        actions={<Button variant="primary" size="sm" className="shrink-0 whitespace-nowrap" icon={<Plus size={14}/>} onClick={add}>Add section</Button>}
      >
        <ol className={ui.outline}>
          {sections.map((section, index) => {
            const locked = section.kind === "preface";
            const active = selected === section.id;
            const number = outlineNumbers[index];
            const kind = labelFor(section);
            const hasContent = sectionHasContent(policy, section);
            return (
              <motion.li key={section.id} layout="position" transition={{ duration: 0.28, ease }} className={ui.outlineItem}>
                {/* Native drag and drop lives on this inner element, not the animated list item. */}
                <div
                  draggable={!locked}
                  onDragStart={() => setDragged(section.id)}
                  onDragEnd={() => { setDragged(null); setDropTarget(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (dragged && dropTarget !== section.id) setDropTarget(section.id); }}
                  onDrop={() => { drop(section.id); setDropTarget(null); }}
                  onClick={() => setSelected(section.id)}
                  className={ui.outlineRow}
                  data-active={active || undefined}
                  data-hidden={!section.enabled || undefined}
                  data-dragging={dragged === section.id || undefined}
                  data-drop-target={(dragged && dragged !== section.id && dropTarget === section.id) || undefined}
                >
                  <span className={ui.grip} data-locked={locked || undefined} aria-hidden="true">
                    {locked ? <LockKeyhole size={13} /> : <GripVertical size={16} />}
                  </span>
                  <span className={ui.outlineNumber}>{number === null ? "" : String(number).padStart(2, "0")}</span>
                  <div className={ui.outlineMain}>
                    <Input
                      value={section.title}
                      onChange={(e) => update(section.id, { title: e.target.value })}
                      className={`${ui.inline} ${ui.outlineTitle}`}
                      aria-label={`${kind} title`}
                    />
                  </div>
                  <span className={ui.pillSlot}>
                    {!section.enabled
                      ? <span className={ui.pill} data-tone="hidden"><EyeOff size={12} aria-hidden="true" />Hidden</span>
                      : !hasContent
                        ? <span className={ui.pill} data-tone="empty">Empty</span>
                        : <span className="sr-only">Has content</span>}
                  </span>
                  <div className={ui.rowActions}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); if (!locked) update(section.id, { enabled: !section.enabled }); }}
                      disabled={locked}
                      className={ui.iconButton}
                      data-tone="brand"
                      aria-label={section.enabled ? `Hide ${section.title} from document` : `Show ${section.title} in document`}
                      title={section.enabled ? "Hide from document" : "Show in document"}
                    >
                      {section.enabled ? <Eye size={16}/> : <EyeOff size={16}/>}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(index, -1); }}
                      disabled={locked || index <= 1}
                      className={ui.iconButton}
                      aria-label="Move section up"
                    >
                      <ChevronUp size={16}/>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); move(index, 1); }}
                      disabled={locked || index === sections.length - 1}
                      className={ui.iconButton}
                      aria-label="Move section down"
                    >
                      <ChevronDown size={16}/>
                    </button>
                    {section.kind === "custom" && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); remove(section.id); }}
                        className={ui.iconButton}
                        data-tone="danger"
                        aria-label="Remove custom section"
                      >
                        <Trash2 size={15}/>
                      </button>
                    )}
                  </div>
                </div>
              </motion.li>
            );
          })}
          {policy.showAcknowledgement && (
            <li className={ui.outlineItem}>
              <div className={ui.outlineFixed}>
                <span className={ui.grip} aria-hidden="true"><LockKeyhole size={13} /></span>
                <span className={ui.outlineNumber}>{String(visibleCount + 1).padStart(2, "0")}</span>
                <p className={ui.outlineFixedText}><strong>Employee Acknowledgement Form</strong><span>Always placed at the end</span></p>
              </div>
            </li>
          )}
        </ol>
        <p className={ui.outlineTip}>
          <Eye size={14} aria-hidden="true" />
          Hide a section to remove it from the document and table of contents without deleting its content.
        </p>
      </Panel>
    </StepRoot>
  );
}
