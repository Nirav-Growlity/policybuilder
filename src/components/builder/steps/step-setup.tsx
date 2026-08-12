"use client";

import * as React from "react";
import { useBuilder, makeSamplePolicy, makeTemplatePolicy } from "@/lib/store";
import { STANDARDS, INDUSTRY_SECTORS, INDUSTRY_SUBSECTORS, FRAMEWORK_ALIGNMENT } from "@/lib/constants";
import { Panel, Badge, InfoBar } from "@/components/ui/panel";
import { Combobox, Field, Input, Textarea } from "@/components/ui/input";
import { Tag } from "@/components/ui/tag";
import { Icon } from "@/components/icons";
import { getCompanySites, type Site } from "@/lib/types";
import { Building2, Award, Sparkles, Info as InfoIcon, MapPin, Plus, Trash2, Upload } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { PolicyPreview } from "@/components/policy/policy-preview";
import { CompanyInfoForm } from "@/components/builder/company-info-form";

export function StepSetup() {
  const { policy, updatePolicy } = useBuilder();
  const { push } = useToast();
  const co = policy.company;
  const [aiBusy, setAiBusy] = React.useState(false);
  const [showPreview, setShowPreview] = React.useState(false);

  const fillCompany = async () => {
    setAiBusy(true);
    try {
      const ctx = {
        type: "all" as const,
        policy: {
          ...policy,
          company: {
            ...co,
            name: co.name || "Acme Specialty Chemicals Pvt. Ltd.",
            industry: co.industry || "Specialty chemicals manufacturing",
            site:
              co.site ||
              "Plot 14, Sector 4, IMT Manesar, Gurugram - 122051, Haryana, India",
            docNum: co.docNum || "ASC-ENV-001",
            effectiveDate: co.effectiveDate || "2025-01-15",
            reviewDate: co.reviewDate || "2027-01-14",
            approver: co.approver || "Managing Director",
          },
        },
      };
      push("Sample company details loaded", "info");
    } catch (e) {
      push("Failed to load", "error");
    } finally {
      setAiBusy(false);
    }
  };

  const [showCompanyDetails, setShowCompanyDetails] = React.useState(false);

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-xl border border-[var(--color-line)] bg-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-forest-soft)] text-[var(--color-forest)] flex items-center justify-center">
            <Building2 size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-semibold text-[var(--color-ink)]">
                {co.name || "Acme Specialty Chemicals Pvt. Ltd."}
              </h3>
              <span className="text-[10.5px] font-mono uppercase bg-[var(--color-paper)] text-[var(--color-muted)] px-2 py-0.5 rounded border border-[var(--color-line)]">
                Universal Info
              </span>
            </div>
            <p className="text-[12px] text-[var(--color-muted)] mt-0.5">
              {[co.industry, co.country, co.docNum ? `Doc: ${co.docNum}` : null].filter(Boolean).join(" · ") || "Universal company details configured"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCompanyDetails((prev) => !prev)}
          className="text-[12px] font-semibold text-[var(--color-forest)] hover:underline cursor-pointer flex items-center gap-1 shrink-0"
        >
          {showCompanyDetails ? "Hide company details ▲" : "Edit universal company details ▼"}
        </button>
      </div>

      {showCompanyDetails && <CompanyInfoForm />}

      <Panel
        title="Sustainability standards to align with"
        description="Pick the frameworks your policy should reference."
        icon={<Award size={17} strokeWidth={1.8} />}
        actions={
          <Badge variant="muted">
            {policy.standards.length} selected
          </Badge>
        }
      >
        <div className="flex flex-wrap gap-2">
          {STANDARDS.map((s) => {
            const matching = policy.standards.find((x) => x === s || x.includes(`(${s})`) || x.includes(s));
            const sel = !!matching;
            return (
              <Tag
                key={s}
                selected={sel}
                onClick={() => {
                  updatePolicy((p) => ({
                    standards: sel ? p.standards.filter((x) => x !== matching) : [...p.standards, s],
                  }));
                }}
              >
                {s}
              </Tag>
            );
          })}
        </div>
        <p className="text-[12px] text-[var(--color-muted)] mt-4">
          Selected:{" "}
          <span className="text-[var(--color-ink-2)] font-medium">
            {policy.standards.length ? policy.standards.join(", ") : "None"}
          </span>
        </p>
        <div className="mt-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)] mb-1.5">Dynamic framework alignment</p>
          <ul className="space-y-1 text-[12px] text-[var(--color-ink-2)]">
            {policy.standards.filter((standard) => FRAMEWORK_ALIGNMENT[standard]).map((standard) => <li key={standard}>• {FRAMEWORK_ALIGNMENT[standard]}</li>)}
            {!policy.standards.some((standard) => FRAMEWORK_ALIGNMENT[standard]) && <li>Select a framework to see the relevant policy coverage.</li>}
          </ul>
        </div>
      </Panel>

      <Panel
        title="Next: document structure"
        description="After saving company details, use the Document Structure step to rename, hide, and arrange the final policy outline."
        icon={<Sparkles size={17} strokeWidth={1.8} />}
      >
        <div className="flex items-center justify-between gap-4 py-2"><p className="text-[12.5px] text-[var(--color-ink-2)]">Choose the final Corporate or Modern output format in the Preview & Export step.</p><span className="text-[11px] font-semibold text-[var(--color-forest)]">Custom outline enabled</span></div>
      </Panel>

      {false && <Panel
        title="Presentation Format & Visual Style"
        description="Choose the table of contents structure and the visual formatting style for the final document."
        icon={<Sparkles size={17} strokeWidth={1.8} />}
        actions={<Badge variant="forest">Format & Style</Badge>}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)] mb-3">1. Select Document Structure</h3>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {[
                { id: "standard", label: "Standard", desc: "Traditional flow" },
                { id: "executive", label: "Executive", desc: "High-level summary" },
                { id: "comprehensive", label: "Comprehensive", desc: "In-depth ESG" },
              ].map((t) => {
                const selected = (policy.presentationTemplate || "standard") === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => updatePolicy(() => ({ presentationTemplate: t.id as any }))}
                    className={`p-4 border rounded-xl cursor-pointer transition-all ${
                      selected
                        ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)]/50 shadow-[0_2px_8px_rgba(26,92,58,0.12)]"
                        : "border-[var(--color-line)] bg-white hover:border-[var(--color-line-2)] hover:shadow-[var(--shadow-lift)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`text-[13px] font-semibold ${selected ? "text-[var(--color-forest)]" : "text-[var(--color-ink)]"}`}>
                        {t.label}
                      </div>
                      {selected && (
                        <div className="w-2 h-2 rounded-full bg-[var(--color-forest)]" />
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-ink-2)] leading-[1.5]">{t.desc}</div>
                  </div>
                );
              })}
            </div>
            
            <h3 className="text-[13px] font-semibold text-[var(--color-ink)] mb-3">2. Select Visual Style</h3>
            <div className="grid grid-cols-1 gap-3 mb-6">
              {[
                { id: "corporate", label: "Corporate", desc: "Formal tables for data" },
                { id: "modern", label: "Modern", desc: "Clean bulleted lists" },
              ].map((t) => {
                const selected = (policy.visualStyle || "corporate") === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => updatePolicy(() => ({ visualStyle: t.id as any }))}
                    className={`p-4 border rounded-xl cursor-pointer transition-all ${
                      selected
                        ? "border-[var(--color-forest)] bg-[var(--color-forest-soft)]/50 shadow-[0_2px_8px_rgba(26,92,58,0.12)]"
                        : "border-[var(--color-line)] bg-white hover:border-[var(--color-line-2)] hover:shadow-[var(--shadow-lift)]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={`text-[13px] font-semibold ${selected ? "text-[var(--color-forest)]" : "text-[var(--color-ink)]"}`}>
                        {t.label}
                      </div>
                      {selected && (
                        <div className="w-2 h-2 rounded-full bg-[var(--color-forest)]" />
                      )}
                    </div>
                    <div className="text-[11px] text-[var(--color-ink-2)] leading-[1.5]">{t.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="bg-white border border-[var(--color-line)] rounded-xl overflow-hidden h-full flex flex-col">
              <div className="bg-[var(--color-cream)] px-4 py-3 border-b border-[var(--color-line)] text-[11px] font-semibold text-[var(--color-ink)] uppercase tracking-wider flex items-center gap-2">
                <Icon name="document" size={14} className="text-[var(--color-forest)]" />
                Table of Contents Preview
              </div>
              <div className="p-6 flex-1 bg-[#fffdf7] font-serif">
                <h4 className="text-[15px] font-bold text-[var(--color-ink)] mb-4 pb-2 border-b-2 border-[var(--color-forest)] inline-block">Table of Contents</h4>
                <ol className="space-y-3 list-none pl-0">
                  <li className="text-[12px] text-[#1f1f1f] flex gap-3"><span className="font-mono text-[var(--color-forest)] font-bold">01.</span> Preface & Declaration</li>
                  <li className="text-[12px] text-[#1f1f1f] flex gap-3"><span className="font-mono text-[var(--color-forest)] font-bold">02.</span> Scope</li>
                  {policy.presentationTemplate !== "executive" && (
                    <li className="text-[12px] text-[#1f1f1f] flex gap-3"><span className="font-mono text-[var(--color-forest)] font-bold">03.</span> Key Focus Areas</li>
                  )}
                  {policy.presentationTemplate === "comprehensive" && (
                    <li className="text-[12px] text-[#1f1f1f] flex gap-3"><span className="font-mono text-[var(--color-forest)] font-bold">04.</span> Qualitative Objectives</li>
                  )}
                  <li className="text-[12px] text-[#1f1f1f] flex gap-3">
                    <span className="font-mono text-[var(--color-forest)] font-bold">
                      {policy.presentationTemplate === "executive" ? "03." : policy.presentationTemplate === "standard" ? "04." : "05."}
                    </span> 
                    Quantitative Targets
                    <span className="text-[9px] ml-2 bg-[var(--color-cream)] px-1.5 py-0.5 rounded text-[var(--color-muted)] font-sans mt-0.5">
                      {policy.visualStyle} format
                    </span>
                  </li>
                  {policy.presentationTemplate !== "standard" && (
                    <li className="text-[12px] text-[#1f1f1f] flex gap-3">
                      <span className="font-mono text-[var(--color-forest)] font-bold">
                        {policy.presentationTemplate === "executive" ? "04." : "06."}
                      </span> 
                      SDG Alignment
                    </li>
                  )}
                  {policy.presentationTemplate !== "executive" && (
                    <li className="text-[12px] text-[#1f1f1f] flex gap-3">
                      <span className="font-mono text-[var(--color-forest)] font-bold">
                        {policy.presentationTemplate === "standard" ? "05." : "07."}
                      </span> 
                      Responsibilities
                      <span className="text-[9px] ml-2 bg-[var(--color-cream)] px-1.5 py-0.5 rounded text-[var(--color-muted)] font-sans mt-0.5">
                        {policy.visualStyle} format
                      </span>
                    </li>
                  )}
                  <li className="text-[12px] text-[#1f1f1f] flex gap-3"><span className="font-mono text-[var(--color-forest)] font-bold">{policy.presentationTemplate === "executive" ? "05." : policy.presentationTemplate === "standard" ? "06." : "08."}</span> Review Mechanism</li>
                  <li className="text-[12px] text-[#1f1f1f] flex gap-3"><span className="font-mono text-[var(--color-forest)] font-bold">{policy.presentationTemplate === "executive" ? "06." : policy.presentationTemplate === "standard" ? "07." : "09."}</span> Employee Acknowledgement Form</li>
                </ol>
              </div>
              <div className="p-4 bg-[var(--color-cream)] border-t border-[var(--color-line)]">
                <button 
                  onClick={() => setShowPreview(true)}
                  className="w-full py-2.5 bg-white border border-[var(--color-forest)] text-[var(--color-forest)] rounded-lg font-medium text-[12px] hover:bg-[var(--color-forest-soft)] transition-colors shadow-sm"
                >
                  View Full Document Preview
                </button>
              </div>
            </div>
          </div>
        </div>
      </Panel>}

      <Modal open={showPreview} onClose={() => setShowPreview(false)} width={800} title="Live Document Preview">
        <div className="max-h-[70vh] overflow-y-auto scrollbar-thin bg-gray-50 border border-[var(--color-line)] rounded-xl p-6">
          <PolicyPreview policy={{ ...makeTemplatePolicy(), presentationTemplate: policy.presentationTemplate, visualStyle: policy.visualStyle }} />
        </div>
      </Modal>

      <div className="text-[12px] text-[var(--color-muted)] text-center pt-2">
        <kbd className="px-1.5 py-0.5 rounded border border-[var(--color-line-2)] bg-[var(--color-paper)] font-mono text-[11px]">
          Continue
        </kbd>{" "}
        to proceed to declaration & scope.
      </div>
    </div>
  );
}
