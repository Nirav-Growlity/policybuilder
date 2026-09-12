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
import { extractLogoPalette } from "@/lib/logo-palette";
import { applyCompanyMaster } from "@/lib/policycraft-mapping";
import type { PolicyCraftDocumentState } from "@/lib/policycraft-types";

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
    updatePolicy,
    hydrated,
  } = useBuilder();
  const { push } = useToast();
  const searchParams = useSearchParams();
  const selectedType = searchParams.get("type") as PolicyType | null;
  const draftId = searchParams.get("draft");
  const router = useRouter();
  const [dragOver, setDragOver] = React.useState(false);
  const [companyLoaded, setCompanyLoaded] = React.useState(false);
  const [documentLoaded, setDocumentLoaded] = React.useState(!draftId);
  const [backendDocumentId, setBackendDocumentId] = React.useState<string | null>(draftId);
  const [backendTitle, setBackendTitle] = React.useState("");
  const backendLockVersion = React.useRef(1);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "offline" | "conflict">("idle");
  const backendLoadKey = React.useRef<string>("");
  const createAttempted = React.useRef(false);
  const skipNextSave = React.useRef(false);

  const order = getStepOrder(policy);
  const currentIndex = Math.max(0, order.indexOf(step));
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === order.length - 1;
  const StepCmp = STEP_RENDERERS[step] || StepStructure;

  React.useEffect(() => {
    if (hydrated && !order.includes(step)) setStep(order[0]);
  }, [hydrated, order, setStep, step]);

  // Every new/legacy local builder session is hydrated from the authenticated
  // organization. A saved draft is loaded instead and remains user-editable.
  React.useEffect(() => {
    if (!hydrated) return;
    const key = draftId ? `draft:${draftId}` : "company-master";
    if (backendLoadKey.current === key) return;
    backendLoadKey.current = key;
    if (draftId) {
      fetch(`/api/policycraft/documents/${encodeURIComponent(draftId)}`)
        .then(async (response) => {
          if (response.status === 401) {
            router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            return null;
          }
          if (!response.ok) throw new Error("Could not load draft");
          return response.json();
        })
        .then((data) => {
          if (!data?.document) return;
          const loaded = data.document;
          setPolicy(loaded.state.policy);
          if (loaded.state.importedPolicy) setImportedPolicy(loaded.state.importedPolicy);
          else clearImportedPolicy();
          setStep(loaded.state.step);
          setBackendDocumentId(loaded.id);
          setBackendTitle(loaded.title);
          backendLockVersion.current = loaded.lockVersion;
          skipNextSave.current = true;
          setDocumentLoaded(true);
          setCompanyLoaded(true);
        })
        .catch(() => {
          push("Could not load that draft", "error");
          setDocumentLoaded(true);
        });
      return;
    }

    fetch("/api/policycraft/bootstrap")
      .then(async (response) => {
        if (response.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return null;
        }
        if (!response.ok) throw new Error("Could not load company");
        return response.json();
      })
      .then((data) => {
        if (data?.company) updatePolicy((current) => applyCompanyMaster(current, data.company));
        setCompanyLoaded(true);
      })
      .catch(() => {
        push("Could not load company information", "error");
        setCompanyLoaded(true);
      });
  }, [clearImportedPolicy, draftId, hydrated, push, router, setImportedPolicy, setPolicy, setStep, updatePolicy]);

  React.useEffect(() => {
    if (!hydrated || !companyLoaded || !selectedType || draftId) return;
    if (policy.policyType !== selectedType) startPolicy(selectedType);
  }, [companyLoaded, draftId, hydrated, policy.policyType, selectedType, startPolicy]);

  // Create the server draft once a policy type is known. Until then
  // the existing local Zustand draft remains a safe temporary workspace.
  React.useEffect(() => {
    const selectedTypeReady = !selectedType || policy.policyType === selectedType;
    const shouldCreate = hydrated && companyLoaded && documentLoaded && selectedTypeReady && !draftId && !backendDocumentId && !createAttempted.current && Boolean(selectedType);
    if (!shouldCreate) return;
    createAttempted.current = true;
    const current = useBuilder.getState();
    const state: PolicyCraftDocumentState = { step: current.step, policy: current.policy, importedPolicy: current.importedPolicy };
    fetch("/api/policycraft/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${current.policy.company.name || "Untitled"} ${current.policy.policyType} policy`, state }),
    })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!response.ok) throw new Error("Could not create draft");
        return response.json();
      })
      .then((data) => {
        if (!data?.document) return;
        setBackendDocumentId(data.document.id);
        setBackendTitle(data.document.title);
        backendLockVersion.current = data.document.lockVersion;
        router.replace(`/builder?draft=${encodeURIComponent(data.document.id)}`);
        setSaveStatus("saved");
      })
      .catch(() => {
        createAttempted.current = false;
        push("Draft storage is unavailable; your local copy is still open", "error");
      });
  }, [backendDocumentId, companyLoaded, draftId, documentLoaded, hydrated, policy.policyType, push, router, selectedType]);

  React.useEffect(() => {
    if (!backendDocumentId || !companyLoaded || !documentLoaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const state: PolicyCraftDocumentState = { step, policy, importedPolicy };
    const timer = window.setTimeout(() => {
      setSaveStatus("saving");
      fetch(`/api/policycraft/documents/${encodeURIComponent(backendDocumentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: backendTitle || `${policy.company.name || "Untitled"} ${policy.policyType} policy`, state, lockVersion: backendLockVersion.current }),
      }).then(async (response) => {
        if (response.status === 409) {
          setSaveStatus("conflict");
          push("This draft changed in another window. Reload it before continuing.", "error");
          return;
        }
        if (!response.ok) throw new Error("save failed");
        const data = await response.json();
        if (data?.document?.lockVersion) backendLockVersion.current = data.document.lockVersion;
        setSaveStatus("saved");
      }).catch(() => setSaveStatus("offline"));
    }, 900);
    return () => window.clearTimeout(timer);
  }, [backendDocumentId, backendTitle, companyLoaded, documentLoaded, draftId, importedPolicy, policy, push, step]);

  // Legacy saved policies may contain a logo but no cached palette. Keep this
  // migration alive at the builder level so it also runs on Preview/Export,
  // where the company form is not mounted.
  React.useEffect(() => {
    const logo = policy.company.companyLogo;
    if (!hydrated || !logo || policy.company.logoPalette) return;
    let active = true;
    void extractLogoPalette(logo).then((logoPalette) => {
      if (!active || !logoPalette) return;
      updatePolicy((current) => current.company.companyLogo === logo ? { company: { ...current.company, logoPalette } } : undefined);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [hydrated, policy.company.companyLogo, policy.company.logoPalette, updatePolicy]);

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

  if (draftId && !documentLoaded) {
    return <div className="min-h-screen bg-[var(--color-cream)]" />;
  }

  if (!companyLoaded) {
    return <div className="min-h-screen bg-[var(--color-cream)]" />;
  }

  if (!draftId && !selectedType) {
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
      {!isLast && (<Button
        variant="primary"
        size="md"
        trailingIcon={<ArrowRight size={14} />}
        onClick={next}
        disabled={isLast}
      >
        Continue
      </Button>)}
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
      <BuilderShell topActions={<>{backendDocumentId ? <span className="mr-2 text-[11px] text-[var(--color-muted)]">{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "conflict" ? "Conflict" : saveStatus === "offline" ? "Offline" : ""}</span> : null}{topActions}</>}>
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
