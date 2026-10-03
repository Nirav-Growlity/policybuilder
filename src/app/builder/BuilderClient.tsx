"use client";

import * as React from "react";
import { useBuilder, getStepOrder, initialPolicy } from "@/lib/store";
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
import { CompanyInfoForm } from "@/components/builder/company-info-form";
import { Modal } from "@/components/ui/modal";
import type { PolicyType } from "@/lib/types";
import { extractLogoPalette } from "@/lib/logo-palette";
import { applyCompanyMaster } from "@/lib/policycraft-mapping";
import type { PolicyCraftDocumentState, StoredPolicyDocument } from "@/lib/policycraft-types";
import { createDraftAutosave } from "@/lib/policycraft-autosave";
import { AlertTriangle, Building2 } from "lucide-react";
import Link from "next/link";
import { PolicyPreview } from "@/components/policy/policy-preview";
import type { PolicyCraftAccess, PolicyCraftOrganization, PolicyCraftWorkspaceScope } from "@/lib/policycraft-access-types";
import { policyCraftScopeKey, policyCraftUrl, usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import { policyCraftBuilderStorage, runPolicyCraftBuilderStorageTransition } from "@/lib/policycraft-builder-storage";

const STEP_RENDERERS: Record<string, React.ComponentType<{ onCoverEditingChange?: (editing: boolean) => void }>> = {
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

type BuilderDocument = StoredPolicyDocument & {
  organization?: { id: number };
  organizationId?: number;
  orgId?: number;
};

export function BuilderClient() {
  const params = useSearchParams();
  const key = `${params.get("draft") || "new"}:${params.get("orgId") || "auto"}`;
  return <BuilderClientWorkspace key={key} />;
}

function BuilderClientWorkspace() {
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
  const requestedOrgId = searchParams.get("orgId");
  const router = useRouter();
  const [dragOver, setDragOver] = React.useState(false);
  const [companyLoaded, setCompanyLoaded] = React.useState(false);
  const [documentLoaded, setDocumentLoaded] = React.useState(!draftId);
  const [workspaceState, setWorkspaceState] = React.useState<"loading" | "choose" | "ready" | "error">("loading");
  const [workspaceError, setWorkspaceError] = React.useState("");
  const [workspaceAccess, setWorkspaceAccess] = React.useState<PolicyCraftAccess | null>(null);
  const [workspaceOrganizations, setWorkspaceOrganizations] = React.useState<PolicyCraftOrganization[]>([]);
  const [workspaceScope, setWorkspaceScope] = React.useState<PolicyCraftWorkspaceScope | null>(null);
  const setPolicyCraftScope = usePolicyCraftScope((state) => state.setScope);
  const [authorSignatureLoaded, setAuthorSignatureLoaded] = React.useState(false);
  const [backendDocumentId, setBackendDocumentId] = React.useState<string | null>(draftId);
  const [backendTitle, setBackendTitle] = React.useState("");
  const backendLockVersion = React.useRef(1);
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved" | "offline" | "conflict">("idle");
  const createAttempted = React.useRef(false);
  const skipNextSave = React.useRef(false);
  const draftAutosave = React.useRef<ReturnType<typeof createDraftAutosave<PolicyCraftDocumentState>> | null>(null);
  const authorSignatureLoadKey = React.useRef("");
  const lastSavedState = React.useRef("");
  const saveDraftRef = React.useRef<((nextState: PolicyCraftDocumentState) => Promise<void>) | null>(null);
  if (!draftAutosave.current) draftAutosave.current = createDraftAutosave<PolicyCraftDocumentState>();
  React.useEffect(() => {
    const autosave = createDraftAutosave<PolicyCraftDocumentState>();
    draftAutosave.current = autosave;
    return () => autosave.cancel();
  }, []);

  saveDraftRef.current = async (nextState) => {
    if (!backendDocumentId || !workspaceScope) throw new Error("The policy workspace is not ready to save.");
    setSaveStatus("saving");
    const response = await fetch(policyCraftUrl(`/api/policycraft/documents/${encodeURIComponent(backendDocumentId)}`, { ...workspaceScope, documentId: backendDocumentId }), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: backendTitle || `${nextState.policy.company.name || "Untitled"} ${nextState.policy.policyType} policy`, state: nextState, lockVersion: backendLockVersion.current }),
    });
    if (response.status === 409) {
      setSaveStatus("conflict");
      push("This policy changed in another window. Reload it before continuing.", "error");
      throw new Error("draft conflict");
    }
    if (!response.ok) throw new Error("Could not save this policy.");
    const data = await response.json();
    const savedLockVersion = Number(data?.document?.lockVersion);
    if (Number.isInteger(savedLockVersion) && savedLockVersion > 0) backendLockVersion.current = savedLockVersion;
    lastSavedState.current = JSON.stringify(nextState);
    setSaveStatus("saved");
  };

  React.useLayoutEffect(() => {
    setPolicyCraftScope(null);
    policyCraftBuilderStorage.clearScope();
  }, [draftId, requestedOrgId, setPolicyCraftScope]);

  const order = getStepOrder(policy);
  const currentIndex = Math.max(0, order.indexOf(step));
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === order.length - 1;
  const StepCmp = STEP_RENDERERS[step] || StepStructure;

  React.useEffect(() => {
    if (hydrated && !order.includes(step)) setStep(order[0]);
  }, [hydrated, order, setStep, step]);

  // Resolve organization context from authenticated access or saved document
  // metadata before hydrating actor/org-isolated local state or rendering UI.
  React.useEffect(() => {
    let active = true;
    async function resolve() {
      try {
        const accessResponse = await fetch("/api/policycraft/access", { cache: "no-store" });
        if (accessResponse.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        if (!accessResponse.ok) throw new Error("Could not verify workspace access. Refresh to try again.");
        const access = await accessResponse.json() as PolicyCraftAccess;
        if (!active) return;
        setWorkspaceAccess(access);
        setWorkspaceOrganizations(access.organizations);

        let targetOrganization: PolicyCraftOrganization | undefined;
        let loadedDocument: BuilderDocument | null = null;
        if (draftId) {
          const documentResponse = await fetch(`/api/policycraft/documents/${encodeURIComponent(draftId)}`, { cache: "no-store" });
          if (documentResponse.status === 401) {
            router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
            return;
          }
          if (!documentResponse.ok) throw new Error(documentResponse.status === 404 ? "This policy is unavailable in your workspace." : "Could not load this policy. Refresh to try again.");
          const data = await documentResponse.json();
          loadedDocument = (data?.document || null) as BuilderDocument | null;
          const documentOrg = loadedDocument?.organization;
          const documentOrganizationId = Number(documentOrg?.id ?? loadedDocument?.organizationId ?? loadedDocument?.orgId);
          if (!loadedDocument || !Number.isInteger(documentOrganizationId)) throw new Error("This policy is missing its organization context. Contact an administrator.");
          targetOrganization = access.organizations.find((organization) => organization.id === documentOrganizationId);
          if (!targetOrganization) throw new Error("This policy’s organization is not assigned to your account.");
          if (access.actor.role !== "admin" && (targetOrganization.deleted || targetOrganization.expired)) throw new Error("This organization is unavailable. Return to your workspace and choose an active organization.");
          if (requestedOrgId && Number(requestedOrgId) !== documentOrganizationId) throw new Error("The policy belongs to a different organization than the selected workspace.");
        } else {
          const requestedId = requestedOrgId ? Number(requestedOrgId) : null;
          if (requestedOrgId && (!Number.isInteger(requestedId) || requestedId! <= 0)) throw new Error("Choose a valid organization before creating a policy.");
          if (requestedId) targetOrganization = access.organizations.find((organization) => organization.id === requestedId);
          else if (access.actor.role === "user" || access.organizations.filter((organization) => !organization.deleted && (access.actor.role === "admin" || !organization.expired)).length === 1) {
            targetOrganization = access.organizations.find((organization) => !organization.deleted && (access.actor.role === "admin" || !organization.expired));
          }
          if (requestedId && !targetOrganization) throw new Error("This organization is not assigned to your account.");
          if (targetOrganization?.deleted || (access.actor.role !== "admin" && targetOrganization?.expired)) throw new Error("This organization is not available for new policies.");
          if (!targetOrganization) {
            setWorkspaceState("choose");
            return;
          }
        }
        if (!targetOrganization || !active) return;

        const scope: PolicyCraftWorkspaceScope = {
          userId: access.actor.id,
          role: access.actor.role,
          organizationId: targetOrganization.id,
          organizationName: targetOrganization.name,
          ...(draftId ? { documentId: draftId } : {}),
          readOnly: !!targetOrganization.deleted,
        };

        await runPolicyCraftBuilderStorageTransition(async () => {
          if (!active) return;
          policyCraftBuilderStorage.clearScope();
          useBuilder.setState({ hydrated: false, step: "structure", policy: initialPolicy(), importedPolicy: null, coverEditorRequest: null, includeAuthorSignature: false, authorSignatureChoiceMade: false, authorSignatureDate: null, authorSignatureUpdatedAt: null });
          policyCraftBuilderStorage.setScope(access.actor.id, targetOrganization.id);
          await useBuilder.persist.rehydrate();
        });
        if (!active) return;
        setPolicyCraftScope(scope);
        setWorkspaceScope(scope);
        setAuthorSignatureLoaded(false);
        authorSignatureLoadKey.current = "";

        if (loadedDocument) {
          const loadedState = loadedDocument.state as PolicyCraftDocumentState;
          if (!loadedState?.policy) throw new Error("This policy has no saved content.");
          setPolicy(loadedState.policy);
          if (loadedState.importedPolicy) setImportedPolicy(loadedState.importedPolicy);
          else clearImportedPolicy();
          setStep(loadedState.step);
          setBackendDocumentId(loadedDocument.id);
          setBackendTitle(loadedDocument.title);
          const lockVersion = Number(loadedDocument.lockVersion);
          if (Number.isInteger(lockVersion) && lockVersion > 0) backendLockVersion.current = lockVersion;
          lastSavedState.current = JSON.stringify({ step: loadedState.step, policy: loadedState.policy, importedPolicy: loadedState.importedPolicy ?? null });
          skipNextSave.current = true;
          setDocumentLoaded(true);
          setCompanyLoaded(true);
        } else {
          const bootstrapResponse = await fetch(policyCraftUrl("/api/policycraft/bootstrap", scope), { cache: "no-store" });
          if (!bootstrapResponse.ok) throw new Error(bootstrapResponse.status === 401 ? "Your session expired. Sign in again." : "Could not load organization details. Refresh to try again.");
          const bootstrap = await bootstrapResponse.json();
          if (!active) return;
          if (bootstrap?.company) updatePolicy((current) => applyCompanyMaster(current, bootstrap.company));
          setCompanyLoaded(true);
        }
        if (active) setWorkspaceState("ready");
      } catch (cause) {
        if (active) {
          const message = cause instanceof Error ? cause.message : "Could not load this workspace.";
          setWorkspaceError(message);
          setWorkspaceState("error");
          setCompanyLoaded(false);
          setDocumentLoaded(false);
          setPolicyCraftScope(null);
          policyCraftBuilderStorage.clearScope();
        }
      }
    }

    const timer = window.setTimeout(() => {
      setWorkspaceState("loading");
      setWorkspaceError("");
      setWorkspaceAccess(null);
      setWorkspaceScope(null);
      setCompanyLoaded(false);
      setDocumentLoaded(!draftId);
      setBackendDocumentId(draftId);
      setBackendTitle("");
      void resolve();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [clearImportedPolicy, draftId, requestedOrgId, router, setImportedPolicy, setPolicy, setPolicyCraftScope, setStep, updatePolicy]);

  React.useEffect(() => {
    if (!hydrated || !companyLoaded || !selectedType || draftId) return;
    if (policy.policyType !== selectedType) startPolicy(selectedType);
  }, [companyLoaded, draftId, hydrated, policy.policyType, selectedType, startPolicy]);

  // Resolve the account signature before showing Export. The signature itself
  // is account-scoped, while the previous lookup lived inside the
  // Responsibilities step and could be skipped when a draft reopened on Export.
  React.useEffect(() => {
    const policyTypeReady = !selectedType || draftId || policy.policyType === selectedType;
    if (!hydrated || !companyLoaded || !documentLoaded || !policyTypeReady) return;
    const key = `${workspaceScope?.userId ?? "unbound"}:${workspaceScope?.organizationId ?? "none"}:${draftId ?? "local"}:${policy.policyType}`;
    if (authorSignatureLoadKey.current === key) return;
    authorSignatureLoadKey.current = key;
    setAuthorSignatureLoaded(false);
    const controller = new AbortController();
    const expectedScopeKey = policyCraftScopeKey(workspaceScope);
    void fetch("/api/policycraft/signatures/me", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || controller.signal.aborted || policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== expectedScopeKey) return;
        const signature = body?.signature;
        const state = useBuilder.getState();
        state.setAuthorSignatureUpdatedAt(signature?.updatedAt ? `${body.userId}:${signature.updatedAt}` : null);
        if (signature && state.policy.showAcknowledgement !== false && !state.authorSignatureChoiceMade) {
          state.setAuthorSignatureApplied(true, new Date().toISOString().slice(0, 10), "automatic");
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setAuthorSignatureLoaded(true);
      });
    return () => controller.abort();
  }, [companyLoaded, documentLoaded, draftId, hydrated, policy.policyType, selectedType, workspaceScope]);

  // Create the server draft once a policy type is known. Until then
  // the existing local Zustand draft remains a safe temporary workspace.
  React.useEffect(() => {
    const selectedTypeReady = !selectedType || policy.policyType === selectedType;
    const shouldCreate = hydrated && companyLoaded && documentLoaded && selectedTypeReady && !draftId && !backendDocumentId && !createAttempted.current && Boolean(selectedType);
    if (!shouldCreate) return;
    createAttempted.current = true;
    const current = useBuilder.getState();
    const state: PolicyCraftDocumentState = { step: current.step, policy: current.policy, importedPolicy: current.importedPolicy };
    const controller = new AbortController();
    let active = true;
    const expectedScopeKey = policyCraftScopeKey(workspaceScope);
    fetch(policyCraftUrl("/api/policycraft/documents", workspaceScope), {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `${current.policy.company.name || "Untitled"} ${current.policy.policyType} policy`, state }),
    })
      .then(async (response) => {
        if (!active || response.status === 401) {
          router.replace("/login");
          return null;
        }
        if (!response.ok) throw new Error("Could not create draft");
        return response.json();
      })
      .then((data) => {
        if (!active || policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== expectedScopeKey || !data?.document) return;
        setBackendDocumentId(data.document.id);
        setBackendTitle(data.document.title);
        const savedState: PolicyCraftDocumentState = { step: current.step, policy: current.policy, importedPolicy: current.importedPolicy };
        lastSavedState.current = JSON.stringify(savedState);
        const createdLockVersion = Number(data.document.lockVersion);
        if (Number.isInteger(createdLockVersion) && createdLockVersion > 0) backendLockVersion.current = createdLockVersion;
        const nextScope = workspaceScope ? { ...workspaceScope, documentId: data.document.id } : null;
        if (nextScope) { setPolicyCraftScope(nextScope); setWorkspaceScope(nextScope); }
        router.replace(`/builder?draft=${encodeURIComponent(data.document.id)}&orgId=${workspaceScope?.organizationId || ""}`);
        setSaveStatus("saved");
      })
      .catch(() => {
        if (active) {
          createAttempted.current = false;
          push("Draft storage is unavailable; your local copy is still open", "error");
        }
      });
    return () => { active = false; controller.abort(); };
  }, [backendDocumentId, companyLoaded, draftId, documentLoaded, hydrated, policy.policyType, push, router, selectedType, workspaceScope, setPolicyCraftScope]);

  React.useEffect(() => {
    if (!backendDocumentId || !companyLoaded || !documentLoaded) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const state: PolicyCraftDocumentState = { step, policy, importedPolicy };
    const activeAutosave = draftAutosave.current;
    if (!activeAutosave) return;
    activeAutosave.schedule(state, async (nextState) => {
      try {
        if (!saveDraftRef.current) throw new Error("The policy workspace is not ready to save.");
        await saveDraftRef.current(nextState);
      } catch (cause) {
        if (cause instanceof Error && cause.message === "draft conflict") throw cause;
        setSaveStatus("offline");
        throw cause;
      }
    });
  }, [backendDocumentId, backendTitle, companyLoaded, documentLoaded, draftId, importedPolicy, policy, push, step]);

  React.useEffect(() => {
    if (!backendDocumentId || workspaceState !== "ready") return;
    const autosave = draftAutosave.current;
    if (!autosave) return;
    const activeAutosave = autosave;

    function currentState(): PolicyCraftDocumentState {
      const state = useBuilder.getState();
      return { step: state.step, policy: state.policy, importedPolicy: state.importedPolicy };
    }

    async function flushForNavigation(): Promise<void> {
      if (saveStatus === "conflict") throw new Error("This policy changed in another window. Reload it before continuing.");
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const state = currentState();
        const serialized = JSON.stringify(state);
        if (serialized !== lastSavedState.current || activeAutosave.hasPending() || activeAutosave.isSaving()) {
          if (!saveDraftRef.current) throw new Error("The policy workspace is not ready to save.");
          activeAutosave.schedule(state, (nextState) => saveDraftRef.current!(nextState));
          await activeAutosave.flush();
        }
        if (JSON.stringify(currentState()) === lastSavedState.current && !activeAutosave.hasPending() && !activeAutosave.isSaving()) return;
      }
      throw new Error("The policy is still changing. Wait for the save indicator, then try again.");
    }

    const beforeUnload = (event: BeforeUnloadEvent) => {
      const stateChanged = JSON.stringify(currentState()) !== lastSavedState.current;
      if (stateChanged || saveStatus === "saving" || saveStatus === "offline" || saveStatus === "conflict" || activeAutosave.hasPending() || activeAutosave.isSaving()) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    // App Router history navigation stays within the document, so beforeunload
    // cannot protect a queued save. Keep the current route until it succeeds.
    const currentHref = window.location.href;
    const currentHistoryState: unknown = window.history.state;
    let historyNavigationPending = false;
    const interceptHistoryNavigation = (event: PopStateEvent) => {
      const changed = JSON.stringify(currentState()) !== lastSavedState.current;
      if (!changed && !activeAutosave.hasPending() && !activeAutosave.isSaving() && saveStatus !== "offline" && saveStatus !== "conflict") return;
      const destination = window.location.href;
      event.stopImmediatePropagation();
      window.history.replaceState(currentHistoryState, "", currentHref);
      if (historyNavigationPending) return;
      historyNavigationPending = true;
      void flushForNavigation().then(() => {
        const target = new URL(destination);
        router.push(`${target.pathname}${target.search}${target.hash}`);
      }).catch((cause) => {
        push(cause instanceof Error ? cause.message : "Could not save this policy. Stay here and retry.", "error");
      }).finally(() => { historyNavigationPending = false; });
    };

    const interceptInternalNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin || `${url.pathname}${url.search}${url.hash}` === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      event.preventDefault();
      void flushForNavigation().then(() => {
        router.push(`${url.pathname}${url.search}${url.hash}`);
      }).catch((cause) => {
        push(cause instanceof Error ? cause.message : "Could not save this policy. Stay here and retry.", "error");
      });
    };

    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("popstate", interceptHistoryNavigation, true);
    document.addEventListener("click", interceptInternalNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("popstate", interceptHistoryNavigation, true);
      document.removeEventListener("click", interceptInternalNavigation, true);
    };
  }, [backendDocumentId, push, router, saveStatus, workspaceState]);

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
    const uploadScope = workspaceScope;
    const uploadScopeKey = policyCraftScopeKey(uploadScope);
    if (!file.name.toLowerCase().endsWith(".docx")) {
      push("Please select a .docx file", "error");
      return;
    }
    try {
      push("Parsing document…", "info");
      const fd = new FormData();
      fd.append("file", file);
      fd.append("policyType", policy.policyType);
      const res = await fetch(policyCraftUrl("/api/parse/docx", uploadScope), { method: "POST", body: fd });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.error || "Parse failed");
      }
      const data = await res.json();
      if (policyCraftScopeKey(usePolicyCraftScope.getState().scope) !== uploadScopeKey) return;
      setImportedPolicy(data.referencePolicy);
      push("Policy attached as the primary AI context. Your current fields were not changed.", "success");
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not parse file", "error");
    }
  };

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [setupPhase, setSetupPhase] = React.useState<"company" | "policy">("company");
  const [showCompanyWarning, setShowCompanyWarning] = React.useState(false);
  const [showCompanyEditor, setShowCompanyEditor] = React.useState(false);
  const [coverEditing, setCoverEditing] = React.useState(false);

  if (workspaceState === "loading") return <div className="grid min-h-screen place-items-center bg-[var(--color-cream)] text-sm text-[var(--color-muted)]" aria-busy="true">Loading organization and policy access…</div>;
  if (workspaceState === "error") return <main className="mx-auto grid min-h-screen max-w-xl content-center px-5 text-center"><h1 className="font-display text-2xl font-semibold">Workspace unavailable</h1><p className="mt-2 text-sm leading-6 text-[var(--color-muted)]" role="alert">{workspaceError}</p><Link href={workspaceAccess?.homeHref || "/login"} className="mx-auto mt-5 inline-flex min-h-10 items-center rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)]">Return to workspace</Link></main>;
  if (workspaceState === "choose") {
    const candidates = workspaceOrganizations.filter((organization) => !organization.deleted && (workspaceAccess?.actor.role === "admin" || !organization.expired));
    return <main className="mx-auto min-h-screen max-w-2xl px-5 py-12 text-[var(--color-ink)]"><Link href={workspaceAccess?.homeHref || "/"} className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)]">← Workspace</Link><p className="mt-8 text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">New policy</p><h1 className="mt-1 font-display text-3xl font-semibold">Choose an organization</h1><p className="mt-2 text-sm text-[var(--color-muted)]">Each policy belongs to one organization. You can switch organizations from the workspace after this draft is saved.</p>{candidates.length ? <ul className="mt-6 divide-y divide-[var(--color-line)] rounded-xl border border-[var(--color-line)] bg-white">{candidates.map((organization) => <li key={organization.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{organization.name}</p><p className="mt-0.5 text-[11px] text-[var(--color-muted)]">{organization.code}{organization.expired ? " · expired · admin access" : ""}</p></div><button type="button" onClick={() => router.replace(`/builder?orgId=${organization.id}`)} className="min-h-9 shrink-0 rounded-lg bg-[var(--color-forest)] px-3 text-xs font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Use organization</button></li>)}</ul> : <div className="mt-6 rounded-xl border border-dashed border-[var(--color-line-2)] bg-white px-5 py-10 text-center"><h2 className="font-display text-lg font-semibold">No available organizations</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Ask an administrator to assign an active organization to your account.</p></div>}</main>;
  }

  if (!companyLoaded || (draftId && !documentLoaded)) return <div className="grid min-h-screen place-items-center bg-[var(--color-cream)] text-sm text-[var(--color-muted)]" aria-busy="true">Loading policy…</div>;
  if (workspaceScope?.readOnly && draftId) return <main className="min-h-screen bg-[var(--color-cream)] px-5 py-7 text-[var(--color-ink)]"><div className="mx-auto max-w-5xl"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-muted)]">Deleted organization · read only</p><h1 className="mt-1 font-display text-2xl font-semibold">{workspaceScope.organizationName}</h1></div><Link href="/admin/policies" className="min-h-9 rounded-lg border border-[var(--color-line-2)] bg-white px-3 py-2 text-xs font-semibold hover:bg-[var(--color-cream-2)]">Back to policies</Link></div><PolicyPreview policy={policy} assetScope={workspaceScope} /></div></main>;

  if (step === "export" && !authorSignatureLoaded) {
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
          router.push(`/builder?type=${type}&orgId=${workspaceScope?.organizationId || ""}`);
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
      {(draftId || backendDocumentId) ? (
        <Button
          variant="secondary"
          size="md"
          icon={<Building2 size={14} />}
          onClick={() => setShowCompanyWarning(true)}
        >
          Company details
        </Button>
      ) : null}
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
      <BuilderShell hideDesignInspector={coverEditing} topActions={<>{backendDocumentId ? <span className="mr-2 text-[11px] text-[var(--color-muted)]">{saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved" : saveStatus === "conflict" ? "Conflict" : saveStatus === "offline" ? "Offline" : ""}</span> : null}{topActions}</>}>
        <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8">
          <StepCmp onCoverEditingChange={step === "export" ? setCoverEditing : undefined} />
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
      <Modal
        open={showCompanyWarning}
        onClose={() => setShowCompanyWarning(false)}
        title="Before you change company details"
        description="Company information is used throughout this policy draft."
        width={520}
      >
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-700" />
            <div>
              <p className="text-[13px] font-semibold text-amber-950">Some policy content may need updating</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-amber-900/85">
                Changing the company name, industry, sites, or other details does not rewrite the policy text automatically. After saving, review the declaration, scope, focus areas, targets, responsibilities, and document metadata so they still match the company.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={() => setShowCompanyWarning(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => {
              setShowCompanyWarning(false);
              setShowCompanyEditor(true);
            }}
          >
            Continue to edit
          </Button>
        </div>
      </Modal>
      <Modal
        open={showCompanyEditor}
        onClose={() => setShowCompanyEditor(false)}
        title="Edit company details"
        description="Changes are saved to this draft automatically. Review the policy sections after editing."
        width={980}
      >
        <div className="max-h-[calc(100vh-170px)] overflow-y-auto pr-1 scrollbar-thin">
          <CompanyInfoForm />
        </div>
        <div className="mt-5 flex justify-end border-t border-[var(--color-line)] pt-4">
          <Button variant="primary" size="md" onClick={() => setShowCompanyEditor(false)}>
            Done
          </Button>
        </div>
      </Modal>
    </div>
  );
}
