"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppTransitionScreen } from "@/components/ui/app-transition-screen";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { useToast } from "@/components/ui/toast";
import { extractLogoPalette } from "@/lib/logo-palette";
import { usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import type { PolicyCraftOrganization } from "@/lib/policycraft-access-types";
import type { CompanyMasterSnapshot } from "@/lib/policycraft-types";
import type { Company } from "@/lib/types";
import { SOP_CATALOG, recommendSops } from "@/lib/sop/catalog";
import { createEmptySopCompany } from "@/lib/sop/initial-manual";
import { createSopManual, fetchAccess, fetchCompanySnapshot, importSopDocx, isImportAvailable, saveSopManual } from "@/lib/sop/client-api";
import { DEFAULT_SOP_TEMPLATE_ID, type SopCover, type SopManual, type SopManualControl, type SopTemplateId, type SopThemeOptions } from "@/lib/sop/types";
import { buildNewManual, catalogTopicsById, manualTitle, suggestDocNo, withSuggestedCodes, type CustomSopDraft } from "../manual-helpers";
import { ChooseSopsStep, type ImportState, type StartChoice } from "./choose-sops-step";
import { DetailsStep, nextReviewDate } from "./details-step";
import { LookStep } from "./look-step";
import { WizardHeader } from "./wizard-chrome";

type Step = 0 | 1 | 2;

/** The company the manual starts from: the organization master record. */
export function companyFromSnapshot(snapshot: CompanyMasterSnapshot | null, fallbackName: string): Company {
  const company = createEmptySopCompany();
  if (!snapshot) return { ...company, name: fallbackName };
  return {
    ...company,
    name: snapshot.name || fallbackName,
    industry: snapshot.industry,
    subCategory: snapshot.subCategory,
    industryDetail: snapshot.industryDetail || "",
    country: snapshot.country,
    websiteLink: snapshot.websiteLink,
    site: snapshot.sites[0]?.address || "",
    sites: snapshot.sites.map((site) => ({ ...site })),
    ...(snapshot.reportingPeriod ? { reportingPeriod: snapshot.reportingPeriod } : {}),
    ...(snapshot.companyLogo !== undefined ? { companyLogo: snapshot.companyLogo } : {}),
  };
}

export function initialControl(company: Company, organizationCode: string, today = new Date()): SopManualControl {
  const effectiveDate = today.toISOString().slice(0, 10);
  return {
    docNo: suggestDocNo(company, organizationCode),
    revision: "01",
    supersedes: "",
    effectiveDate,
    reviewFrequency: "Yearly",
    nextReviewDate: nextReviewDate(effectiveDate, "Yearly"),
    preparedBy: "",
    reviewedBy: "",
    approvedBy: "",
    classification: "Internal",
  };
}

export function NewManualWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { push } = useToast();
  const setScope = usePolicyCraftScope((state) => state.setScope);
  const requestedOrgId = Number(searchParams.get("orgId")) || null;

  const [phase, setPhase] = React.useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = React.useState("");
  const [organization, setOrganization] = React.useState<PolicyCraftOrganization | null>(null);
  const [company, setCompany] = React.useState<Company>(createEmptySopCompany);
  const [control, setControl] = React.useState<SopManualControl>(() => initialControl(createEmptySopCompany(), ""));
  const [step, setStep] = React.useState<Step>(0);
  const [start, setStart] = React.useState<StartChoice>("recommended");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [recommendedFor, setRecommendedFor] = React.useState("");
  const [custom, setCustom] = React.useState<CustomSopDraft[]>([]);
  const [importState, setImportState] = React.useState<ImportState>({ status: "checking" });
  const [theme, setTheme] = React.useState<SopTemplateId>(DEFAULT_SOP_TEMPLATE_ID);
  const [themeOptions, setThemeOptions] = React.useState<SopThemeOptions>({ accent: "", fontPair: "", pageSize: "A4", showSopHeaderCard: false });
  const [cover, setCover] = React.useState<SopCover>({ variant: "template" });
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        const access = await fetchAccess();
        const role = access.actor.role;
        const candidates = access.organizations.filter((item) => !item.deleted && (role === "admin" || !item.expired));
        const target = requestedOrgId ? candidates.find((item) => item.id === requestedOrgId) : candidates[0];
        if (!target) throw new Error(requestedOrgId ? "This organization is not available for new documents." : "Ask an administrator to assign an active organization to your account.");
        setScope({ userId: access.actor.id, role, organizationId: target.id, organizationName: target.name });
        const snapshot = await fetchCompanySnapshot(target.id).catch(() => null);
        if (!active) return;
        const nextCompany = companyFromSnapshot(snapshot, target.name);
        setOrganization(target);
        setCompany(nextCompany);
        setControl(initialControl(nextCompany, target.code));
        setPhase("ready");
        void isImportAvailable(target.id).then((available) => { if (active) setImportState(available ? { status: "available", file: null } : { status: "unavailable" }); });
      } catch (cause) {
        if (cause instanceof Error && "status" in cause && (cause as { status: number }).status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/documents/sop/new${requestedOrgId ? `?orgId=${requestedOrgId}` : ""}`)}`);
          return;
        }
        if (active) { setError(cause instanceof Error ? cause.message : "Could not open the manual builder."); setPhase("error"); }
      }
    }
    void load();
    return () => { active = false; };
  }, [requestedOrgId, router, setScope]);

  // Brand colours become available once the logo's palette is known.
  React.useEffect(() => {
    const logo = company.companyLogo;
    if (!logo || company.logoPalette || !organization) return;
    let active = true;
    const source = logo.startsWith("data:") || logo.startsWith("/") || /^https?:/i.test(logo) ? logo : `/api/policycraft/cover-assets/${encodeURIComponent(logo)}?orgId=${organization.id}`;
    void extractLogoPalette(source).then((logoPalette) => {
      if (active && logoPalette) setCompany((current) => (current.companyLogo === logo ? { ...current, logoPalette } : current));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [company.companyLogo, company.logoPalette, organization]);

  // Each step opens at the top, like a new page.
  React.useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: "auto" }); }, [step]);

  // Some organization profiles store ISIC keys ("201_basic_chemicals"); show them as words.
  const industry = (company.industryDetail || company.subCategory || company.industry || "")
    .replace(/^\d+[_\s-]*/, "").replace(/_/g, " ").trim();
  // "Recommended for finishing of textiles" reads as a sentence; acronyms keep their capitals.
  const industryLabel = industry ? (/^[A-Z][a-z]/.test(industry) ? industry[0].toLowerCase() + industry.slice(1) : industry) : "your company";
  const recommendationKey = `${company.industry}|${company.subCategory}|${company.industryDetail}`;

  const applyRecommended = React.useCallback(() => {
    setSelected(new Set(recommendSops(company).map((topic) => topic.id)));
    setRecommendedFor(recommendationKey);
  }, [company, recommendationKey]);

  const goToSops = () => {
    // The recommendation follows the industry; refresh it if the industry changed and the user has not chosen yet.
    if (start === "recommended" && recommendedFor !== recommendationKey) applyRecommended();
    setStep(1);
  };

  const chooseStart = (choice: StartChoice) => {
    setStart(choice);
    if (choice === "recommended") applyRecommended();
    if (choice === "scratch") { setSelected(new Set()); setCustom([]); }
    if (choice === "import") {
      setSelected(new Set());
      if (importState.status === "unavailable" && organization) {
        setImportState({ status: "checking" });
        void isImportAvailable(organization.id).then((available) => setImportState(available ? { status: "available", file: null } : { status: "unavailable" }));
      }
    }
  };

  const updateCompany = React.useCallback((updater: (current: Company) => Company | undefined) => {
    setCompany((current) => updater(current) ?? current);
  }, []);

  async function createManual() {
    if (!organization || creating) return;
    setCreating(true);
    const orgId = organization.id;
    try {
      const topics = catalogTopicsById(selected);
      const manual = buildNewManual({ company, control, topics, custom, theme, themeOptions, cover: cover.variant === "ai" ? { variant: "ai" } : cover });
      let stored = await createSopManual(orgId, { title: manualTitle(manual), manual });
      const importFile = start === "import" && importState.status === "available" ? importState.file : null;
      if (importFile) {
        try {
          const result = await importSopDocx(orgId, stored.id, importFile);
          if (result.status === "unavailable") push("Import is not available yet. Your manual was created without the file.", "info");
          else {
            const imported: SopManual = result.manual ?? { ...stored.manual, sops: [...stored.manual.sops, ...(result.sops ?? [])] };
            stored = await saveSopManual(orgId, stored.id, { title: stored.title, stage: stored.currentStage, manual: withSuggestedCodes(imported), lockVersion: stored.lockVersion });
            push(`Imported ${result.sops?.length ?? imported.sops.length} SOPs from ${importFile.name}.`, "success");
          }
        } catch (cause) {
          push(cause instanceof Error ? `The manual was created, but the import failed: ${cause.message}` : "The manual was created, but the import failed.", "error");
        }
      }
      const params = new URLSearchParams({ orgId: String(orgId) });
      if (topics.length || custom.length) params.set("generate", "1");
      if (cover.variant === "ai") params.set("cover", "ai");
      router.push(`/documents/sop/${encodeURIComponent(stored.id)}?${params}`);
    } catch (cause) {
      push(cause instanceof Error ? cause.message : "Could not create the manual.", "error");
      setCreating(false);
    }
  }

  if (phase === "loading") return <AppTransitionScreen title="Preparing a new SOP manual" detail="Loading your company details." />;
  if (phase === "error" || !organization) {
    return (
      <main className="pc-builder-authoring mx-auto grid min-h-screen max-w-xl content-center px-5 text-center">
        <h1 className="font-display text-2xl font-semibold">Workspace unavailable</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-muted)]" role="alert">{error}</p>
        <Link href="/documents" className="mx-auto mt-5 inline-flex min-h-10 items-center rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-[var(--pc-primary-text)] hover:bg-[var(--color-forest-deep)]">Return to documents</Link>
      </main>
    );
  }

  const backHref = `/documents?orgId=${organization.id}`;
  const sopCount = selected.size + custom.length;
  return (
    <ApplicationSurface className="min-h-screen bg-[var(--pc-page)] text-[var(--pc-text)]">
      <main className="pc-builder-authoring min-h-screen pb-12">
        <WizardHeader step={step} backHref={backHref} />
        {step === 0 ? (
          <DetailsStep
            company={company}
            control={control}
            onCompanyChange={updateCompany}
            onControlChange={(patch) => setControl((current) => ({ ...current, ...patch }))}
            onContinue={goToSops}
          />
        ) : step === 1 ? (
          <ChooseSopsStep
            catalog={SOP_CATALOG}
            industryLabel={industryLabel}
            start={start}
            onStart={chooseStart}
            selected={selected}
            onToggle={(id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
            onSetGroup={(ids, checked) => setSelected((current) => { const next = new Set(current); ids.forEach((id) => (checked ? next.add(id) : next.delete(id))); return next; })}
            custom={custom}
            onCustomChange={setCustom}
            importState={importState}
            onImportFile={(file) => setImportState({ status: "available", file })}
            creating={creating}
            onBack={() => setStep(0)}
            onLook={() => setStep(2)}
            onCreate={() => void createManual()}
          />
        ) : (
          <LookStep
            orgId={organization.id}
            theme={theme}
            options={themeOptions}
            cover={cover}
            logoPalette={company.logoPalette}
            sopCount={sopCount}
            creating={creating}
            onTheme={setTheme}
            onOptions={(patch) => setThemeOptions((current) => ({ ...current, ...patch }))}
            onCover={setCover}
            onBack={() => setStep(1)}
            onCreate={() => void createManual()}
          />
        )}
      </main>
    </ApplicationSurface>
  );
}
