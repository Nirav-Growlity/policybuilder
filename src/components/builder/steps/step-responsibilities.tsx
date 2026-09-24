"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar } from "@/components/ui/panel";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { BarChart3, History, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { getSection } from "@/lib/sections";
import type { RevisionEntry } from "@/lib/types";
import { resolveRevisionHistory, scheduleAnchorAfter, suggestMinorRevisionNumber } from "@/lib/revision-history";

export function StepResponsibilities() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});

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
    <div className="space-y-6">
      <InfoBar icon={<Users size={16} className="text-[var(--color-forest)]" />}>
        Define who owns the policy, how performance is monitored, and how the policy is reviewed over time.
      </InfoBar>

      {getSection(policy, "responsibilities")?.enabled && <Panel
        title="Roles & responsibilities"
        description="Assign ownership of the policy across the organization."
        icon={<Users size={17} strokeWidth={1.8} />}
        actions={
          <>
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={addRole}>
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
        <div className="space-y-2.5">
          {policy.responsibilities.map((r, i) => (
            <div
              key={i}
              className="group grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-cream-2)]/60 border border-[var(--color-line)]"
            >
              <Input
                value={r.role}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRole(i, "role", e.target.value)}
                placeholder="Role / department"
                className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] font-semibold text-[13px]"
              />
              <Textarea
                rows={Math.max(2, Math.ceil((r.duty || "").length / 50))}
                value={r.duty}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateRole(i, "duty", e.target.value)}
                placeholder="Responsibility description"
                className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] text-[13px] resize-y"
              />
              <button
                onClick={() => removeRole(i)}
                className="text-[var(--color-muted)] hover:text-[#9b2929] hover:bg-[#fdecec] p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100 self-center"
                aria-label="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </Panel>}

      {getSection(policy, "monitoring")?.enabled && <Panel
        title="Monitoring, reporting & transparency"
        description="How performance is tracked, reviewed and disclosed."
        icon={<BarChart3 size={17} strokeWidth={1.8} />}
        actions={
          <AIActionButton
            label="AI Write"
            loading={busy.monitoring}
            onGenerate={(prompt) => generateMonitoring(prompt)}
          />
        }
      >
        <Textarea
          value={policy.monitoring}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePolicy(() => ({ monitoring: e.target.value }))}
          rows={5}
          placeholder="Describe how performance is monitored, which KPIs are tracked, review frequency, and how findings are reported..."
        />
      </Panel>}

      {getSection(policy, "review")?.enabled && <Panel
        title="Review mechanism & continuous improvement"
        description="When and how this policy is revisited."
        icon={<RefreshCw size={17} strokeWidth={1.8} />}
        actions={
          <AIActionButton
            label="AI Write"
            loading={busy.review}
            onGenerate={(prompt) => generateReview(prompt)}
          />
        }
      >
        <Textarea
          value={policy.reviewMechanism}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePolicy(() => ({ reviewMechanism: e.target.value }))}
          rows={5}
          placeholder="Describe how and when this policy is reviewed, who owns the review, and how changes are communicated..."
        />
      </Panel>}

      {getSection(policy, "revision")?.enabled && (
        <Panel
          title={getSection(policy, "revision")?.title || "Revision history"}
          description="Track version history, revision dates, and change logs."
          icon={<History size={17} strokeWidth={1.8} />}
          actions={
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => insertRevisionEntry(revisionHistory.length - 1)}>
              Add revision
            </Button>
          }
        >
          <div className="space-y-2.5">
            <div className="hidden md:grid grid-cols-[100px_130px_1fr_auto] gap-2 px-3 py-1 text-[11px] font-semibold text-[var(--color-muted)] uppercase tracking-wider">
              <span>Rev No.</span>
              <span>Date</span>
              <span>Description of Change</span>
              <span className="w-8"></span>
            </div>
            {revisionHistory.map((rev, i) => (
              <div
                key={i}
                className="group grid grid-cols-1 md:grid-cols-[100px_130px_1fr_auto] gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-cream-2)]/60 border border-[var(--color-line)]"
              >
                <Input
                  value={rev.revisionNo}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRevisionEntry(i, "revisionNo", e.target.value)}
                  placeholder="0.0"
                  className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] font-semibold text-[13px]"
                />
                <Input
                  value={rev.date}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateRevisionEntry(i, "date", e.target.value)}
                  placeholder="DD-MM-YYYY"
                  readOnly={rev.source === "scheduled"}
                  aria-label={`Revision ${rev.revisionNo} date`}
                  title={rev.source === "scheduled" ? "Set by the effective and last review dates" : undefined}
                  className={`border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] text-[13px] ${rev.source === "scheduled" ? "cursor-not-allowed opacity-70" : ""}`}
                />
                <Textarea
                  rows={Math.max(2, Math.ceil((rev.description || "").length / 60))}
                  value={rev.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateRevisionEntry(i, "description", e.target.value)}
                  placeholder="Description of change..."
                  className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] text-[13px] resize-y"
                />
                <div className="flex items-center gap-1 self-center">
                  <button
                    onClick={() => insertRevisionEntry(i)}
                    className="text-[var(--color-muted)] hover:text-[var(--color-forest)] hover:bg-[var(--color-paper)] p-2 rounded-md transition-colors"
                    aria-label={`Insert revision after ${rev.revisionNo}`}
                    title="Insert revision"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => removeRevisionEntry(i)}
                    disabled={rev.source !== "custom"}
                    className="text-[var(--color-muted)] hover:text-[#9b2929] hover:bg-[#fdecec] p-2 rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--color-muted)]"
                    aria-label={rev.source === "custom" ? "Remove revision" : `Scheduled revision ${rev.revisionNo} cannot be removed`}
                    title={rev.source === "custom" ? "Remove revision" : "Scheduled revisions follow the effective and last review dates"}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
