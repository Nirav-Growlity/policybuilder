"use client";

import * as React from "react";
import { useBuilder, getStepOrder } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BuilderShell } from "@/components/builder/shell";
import { StepStructure } from "@/components/builder/steps/step-structure";
import { StepCustom } from "@/components/builder/steps/step-custom";
import { StepDeclaration } from "@/components/builder/steps/step-declaration";
import { StepFocus } from "@/components/builder/steps/step-focus";
import { StepQualitative } from "@/components/builder/steps/step-qualitative";
import { StepQuantitative } from "@/components/builder/steps/step-quantitative";
import { StepSDG } from "@/components/builder/steps/step-sdg";
import { StepResponsibilities } from "@/components/builder/steps/step-responsibilities";
import { StepExport } from "@/components/builder/steps/step-export";
import { ArrowLeft, ArrowRight, FileUp } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { PolicySelector } from "@/components/builder/policy-selector";
import { CompanySetupScreen } from "@/components/builder/company-setup-screen";
import type { PolicyType } from "@/lib/types";

const STEP_RENDERERS: Record<string, React.ComponentType> = {
  structure: StepStructure,
  declaration: StepDeclaration,
  focus: StepFocus,
  qualitative: StepQualitative,
  quantitative: StepQuantitative,
  sdg: StepSDG,
  responsibilities: StepResponsibilities,
  custom: StepCustom,
  export: StepExport,
};

export function BuilderClient() {
  const { step, policy, setStep, next, prev, updatePolicy, setPolicy, startPolicy, hydrated } = useBuilder();
  const { push } = useToast();
  const searchParams = useSearchParams();
  const templateId = searchParams.get("template");
  const selectedType = searchParams.get("type") as PolicyType | null;
  const router = useRouter();
  const [dragOver, setDragOver] = React.useState(false);
  const [templateLoaded, setTemplateLoaded] = React.useState(false);

  const order = getStepOrder(policy);
  const currentIndex = Math.max(0, order.indexOf(step));
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === order.length - 1;
  const StepCmp = STEP_RENDERERS[step] || StepStructure;

  React.useEffect(() => {
    if (hydrated && !order.includes(step)) setStep(order[0]);
  }, [hydrated, order, setStep, step]);

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
          setStep("structure");
        }
      } catch {
        // ignore
      } finally {
        setTemplateLoaded(true);
      }
    })();
  }, [hydrated, templateId, templateLoaded]);

  const handleDrop = async (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes("Files")) return;
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
      fd.append("policyType", policy.policyType);
      const res = await fetch("/api/parse/docx", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Parse failed");
      const data = await res.json();
      updatePolicy((cur) => ({
        ...cur,
        ...data.policy,
        policyType: data.policy.policyType || cur.policyType,
      }));
      push("Document parsed. Review the fields below.", "success");
      setStep("structure");
    } catch (e) {
      push("Could not parse file", "error");
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [setupPhase, setSetupPhase] = React.useState<"company" | "policy">("company");

  if (!templateId && !selectedType) {
    if (setupPhase === "company") {
      return <CompanySetupScreen onContinue={() => setSetupPhase("policy")} />;
    }
    return (
      <PolicySelector
        onSelect={(type) => {
          startPolicy(type);
          router.push(`/builder?type=${type}`);
        }}
        onBack={() => setSetupPhase("company")}
      />
    );
  }

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
        if (!Array.from(e.dataTransfer.types).includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (Array.from(e.dataTransfer.types).includes("Files")) setDragOver(false);
      }}
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
