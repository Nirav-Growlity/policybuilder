"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { Combobox, Field } from "@/components/ui/input";
import { INDUSTRY_SECTORS } from "@/lib/constants";
import { getIndustrySubsectorOptions } from "@/lib/focus-area-catalog";

export type StandaloneOrganizationSite = { id?: string; location: string; address: string; primaryFunction: string };
export type StandaloneOrganizationProfile = {
  name: string;
  industry: string;
  subCategory: string;
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
    country: String(company.country ?? ""),
    websiteLink: String(company.websiteLink ?? ""),
    reportingPeriod: company.reportingPeriod === "CY" ? "CY" : "FY",
    sites: Array.isArray(company.sites) ? company.sites as StandaloneOrganizationSite[] : [],
    companyLogo: typeof company.companyLogo === "string" ? company.companyLogo : undefined,
  };
}

const emptyProfile: StandaloneOrganizationProfile = {
  name: "", industry: "", subCategory: "", country: "", websiteLink: "", reportingPeriod: "FY", sites: [{ location: "", address: "", primaryFunction: "" }],
};

function imageSource(reference: string | undefined, organizationId?: number) {
  if (!reference || reference.startsWith("data:") || /^https?:\/\//i.test(reference)) return reference || "";
  const path = reference.startsWith("/") ? reference : `/api/policycraft/cover-assets/${encodeURIComponent(reference)}`;
  if (!organizationId || !path.startsWith("/api/policycraft/cover-assets/")) return path;
  const url = new URL(path, "https://policycraft.invalid");
  url.searchParams.set("orgId", String(organizationId));
  return `${url.pathname}${url.search}`;
}

export function StandaloneOrganizationEditor({ organizationId, initial, backHref = "/admin/organizations" }: { organizationId?: number; initial?: StandaloneOrganization; backHref?: string }) {
  const router = useRouter();
  const [profile, setProfile] = React.useState<StandaloneOrganizationProfile>(initial ? {
    name: initial.name || "", industry: initial.industry || "", subCategory: initial.subCategory || "", country: initial.country || "", websiteLink: initial.websiteLink || "", reportingPeriod: initial.reportingPeriod || "FY", sites: initial.sites?.length ? initial.sites.map((site) => ({ ...site })) : [{ location: "", address: "", primaryFunction: "" }], companyLogo: initial.companyLogo,
  } : emptyProfile);
  const [lockVersion, setLockVersion] = React.useState(initial?.lockVersion ?? 1);
  const [logo, setLogo] = React.useState<File | null>(null);
  const [logoPreview, setLogoPreview] = React.useState("");
  const logoPreviewRef = React.useRef("");
  const [error, setError] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);

  React.useEffect(() => () => {
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
  }, []);

  function update<K extends keyof StandaloneOrganizationProfile>(key: K, value: StandaloneOrganizationProfile[K]) {
    setSaved(false);
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function setSite(index: number, key: keyof StandaloneOrganizationSite, value: string) {
    setSaved(false);
    setProfile((current) => ({ ...current, sites: current.sites.map((site, siteIndex) => siteIndex === index ? { ...site, [key]: value } : site) }));
  }

  function chooseLogo(file?: File) {
    setError("");
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 10 * 1024 * 1024) {
      setError("Choose a PNG, JPEG or WebP image under 10 MB.");
      return;
    }
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
    setSaved(false);
    logoPreviewRef.current = URL.createObjectURL(file);
    setLogoPreview(logoPreviewRef.current);
    setLogo(file);
  }

  function clearSelectedLogo() {
    if (logoPreviewRef.current) URL.revokeObjectURL(logoPreviewRef.current);
    logoPreviewRef.current = "";
    setLogoPreview("");
    setLogo(null);
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
      setProfile({ name: next.name, industry: next.industry, subCategory: next.subCategory, country: next.country, websiteLink: next.websiteLink, reportingPeriod: next.reportingPeriod, sites: next.sites, companyLogo: next.companyLogo });
      setLockVersion(next.lockVersion);
      clearSelectedLogo();
      setSaved(false);
      setConflict(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not reload the organization."); }
    finally { setSaving(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    setConflict(false);
    const form = new FormData();
    form.set("profile", JSON.stringify({ ...profile, sites: profile.sites.map(({ id, location, address, primaryFunction }) => ({ ...(id ? { id } : {}), location: location.trim(), address: address.trim(), primaryFunction: primaryFunction.trim() })) }));
    if (organizationId) form.set("lockVersion", String(lockVersion));
    if (logo) form.set("logo", logo);
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
        const saved = normalizeStandaloneOrganization(result);
        setLockVersion(saved.lockVersion);
        setProfile({ name: saved.name, industry: saved.industry, subCategory: saved.subCategory, country: saved.country, websiteLink: saved.websiteLink, reportingPeriod: saved.reportingPeriod, sites: saved.sites, companyLogo: saved.companyLogo });
        clearSelectedLogo();
        setError("");
        setSaved(true);
      } else {
        router.push(`/admin/organizations?created=${result.organization.id}`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this organization."); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-5xl">
    <nav aria-label="Breadcrumb"><Link href={backHref} className="inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-forest)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]"><ArrowLeft size={14} aria-hidden="true" />Organizations</Link></nav>
    <div className="mt-4"><p className="text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--color-forest)]">PolicyCraft organization</p><h1 className="mt-1 text-pretty font-display text-3xl font-semibold tracking-tight">{organizationId ? "Edit organization details" : "Create organization"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-muted)]">Company details set the defaults for new policies. Existing policies keep their saved details.</p></div>
    {organizationId && !initial ? <div className="mt-8 flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-white p-4 text-sm text-[var(--color-muted)]" aria-live="polite"><Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />Loading organization…</div> : <form className="mt-6 overflow-hidden rounded-xl border border-[var(--color-line)] bg-white" onSubmit={(event) => void submit(event)} aria-busy={saving}>
      <div className="p-5 sm:p-7">
        <section aria-labelledby="organization-profile-title"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="organization-profile-title" className="text-base font-semibold">Company profile</h2><span className="text-xs text-[var(--color-muted)]">All fields required</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--color-ink-2)]">Company name<input name="name" autoComplete="organization" required maxLength={180} value={profile.name} onChange={(event) => update("name", event.target.value)} disabled={saving} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)] disabled:opacity-60" placeholder="e.g. Acme Manufacturing Ltd." /></label>
          <Field label="Industry sector" required><Combobox id="organization-industry" name="industry" required ariaLabel="Industry sector" value={profile.industry} onValueChange={(value) => setProfile((current) => ({ ...current, industry: value, subCategory: current.industry === value ? current.subCategory : "" }))} placeholder="Select or type a sector" options={INDUSTRY_SECTORS} disabled={saving} /></Field>
          <Field label="Industry sub-category" required><Combobox id="organization-subcategory" name="subCategory" required ariaLabel="Industry sub-category" value={profile.subCategory} onValueChange={(value) => update("subCategory", value)} placeholder={profile.industry ? "Select or type a sub-category" : "Select an industry sector first"} options={getIndustrySubsectorOptions(profile.industry)} disabled={saving || !profile.industry} /></Field>
          <label className="text-xs font-semibold text-[var(--color-ink-2)]">Country<input name="country" autoComplete="country-name" required maxLength={100} value={profile.country} onChange={(event) => update("country", event.target.value)} disabled={saving} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)] disabled:opacity-60" placeholder="e.g. India" /></label>
          <label className="text-xs font-semibold text-[var(--color-ink-2)]">Website<input name="websiteLink" type="url" autoComplete="url" required maxLength={255} value={profile.websiteLink} onChange={(event) => update("websiteLink", event.target.value)} disabled={saving} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-forest)] disabled:opacity-60" placeholder="https://example.com" /></label>
          <fieldset><legend className="text-xs font-semibold text-[var(--color-ink-2)]">Financial reporting period <span className="text-red-700">*</span></legend><input type="hidden" name="reportingPeriod" required value={profile.reportingPeriod} readOnly /><div className="mt-1.5 flex min-h-11 overflow-hidden rounded-lg border border-[var(--color-line-2)]" role="group" aria-label="Financial reporting period">{(["FY", "CY"] as const).map((period) => <button key={period} type="button" aria-pressed={profile.reportingPeriod === period} disabled={saving} onClick={() => update("reportingPeriod", period)} className={`min-h-11 flex-1 px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[var(--color-forest)] disabled:opacity-60 ${profile.reportingPeriod === period ? "bg-[var(--color-forest)] text-white" : "bg-white text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)]"}`}>{period === "FY" ? "Financial year (FY)" : "Calendar year (CY)"}</button>)}</div></fieldset>
          <Field label="Company logo" required={!profile.companyLogo}><div className="flex min-h-11 flex-wrap items-center gap-3">{(logoPreview || imageSource(profile.companyLogo, organizationId)) ? <Image src={logoPreview || imageSource(profile.companyLogo, organizationId)} alt="Company logo preview" width={64} height={44} unoptimized className="h-11 w-16 rounded border border-[var(--color-line)] bg-white object-contain" /> : null}<label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-xs font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-within:outline focus-within:outline-2 focus-within:outline-[var(--color-forest)]"><Upload size={14} aria-hidden="true" />{logo || profile.companyLogo ? "Replace logo" : "Upload logo"}<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" required={!profile.companyLogo && !logo} disabled={saving} className="sr-only" onChange={(event) => chooseLogo(event.currentTarget.files?.[0])} /></label><span className="text-xs text-[var(--color-muted)]">PNG, JPEG or WebP · up to 10 MB</span></div></Field>
        </div></section>
        <section className="mt-8 border-t border-[var(--color-line)] pt-6" aria-labelledby="organization-sites-title"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h2 id="organization-sites-title" className="flex items-center gap-2 text-base font-semibold"><MapPin size={16} className="text-[var(--color-forest)]" aria-hidden="true" />Operating sites</h2><p className="mt-1 text-sm text-[var(--color-muted)]">Add at least one location covered by future policies.</p></div><button type="button" disabled={saving} onClick={() => update("sites", [...profile.sites, { location: "", address: "", primaryFunction: "" }])} className="inline-flex min-h-10 items-center gap-2 self-start rounded-lg bg-[var(--color-forest)] px-3.5 text-xs font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60"><Plus size={14} aria-hidden="true" />Add site</button></div>
          <div className="mt-4 space-y-3">{profile.sites.map((site, index) => <fieldset key={site.id ?? index} className="grid gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-cream-2)]/40 p-4 sm:grid-cols-12"><legend className="sr-only">Operating site {index + 1}</legend><label className="text-xs font-semibold text-[var(--color-ink-2)] sm:col-span-3">Location / unit<input name={`sites[${index}].location`} required maxLength={180} value={site.location} onChange={(event) => setSite(index, "location", event.target.value)} disabled={saving} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60" placeholder="e.g. Surat manufacturing unit" /></label><label className="text-xs font-semibold text-[var(--color-ink-2)] sm:col-span-5">Address<input name={`sites[${index}].address`} autoComplete="street-address" required maxLength={500} value={site.address} onChange={(event) => setSite(index, "address", event.target.value)} disabled={saving} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60" placeholder="Full site address" /></label><label className="text-xs font-semibold text-[var(--color-ink-2)] sm:col-span-3">Primary function<input name={`sites[${index}].primaryFunction`} required maxLength={180} value={site.primaryFunction} onChange={(event) => setSite(index, "primaryFunction", event.target.value)} disabled={saving} className="mt-1.5 h-11 w-full rounded-lg border border-[var(--color-line-2)] bg-white px-3 text-sm font-normal focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60" placeholder="e.g. Manufacturing" /></label><div className="flex justify-end sm:col-span-1 sm:items-end"><button type="button" aria-label={`Remove operating site ${index + 1}`} title="Remove site" disabled={saving || profile.sites.length <= 1} onClick={() => update("sites", profile.sites.filter((_, siteIndex) => siteIndex !== index))} className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--color-muted)] hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-not-allowed disabled:opacity-30"><Trash2 size={15} aria-hidden="true" /></button></div></fieldset>)}</div>
        </section>
      </div>
      {error ? <div className="mx-5 mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:mx-7" role="alert" aria-live="polite"><p>{error}</p>{conflict ? <button type="button" onClick={() => void reload()} disabled={saving} className="mt-2 inline-flex min-h-9 items-center rounded-md px-2 text-xs font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-forest)] disabled:opacity-60">Reload latest profile</button> : null}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] bg-[var(--color-cream-2)]/60 px-5 py-4 sm:px-7"><p className="text-xs text-[var(--color-muted)]" aria-live="polite">{saving ? "Saving organization…" : saved ? "Organization details saved." : "Your changes apply to policies created after they are saved."}</p><div className="flex flex-wrap gap-2"><Link href={backHref} className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-line-2)] bg-white px-4 text-sm font-semibold text-[var(--color-ink-2)] hover:bg-[var(--color-cream-2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)]">Cancel</Link><button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-forest)] px-4 text-sm font-semibold text-white hover:bg-[var(--color-forest-deep)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-forest)] disabled:cursor-wait disabled:opacity-55">{saving ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{saving ? "Saving…" : organizationId ? "Save organization" : "Create organization"}</button></div></div>
    </form>}</div>;
}
