"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { correctGrammar, streamAI } from "@/lib/ai/client";
import type { AIResponse } from "@/lib/ai/prompts";
import { FIELD_BREAK, ITEM_BREAK, useGenerationStreams } from "@/lib/ai/use-generation-streams";
import { Composing, StreamField, StreamingItems, StreamingProse } from "@/components/ui/ai-stream";
import type { TextReveal } from "@/lib/ai/text-reveal";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { getQuantitativeYearOptions, normalizeQuantitativeTarget, REPORTING_FREQUENCY, syncQuantitativeAreas, TARGET_PERIOD, validateQuantitativeTarget } from "@/lib/quantitative";
import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/ui/toast";
import { visibleQuantitativeAreas } from "@/lib/focus-area-catalog";
import { AutosizeTextarea, StepRoot, authoring as ui } from "./authoring-ui";

type GeneratedTarget = NonNullable<AIResponse["targets"]>[number];

/** Targets as one paced stream: items split by ITEM_BREAK, and each item's description, baseline, deadline and basis by FIELD_BREAK. */
const encodeTargets = (targets: unknown[] = []) => targets
  .filter((item): item is Partial<Record<keyof GeneratedTarget, unknown>> => Boolean(item) && typeof item === "object")
  .map((item) => [item.target, item.baseline, item.deadline, item.reportingFrequency].map((value) => typeof value === "string" ? value : "").join(FIELD_BREAK))
  .join(ITEM_BREAK);

/** A stopped stream keeps only the targets that finished, including their reporting basis. */
const finishedTargets = (targets: unknown[] = [], stopped: boolean) => {
  const complete = targets.filter((item): item is GeneratedTarget => Boolean(item) && typeof item === "object" && typeof (item as GeneratedTarget).target === "string" && Boolean((item as GeneratedTarget).target.trim()));
  return stopped ? complete.filter((item) => item.reportingFrequency === REPORTING_FREQUENCY || item.reportingFrequency === TARGET_PERIOD) : complete;
};

function TargetTableHead() {
  return (
    <thead><tr>
      <th className="w-[41%]">Target description</th>
      <th className="w-[16%]">Reporting target</th>
      <th className="w-[16%]">Baseline year</th>
      <th className="w-[15%]">Deadline</th>
      <th className="w-[12%]"><span className="sr-only">Actions</span></th>
    </tr></thead>
  );
}

/** Rows the AI is still writing. The description types in, then each year and the basis settle in once known. */
function StreamingTargetRows({ reveal, yearOptions }: { reveal: TextReveal; yearOptions: { baseline: string[]; deadline: string[] } }) {
  const cell = (value: string, known: boolean) => known ? <span key={value} className={ui.cellValue}>{value}</span> : <span className={ui.cellPending} aria-hidden="true" />;
  return (
    <StreamingItems
      reveal={reveal}
      waiting={(
        <tr className={ui.tableRow} aria-busy="true">
          <td><div className={`${ui.cellText} ${ui.streamCell}`}><Composing lines={2} compact note="Writing measurable targets for this topic" /></div></td>
          <td>{cell("", false)}</td><td>{cell("", false)}</td><td>{cell("", false)}</td><td />
        </tr>
      )}
      render={([text = "", baseline = "", deadline = "", basis = ""], index, writing) => {
        const annual = basis === REPORTING_FREQUENCY;
        const basisKnown = annual || basis === TARGET_PERIOD;
        return (
          <tr key={`streaming-${index}`} className={ui.tableRow} aria-busy={writing || undefined}>
            <td><StreamField text={text} writing={writing && !baseline && !deadline && !basis} className={`${ui.cellText} ${ui.streamCell}`} /></td>
            <td>{cell(basis, basisKnown)}</td>
            <td>{annual ? <span className={ui.cellEmpty}>—</span> : cell(baseline, yearOptions.baseline.includes(baseline))}</td>
            <td>{annual ? <span className={ui.cellEmpty}>—</span> : cell(deadline, yearOptions.deadline.includes(deadline))}</td>
            <td><div className={`${ui.rowActions} ${ui.streamSpacer}`} aria-hidden="true" inert><AIActionButton label="Refine" variant="ghost" onGenerate={() => undefined} /><span className={ui.iconButton}><Trash2 size={15} /></span></div></td>
          </tr>
        );
      }}
    />
  );
}

export function StepQuantitative() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const streams = useGenerationStreams();
  const [streamingTopic, setStreamingTopic] = React.useState<string | null>(null);
  const [addingTopic, setAddingTopic] = React.useState(false);
  const [topicName, setTopicName] = React.useState("");
  const [checkingTopic, setCheckingTopic] = React.useState(false);
  const reportingPeriod = policy.company.reportingPeriod || "FY";
  const yearOptions = React.useMemo(() => getQuantitativeYearOptions(reportingPeriod), [reportingPeriod]);
  const areas = React.useMemo(() => policy.focusAreas.filter(Boolean), [policy.focusAreas]);
  const visibleQuantitative = visibleQuantitativeAreas(policy).map((area) => ({ area, index: policy.quantitative.indexOf(area) }));

  const normalize = React.useCallback(
    (target: Parameters<typeof normalizeQuantitativeTarget>[0]) => normalizeQuantitativeTarget(target, reportingPeriod),
    [reportingPeriod]
  );

  React.useEffect(() => {
    updatePolicy((p) => {
      const quantitative = syncQuantitativeAreas(p.quantitative, areas, p.company.reportingPeriod || "FY");
      const changed = JSON.stringify(quantitative) !== JSON.stringify(p.quantitative);
      return changed ? { quantitative } : {};
    });
  }, [areas, reportingPeriod, updatePolicy]);

  const generatedTargets = (targets: GeneratedTarget[]) =>
    targets.map(normalize);

  const generate = async (qi: number, customPrompt?: string) => {
    const area = policy.quantitative[qi]?.area;
    if (!area) return;
    const busyKey = `area-${qi}`;
    const { reveal, signal } = streams.start(busyKey);
    try {
      const existing = policy.quantitative[qi]?.targets || [];
      const r = await streamAI({ type: "quantitative", policy, areaIndex: qi, customPrompt, existingContent: existing }, {
        signal,
        onPartial: (partial) => reveal.set(encodeTargets(partial.targets)),
      });
      if (r.targets || signal.aborted) {
        const existingLower = new Set(existing.map((t) => t.target.toLowerCase().trim()));
        let uniqueNew = generatedTargets(finishedTargets(r.targets, signal.aborted)).filter((t) => !existingLower.has(t.target.toLowerCase().trim()));
        const reqCount = parseRequestedCount(customPrompt);
        if (reqCount && reqCount > 0) uniqueNew = uniqueNew.slice(0, reqCount);
        if (uniqueNew.length === 0) {
          push(signal.aborted ? "Stopped before a target was finished" : "No new targets generated", "info");
          return;
        }
        await reveal.finish(encodeTargets(uniqueNew));
        updatePolicy((p) => ({
          quantitative: p.quantitative.map((q, i) => i === qi ? { ...q, targets: [...q.targets, ...uniqueNew] } : q),
        }));
        if (uniqueNew.some((target) => validateQuantitativeTarget(target).length)) push("Some generated targets need a quick percentage or year review", "info");
        push(`Added ${uniqueNew.length} target${uniqueNew.length === 1 ? "" : "s"}`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end(busyKey, reveal);
    }
  };

  const addTopic = async () => {
    const draft = topicName.trim();
    if (!draft || checkingTopic || streams.busy("topic")) return;
    setCheckingTopic(true);
    let run: ReturnType<typeof streams.start> | null = null;
    try {
      const area = await correctGrammar(draft);
      if (policy.quantitative.some((q) => q.area.toLowerCase() === area.toLowerCase())) {
        push("A quantitative topic with this name already exists", "info");
        return;
      }
      if (area !== draft) push("Spelling and grammar corrected", "success");
      setCheckingTopic(false);
      setStreamingTopic(area);
      run = streams.start("topic");
      const { reveal, signal } = run;
      const r = await streamAI({ type: "quantitative-topic", policy, areaName: area }, {
        signal,
        onPartial: (partial) => reveal.set(encodeTargets(partial.targets)),
      });
      const targets = generatedTargets(finishedTargets(r.targets, signal.aborted));
      await reveal.finish(encodeTargets(targets));
      updatePolicy((p) => ({
        quantitative: [...p.quantitative, { area, targets: targets.length ? targets : [normalize({})] }],
      }));
      setTopicName("");
      setAddingTopic(false);
      push(signal.aborted ? "Quantitative topic added. Generation was stopped." : "Quantitative topic added", signal.aborted ? "info" : "success");
    } catch {
      push("Could not add the quantitative topic", "error");
    } finally {
      setCheckingTopic(false);
      setStreamingTopic(null);
      if (run) streams.end("topic", run.reveal);
    }
  };

  const addRow = (qi: number) => {
    updatePolicy((p) => ({
      quantitative: p.quantitative.map((q, i) => i === qi ? { ...q, targets: [...q.targets, normalizeQuantitativeTarget({}, p.company.reportingPeriod || "FY")] } : q),
    }));
  };

  const removeRow = (qi: number, ti: number) => {
    updatePolicy((p) => ({
      quantitative: p.quantitative.map((q, i) => i === qi ? { ...q, targets: q.targets.filter((_, j) => j !== ti) } : q),
    }));
  };

  const updateCell = (qi: number, ti: number, field: "target" | "baseline" | "deadline", value: string) => {
    updatePolicy((p) => ({
      quantitative: p.quantitative.map((q, i) => i === qi
        ? { ...q, targets: q.targets.map((t, j) => j === ti ? { ...t, [field]: value } : t) }
        : q),
    }));
  };

  const updateReportingFrequency = (qi: number, ti: number, reportingFrequency: typeof REPORTING_FREQUENCY | typeof TARGET_PERIOD) => {
    updatePolicy((p) => ({
      quantitative: p.quantitative.map((q, i) => i === qi
        ? {
            ...q,
            targets: q.targets.map((t, j) => j === ti
              ? normalizeQuantitativeTarget({
                  ...t,
                  reportingFrequency,
                  ...(reportingFrequency === REPORTING_FREQUENCY ? { baseline: "", deadline: "" } : {}),
                }, p.company.reportingPeriod || "FY")
              : t),
          }
        : q),
    }));
  };

  const refineTarget = async (qi: number, ti: number, customPrompt?: string) => {
    const area = policy.quantitative[qi]?.area;
    const target = policy.quantitative[qi]?.targets[ti];
    if (!area || !target) return;
    const busyKey = `target-${qi}-${ti}`;
    const { reveal, signal } = streams.start(busyKey);
    try {
      const r = await streamAI({ type: "quantitative-refine", policy, areaIndex: qi, areaName: area, customPrompt, existingContent: target }, {
        signal,
        onPartial: (partial) => {
          const text = partial.targets?.[0]?.target;
          reveal.set(typeof text === "string" ? text : "");
        },
      });
      const generated = r.targets?.[0];
      const refined = generated && typeof generated.target === "string" && !signal.aborted ? normalize(generated) : null;
      if (!refined) {
        // A stopped refinement is discarded: the years and basis may not have arrived yet.
        push(signal.aborted ? "Refine stopped. The target was left unchanged." : "No refinement was generated", "info");
        return;
      }
      await reveal.finish(refined.target);
      updatePolicy((p) => ({
        quantitative: p.quantitative.map((q, i) => i === qi ? { ...q, targets: q.targets.map((t, j) => j === ti ? refined : t) } : q),
      }));
      if (validateQuantitativeTarget(refined).length) push("Review the refined target's percentage or year wording", "info");
      push("Target refined", "success");
    } catch {
      push("AI generation failed", "error");
    } finally {
      streams.end(busyKey, reveal);
    }
  };

  return (
    <StepRoot>
      <div className={ui.toolbar}>
        <AnimatePresence mode="wait" initial={false}>
          {!addingTopic ? (
            <motion.div key="add-topic" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}>
              <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => setAddingTopic(true)}>Add topic</Button>
            </motion.div>
          ) : (
            <motion.div
              key="topic-composer"
              className={`${ui.composer} ${ui.topicComposer}`}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <span className={ui.composerIcon} aria-hidden="true"><Plus size={16} /></span>
              <Input autoFocus value={topicName} data-grammar-checking={checkingTopic ? "true" : undefined} disabled={checkingTopic || streams.busy("topic")} onChange={(e) => setTopicName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTopic(); } }} placeholder="Name a new quantitative-only topic..." aria-label="New quantitative topic" className={ui.composerInput} />
              <Button variant="ghost" size="sm" disabled={streams.busy("topic")} onClick={() => { setAddingTopic(false); setTopicName(""); }}>Cancel</Button>
              <Button variant="primary" size="sm" loading={checkingTopic || streams.busy("topic")} disabled={checkingTopic || streams.busy("topic")} onClick={() => { void addTopic(); }} className={ui.composerAdd}>Generate targets</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {visibleQuantitative.map(({ area: q, index: qi }) => {
        const areaStream = streams.reveal(`area-${qi}`);
        return (
        <Panel
          key={`${q.area}-${qi}`}
          title={q.area}
          description={`${q.targets.length} target${q.targets.length === 1 ? "" : "s"}`}
          icon={<span className={ui.areaNumber} aria-label={`Topic ${qi + 1}`}>{qi + 1}</span>}
          actions={<><Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => addRow(qi)}>Add row</Button><AIActionButton label="AI Generate" loading={Boolean(areaStream)} onGenerate={(prompt) => generate(qi, prompt)} onStop={() => streams.stop(`area-${qi}`)} /></>}
        >
          {q.targets.length === 0 && !areaStream ? (
            <div className={ui.empty}>No targets yet. Add a row or use AI Generate.</div>
          ) : (
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <TargetTableHead />
              <tbody>{q.targets.map((target, ti) => {
                const refineStream = streams.reveal(`target-${qi}-${ti}`);
                return (
                <tr key={ti} className={ui.tableRow}>
                  <td>{refineStream
                    ? <StreamingProse reveal={refineStream} label={`${q.area} target ${ti + 1}`} className={`${ui.cellText} ${ui.streamCell}`} fallback={<span className={ui.dimmed}>{target.target}</span>} />
                    : <AutosizeTextarea value={target.target} onChange={(e) => updateCell(qi, ti, "target", e.target.value)} placeholder="e.g. Reduce specific energy consumption by 15%" aria-label={`${q.area} target ${ti + 1}`} className={`${ui.inline} ${ui.cellText}`} />}
                    {validateQuantitativeTarget(target).length > 0 && (
                      <div className={ui.cellIssues}>
                        {validateQuantitativeTarget(target).map((issue) => <p key={issue} className={ui.warning}><TriangleAlert size={13} aria-hidden="true" />{issue}</p>)}
                      </div>
                    )}
                  </td>
                  <td><SelectMenu size="compact" value={target.reportingFrequency || TARGET_PERIOD} onValueChange={(value) => updateReportingFrequency(qi, ti, value as typeof REPORTING_FREQUENCY | typeof TARGET_PERIOD)} options={[{ value: TARGET_PERIOD, label: "Target period" }, { value: REPORTING_FREQUENCY, label: "Annually" }]} aria-label="Reporting target" className={ui.cellSelect} /></td>
                  <td>{target.reportingFrequency === REPORTING_FREQUENCY ? <span className={ui.cellEmpty}>—</span> : <SelectMenu size="compact" value={target.baseline} onValueChange={(value) => updateCell(qi, ti, "baseline", value)} options={yearOptions.baseline.map((year) => ({ value: year, label: year }))} placeholder="Year" searchable={false} aria-label="Baseline year" className={ui.cellSelect} />}</td>
                  <td>{target.reportingFrequency === REPORTING_FREQUENCY ? <span className={ui.cellEmpty}>—</span> : <SelectMenu size="compact" value={target.deadline} onValueChange={(value) => updateCell(qi, ti, "deadline", value)} options={yearOptions.deadline.map((year) => ({ value: year, label: year }))} placeholder="Year" searchable={false} aria-label="Deadline" className={ui.cellSelect} />}</td>
                  <td><div className={ui.rowActions}><AIActionButton label="Refine" variant="ghost" loading={Boolean(refineStream)} onGenerate={(prompt) => refineTarget(qi, ti, prompt)} onStop={() => streams.stop(`target-${qi}-${ti}`)} /><button type="button" onClick={() => removeRow(qi, ti)} className={ui.iconButton} data-tone="danger" aria-label="Remove row"><Trash2 size={15} /></button></div></td>
                </tr>
                );
              })}
              {areaStream ? <StreamingTargetRows reveal={areaStream} yearOptions={yearOptions} /> : null}
              </tbody>
            </table>
          </div>
          )}
        </Panel>
        );
      })}

      {streamingTopic && streams.reveal("topic") ? (
        <Panel
          title={streamingTopic}
          description="Writing targets"
          icon={<span className={ui.areaNumber} aria-hidden="true">{policy.quantitative.length + 1}</span>}
          actions={<AIActionButton label="AI Generate" loading onGenerate={() => undefined} onStop={() => streams.stop("topic")} />}
        >
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <TargetTableHead />
              <tbody><StreamingTargetRows reveal={streams.reveal("topic")!} yearOptions={yearOptions} /></tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </StepRoot>
  );
}
