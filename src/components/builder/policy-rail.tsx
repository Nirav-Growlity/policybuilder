"use client";

import * as React from "react";
import { motion } from "motion/react";
import { Check, Plus } from "lucide-react";
import { clsx } from "clsx";
import { useBuilder } from "@/lib/store";
import { getPolicyProfile } from "@/lib/constants";
import { getEnabledSections } from "@/lib/sections";
import { calculatePolicyProgress } from "@/lib/policycraft-progress";
import { visibleQualitativeEntries, visibleQuantitativeAreas } from "@/lib/focus-area-catalog";
import type { Policy, PolicySection, StepDef, StepId } from "@/lib/types";
import rail from "@/components/documents/builder/builder.module.css";
import shell from "./shell.module.css";

const markerTransition = { duration: 0.2, ease: "easeOut" as const };

/** The policy sections each writing step fills; Document structure arranges them and has none. */
const STEP_SECTIONS: Partial<Record<StepId, PolicySection["kind"][]>> = {
  declaration: ["preface", "declaration", "scope", "definitions"],
  focus: ["focus"],
  qualitative: ["qualitative"],
  quantitative: ["quantitative"],
  sdg: ["sdg"],
  responsibilities: ["responsibilities", "monitoring", "review", "revision"],
  custom: ["custom"],
};

const count = (value: number, one: string, many = `${one}s`) => `${value} ${value === 1 ? one : many}`;

/** One line under each step: what it holds so far. */
function stepDetail(policy: Policy, step: StepId, sections: PolicySection[]): string {
  switch (step) {
    case "structure": return count(sections.length, "section");
    case "declaration": {
      const titles = sections.filter((section) => STEP_SECTIONS.declaration!.includes(section.kind)).map((section) => section.title);
      return titles.join(", ") || "Preface, declaration, scope";
    }
    case "focus": return count(policy.focusAreas.filter((area) => area.trim()).length, "focus area");
    case "qualitative": return count(visibleQualitativeEntries(policy).reduce((sum, [, objectives]) => sum + objectives.filter((item) => item.trim()).length, 0), "objective");
    case "quantitative": return count(visibleQuantitativeAreas(policy).reduce((sum, area) => sum + area.targets.filter((target) => target.target.trim()).length, 0), "target");
    case "sdg": return count(policy.sdgs.length, "goal");
    case "responsibilities": return `${count(policy.responsibilities.filter((entry) => entry.role.trim()).length, "role")}, review`;
    case "custom": return count(sections.filter((section) => section.kind === "custom").length, "custom section");
    default: return "";
  }
}

type StepState = "written" | "empty";

/** Written once every section the step fills has content; Document structure counts as written. */
export function usePolicyStepStates(steps: StepDef[]) {
  const policy = useBuilder((state) => state.policy);
  return React.useMemo(() => {
    const progress = calculatePolicyProgress(policy);
    const sections = getEnabledSections(policy);
    const states = new Map<StepId, { state: StepState; detail: string }>();
    for (const step of steps) {
      const kinds = STEP_SECTIONS[step.id];
      const owned = kinds ? progress.sections.filter((section) => kinds.includes(section.kind)) : [];
      const written = !kinds || (owned.length > 0 && owned.every((section) => section.filled));
      states.set(step.id, { state: written ? "written" : "empty", detail: stepDetail(policy, step.id, sections) });
    }
    return { states, progress };
  }, [policy, steps]);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]!.toUpperCase()).join("") || "P";
}

/** The policy's company and how much of it is written, like the SOP manual header. */
export function PolicyRailSummary({ steps }: { steps: StepDef[] }) {
  const policy = useBuilder((state) => state.policy);
  const { progress } = usePolicyStepStates(steps);
  const profile = getPolicyProfile(policy.policyType);
  const title = policy.company.name?.trim() || profile.label;
  const logo = policy.company.companyLogo;
  const { filledSections: written, totalSections: total, percentage } = progress;
  const status = !total ? "No sections turned on" : written === total ? "All sections written" : `${written} of ${total} sections written`;
  return (
    <div className={rail.railSummary}>
      <div className={rail.railIdentity}>
        <span className={rail.railLogo} data-logo={logo ? true : undefined}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL or uploaded file */}
          {logo ? <img src={logo} alt="" /> : initials(title)}
        </span>
        <span className="min-w-0">
          <span className={rail.railSummaryTitle} title={title}>{title}</span>
          <span className={rail.railSummaryMeta}>{profile.label}</span>
        </span>
      </div>
      <div className={rail.railProgress} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={`${written} of ${total} sections written`} aria-label="Writing progress">
        <div className={rail.railProgressHead}>
          <span>{status}</span>
          <span>{written}/{total}</span>
        </div>
        <div className={rail.railProgressTrack}><span style={{ width: `${percentage}%` }} /></div>
      </div>
    </div>
  );
}

/** The writing steps as an outline: status circle, step name, then what it holds. Add section is pinned below. */
export function PolicyRail({ steps }: { steps: StepDef[] }) {
  const step = useBuilder((state) => state.step);
  const setStep = useBuilder((state) => state.setStep);
  const updatePolicy = useBuilder((state) => state.updatePolicy);
  const { states } = usePolicyStepStates(steps);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Up and down move through the steps the way they would in a file list.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-rail-item]") ?? []);
    const index = items.findIndex((item) => item === document.activeElement);
    if (index < 0) return;
    event.preventDefault();
    const next = items[Math.min(items.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
    next?.focus();
    next?.click();
  };

  // A new custom section goes at the end of the document and opens where it is written.
  const addSection = () => {
    const id = `custom-${Date.now()}`;
    updatePolicy((policy) => ({ sections: [...(policy.sections || []), { id, kind: "custom", title: "Custom section", enabled: true, blocks: [{ id: `${id}-p1`, type: "paragraph", text: "" }] }] }));
    setStep("custom");
  };

  return (
    <nav className={clsx(shell.nav, rail.railNav)} aria-label="Policy sections" onKeyDown={onKeyDown}>
      <div className={rail.railScroll} data-lenis-prevent="">
        <ul ref={listRef} className={clsx(shell.navList, rail.railGroupList)}>
          {steps.map((item) => {
            const entry = states.get(item.id);
            const state = entry?.state ?? "empty";
            const active = item.id === step;
            return (
              <li key={item.id}>
                <button type="button" data-rail-item={item.id} onClick={() => setStep(item.id)} aria-current={active ? "step" : undefined} aria-label={`${item.label}, ${state === "written" ? "written" : "not written yet"}`} title={item.desc} className={clsx(shell.navButton, rail.railItem)}>
                  {active ? <motion.span layoutId="builder-workflow-selection" aria-hidden="true" className={shell.workflowMarker} transition={markerTransition} /> : null}
                  <span className={rail.railMark} data-state={state}>{state === "written" ? <Check size={9} strokeWidth={3} aria-hidden="true" /> : null}</span>
                  <span className={rail.railText}>
                    <span className={rail.railTitle}>{item.label}</span>
                    {entry?.detail ? <span className={rail.railCode}>{entry.detail}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className={rail.railFoot}>
        <button type="button" className={rail.railAdd} onClick={addSection}><Plus size={14} aria-hidden="true" />Add section</button>
      </div>
    </nav>
  );
}
