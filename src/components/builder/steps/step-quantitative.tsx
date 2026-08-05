"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar, Badge } from "@/components/ui/panel";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function StepQuantitative() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<number, boolean>>({});

  const areas = policy.focusAreas.filter(Boolean);

  React.useEffect(() => {
    updatePolicy((p) => {
      const currentMap = new Map(p.quantitative.map((q) => [q.area, q.targets]));
      const syncedQuants = areas.map((area) => ({
        area,
        targets: currentMap.get(area) || [
          { target: "", baseline: "FY 2022-23", deadline: "FY 2029-30" },
        ],
      }));

      let changed = false;
      if (
        syncedQuants.length !== p.quantitative.length ||
        syncedQuants.some((q, i) => q.area !== p.quantitative[i]?.area)
      ) {
        changed = true;
      }

      return changed ? { quantitative: syncedQuants } : {};
    });
  }, [areas.join("|")]);

  const generate = async (qi: number, customPrompt?: string) => {
    const area = policy.quantitative[qi]?.area;
    if (!area) return;
    setBusy((b) => ({ ...b, [qi]: true }));
    try {
      const existing = policy.quantitative[qi]?.targets || [];
      const r = await callAI({
        type: "quantitative",
        policy,
        areaIndex: qi,
        customPrompt,
        existingContent: existing,
      });
      if (r.targets) {
        const existingLower = new Set(existing.map((t) => t.target.toLowerCase().trim()));
        let uniqueNew = r.targets.filter((t) => !existingLower.has(t.target.toLowerCase().trim()));
        const reqCount = parseRequestedCount(customPrompt);
        if (reqCount && reqCount > 0) {
          uniqueNew = uniqueNew.slice(0, reqCount);
        }
        updatePolicy((p) => ({
          quantitative: p.quantitative.map((q, i) =>
            i === qi ? { ...q, targets: [...q.targets, ...uniqueNew] } : q
          ),
        }));
        push(`Added ${uniqueNew.length} target${uniqueNew.length === 1 ? "" : "s"}`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [qi]: false }));
    }
  };

  const addRow = (qi: number) => {
    updatePolicy((p) => ({
      quantitative: p.quantitative.map((q, i) =>
        i === qi ? { ...q, targets: [...q.targets, { target: "", baseline: "FY 2022-23", deadline: "FY 2029-30" }] } : q
      ),
    }));
  };

  const removeRow = (qi: number, ti: number) => {
    updatePolicy((p) => ({
      quantitative: p.quantitative.map((q, i) =>
        i === qi ? { ...q, targets: q.targets.filter((_, j) => j !== ti) } : q
      ),
    }));
  };

  const updateCell = (qi: number, ti: number, field: "target" | "baseline" | "deadline", v: string) => {
    updatePolicy((p) => ({
      quantitative: p.quantitative.map((q, i) =>
        i === qi
          ? { ...q, targets: q.targets.map((t, j) => (j === ti ? { ...t, [field]: v } : t)) }
          : q
      ),
    }));
  };

  return (
    <div className="space-y-6">
      <InfoBar icon={<Sparkles size={16} className="text-[var(--color-forest)]" />}>
        Set measurable, time-bound targets. Baseline year is FY 2022-23 by default. These form the KPI framework for
        annual reporting.
      </InfoBar>

      {policy.quantitative.map((q, qi) => {
        const isBusy = busy[qi];
        return (
          <Panel
            key={qi}
            title={`${qi + 1}. ${q.area}`}
            description={`${q.targets.length} target${q.targets.length === 1 ? "" : "s"}`}
            icon={<Target size={17} strokeWidth={1.8} />}
            actions={
              <>
                <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={() => addRow(qi)}>
                  Add row
                </Button>
                <AIActionButton
                  label="AI Generate"
                  loading={isBusy}
                  onGenerate={(prompt) => generate(qi, prompt)}
                />
              </>
            }
          >
            <div className="border border-[var(--color-line)] rounded-lg overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[var(--color-cream-2)] border-b border-[var(--color-line)]">
                    <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2.5 w-[55%]">Target description</th>
                    <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2.5 w-[18%]">Baseline year</th>
                    <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2.5 w-[18%]">Deadline</th>
                    <th className="text-right font-semibold text-[var(--color-ink-2)] px-4 py-2.5 w-[9%]"></th>
                  </tr>
                </thead>
                <tbody>
                  {q.targets.map((t, ti) => (
                    <tr key={ti} className="border-t border-[var(--color-line)] hover:bg-[#fafaf5]">
                      <td className="px-3 py-2">
                        <Textarea
                          rows={Math.max(2, Math.ceil((t.target || "").length / 45))}
                          value={t.target}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateCell(qi, ti, "target", e.target.value)}
                          placeholder="e.g. Reduce specific energy consumption by 15%"
                          className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] text-[13px] resize-y py-1.5"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={t.baseline}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCell(qi, ti, "baseline", e.target.value)}
                          className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={t.deadline}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCell(qi, ti, "deadline", e.target.value)}
                          className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeRow(qi, ti)}
                          className="text-[var(--color-muted)] hover:text-[#9b2929] hover:bg-[#fdecec] p-1.5 rounded-md transition-colors"
                          aria-label="Remove row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
