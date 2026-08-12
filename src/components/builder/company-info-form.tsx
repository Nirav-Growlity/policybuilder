"use client";

import * as React from "react";
import { useBuilder } from "@/lib/store";
import { INDUSTRY_SECTORS, INDUSTRY_SUBSECTORS } from "@/lib/constants";
import { Panel, Badge } from "@/components/ui/panel";
import { Combobox, Field, Input } from "@/components/ui/input";
import { getCompanySites } from "@/lib/types";
import { Building2, MapPin, Plus, Trash2, Upload } from "lucide-react";

export function CompanyInfoForm() {
  const { policy, updatePolicy } = useBuilder();
  const co = policy.company;

  return (
    <Panel
      title="Company information"
      description="The legal entity, industry and operating site."
      icon={<Building2 size={17} strokeWidth={1.8} />}
      actions={<Badge variant="blue">Required for document header</Badge>}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company name" required>
          <Input
            value={co.name || ""}
            onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, name: e.target.value } }))}
            placeholder="e.g. Acme Specialty Chemicals Pvt. Ltd."
          />
        </Field>
        <Field label="Industry sector">
          <Combobox
            value={co.industry || ""}
            onValueChange={(industry) => updatePolicy((p) => ({ company: { ...p.company, industry, subCategory: p.company.industry === industry ? p.company.subCategory : "" } }))}
            placeholder="Select or type a sector"
            options={INDUSTRY_SECTORS}
          />
        </Field>
        <Field label="Industry sub-category">
          <Combobox
            value={co.subCategory || ""}
            onValueChange={(subCategory) => updatePolicy((p) => ({ company: { ...p.company, subCategory } }))}
            placeholder={co.industry ? "Select or type a sub-category" : "Select an industry sector first"}
            options={INDUSTRY_SUBSECTORS[co.industry] || []}
            disabled={!co.industry}
          />
        </Field>
        <Field label="Country">
          <Input
            value={co.country || ""}
            onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, country: e.target.value } }))}
            placeholder="e.g. India"
          />
        </Field>
        <Field label="Website link">
          <Input
            type="url"
            value={co.websiteLink || ""}
            onChange={(e) => updatePolicy((p) => ({ company: { ...p.company, websiteLink: e.target.value } }))}
            placeholder="https://www.company.com"
          />
        </Field>
        <Field label="Financial reporting period">
          <div className="flex rounded-lg border border-[var(--color-line)] overflow-hidden h-10">
            {(["FY", "CY"] as const).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => updatePolicy((p) => ({ company: { ...p.company, reportingPeriod: period } }))}
                className={`flex-1 text-[12px] font-semibold transition-colors cursor-pointer ${
                  (co.reportingPeriod || "FY") === period
                    ? "bg-[var(--color-forest)] text-white"
                    : "bg-white text-[var(--color-ink-2)] hover:bg-[var(--color-cream)]"
                }`}
              >
                {period === "FY" ? "Financial Year (FY)" : "Calendar Year (CY)"}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Company logo">
          <div className="flex items-center gap-3 h-10">
            {co.companyLogo ? (
              <img src={co.companyLogo} alt="Company logo" className="h-9 w-14 object-contain rounded border border-[var(--color-line)] bg-white" />
            ) : null}
            <label className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg border border-[var(--color-line-2)] bg-white text-[12px] font-medium text-[var(--color-ink-2)] cursor-pointer hover:bg-[var(--color-cream)]">
              <Upload size={14} /> {co.companyLogo ? "Replace logo" : "Upload logo"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = () => updatePolicy((p) => ({ company: { ...p.company, companyLogo: String(reader.result) } }));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {co.companyLogo ? <button type="button" onClick={() => updatePolicy((p) => ({ company: { ...p.company, companyLogo: "" } }))} className="text-[11px] text-red-600 cursor-pointer">Remove</button> : null}
          </div>
        </Field>
      </div>

      <div className="mt-6 pt-5 border-t border-[var(--color-line)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-[13.5px] font-semibold text-[var(--color-ink)] flex items-center gap-1.5">
              <MapPin size={15} className="text-[var(--color-forest)] shrink-0" />
              Site Coverage / Operating Sites
            </h4>
            <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
              Add all units, facilities, R&D centers, or operating sites covered by this policy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const currentSites = getCompanySites(co);
              const updated = [
                ...currentSites,
                { location: "", address: "", primaryFunction: "" },
              ];
              updatePolicy((p) => ({
                company: {
                  ...p.company,
                  sites: updated,
                  site: updated[0]?.address || "",
                },
              }));
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-[var(--color-forest)] text-white text-[12px] font-medium hover:bg-[var(--color-forest-hover)] transition-colors shadow-sm self-start sm:self-auto cursor-pointer"
          >
            <Plus size={14} /> Add site row
          </button>
        </div>

        {getCompanySites(co).length === 0 ? (
          <div className="p-4 text-center border border-dashed border-[var(--color-line-2)] rounded-xl bg-[var(--color-paper)] text-[var(--color-muted)] text-[12.5px]">
            No sites added yet. Click <strong>&quot;Add site row&quot;</strong> to specify operational locations.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="hidden md:grid grid-cols-12 gap-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              <div className="col-span-3">Location / Unit</div>
              <div className="col-span-5">Address</div>
              <div className="col-span-3">Primary Function</div>
              <div className="col-span-1 text-center">Action</div>
            </div>

            {getCompanySites(co).map((siteItem, idx) => {
              const sitesList = getCompanySites(co);
              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2.5 p-3 rounded-xl bg-[var(--color-cream-2)]/50 border border-[var(--color-line)] items-center"
                >
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] uppercase font-semibold text-[var(--color-muted)] block mb-1 md:hidden">
                      Location / Unit
                    </label>
                    <Input
                      value={siteItem.location || ""}
                      onChange={(e) => {
                        const updated = sitesList.map((s, i) =>
                          i === idx ? { ...s, location: e.target.value } : s
                        );
                        updatePolicy((p) => ({
                          company: {
                            ...p.company,
                            sites: updated,
                            site: updated[0]?.address || "",
                          },
                        }));
                      }}
                      placeholder="e.g. Sachin Unit 1"
                      className="bg-white text-[12.5px]"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-5">
                    <label className="text-[10px] uppercase font-semibold text-[var(--color-muted)] block mb-1 md:hidden">
                      Address
                    </label>
                    <Input
                      value={siteItem.address || ""}
                      onChange={(e) => {
                        const updated = sitesList.map((s, i) =>
                          i === idx ? { ...s, address: e.target.value } : s
                        );
                        updatePolicy((p) => ({
                          company: {
                            ...p.company,
                            sites: updated,
                            site: updated[0]?.address || "",
                          },
                        }));
                      }}
                      placeholder="e.g. Plot No. 8109, GIDC Sachin, Surat, Gujarat"
                      className="bg-white text-[12.5px]"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] uppercase font-semibold text-[var(--color-muted)] block mb-1 md:hidden">
                      Primary Function
                    </label>
                    <Input
                      value={siteItem.primaryFunction || ""}
                      onChange={(e) => {
                        const updated = sitesList.map((s, i) =>
                          i === idx ? { ...s, primaryFunction: e.target.value } : s
                        );
                        updatePolicy((p) => ({
                          company: {
                            ...p.company,
                            sites: updated,
                            site: updated[0]?.address || "",
                          },
                        }));
                      }}
                      placeholder="e.g. Manufacturing Site"
                      className="bg-white text-[12.5px]"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-1 flex justify-end md:justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        const updated = sitesList.filter((_, i) => i !== idx);
                        updatePolicy((p) => ({
                          company: {
                            ...p.company,
                            sites: updated,
                            site: updated[0]?.address || "",
                          },
                        }));
                      }}
                      className="p-1.5 rounded-lg text-[var(--color-muted)] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                      title="Delete site"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </Panel>
  );
}
