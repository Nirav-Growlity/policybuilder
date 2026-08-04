"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { callAI } from "@/lib/ai/client";
import { BarChart3, Plus, RefreshCw, Sparkles, Trash2, Users, Wand2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function StepResponsibilities() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});

  const generateResp = async () => {
    setBusy((b) => ({ ...b, resp: true }));
    try {
      const r = await callAI({ type: "responsibilities", policy });
      if (r.responsibilities) {
        updatePolicy((p) => ({ responsibilities: r.responsibilities! }));
        push("Responsibilities generated", "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, resp: false }));
    }
  };

  const generateMonitoring = async () => {
    setBusy((b) => ({ ...b, monitoring: true }));
    try {
      const r = await callAI({ type: "monitoring", policy });
      if (r.text) {
        updatePolicy((p) => ({ monitoring: r.text! }));
        push("Monitoring section generated", "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, monitoring: false }));
    }
  };

  const generateReview = async () => {
    setBusy((b) => ({ ...b, review: true }));
    try {
      const r = await callAI({ type: "review", policy });
      if (r.text) {
        updatePolicy((p) => ({ reviewMechanism: r.text! }));
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

      <Panel
        title="Roles & responsibilities"
        description="Assign ownership of the policy across the organization."
        icon={<Users size={17} strokeWidth={1.8} />}
        actions={
          <>
            <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={addRole}>
              Add role
            </Button>
            <Button variant="ai" size="sm" icon={<Wand2 size={13} />} loading={busy.resp} onClick={generateResp}>
              AI Generate
            </Button>
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
                onChange={(e) => updateRole(i, "role", e.target.value)}
                placeholder="Role / department"
                className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] font-semibold text-[13px]"
              />
              <Input
                value={r.duty}
                onChange={(e) => updateRole(i, "duty", e.target.value)}
                placeholder="Responsibility description"
                className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]"
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
      </Panel>

      <Panel
        title="Monitoring, reporting & transparency"
        description="How performance is tracked, reviewed and disclosed."
        icon={<BarChart3 size={17} strokeWidth={1.8} />}
        actions={
          <Button variant="ai" size="sm" icon={<Wand2 size={13} />} loading={busy.monitoring} onClick={generateMonitoring}>
            Generate
          </Button>
        }
      >
        <Textarea
          value={policy.monitoring}
          onChange={(e) => updatePolicy((p) => ({ monitoring: e.target.value }))}
          rows={5}
          placeholder="Describe how performance is monitored, which KPIs are tracked, review frequency, and how findings are reported..."
        />
      </Panel>

      <Panel
        title="Review mechanism & continuous improvement"
        description="When and how this policy is revisited."
        icon={<RefreshCw size={17} strokeWidth={1.8} />}
        actions={
          <Button variant="ai" size="sm" icon={<Wand2 size={13} />} loading={busy.review} onClick={generateReview}>
            Generate
          </Button>
        }
      >
        <Textarea
          value={policy.reviewMechanism}
          onChange={(e) => updatePolicy((p) => ({ reviewMechanism: e.target.value }))}
          rows={5}
          placeholder="Describe how and when this policy is reviewed, who owns the review, and how changes are communicated..."
        />
      </Panel>
    </div>
  );
}
