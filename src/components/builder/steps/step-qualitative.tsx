"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { correctGrammar, streamAI } from "@/lib/ai/client";
import { ITEM_BREAK, keepFinishedSentences, useGenerationStreams } from "@/lib/ai/use-generation-streams";
import { Composing, StreamField, StreamingItems, StreamingProse } from "@/components/ui/ai-stream";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { AnimatePresence, motion } from "motion/react";
import { AutosizeTextarea, StepRoot, authoring as ui, itemEnter } from "./authoring-ui";

export function StepQualitative() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const streams = useGenerationStreams();
  // Objectives that replace a streamed preview appear without an entrance, so the hand-off is invisible.
  const [settledFrom, setSettledFrom] = React.useState<{ area: string; from: number } | null>(null);
  React.useEffect(() => {
    if (!settledFrom) return;
    const frame = requestAnimationFrame(() => setSettledFrom(null));
    return () => cancelAnimationFrame(frame);
  }, [settledFrom]);
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
    const { reveal, signal } = streams.start(`area-${idx}`);
    try {
      const existing = policy.qualitative[area] || [];
      const r = await streamAI({
        type: "qualitative",
        policy,
        areaIndex: policy.focusAreas.indexOf(area),
        customPrompt,
        existingContent: existing,
      }, {
        signal,
        onPartial: (partial) => reveal.set((partial.objectives ?? []).filter((item) => typeof item === "string").join(ITEM_BREAK)),
      });
      let objectives = (r.objectives ?? []).filter((item) => typeof item === "string" && item.trim());
      // A stopped stream keeps only the objectives that were finished.
      if (signal.aborted) objectives = objectives.filter((item, i) => i < objectives.length - 1 || /[.!?]$/.test(item.trim()));
      if (r.objectives || signal.aborted) {
        const existingLower = new Set(existing.map((s) => s.toLowerCase().trim()));
        let uniqueNew = objectives.filter(
          (item) => !existingLower.has(item.toLowerCase().trim())
        );
        const reqCount = parseRequestedCount(customPrompt);
        if (reqCount && reqCount > 0) {
          uniqueNew = uniqueNew.slice(0, reqCount);
        }
        if (uniqueNew.length === 0) {
          push(signal.aborted ? "Stopped before an objective was finished" : "No new unique objectives generated", "info");
          return;
        }
        await reveal.finish(uniqueNew.join(ITEM_BREAK));
        setSettledFrom({ area, from: existing.length });
        updatePolicy((p) => ({
          qualitative: { ...p.qualitative, [area]: [...(p.qualitative[area] || []), ...uniqueNew] },
        }));
        push(`Added ${uniqueNew.length} objective${uniqueNew.length === 1 ? "" : "s"}`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end(`area-${idx}`, reveal);
    }
  };

  const generateObjective = async (area: string, areaIndex: number, objectiveIndex: number, customPrompt?: string) => {
    const current = policy.qualitative[area]?.[objectiveIndex];
    if (!current) return;

    const busyKey = `objective-${areaIndex}-${objectiveIndex}`;
    const { reveal, signal } = streams.start(busyKey);
    try {
      const r = await streamAI({
        type: "qualitative",
        policy,
        areaIndex: policy.focusAreas.indexOf(area),
        customPrompt: `Generate exactly 1 new objective to replace this objective: "${current}".${customPrompt ? ` ${customPrompt}` : ""}`,
        existingContent: policy.qualitative[area] || [],
      }, {
        signal,
        onPartial: (partial) => reveal.set(typeof partial.objectives?.[0] === "string" ? partial.objectives[0] : ""),
      });
      const generated = r.objectives?.[0]?.trim();
      const replacement = signal.aborted && generated ? keepFinishedSentences(generated) : generated;
      if (!replacement || (signal.aborted && !/[.!?]$/.test(replacement))) {
        push(signal.aborted ? "Refine stopped. The objective was left unchanged." : "No objective was generated", "info");
        return;
      }
      await reveal.finish(replacement);
      update(area, objectiveIndex, replacement);
      push("Objective updated", "success");
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end(busyKey, reveal);
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
        const areaStream = streams.reveal(`area-${i}`);
        const isBusy = Boolean(areaStream);
        return (
          <Panel
            key={area}
            title={area}
            description={`${objs.length} objective${objs.length === 1 ? "" : "s"}`}
            icon={<span className={ui.areaNumber} aria-label={`Focus area ${i + 1}`}>{i + 1}</span>}
            actions={
              <AIActionButton
                label="AI Generate"
                loading={isBusy}
                onGenerate={(prompt) => generate(i, prompt)}
                onStop={() => streams.stop(`area-${i}`)}
              />
            }
          >
            {objs.length > 0 || areaStream ? (
              <ol className={ui.objectives}>
                <AnimatePresence initial={false}>
                  {objs.map((obj, oi) => {
                    const refineStream = streams.reveal(`objective-${i}-${oi}`);
                    const settled = settledFrom?.area === area && oi >= settledFrom.from;
                    return (
                    <motion.li key={oi} className={ui.objective} {...itemEnter} initial={settled ? false : itemEnter.initial}>
                      {refineStream ? (
                        <StreamingProse
                          reveal={refineStream}
                          label={`${area} objective ${oi + 1}`}
                          className={`${ui.objectiveText} ${ui.streamCell}`}
                          fallback={<span className={ui.dimmed}>{obj}</span>}
                        />
                      ) : (
                      <AutosizeTextarea
                        value={obj}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update(area, oi, e.target.value)}
                        aria-label={`${area} objective ${oi + 1}`}
                        className={`${ui.inline} ${ui.objectiveText}`}
                      />
                      )}
                      <div className={ui.rowActions}>
                        <AIActionButton
                          label="Refine"
                          variant="ghost"
                          loading={Boolean(refineStream)}
                          onGenerate={(prompt) => generateObjective(area, i, oi, prompt)}
                          onStop={() => streams.stop(`objective-${i}-${oi}`)}
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
                    );
                  })}
                </AnimatePresence>
                {areaStream ? (
                  <StreamingItems
                    reveal={areaStream}
                    waiting={<li className={ui.objective} aria-busy="true"><div className={`${ui.objectiveText} ${ui.streamCell}`}><Composing lines={2} compact note="Writing objectives for this focus area" /></div></li>}
                    render={([text], index, writing) => (
                      <li key={`streaming-${index}`} className={ui.objective} aria-busy={writing || undefined}>
                        <StreamField text={text ?? ""} writing={writing} className={`${ui.objectiveText} ${ui.streamCell}`} />
                        <div className={`${ui.rowActions} ${ui.streamSpacer}`} aria-hidden="true" inert>
                          <AIActionButton label="Refine" variant="ghost" onGenerate={() => undefined} />
                          <span className={ui.iconButton}><X size={15} /></span>
                        </div>
                      </li>
                    )}
                  />
                ) : null}
              </ol>
            ) : (
              <div className={`${ui.empty} mb-3`}>
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
