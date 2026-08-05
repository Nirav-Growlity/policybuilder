"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar } from "@/components/ui/panel";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { ListChecks, Plus, Sparkles, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function StepQualitative() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<number, boolean>>({});
  const [newObj, setNewObj] = React.useState<Record<number, string>>({});

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
    setBusy((b) => ({ ...b, [idx]: true }));
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
      setBusy((b) => ({ ...b, [idx]: false }));
    }
  };

  const add = (area: string, idx: number) => {
    const v = (newObj[idx] || "").trim();
    if (!v) return;
    updatePolicy((p) => ({
      qualitative: { ...p.qualitative, [area]: [...(p.qualitative[area] || []), v] },
    }));
    setNewObj((s) => ({ ...s, [idx]: "" }));
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
        const isBusy = busy[i];
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
            <ol className="space-y-2.5">
              {objs.map((obj, oi) => (
                <li
                  key={oi}
                  className="group flex items-start gap-3 px-4 py-3 rounded-lg bg-[var(--color-cream-2)]/60 border border-[var(--color-line)]"
                >
                  <div className="w-5 h-5 rounded-full bg-[var(--color-forest-soft)] text-[var(--color-forest-deep)] flex items-center justify-center flex-shrink-0 mt-1 text-[10px] font-bold">
                    •
                  </div>
                  <Textarea
                    rows={Math.max(2, Math.ceil((obj || "").length / 75))}
                    value={obj}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(area, oi, e.target.value)}
                    className="border-transparent bg-transparent hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)] px-2 -mx-2 leading-relaxed text-[13px] resize-y"
                  />
                  <button
                    onClick={() => remove(area, oi)}
                    className="text-[var(--color-muted)] hover:text-[#9b2929] hover:bg-[#fdecec] p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100 mt-1"
                    aria-label="Remove"
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
              {objs.length === 0 && (
                <li className="text-[12.5px] text-[var(--color-muted)] italic px-1">
                  No objectives yet. Add one below or use AI Generate.
                </li>
              )}
            </ol>
            <div className="flex items-start gap-2 mt-4 pt-4 border-t border-[var(--color-line)]">
              <Textarea
                rows={2}
                value={newObj[i] || ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewObj((s) => ({ ...s, [i]: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    add(area, i);
                  }
                }}
                placeholder="Add a qualitative objective..."
                className="border-dashed text-[13px]"
              />
              <Button variant="primary" size="md" icon={<Plus size={14} />} onClick={() => add(area, i)} className="mt-0.5">
                Add
              </Button>
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
