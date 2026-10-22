"use client";

import { DelayedLoading } from "@/components/workspace/workspace-list";
import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import { ArrowLeft, Check, Loader2, MapPin, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Combobox } from "@/components/ui/input";
import { ApplicationButton, ApplicationInput } from "@/components/ui/app-primitives";
import { ApplicationSurface } from "@/components/ui/application-surface";
import { SelectionPill, WorkspaceHero, WorkspaceSheet, WS_EASE } from "@/components/workspace/workspace-motion";
import { getIndustryOptions, getSectorOptions, getSubsectorOptions, withCompanyClassification } from "@/lib/company-classification";
import styles from "./standalone-organization-editor.module.css";

export type StandaloneOrganizationSite = { id?: string; location: string; address: string; primaryFunction: string };
export type StandaloneOrganizationProfile = {
  name: string;
  industry: string;
  subCategory: string;
  industryDetail?: string;
  country: string;
  websiteLink: string;
  reportingPeriod: "FY" | "CY";
  sites: StandaloneOrganizationSite[];
  companyLogo?: string;
};
export type StandaloneOrganization = StandaloneOrganizationProfile & {
  id: number;
  code?: string;
  source: "standalone" | "esg";
  lockVersion: number;
};

export function normalizeStandaloneOrganization(result: { organization: Record<string, unknown>; company?: Record<string, unknown>; lockVersion: number }): StandaloneOrganization {
  const summary = result.organization;
  const company = result.company || summary;
  return {
    id: Number(summary.id),
    code: typeof summary.code === "string" ? summary.code : undefined,
    source: summary.source === "esg" ? "esg" : "standalone",
    lockVersion: Number(result.lockVersion),
    name: String(company.name ?? ""),
    industry: String(company.industry ?? ""),
    subCategory: String(company.subCategory ?? ""),
    industryDetail: String(company.industryDetail ?? ""),
    country: String(company.country ?? ""),
    websiteLink: String(company.websiteLink ?? ""),
    reportingPeriod: company.reportingPeriod === "CY" ? "CY" : "FY",
    sites: Array.isArray(company.sites) ? company.sites as StandaloneOrganizationSite[] : [],
    companyLogo: typeof company.companyLogo === "string" ? company.companyLogo : undefined,
  };
}

const organizationFormSchema = z.object({
  name: z.string(),
  industry: z.string(),
  subCategory: z.string(),
  industryDetail: z.string().optional(),
  country: z.string(),
  websiteLink: z.string(),
  reportingPeriod: z.enum(["FY", "CY"]),
  sites: z.array(z.object({ id: z.string().optional(), location: z.string(), address: z.string(), primaryFunction: z.string() })),
  companyLogo: z.string().optional(),
  logo: z.any().optional(),
});
type OrganizationFormValues = StandaloneOrganizationProfile & { logo?: unknown };

const EDITOR_TITLE_ID = "organization-editor-title";
const EDITOR_INTRO = "Set the company profile, Sector, Subsector and Industry used as defaults for new policies. Existing policies keep their saved details.";

function imageSource(reference: string | undefined, organizationId?: number) {
  if (!reference || reference.startsWith("data:") || /^https?:\/\//i.test(reference)) return reference || "";
  const path = reference.startsWith("/") ? reference : `/api/policycraft/cover-assets/${encodeURIComponent(reference)}`;
  if (!organizationId || !path.startsWith("/api/policycraft/cover-assets/")) return path;
  const url = new URL(path, "https://policycraft.invalid");
  url.searchParams.set("orgId", String(organizationId));
  return `${url.pathname}${url.search}`;
}

function toFormValues(profile?: StandaloneOrganization): OrganizationFormValues {
  return {
    name: profile?.name || "",
    industry: profile?.industry || "",
    subCategory: profile?.subCategory || "",
    industryDetail: profile?.industryDetail || "",
    country: profile?.country || "",
    websiteLink: profile?.websiteLink || "",
    reportingPeriod: profile?.reportingPeriod || "FY",
    sites: profile?.sites?.length ? profile.sites.map((site) => ({ ...site })) : [{ location: "", address: "", primaryFunction: "" }],
    companyLogo: profile?.companyLogo,
    logo: undefined,
  };
}

/** Masthead shared by the editor and its loading or error states, so the page never shifts. */
function EditorHero({ title, backHref, backLabel, navigation }: { title: string; backHref: string; backLabel: string; navigation?: React.ReactNode }) {
  return <WorkspaceHero
    titleId={EDITOR_TITLE_ID}
    title={title}
    description={EDITOR_INTRO}
    actions={<nav aria-label="Breadcrumb"><Link href={backHref} className={styles.heroLink}><ArrowLeft size={15} aria-hidden="true" />{backLabel}</Link></nav>}
  >
    {navigation}
  </WorkspaceHero>;
}

/** Loading and error states for the organization detail routes. Same masthead as the editor. */
export function StandaloneOrganizationStatus({ backHref, backLabel, navigation, loading, error, onRetry }: {
  backHref: string;
  backLabel: string;
  navigation?: React.ReactNode;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  return <ApplicationSurface data-pc-workspace="organization-editor" className={styles.surface}>
    <section className={styles.page} aria-labelledby={EDITOR_TITLE_ID}>
      <EditorHero title="Edit organization details" backHref={backHref} backLabel={backLabel} navigation={navigation} />
      <WorkspaceSheet className={styles.sheet}>
        {loading ? <DelayedLoading label="Loading organization…" minHeight={240}><p className={styles.statusLoading} role="status"><Loader2 size={16} className={styles.spinner} aria-hidden="true" />Loading organization…</p></DelayedLoading> : error ? <div className={styles.statusError} role="alert" aria-live="polite"><p>{error}</p><ApplicationButton type="button" variant="outline" onClick={onRetry} leadingIcon={<RefreshCw size={14} aria-hidden="true" />}>Retry</ApplicationButton></div> : null}
      </WorkspaceSheet>
    </section>
  </ApplicationSurface>;
}

export function StandaloneOrganizationEditor({ organizationId, initial, backHref = "/admin/organizations/policycraft", navigation }: { organizationId?: number; initial?: StandaloneOrganization; backHref?: string; navigation?: React.ReactNode }) {
  const router = useRouter();
  const [lockVersion, setLockVersion] = React.useState(initial?.lockVersion ?? 1);
  const [logoPreview, setLogoPreview] = React.useState("");
  const logoPreviewRef = React.useRef("");
  const [error, setError] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const { register, control, handleSubmit, getValues, setValue, reset, resetField } = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationFormSchema),
    defaultValues: toFormValues(initial),
  });
  const profile = useWatch({ control }) || toFormValues(initial);
  const siteFields = useFieldArray({ control, name: "sites", keyName: "fieldKey" });
  const logoRegistration = register("logo");

  React.useEffect(() => () => {
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
  }, []);

  function setClassification(key: "industry" | "subCategory" | "industryDetail", value: string) {
    const next = withCompanyClassification(getValues(), key, value);
    setValue("industry", next.industry, { shouldDirty: true });
    setValue("subCategory", next.subCategory, { shouldDirty: true });
    setValue("industryDetail", next.industryDetail, { shouldDirty: true });
    setSaved(false);
  }

  function chooseLogo(file?: File) {
    setError("");
    if (!file) return;
    // Some systems report no MIME type for SVGs, so fall back to the extension; the server checks the bytes.
    const supported = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type) || /\.(png|jpe?g|webp|svg)$/i.test(file.name);
    if (!supported || file.size > 10 * 1024 * 1024) {
      setError("Choose a PNG, JPEG, WebP or SVG image under 10 MB.");
      return;
    }
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
    setSaved(false);
    logoPreviewRef.current = URL.createObjectURL(file);
    setLogoPreview(logoPreviewRef.current);
    setValue("logo", file, { shouldDirty: true });
  }

  function clearSelectedLogo() {
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
    logoPreviewRef.current = "";
    setLogoPreview("");
    resetField("logo");
  }

  async function reload() {
    if (!organizationId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/policycraft/organizations/${organizationId}`, { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.organization) throw new Error(result?.error || "Could not reload the organization. Retry or return to Organizations.");
      const next = normalizeStandaloneOrganization(result);
      reset(toFormValues(next));
      setLockVersion(next.lockVersion);
      clearSelectedLogo();
      setSaved(false);
      setConflict(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reload the organization."); }
    finally { setSaving(false); }
  }

  async function submit(values: OrganizationFormValues) {
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    setConflict(false);
    const form = new FormData();
    const { logo, ...organizationProfile } = values;
    form.set("profile", JSON.stringify({ ...organizationProfile, sites: values.sites.map(({ id, location, address, primaryFunction }) => ({ ...(id ? { id } : {}), location: location.trim(), address: address.trim(), primaryFunction: primaryFunction.trim() })) }));
    if (organizationId) form.set("lockVersion", String(lockVersion));
    if (logo instanceof File) form.set("logo", logo);
    try {
      const response = await fetch(organizationId ? `/api/policycraft/organizations/${organizationId}` : "/api/policycraft/admin/organizations", { method: organizationId ? "PATCH" : "POST", body: form });
      const result = await response.json().catch(() => null);
      if (response.status === 409) {
        setConflict(true);
        setError("Someone saved this organization after you opened it. Reload the latest profile before saving again.");
        return;
      }
      if (!response.ok || !result?.organization) throw new Error(result?.error || "Could not save this organization. Check the required fields and try again.");
      if (organizationId) {
        const normalized = normalizeStandaloneOrganization(result);
        setLockVersion(normalized.lockVersion);
        reset(toFormValues(normalized));
        clearSelectedLogo();
        setError("");
        setSaved(true);
      } else {
        router.push(`/admin/organizations/policycraft?created=${result.organization.id}`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this organization."); }
    finally { setSaving(false); }
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    void handleSubmit(submit)(event);
  }

  const backLabel = backHref.startsWith("/manager") ? "Organizations" : "PolicyCraft organizations";
  const hasExistingLogo = Boolean(profile.companyLogo);
  const chosenLogo = logoPreview || imageSource(profile.companyLogo, organizationId);

  return <ApplicationSurface data-pc-workspace="organization-editor" className={styles.surface}>
    <section className={styles.page} aria-labelledby={EDITOR_TITLE_ID}>
      <EditorHero title={organizationId ? "Edit organization details" : "Create organization"} backHref={backHref} backLabel={backLabel} navigation={navigation} />
      <WorkspaceSheet className={styles.sheet}>
        {organizationId && !initial ? <div className={styles.statusLoading} aria-live="polite"><Loader2 size={16} className={styles.spinner} aria-hidden="true" />Loading organization…</div> : <form className={styles.form} onSubmit={submitForm} onChange={() => setSaved(false)} aria-busy={saving}>
          <div className={styles.formBody}>
            <section className={styles.section} aria-labelledby="organization-profile-title">
              <div className={styles.sectionHeading}><h2 id="organization-profile-title">Company profile</h2><span>Required fields marked *</span></div>
              <div className={styles.profileGrid}>
                <label className={styles.field}>Company name<ApplicationInput {...register("name", { required: true, maxLength: 180 })} autoComplete="organization" required maxLength={180} disabled={saving} placeholder="e.g. Acme Manufacturing Ltd." /></label>
                <div className={styles.field}><label htmlFor="organization-sector">Sector <span aria-hidden="true">*</span></label><Controller control={control} name="industry" render={({ field }) => <Combobox id="organization-sector" name={field.name} required ariaLabel="Sector" value={field.value || ""} onValueChange={(value) => setClassification("industry", value)} placeholder="Select or type a sector" options={getSectorOptions()} disabled={saving} />} /></div>
                <div className={styles.field}><label htmlFor="organization-subsector">Subsector <span aria-hidden="true">*</span></label><Controller control={control} name="subCategory" render={({ field }) => <Combobox id="organization-subsector" name={field.name} required ariaLabel="Subsector" value={field.value || ""} onValueChange={(value) => setClassification("subCategory", value)} placeholder={profile.industry ? "Select or type a subsector" : "Select a sector first"} options={getSubsectorOptions(profile.industry || "")} disabled={saving || !profile.industry} />} /></div>
                <div className={styles.field}><label htmlFor="organization-industry-detail">Industry</label><Controller control={control} name="industryDetail" render={({ field }) => <Combobox id="organization-industry-detail" name={field.name} ariaLabel="Industry" value={field.value || ""} onValueChange={(value) => setClassification("industryDetail", value)} placeholder={profile.industry && profile.subCategory ? "Select or type an industry" : "Select a sector and subsector first"} options={getIndustryOptions(profile.industry || "", profile.subCategory || "")} disabled={saving || !profile.industry || !profile.subCategory} />} /></div>
                <label className={styles.field}>Country<ApplicationInput {...register("country", { required: true, maxLength: 100 })} autoComplete="country-name" required maxLength={100} disabled={saving} placeholder="e.g. India" /></label>
                <label className={styles.field}>Website<ApplicationInput {...register("websiteLink", { required: true, maxLength: 255 })} type="url" autoComplete="url" required maxLength={255} disabled={saving} placeholder="https://example.com" /></label>
                <fieldset className={styles.periodField}><legend>Financial reporting period <span aria-hidden="true">*</span></legend><Controller control={control} name="reportingPeriod" render={({ field }) => <><input type="hidden" name={field.name} required value={field.value} readOnly /><div className={styles.periodControl} role="group" aria-label="Financial reporting period">{(["FY", "CY"] as const).map((period) => {
                  const selected = field.value === period;
                  return <button key={period} type="button" aria-pressed={selected} disabled={saving} onClick={() => { field.onChange(period); setSaved(false); }} className={`${styles.periodButton} ${selected ? styles.periodSelected : ""}`}>{selected ? <SelectionPill layoutId="organization-reporting-period" /> : null}{period === "FY" ? "Financial year (FY)" : "Calendar year (CY)"}</button>;
                })}</div></>} /></fieldset>
                <div className={styles.logoField}><span className={styles.fieldLabel}>Company logo</span><div className={styles.logoRow}>{chosenLogo ? <Image src={chosenLogo} alt="Company logo preview" width={64} height={44} unoptimized className={styles.logoPreview} /> : null}<label className={styles.fileButton}><Upload size={14} aria-hidden="true" />{profile.logo || hasExistingLogo ? "Replace logo" : "Upload logo"}<input {...logoRegistration} name="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.svg" required={!hasExistingLogo && !profile.logo} disabled={saving} className={styles.visuallyHidden} onChange={(event) => chooseLogo(event.currentTarget.files?.[0])} /></label><span className={styles.hint}>PNG, JPEG, WebP or SVG · up to 10 MB</span></div></div>
              </div>
            </section>

            <section className={styles.sitesSection} aria-labelledby="organization-sites-title">
              <div className={styles.sitesHeading}>
                <div><h2 id="organization-sites-title"><MapPin size={16} aria-hidden="true" />Operating sites</h2><p>Add at least one location covered by future policies.</p></div>
                <ApplicationButton type="button" variant="primary" size="md" className={`${styles.ctaButton} ${styles.addSite}`} onClick={() => { siteFields.append({ location: "", address: "", primaryFunction: "" }); setSaved(false); }} disabled={saving} leadingIcon={<Plus size={14} aria-hidden="true" />}>Add site</ApplicationButton>
              </div>
              <div className={styles.siteList}>{siteFields.fields.map((site, index) => <motion.fieldset key={site.fieldKey} className={styles.siteRow} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: WS_EASE }}>
                <legend className={styles.visuallyHidden}>Operating site {index + 1}</legend>
                <label className={styles.field}>Location / unit<ApplicationInput {...register(`sites.${index}.location`, { required: true, maxLength: 180 })} required maxLength={180} disabled={saving} placeholder="e.g. Surat manufacturing unit" /></label>
                <label className={styles.field}>Address<ApplicationInput {...register(`sites.${index}.address`, { required: true, maxLength: 500 })} autoComplete="street-address" required maxLength={500} disabled={saving} placeholder="Full site address" /></label>
                <label className={styles.field}>Primary function<ApplicationInput {...register(`sites.${index}.primaryFunction`, { required: true, maxLength: 180 })} required maxLength={180} disabled={saving} placeholder="e.g. Manufacturing" /></label>
                <div className={styles.removeCell}><button type="button" aria-label={`Remove operating site ${index + 1}`} title="Remove site" disabled={saving || siteFields.fields.length <= 1} onClick={() => { siteFields.remove(index); setSaved(false); }}><Trash2 size={15} aria-hidden="true" /></button></div>
              </motion.fieldset>)}</div>
            </section>
          </div>

          {error ? <div className={styles.formError}><div className={styles.error} role="alert" aria-live="polite"><p>{error}</p>{conflict ? <button type="button" onClick={() => void reload()} disabled={saving}>Reload latest profile</button> : null}</div></div> : null}

          <div className={styles.formFooter}>
            <p className={styles.status} aria-live="polite">{saving ? <><Loader2 size={14} className={styles.spinner} aria-hidden="true" />Saving organization…</> : saved ? <><Check size={14} aria-hidden="true" />Organization details saved.</> : "Your changes apply to policies created after they are saved."}</p>
            <div className={styles.footerActions}>
              <Link href={backHref} className={styles.cancelLink}>Cancel</Link>
              <ApplicationButton type="submit" variant="primary" size="lg" className={`${styles.ctaButton} ${styles.submitButton}`} disabled={saving} busy={saving} busyLabel="Saving…">{organizationId ? "Save organization" : "Create organization"}</ApplicationButton>
            </div>
          </div>
        </form>}
      </WorkspaceSheet>
    </section>
  </ApplicationSurface>;
}
