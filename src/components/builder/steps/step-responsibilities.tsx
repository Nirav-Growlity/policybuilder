"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { streamAI } from "@/lib/ai/client";
import { FIELD_BREAK, ITEM_BREAK, keepFinishedSentences, useGenerationStreams } from "@/lib/ai/use-generation-streams";
import { Composing, StreamField, StreamingItems } from "@/components/ui/ai-stream";
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
  const streams = useGenerationStreams();
  // Roles that replace a streamed preview appear without an entrance, so the hand-off is invisible.
  const [settledFrom, setSettledFrom] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (settledFrom === null) return;
    const frame = requestAnimationFrame(() => setSettledFrom(null));
    return () => cancelAnimationFrame(frame);
  }, [settledFrom]);

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
    const { reveal, signal } = streams.start("resp");
    try {
      const existing = policy.responsibilities;
      const r = await streamAI({ type: "responsibilities", policy, customPrompt, existingContent: existing }, {
        signal,
        onPartial: (partial) => reveal.set((partial.responsibilities ?? [])
          .filter((item) => item && typeof item === "object")
          .map((item) => `${typeof item.role === "string" ? item.role : ""}${typeof item.duty === "string" ? `${FIELD_BREAK}${item.duty}` : ""}`)
          .join(ITEM_BREAK)),
      });
      let generated = (r.responsibilities ?? []).filter((item) => typeof item?.role === "string" && typeof item?.duty === "string" && item.role.trim());
      // A stopped stream keeps only the roles whose duty was finished.
      if (signal.aborted) generated = generated.filter((item, i) => i < generated.length - 1 || /[.!?]$/.test(item.duty.trim()));
      if (r.responsibilities || signal.aborted) {
        const existingRolesLower = new Set(existing.map((x) => x.role.toLowerCase().trim()));
        let uniqueNew = generated.filter((x) => !existingRolesLower.has(x.role.toLowerCase().trim()));
        const reqCount = parseRequestedCount(customPrompt);
        if (reqCount && reqCount > 0) {
          uniqueNew = uniqueNew.slice(0, reqCount);
        }
        if (uniqueNew.length === 0) {
          push(signal.aborted ? "Stopped before a role was finished" : "No new roles generated", "info");
          return;
        }
        await reveal.finish(uniqueNew.map((x) => `${x.role}${FIELD_BREAK}${x.duty}`).join(ITEM_BREAK));
        setSettledFrom(existing.length);
        updatePolicy((p) => ({ responsibilities: [...p.responsibilities, ...uniqueNew] }));
        push(`Added ${uniqueNew.length} role responsibility details`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end("resp", reveal);
    }
  };

  const generateText = async (key: "monitoring" | "review", customPrompt?: string) => {
    const { reveal, signal } = streams.start(key);
    const field = key === "monitoring" ? "monitoring" : "reviewMechanism";
    const name = key === "monitoring" ? "Monitoring section" : "Review section";
    try {
      const r = await streamAI({ type: key, policy, customPrompt, existingContent: policy[field] }, {
        signal,
        onPartial: (partial) => reveal.set(partial.text ?? ""),
      });
      const text = signal.aborted ? keepFinishedSentences(r.text ?? "") : r.text;
      if (text) {
        await reveal.finish(text);
        updatePolicy(() => ({ [field]: text }));
        push(signal.aborted ? `${name} stopped. Finished sentences were kept.` : `${name} generated`, signal.aborted ? "info" : "success");
      } else if (signal.aborted) {
        push(`${name} stopped before any text was written`, "info");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end(key, reveal);
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
              loading={streams.busy("resp")}
              onGenerate={(prompt) => generateResp(prompt)}
              onStop={() => streams.stop("resp")}
            />
          </>
        }
      >
        {policy.responsibilities.length > 0 || streams.busy("resp") ? (
          <div className={ui.roles}>
            <AnimatePresence initial={false}>
              {policy.responsibilities.map((r, i) => (
                <motion.div key={i} className={ui.roleRow} {...itemEnter} initial={settledFrom !== null && i >= settledFrom ? false : itemEnter.initial}>
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
            {streams.reveal("resp") ? (
              <StreamingItems
                reveal={streams.reveal("resp")!}
                waiting={<div className={ui.roleRow} aria-busy="true"><Composing lines={1} compact note="" /><Composing lines={2} compact note="Writing roles and their duties" /></div>}
                render={([role, duty], index, writing) => (
                  <div key={`streaming-${index}`} className={ui.roleRow} aria-busy={writing || undefined}>
                    <StreamField text={role ?? ""} writing={writing && duty === undefined} className={`${ui.roleName} ${ui.streamCell}`} />
                    <StreamField text={duty ?? ""} writing={writing && duty !== undefined} className={`${ui.roleDuty} ${ui.streamCell}`} />
                    <div className={`${ui.rowActions} ${ui.streamSpacer}`} aria-hidden="true"><span className={ui.iconButton}><Trash2 size={15} /></span></div>
                  </div>
                )}
              />
            ) : null}
          </div>
        ) : (
          <div className={ui.empty}>
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
            loading={streams.busy("monitoring")}
            onGenerate={(prompt) => generateText("monitoring", prompt)}
            onStop={() => streams.stop("monitoring")}
          />
        }
      >
        <WritingField
          value={policy.monitoring}
          label="Monitoring, reporting & transparency"
          busy={streams.busy("monitoring")}
          stream={streams.reveal("monitoring")}
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
            loading={streams.busy("review")}
            onGenerate={(prompt) => generateText("review", prompt)}
            onStop={() => streams.stop("review")}
          />
        }
      >
        <WritingField
          value={policy.reviewMechanism}
          label="Review mechanism & continuous improvement"
          busy={streams.busy("review")}
          stream={streams.reveal("review")}
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
