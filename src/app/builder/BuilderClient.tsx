"use client";

import * as React from "react";
import { useBuilder, getStepOrder } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BuilderShell } from "@/components/builder/shell";
import { StepSetup } from "@/components/builder/steps/step-setup";
import { StepDeclaration } from "@/components/builder/steps/step-declaration";
import { StepFocus } from "@/components/builder/steps/step-focus";
import { StepQualitative } from "@/components/builder/steps/step-qualitative";
import { StepQuantitative } from "@/components/builder/steps/step-quantitative";
import { StepSDG } from "@/components/builder/steps/step-sdg";
import { StepResponsibilities } from "@/components/builder/steps/step-responsibilities";
import { StepExport } from "@/components/builder/steps/step-export";
import { AIActionButton } from "@/components/ui/ai-action-button";
import { callAI } from "@/lib/ai/client";
import { ArrowLeft, ArrowRight, Wand2, FileUp } from "lucide-react";
import { useSearchParams } from "next/navigation";

const STEP_RENDERERS: Record<string, React.ComponentType> = {
  setup: StepSetup,
  declaration: StepDeclaration,
  focus: StepFocus,
  qualitative: StepQualitative,
  quantitative: StepQuantitative,
  sdg: StepSDG,
  responsibilities: StepResponsibilities,
  export: StepExport,
};

export function BuilderClient() {
  const { step, policy, setStep, next, prev, updatePolicy, setPolicy, hydrated } = useBuilder();
  const { push } = useToast();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const [aiBusy, setAiBusy] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [templateLoaded, setTemplateLoaded] = React.useState(false);

  const order = getStepOrder(policy.presentationTemplate);
  const currentIndex = Math.max(0, order.indexOf(step));
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === order.length - 1;
  const StepCmp = STEP_RENDERERS[step] || StepSetup;

  React.useEffect(() => {
    if (!hydrated || templateLoaded || !templateId) return;
    (async () => {
      try {
        const res = await fetch(`/api/templates/${templateId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.template?.policy) {
          setPolicy(data.template.policy);
          push(`Loaded template: ${data.template.name}`, "success");
          setStep("setup");
        }
      } catch {
        // ignore
      } finally {
        setTemplateLoaded(true);
      }
    })();
  }, [hydrated, templateId, templateLoaded]);

  const runAiAll = async (customPrompt?: string) => {
    setAiBusy(true);
    try {
      if (step === "declaration") {
        const [p, d, s] = await Promise.all([
          callAI({ type: "preface", policy, customPrompt }),
          callAI({ type: "declaration", policy, customPrompt }),
          callAI({ type: "scope", policy, customPrompt }),
        ]);
        updatePolicy((cur) => ({
          declaration: {
            preface: p.text ?? cur.declaration.preface,
            declaration: d.text ?? cur.declaration.declaration,
            scope: s.text ?? cur.declaration.scope,
          },
        }));
        push("All declaration sections generated", "success");
      } else if (step === "focus") {
        const r = await callAI({ type: "focus", policy, customPrompt });
        if (r.areas) updatePolicy((p) => ({ focusAreas: r.areas! }));
        push("Focus areas generated", "success");
      } else if (step === "qualitative") {
        const count = Math.min(policy.focusAreas.length, 5);
        for (let i = 0; i < count; i++) {
          const r = await callAI({ type: "qualitative", policy, areaIndex: i, customPrompt });
          if (r.objectives) {
            const area = policy.focusAreas[i];
            updatePolicy((p) => ({
              qualitative: { ...p.qualitative, [area]: [...(p.qualitative[area] || []), ...r.objectives!] },
            }));
          }
        }
        push("Objectives generated", "success");
      } else if (step === "quantitative") {
        const count = Math.min(policy.quantitative.length, 4);
        for (let i = 0; i < count; i++) {
          const r = await callAI({ type: "quantitative", policy, areaIndex: i, customPrompt });
          if (r.targets) {
            updatePolicy((p) => ({
              quantitative: p.quantitative.map((q, j) => (i === j ? { ...q, targets: r.targets! } : q)),
            }));
          }
        }
        push("Targets generated", "success");
      } else if (step === "sdg") {
        const r = await callAI({ type: "sdg", policy, customPrompt });
        if (r.sdgs) updatePolicy((p) => ({ sdgs: r.sdgs!.filter((n) => n >= 1 && n <= 17).sort((a, b) => a - b) }));
        push("SDGs suggested", "success");
      } else if (step === "responsibilities") {
        const [r1, r2, r3] = await Promise.all([
          callAI({ type: "responsibilities", policy, customPrompt }),
          callAI({ type: "monitoring", policy, customPrompt }),
          callAI({ type: "review", policy, customPrompt }),
        ]);
        updatePolicy((cur) => ({
          responsibilities: r1.responsibilities ?? cur.responsibilities,
          monitoring: r2.text ?? cur.monitoring,
          reviewMechanism: r3.text ?? cur.reviewMechanism,
        }));
        push("Responsibilities, monitoring & review generated", "success");
      } else if (step === "export") {
        push("Use the export buttons to download", "info");
      } else {
        push("Fill company details manually", "info");
      }
    } catch (e) {
      push("AI generation failed", "error");
    } finally {
      setAiBusy(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadFile(file);
  };

  const uploadFile = async (file: File) => {
    if (!file.name.endsWith(".docx") && !file.name.endsWith(".doc")) {
      push("Please drop a .docx or .doc file", "error");
      return;
    }
    try {
      push("Parsing document…", "info");
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/parse/docx", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Parse failed");
      const data = await res.json();
      updatePolicy((cur) => ({
        ...cur,
        ...data.policy,
        policyType: "environmental",
      }));
      push("Document parsed. Review the fields below.", "success");
      setStep("setup");
    } catch (e) {
      push("Could not parse file", "error");
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const topActions = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx,.doc"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
          e.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        size="md"
        icon={<FileUp size={14} />}
        onClick={() => fileInputRef.current?.click()}
      >
        Import .docx
      </Button>
      <AIActionButton
        label="AI Generate All"
        size="md"
        loading={aiBusy}
        onGenerate={(prompt) => runAiAll(prompt)}
      />
      <div className="w-px h-6 bg-[var(--color-line-2)] mx-1" />
      <Button variant="secondary" size="md" icon={<ArrowLeft size={14} />} onClick={prev} disabled={isFirst}>
        Back
      </Button>
      <Button
        variant="primary"
        size="md"
        trailingIcon={<ArrowRight size={14} />}
        onClick={next}
        disabled={isLast}
      >
        Continue
      </Button>
    </>
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className="relative"
    >
      <BuilderShell topActions={topActions}>
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
          <StepCmp />
        </div>
      </BuilderShell>
      {dragOver && (
        <div className="absolute inset-0 z-50 bg-[var(--color-forest-soft)]/95 border-2 border-dashed border-[var(--color-forest)] flex items-center justify-center pointer-events-none animate-fade-in">
          <div className="text-center">
            <FileUp size={48} className="mx-auto text-[var(--color-forest)]" />
            <div className="mt-3 font-display text-[24px] font-semibold text-[var(--color-forest-deep)]">Drop your .docx to import</div>
            <div className="text-[13px] text-[var(--color-forest-deep)]/70 mt-1">We'll extract the content into the builder</div>
          </div>
        </div>
      )}
    </div>
  );
}
