"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI, correctGrammar } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { ListChecks, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { AnimatePresence, motion } from "motion/react";
import { AutosizeTextarea, StepRoot, authoring as ui, itemEnter } from "./authoring-ui";

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
    <StepRoot>
      {areas.map((area, i) => {
        const objs = policy.qualitative[area] || [];
        const isBusy = busy[`area-${i}`];
        return (
          <Panel
            key={area}
            title={<><span className={ui.areaIndex}>{i + 1}</span>{area}</>}
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
            {objs.length > 0 ? (
              <ol className={ui.objectives}>
                <AnimatePresence initial={false}>
                  {objs.map((obj, oi) => (
                    <motion.li key={oi} className={ui.objective} {...itemEnter}>
                      <AutosizeTextarea
                        value={obj}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(area, oi, e.target.value)}
                        aria-label={`${area} objective ${oi + 1}`}
                        className={`${ui.inline} ${ui.objectiveText}`}
                      />
                      <div className={ui.rowActions}>
                        <AIActionButton
                          label="Refine"
                          variant="ghost"
                          loading={busy[`objective-${i}-${oi}`]}
                          onGenerate={(prompt) => generateObjective(area, i, oi, prompt)}
                          placeholder="e.g. Make this more specific to our manufacturing operations..."
                        />
                        <button
                          type="button"
                          onClick={() => remove(area, oi)}
                          className={ui.iconButton}
                          data-tone="danger"
                          aria-label="Remove objective"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
            ) : (
              <div className={`${ui.empty} mb-3`}>
                <ListChecks size={18} aria-hidden="true" />
                No objectives yet. Add one below or use AI Generate.
              </div>
            )}
            <div className={ui.composer}>
              <span className={ui.composerIcon} aria-hidden="true"><Plus size={16} /></span>
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
                aria-label={`Add an objective to ${area}`}
                className={ui.composerInput}
                disabled={checkingNewObjective[i]}
              />
              <Button variant="primary" size="sm" loading={checkingNewObjective[i]} onClick={() => { void add(area, i); }} disabled={checkingNewObjective[i]} className={ui.composerAdd}>
                Add objective
              </Button>
            </div>
          </Panel>
        );
      })}
    </StepRoot>
  );
}
