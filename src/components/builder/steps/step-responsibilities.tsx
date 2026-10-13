"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { BarChart3, History, Plus, RefreshCw, Trash2, UserCheck, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/ui/toast";
import { getSection } from "@/lib/sections";
import type { RevisionEntry } from "@/lib/types";
import { resolveRevisionHistory, scheduleAnchorAfter, suggestMinorRevisionNumber } from "@/lib/revision-history";
import { SignatureMaker } from "@/components/builder/signature-maker";
import { AutosizeTextarea, StepRoot, WritingField, authoring as ui, itemEnter } from "./authoring-ui";

export function StepResponsibilities() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});

  const updateAcknowledgementDetail = (field: "employeeName" | "employeeId" | "department" | "date", value: string) => {
    updatePolicy((current) => ({
      employeeAcknowledgement: {
        employeeName: current.employeeAcknowledgement?.employeeName ?? "",
        employeeId: current.employeeAcknowledgement?.employeeId ?? "",
        department: current.employeeAcknowledgement?.department ?? "",
        date: current.employeeAcknowledgement?.date ?? "",
        [field]: value,
      },
    }));
  };

  const revisionHistory = resolveRevisionHistory(policy.revisionHistory, policy.company.effectiveDate, policy.company.lastReviewDate, policy.company.reviewFrequency);

  const insertRevisionEntry = (afterIndex: number) => {
    const current = resolveRevisionHistory(policy.revisionHistory, policy.company.effectiveDate, policy.company.lastReviewDate, policy.company.reviewFrequency);
    const nextRevision: RevisionEntry = {
      revisionNo: suggestMinorRevisionNumber(current, afterIndex),
      date: "",
      description: "",
      source: "custom",
      scheduleAnchor: scheduleAnchorAfter(current, afterIndex),
    };
    const next = [...current];
    next.splice(afterIndex + 1, 0, nextRevision);
    updatePolicy(() => ({ revisionHistory: next }));
  };

  const removeRevisionEntry = (i: number) => {
    const list = resolveRevisionHistory(policy.revisionHistory, policy.company.effectiveDate, policy.company.lastReviewDate, policy.company.reviewFrequency);
    if (list[i]?.source !== "custom") return;
    updatePolicy(() => ({ revisionHistory: list.filter((_, idx) => idx !== i) }));
  };

  const updateRevisionEntry = (i: number, field: keyof RevisionEntry, v: string) => {
    const list = resolveRevisionHistory(policy.revisionHistory, policy.company.effectiveDate, policy.company.lastReviewDate, policy.company.reviewFrequency);
    updatePolicy(() => ({
      revisionHistory: list.map((item, idx) => (idx === i ? { ...item, [field]: v } : item)),
    }));
  };

  const generateResp = async (customPrompt?: string) => {
    setBusy((b) => ({ ...b, resp: true }));
    try {
      const existing = policy.responsibilities;
      const r = await callAI({ type: "responsibilities", policy, customPrompt, existingContent: existing });
      if (r.responsibilities) {
        const existingRolesLower = new Set(existing.map((x) => x.role.toLowerCase().trim()));
        let uniqueNew = r.responsibilities.filter((x) => !existingRolesLower.has(x.role.toLowerCase().trim()));
        const reqCount = parseRequestedCount(customPrompt);
        if (reqCount && reqCount > 0) {
          uniqueNew = uniqueNew.slice(0, reqCount);
        }
        updatePolicy((p) => ({ responsibilities: [...p.responsibilities, ...uniqueNew] }));
        push(`Added ${uniqueNew.length} role responsibility details`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, resp: false }));
    }
  };

  const generateMonitoring = async (customPrompt?: string) => {
    setBusy((b) => ({ ...b, monitoring: true }));
    try {
      const existing = policy.monitoring;
      const r = await callAI({ type: "monitoring", policy, customPrompt, existingContent: existing });
      if (r.text) {
        updatePolicy(() => ({ monitoring: r.text! }));
        push("Monitoring section generated", "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, monitoring: false }));
    }
  };

  const generateReview = async (customPrompt?: string) => {
    setBusy((b) => ({ ...b, review: true }));
    try {
      const existing = policy.reviewMechanism;
      const r = await callAI({ type: "review", policy, customPrompt, existingContent: existing });
      if (r.text) {
        updatePolicy(() => ({ reviewMechanism: r.text! }));
        push("Review section generated", "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, review: false }));
    }
  };

  const addRole = () => {
    updatePolicy((p) => ({ responsibilities: [...p.responsibilities, { role: "New role", duty: "" }] }));
  };

  const removeRole = (i: number) => {
    updatePolicy((p) => ({ responsibilities: p.responsibilities.filter((_, idx) => idx !== i) }));
  };

  const updateRole = (i: number, field: "role" | "duty", v: string) => {
    updatePolicy((p) => ({
      responsibilities: p.responsibilities.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)),
    }));
  };

  return (
    <StepRoot>
      {getSection(policy, "responsibilities")?.enabled && <Panel
        title="Roles & responsibilities"
        icon={<Users size={17} strokeWidth={1.8} />}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addRole}>
              Add role
            </Button>
            <AIActionButton
              label="AI Generate"
              loading={busy.resp}
              onGenerate={(prompt) => generateResp(prompt)}
            />
          </>
        }
      >
        {policy.responsibilities.length > 0 ? (
          <div className={ui.roles}>
            <AnimatePresence initial={false}>
              {policy.responsibilities.map((r, i) => (
                <motion.div key={i} className={ui.roleRow} {...itemEnter}>
                  <Input
                    value={r.role}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRole(i, "role", e.target.value)}
                    placeholder="Role / department"
                    aria-label={`Role ${i + 1}`}
                    className={`${ui.inline} ${ui.roleName}`}
                  />
                  <AutosizeTextarea
                    value={r.duty}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateRole(i, "duty", e.target.value)}
                    placeholder="Responsibility description"
                    aria-label={`${r.role || `Role ${i + 1}`} responsibilities`}
                    className={`${ui.inline} ${ui.roleDuty}`}
                  />
                  <div className={ui.rowActions}>
                    <button
                      type="button"
                      onClick={() => removeRole(i)}
                      className={ui.iconButton}
                      data-tone="danger"
                      aria-label={`Remove ${r.role || `role ${i + 1}`}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className={ui.empty}>
            <Users size={18} aria-hidden="true" />
            No roles yet. Add one or use AI Generate.
          </div>
        )}
      </Panel>}

      {getSection(policy, "monitoring")?.enabled && <Panel
        title="Monitoring, reporting & transparency"
        icon={<BarChart3 size={17} strokeWidth={1.8} />}
        actions={
          <AIActionButton
            label="AI Write"
            loading={busy.monitoring}
            onGenerate={(prompt) => generateMonitoring(prompt)}
          />
        }
      >
        <WritingField
          value={policy.monitoring}
          label="Monitoring, reporting & transparency"
          busy={busy.monitoring}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePolicy(() => ({ monitoring: e.target.value }))}
          placeholder="Describe how performance is monitored, which KPIs are tracked, review frequency, and how findings are reported..."
        />
      </Panel>}

      {getSection(policy, "review")?.enabled && <Panel
        title="Review mechanism & continuous improvement"
        icon={<RefreshCw size={17} strokeWidth={1.8} />}
        actions={
          <AIActionButton
            label="AI Write"
            loading={busy.review}
            onGenerate={(prompt) => generateReview(prompt)}
          />
        }
      >
        <WritingField
          value={policy.reviewMechanism}
          label="Review mechanism & continuous improvement"
          busy={busy.review}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePolicy(() => ({ reviewMechanism: e.target.value }))}
          placeholder="Describe how and when this policy is reviewed, who owns the review, and how changes are communicated..."
        />
      </Panel>}

      {getSection(policy, "revision")?.enabled && (
        <Panel
          title={getSection(policy, "revision")?.title || "Revision history"}
          icon={<History size={17} strokeWidth={1.8} />}
          actions={
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => insertRevisionEntry(revisionHistory.length - 1)}>
              Add revision
            </Button>
          }
        >
          <div className={ui.revisionHead} aria-hidden="true">
            <span>Rev no.</span>
            <span>Date</span>
            <span>Description of change</span>
            <span className="w-[70px]"></span>
          </div>
          <AnimatePresence initial={false}>
            {revisionHistory.map((rev, i) => (
              <motion.div
                key={i}
                className={ui.revisionRow}
                data-scheduled={rev.source === "scheduled" || undefined}
                {...itemEnter}
              >
                <Input
                  value={rev.revisionNo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRevisionEntry(i, "revisionNo", e.target.value)}
                  placeholder="0.0"
                  aria-label={`Revision ${i + 1} number`}
                  className={`${ui.inline} ${ui.revisionNo}`}
                />
                <Input
                  value={rev.date}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRevisionEntry(i, "date", e.target.value)}
                  placeholder="DD-MM-YYYY"
                  readOnly={rev.source === "scheduled"}
                  aria-label={`Revision ${rev.revisionNo} date`}
                  title={rev.source === "scheduled" ? "Set by the effective and last review dates" : undefined}
                  className={`${ui.inline} ${ui.revisionDate}`}
                />
                <AutosizeTextarea
                  value={rev.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateRevisionEntry(i, "description", e.target.value)}
                  placeholder="Description of change..."
                  aria-label={`Revision ${rev.revisionNo} description`}
                  className={`${ui.inline} ${ui.revisionText}`}
                />
                <div className={ui.rowActions}>
                  <button
                    type="button"
                    onClick={() => insertRevisionEntry(i)}
                    className={ui.iconButton}
                    data-tone="brand"
                    aria-label={`Insert revision after ${rev.revisionNo}`}
                    title="Insert revision"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRevisionEntry(i)}
                    disabled={rev.source !== "custom"}
                    className={ui.iconButton}
                    data-tone="danger"
                    aria-label={rev.source === "custom" ? "Remove revision" : `Scheduled revision ${rev.revisionNo} cannot be removed`}
                    title={rev.source === "custom" ? "Remove revision" : "Scheduled revisions follow the effective and last review dates"}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </Panel>
      )}
      <Panel
        title="Employee acknowledgement form"
        icon={<UserCheck size={17} strokeWidth={1.8} />}
      >
        <div className={ui.ackGrid}>
          {([
            ["employeeName", "Employee name", "text"],
            ["employeeId", "Employee ID", "text"],
            ["department", "Department", "text"],
            ["date", "Date", "date"],
          ] as const).map(([field, label, type]) => {
            const id = `employee-acknowledgement-${field}`;
            return (
              <div key={field} className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={id} className={ui.ackLabel}>
                  {label}
                </label>
                {type === "date" ? (
                  <DatePicker
                    id={id}
                    value={policy.employeeAcknowledgement?.date ?? ""}
                    onChange={(date) => updateAcknowledgementDetail(field, date)}
                    ariaLabel={label}
                  />
                ) : (
                  <Input
                    id={id}
                    name={id}
                    type={type}
                    value={policy.employeeAcknowledgement?.[field] ?? ""}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateAcknowledgementDetail(field, event.target.value)}
                    aria-label={label}
                    autoComplete="off"
                  />
                )}
              </div>
            );
          })}
        </div>
      </Panel>
      <SignatureMaker />
    </StepRoot>
  );
}
