"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { Panel, InfoBar } from "@/components/ui/panel";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { parseRequestedCount } from "@/lib/ai/prompts";
import { getQuantitativeYearOptions, normalizeQuantitativeTarget, REPORTING_FREQUENCY, TARGET_PERIOD } from "@/lib/quantitative";
import { Plus, Sparkles, Target, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

export function StepQuantitative() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const [busy, setBusy] = React.useState<Record<string, boolean>>({});
  const [addingTopic, setAddingTopic] = React.useState(false);
  const [topicName, setTopicName] = React.useState("");
  const reportingPeriod = policy.company.reportingPeriod || "FY";
  const yearOptions = React.useMemo(() => getQuantitativeYearOptions(reportingPeriod), [reportingPeriod]);
  const areas = policy.focusAreas.filter(Boolean);

  const normalize = React.useCallback(
    (target: Parameters<typeof normalizeQuantitativeTarget>[0]) => normalizeQuantitativeTarget(target, reportingPeriod),
    [reportingPeriod]
  );

  React.useEffect(() => {
    updatePolicy((p) => {
      const focusAreaTargets = new Map(p.quantitative.map((q) => [q.area, q.targets]));
      const syncedFocusAreas = areas.map((area) => ({
        area,
        targets: (focusAreaTargets.get(area) || [{}]).map((target) => normalizeQuantitativeTarget(target, p.company.reportingPeriod || "FY")),
      }));
      const customAreas = p.quantitative
        .filter((q) => !areas.includes(q.area))
        .map((q) => ({ ...q, targets: q.targets.map((target) => normalizeQuantitativeTarget(target, p.company.reportingPeriod || "FY")) }));
      const quantitative = [...syncedFocusAreas, ...customAreas];
      const changed = JSON.stringify(quantitative) !== JSON.stringify(p.quantitative);
      return changed ? { quantitative } : {};
    });
  }, [areas.join("|"), reportingPeriod, updatePolicy]);

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
        push(`Added ${uniqueNew.length} target${uniqueNew.length === 1 ? "" : "s"}`, "success");
      }
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [busyKey]: false }));
    }
  };

  const addTopic = async () => {
    const area = topicName.trim();
    if (!area) return;
    if (policy.quantitative.some((q) => q.area.toLowerCase() === area.toLowerCase())) {
      push("A quantitative topic with this name already exists", "info");
      return;
    }
    setBusy((b) => ({ ...b, topic: true }));
    try {
      const r = await callAI({ type: "quantitative-topic", policy, areaName: area });
      updatePolicy((p) => ({
        quantitative: [...p.quantitative, { area, targets: r.targets?.length ? generatedTargets(r.targets) : [normalize({})] }],
      }));
      setTopicName("");
      setAddingTopic(false);
      push("Quantitative topic added", "success");
    } catch {
      push("AI generation failed", "error");
    } finally {
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
                  // Clear date fields before normalizing an annual target. Otherwise
                  // the migration safeguard treats it as an old date-based row.
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
      push("Target refined", "success");
    } catch {
      push("AI generation failed", "error");
    } finally {
      setBusy((b) => ({ ...b, [busyKey]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <InfoBar icon={<Sparkles size={16} className="text-[var(--color-forest)]" />}>
        Set measurable targets. Choose a target period with a baseline and deadline, or select Annually for an ongoing target with no dates.
      </InfoBar>

      <div className="flex justify-end">
        {!addingTopic ? (
          <Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={() => setAddingTopic(true)}>Add topic</Button>
        ) : (
          <div className="flex w-full max-w-xl gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-cream-2)]/50 p-2">
            <Input value={topicName} onChange={(e) => setTopicName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTopic(); }} placeholder="Name a new quantitative-only topic..." />
            <Button variant="primary" size="sm" loading={busy.topic} onClick={addTopic}>Generate targets</Button>
            <Button variant="ghost" size="sm" onClick={() => { setAddingTopic(false); setTopicName(""); }}>Cancel</Button>
          </div>
        )}
      </div>

      {policy.quantitative.map((q, qi) => (
        <Panel
          key={`${q.area}-${qi}`}
          title={`${qi + 1}. ${q.area}`}
          description={`${q.targets.length} target${q.targets.length === 1 ? "" : "s"}`}
          icon={<Target size={17} strokeWidth={1.8} />}
          actions={<><Button variant="secondary" size="sm" icon={<Plus size={13} />} onClick={() => addRow(qi)}>Add row</Button><AIActionButton label="AI Generate" loading={busy[`area-${qi}`]} onGenerate={(prompt) => generate(qi, prompt)} /></>}
        >
          <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
            <table className="w-full min-w-[840px] text-[13px]">
              <thead><tr className="border-b border-[var(--color-line)] bg-[var(--color-cream-2)]">
                <th className="w-[43%] px-4 py-2.5 text-left font-semibold text-[var(--color-ink-2)]">Target description</th>
                <th className="w-[16%] px-3 py-2.5 text-left font-semibold text-[var(--color-ink-2)]">Baseline year</th>
                <th className="w-[16%] px-3 py-2.5 text-left font-semibold text-[var(--color-ink-2)]">Deadline</th>
                <th className="w-[15%] px-3 py-2.5 text-left font-semibold text-[var(--color-ink-2)]">Reporting basis</th>
                <th className="w-[10%] px-3 py-2.5 text-right font-semibold text-[var(--color-ink-2)]"></th>
              </tr></thead>
              <tbody>{q.targets.map((target, ti) => (
                <tr key={ti} className="border-t border-[var(--color-line)] hover:bg-[#fafaf5]">
                  <td className="px-3 py-2"><Textarea rows={Math.max(2, Math.ceil((target.target || "").length / 45))} value={target.target} onChange={(e) => updateCell(qi, ti, "target", e.target.value)} placeholder="e.g. Reduce specific energy consumption by 15%" className="resize-y border-transparent bg-transparent py-1.5 text-[13px] hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]" /></td>
                  <td className="px-3 py-2">{target.reportingFrequency === REPORTING_FREQUENCY ? <span className="text-[12px] text-[var(--color-muted)]">—</span> : <Select value={target.baseline} onChange={(e) => updateCell(qi, ti, "baseline", e.target.value)} className="border-transparent bg-transparent text-[12px] hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]">{yearOptions.baseline.map((year) => <option key={year}>{year}</option>)}</Select>}</td>
                  <td className="px-3 py-2">{target.reportingFrequency === REPORTING_FREQUENCY ? <span className="text-[12px] text-[var(--color-muted)]">—</span> : <Select value={target.deadline} onChange={(e) => updateCell(qi, ti, "deadline", e.target.value)} className="border-transparent bg-transparent text-[12px] hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]">{yearOptions.deadline.map((year) => <option key={year}>{year}</option>)}</Select>}</td>
                  <td className="px-3 py-2"><Select value={target.reportingFrequency || TARGET_PERIOD} onChange={(e) => updateReportingFrequency(qi, ti, e.target.value as typeof REPORTING_FREQUENCY | typeof TARGET_PERIOD)} className="border-transparent bg-transparent text-[12px] hover:bg-[var(--color-paper)] focus:bg-[var(--color-paper)]"><option value={TARGET_PERIOD}>Target period</option><option value={REPORTING_FREQUENCY}>Annually</option></Select></td>
                  <td className="px-3 py-2 text-right"><div className="flex items-center justify-end gap-1"><AIActionButton label="Refine" variant="ghost" loading={busy[`target-${qi}-${ti}`]} onGenerate={(prompt) => refineTarget(qi, ti, prompt)} className="text-[12px]" /><button onClick={() => removeRow(qi, ti)} className="rounded-md p-1.5 text-[var(--color-muted)] transition-colors hover:bg-[#fdecec] hover:text-[#9b2929]" aria-label="Remove row"><Trash2 size={13} /></button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}
