"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel } from "@/components/ui/panel";
import { Input } from "@/components/ui/input";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI, correctGrammar } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { getQuantitativeYearOptions, normalizeQuantitativeTarget, REPORTING_FREQUENCY, syncQuantitativeAreas, TARGET_PERIOD, validateQuantitativeTarget } from "@/lib/quantitative";
import { Plus, Target, Trash2, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useToast } from "@/components/ui/toast";
import { visibleQuantitativeAreas } from "@/lib/focus-area-catalog";
import { AutosizeTextarea, StepRoot, authoring as ui } from "./authoring-ui";

export function StepQuantitative() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
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

  const generatedTargets = (targets: NonNullable<Awaited<ReturnType<typeof callAI>>["targets"]>) =>
    targets.map(normalize);

  const generate = async (qi: number, customPrompt?: string) => {
    const area = policy.quantitative[qi]?.area;
    if (!area) return;
    const busyKey = `area-${qi}`;
    setBusy((b) => ({ ...b, [busyKey]: true }));
    try {
      const existing = policy.quantitative[qi]?.targets || [];
      const r = await callAI({ type: "quantitative", policy, areaIndex: qi, customPrompt, existingContent: existing });
      if (r.targets) {
        const existingLower = new Set(existing.map((t) => t.target.toLowerCase().trim()));
        let uniqueNew = generatedTargets(r.targets).filter((t) => !existingLower.has(t.target.toLowerCase().trim()));
        const reqCount = parseRequestedCount(customPrompt);
        if (reqCount && reqCount > 0) uniqueNew = uniqueNew.slice(0, reqCount);
        updatePolicy((p) => ({
          quantitative: p.quantitative.map((q, i) => i === qi ? { ...q, targets: [...q.targets, ...uniqueNew] } : q),
        }));
        if (uniqueNew.some((target) => validateQuantitativeTarget(target).length)) push("Some generated targets need a quick percentage or year review", "info");
        push(`Added ${uniqueNew.length} target${uniqueNew.length === 1 ? "" : "s"}`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [busyKey]: false }));
    }
  };

  const addTopic = async () => {
    const draft = topicName.trim();
    if (!draft || checkingTopic) return;
    setCheckingTopic(true);
    try {
      const area = await correctGrammar(draft);
      if (policy.quantitative.some((q) => q.area.toLowerCase() === area.toLowerCase())) {
        push("A quantitative topic with this name already exists", "info");
        return;
      }
      if (area !== draft) push("Spelling and grammar corrected", "success");
      setBusy((b) => ({ ...b, topic: true }));
      const r = await callAI({ type: "quantitative-topic", policy, areaName: area });
      updatePolicy((p) => ({
        quantitative: [...p.quantitative, { area, targets: r.targets?.length ? generatedTargets(r.targets) : [normalize({})] }],
      }));
      setTopicName("");
      setAddingTopic(false);
      push("Quantitative topic added", "success");
    } catch {
      push("Could not add the quantitative topic", "error");
    } finally {
      setCheckingTopic(false);
      setBusy((b) => ({ ...b, topic: false }));
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
    setBusy((b) => ({ ...b, [busyKey]: true }));
    try {
      const r = await callAI({ type: "quantitative-refine", policy, areaIndex: qi, areaName: area, customPrompt, existingContent: target });
      const refined = r.targets?.[0] ? normalize(r.targets[0]) : null;
      if (!refined) {
        push("No refinement was generated", "info");
        return;
      }
      updatePolicy((p) => ({
        quantitative: p.quantitative.map((q, i) => i === qi ? { ...q, targets: q.targets.map((t, j) => j === ti ? refined : t) } : q),
      }));
      if (validateQuantitativeTarget(refined).length) push("Review the refined target's percentage or year wording", "info");
      push("Target refined", "success");
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [busyKey]: false }));
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
              <Input autoFocus value={topicName} data-grammar-checking={checkingTopic ? "true" : undefined} disabled={checkingTopic || busy.topic} onChange={(e) => setTopicName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTopic(); } }} placeholder="Name a new quantitative-only topic..." aria-label="New quantitative topic" className={ui.composerInput} />
              <Button variant="ghost" size="sm" onClick={() => { setAddingTopic(false); setTopicName(""); }}>Cancel</Button>
              <Button variant="primary" size="sm" loading={busy.topic} disabled={checkingTopic} onClick={() => { void addTopic(); }} className={ui.composerAdd}>Generate targets</Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {visibleQuantitative.map(({ area: q, index: qi }) => (
        <Panel
          key={`${q.area}-${qi}`}
          title={<><span className={ui.areaIndex}>{qi + 1}</span>{q.area}</>}
          description={`${q.targets.length} target${q.targets.length === 1 ? "" : "s"}`}
          icon={<Target size={17} strokeWidth={1.8} />}
          actions={<><Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={() => addRow(qi)}>Add row</Button><AIActionButton label="AI Generate" loading={busy[`area-${qi}`]} onGenerate={(prompt) => generate(qi, prompt)} /></>}
        >
          <div className={ui.tableWrap}>
            <table className={ui.table}>
              <thead><tr>
                <th className="w-[41%]">Target description</th>
                <th className="w-[16%]">Baseline year</th>
                <th className="w-[15%]">Deadline</th>
                <th className="w-[16%]">Reporting basis</th>
                <th className="w-[12%]"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>{q.targets.map((target, ti) => (
                <tr key={ti} className={ui.tableRow}>
                  <td><AutosizeTextarea value={target.target} onChange={(e) => updateCell(qi, ti, "target", e.target.value)} placeholder="e.g. Reduce specific energy consumption by 15%" aria-label={`${q.area} target ${ti + 1}`} className={`${ui.inline} ${ui.cellText}`} />
                    {validateQuantitativeTarget(target).length > 0 && (
                      <div className={ui.cellIssues}>
                        {validateQuantitativeTarget(target).map((issue) => <p key={issue} className={ui.warning}><TriangleAlert size={13} aria-hidden="true" />{issue}</p>)}
                      </div>
                    )}
                  </td>
                  <td>{target.reportingFrequency === REPORTING_FREQUENCY ? <span className={ui.cellEmpty}>—</span> : <SelectMenu size="compact" value={target.baseline} onValueChange={(value) => updateCell(qi, ti, "baseline", value)} options={yearOptions.baseline.map((year) => ({ value: year, label: year }))} placeholder="Year" searchable={false} aria-label="Baseline year" className={ui.cellSelect} />}</td>
                  <td>{target.reportingFrequency === REPORTING_FREQUENCY ? <span className={ui.cellEmpty}>—</span> : <SelectMenu size="compact" value={target.deadline} onValueChange={(value) => updateCell(qi, ti, "deadline", value)} options={yearOptions.deadline.map((year) => ({ value: year, label: year }))} placeholder="Year" searchable={false} aria-label="Deadline" className={ui.cellSelect} />}</td>
                  <td><SelectMenu size="compact" value={target.reportingFrequency || TARGET_PERIOD} onValueChange={(value) => updateReportingFrequency(qi, ti, value as typeof REPORTING_FREQUENCY | typeof TARGET_PERIOD)} options={[{ value: TARGET_PERIOD, label: "Target period" }, { value: REPORTING_FREQUENCY, label: "Annually" }]} aria-label="Reporting basis" className={ui.cellSelect} /></td>
                  <td><div className={ui.rowActions}><AIActionButton label="Refine" variant="ghost" loading={busy[`target-${qi}-${ti}`]} onGenerate={(prompt) => refineTarget(qi, ti, prompt)} /><button type="button" onClick={() => removeRow(qi, ti)} className={ui.iconButton} data-tone="danger" aria-label="Remove row"><Trash2 size={15} /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      ))}
    </StepRoot>
  );
}
