"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar } from "@/components/ui/panel";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI, correctGrammar } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { ListChecks, Plus, Sparkles, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function StepQualitative() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [newObj, setNewObj] = React.useState<Record<number, string>>({});
  const [checkingNewObjective, setCheckingNewObjective] = React.useState<Record<number, boolean>>({});

  const areas = policy.focusAreas.filter(Boolean);

  React.useEffect(() => {
    updatePolicy((p) => {
      const next = { ...p.qualitative };
      let changed = false;
      for (const a of areas) {
        if (!next[a]) {
          next[a] = [];
          changed = true;
        }
      }
      return changed ? { qualitative: next } : {};
    });
  }, [areas.join("|")]);

  const generate = async (idx: number, customPrompt?: string) => {
    const area = areas[idx];
    if (!area) return;
    const busyKey = `area-${idx}`;
    setBusy((b) => ({ ...b, [busyKey]: true }));
    try {
      const existing = policy.qualitative[area] || [];
      const r = await callAI({
        type: "qualitative",
        policy,
        areaIndex: policy.focusAreas.indexOf(area),
        customPrompt,
        existingContent: existing,
      });
      if (r.objectives) {
        const existingLower = new Set(existing.map((s) => s.toLowerCase().trim()));
        let uniqueNew = r.objectives.filter(
          (item) => !existingLower.has(item.toLowerCase().trim())
        );
        const reqCount = parseRequestedCount(customPrompt);
        if (reqCount && reqCount > 0) {
          uniqueNew = uniqueNew.slice(0, reqCount);
        }
        if (uniqueNew.length === 0 && r.objectives.length > 0) {
          push("No new unique objectives generated", "info");
          return;
        }
        updatePolicy((p) => ({
          qualitative: { ...p.qualitative, [area]: [...(p.qualitative[area] || []), ...uniqueNew] },
        }));
        push(`Added ${uniqueNew.length} objective${uniqueNew.length === 1 ? "" : "s"}`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [busyKey]: false }));
    }
  };

  const generateObjective = async (area: string, areaIndex: number, objectiveIndex: number, customPrompt?: string) => {
    const current = policy.qualitative[area]?.[objectiveIndex];
    if (!current) return;

    const busyKey = `objective-${areaIndex}-${objectiveIndex}`;
    setBusy((b) => ({ ...b, [busyKey]: true }));
    try {
      const r = await callAI({
        type: "qualitative",
        policy,
        areaIndex: policy.focusAreas.indexOf(area),
        customPrompt: `Generate exactly 1 new objective to replace this objective: "${current}".${customPrompt ? ` ${customPrompt}` : ""}`,
        existingContent: policy.qualitative[area] || [],
      });
      const replacement = r.objectives?.[0]?.trim();
      if (!replacement) {
        push("No objective was generated", "info");
        return;
      }
      update(area, objectiveIndex, replacement);
      push("Objective updated", "success");
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [busyKey]: false }));
    }
  };

  const add = async (area: string, idx: number) => {
    const v = (newObj[idx] || "").trim();
    if (!v) return;
    setCheckingNewObjective((state) => ({ ...state, [idx]: true }));
    try {
      const corrected = await correctGrammar(v);
      updatePolicy((p) => ({
        qualitative: { ...p.qualitative, [area]: [...(p.qualitative[area] || []), corrected] },
      }));
      setNewObj((state) => ({ ...state, [idx]: "" }));
      if (corrected !== v) push("Spelling and grammar corrected", "success");
    } catch {
      updatePolicy((p) => ({
        qualitative: { ...p.qualitative, [area]: [...(p.qualitative[area] || []), v] },
      }));
      setNewObj((state) => ({ ...state, [idx]: "" }));
      push("Added without a spelling and grammar check", "info");
    } finally {
      setCheckingNewObjective((state) => ({ ...state, [idx]: false }));
    }
  };

  const remove = (area: string, oi: number) => {
    updatePolicy((p) => ({
      qualitative: { ...p.qualitative, [area]: (p.qualitative[area] || []).filter((_, i) => i !== oi) },
    }));
  };

  const update = (area: string, oi: number, v: string) => {
    updatePolicy((p) => ({
      qualitative: {
        ...p.qualitative,
        [area]: (p.qualitative[area] || []).map((x, i) => (i === oi ? v : x)),
      },
    }));
  };

  return (
    <div className="space-y-6">
      <InfoBar icon={<Sparkles size={16} className="text-[var(--color-forest)]" />}>
        Write policy commitment statements for each focus area. These are qualitative — what the company commits to
        doing, not measurable numbers.
      </InfoBar>

      {areas.map((area, i) => {
        const objs = policy.qualitative[area] || [];
        const isBusy = busy[`area-${i}`];
        return (
          <Panel
            key={area}
            title={`${i + 1}. ${area}`}
            description={`${objs.length} objective${objs.length === 1 ? "" : "s"}`}
            icon={<ListChecks size={17} strokeWidth={1.8} />}
            actions={
              <AIActionButton
                label="AI Generate"
                loading={isBusy}
                onGenerate={(prompt) => generate(i, prompt)}
              />
            }
          >
            <ol className="space-y-2">
              {objs.map((obj, oi) => (
                <li
                  key={oi}
                  className="group flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-cream-2)]/45 px-3.5 py-2.5 transition-colors hover:border-[var(--color-line-2)]"
                >
                  <div className="w-5 h-5 rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)] flex items-center justify-center flex-shrink-0 mt-1 text-[10px] font-bold">
                    •
                  </div>
                  <Textarea
                    rows={Math.max(1, Math.ceil((obj || "").length / 110))}
                    value={obj}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(area, oi, e.target.value)}
                    className="min-w-0 border-transparent bg-transparent px-1.5 -mx-1.5 py-1 leading-6 text-[13px] hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] resize-y"
                  />
                  <div className="flex shrink-0 items-center gap-1 self-center">
                    <AIActionButton
                      label="Refine"
                      variant="ghost"
                      loading={busy[`objective-${i}-${oi}`]}
                      onGenerate={(prompt) => generateObjective(area, i, oi, prompt)}
                      placeholder="e.g. Make this more specific to our manufacturing operations..."
                      className="text-[12px]"
                    />
                    <button
                      onClick={() => remove(area, oi)}
                      className="rounded-md p-1.5 text-[var(--color-muted)] transition-colors hover:bg-[#fdecec] hover:text-[#9b2929]"
                      aria-label="Remove objective"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </li>
              ))}
              {objs.length === 0 && (
                <li className="text-[12.5px] text-[var(--color-muted)] italic px-1">
                  No objectives yet. Add one below or use AI Generate.
                </li>
              )}
            </ol>
            <div className="mt-4 flex gap-2 border-t border-[var(--color-line)] pt-4">
              <Input
                value={newObj[i] || ""}
                data-grammar-checking={checkingNewObjective[i] ? "true" : undefined}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewObj((s) => ({ ...s, [i]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void add(area, i);
                  }
                }}
                placeholder="Add a qualitative objective..."
                className="border-dashed text-[13px]"
                disabled={checkingNewObjective[i]}
              />
              <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => { void add(area, i); }} disabled={checkingNewObjective[i]}>
                Add Objective
              </Button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
