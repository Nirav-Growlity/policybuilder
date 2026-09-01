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
import { ArrowLeft, ArrowRight, FileCheck2, FileUp, X } from "lucide-react";
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
  const {
    step,
    policy,
    importedPolicy,
    setStep,
    next,
    prev,
    setPolicy,
    setImportedPolicy,
    clearImportedPolicy,
    startPolicy,
    hydrated,
  } = useBuilder();
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
    if (!file.name.toLowerCase().endsWith(".docx")) {
      push("Please select a .docx file", "error");
      return;
    }
    try {
      push("Parsing document…", "info");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("policyType", policy.policyType);
      const res = await fetch("/api/parse/docx", { method: "POST", body: fd });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Parse failed");
      }
      const data = await res.json();
      setImportedPolicy(data.referencePolicy);
      push("Policy attached as the primary AI context. Your current fields were not changed.", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not parse file", "error");
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
        accept=".docx"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
          e.target.value = "";
        }}
      />
      {importedPolicy ? (
        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--color-line-2)] bg-white/70 px-2 py-1">
          <FileCheck2 size={14} className="shrink-0 text-[var(--color-forest)]" />
          <button
            type="button"
            className="max-w-44 truncate text-left text-[12px] font-medium text-[var(--color-ink)]"
            title={`${importedPolicy.fileName} is the primary AI context. Click to replace it.`}
            onClick={() => fileInputRef.current?.click()}
          >
            {importedPolicy.fileName}
          </button>
          <button
            type="button"
            aria-label="Remove imported policy context"
            title="Remove imported policy context"
            className="rounded p-1 text-[var(--color-muted)] transition-colors hover:bg-black/5 hover:text-[var(--color-ink)]"
            onClick={clearImportedPolicy}
          >
            <X size={13} />
          </button>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="md"
          icon={<FileUp size={14} />}
          onClick={() => fileInputRef.current?.click()}
        >
          Add policy context
        </Button>
      )}
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
            <div className="mt-3 font-display text-[24px] font-semibold text-[var(--color-forest-deep)]">Drop a policy .docx</div>
            <div className="text-[13px] text-[var(--color-forest-deep)]/70 mt-1">It becomes the primary AI context without changing your policy fields</div>
          </div>
        </div>
      )}
    </div>
  );
}
