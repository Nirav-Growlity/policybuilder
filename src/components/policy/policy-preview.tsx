"use client";

import * as React from "react";
import { getCompanySites, type Policy } from "@/lib/types";
import { SDG_DATA, FRAMEWORK_ALIGNMENT, getPolicyProfile } from "@/lib/constants";
import { normalizePolicyQuantitative } from "@/lib/quantitative";

export function PolicyPreview({ policy: incomingPolicy }: { policy: Policy }) {
  const policy = normalizePolicyQuantitative(incomingPolicy);
  const profile = getPolicyProfile(policy.policyType);
  const co = policy.company;
  const sites = getCompanySites(co);
  const areas = policy.focusAreas.filter(Boolean);
  const qualEntries = Object.entries(policy.qualitative).filter(([, v]) => v && v.length);
  const quantEntries = policy.quantitative.filter((q) => q.targets && q.targets.some((t) => t.target));

  return (
    <article className="bg-[#fffdf7] text-[#1a1a1a] font-serif shadow-[var(--shadow-lift)] rounded-2xl overflow-hidden border border-[var(--color-line)]">
      {/* Cover */}
      <header className="text-center px-12 py-14 border-b-2 border-[var(--color-forest)] relative">
        {co.companyLogo ? <img src={co.companyLogo} alt={`${co.name || "Company"} logo`} className="absolute top-5 left-6 h-12 w-20 object-contain" /> : null}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between text-[10.5px] uppercase tracking-[0.18em] text-[var(--color-muted)] font-sans">
          <span>{profile.label}</span>
          <span className="font-mono normal-case tracking-normal">Doc · {co.docNum || "—"}</span>
        </div>
        <div className="mt-6 mb-4 text-[10.5px] uppercase tracking-[0.24em] text-[var(--color-forest)] font-sans font-semibold">
          Sustainability Policy
        </div>
        <h1 className="font-display text-[40px] font-semibold leading-[1.05] tracking-tight text-[var(--color-ink)]">
          {profile.label}
        </h1>
        <p className="text-[16px] text-[var(--color-ink-2)] mt-3 font-sans">{co.name || "[Company Name]"}</p>
        {(co.industry || co.subCategory || co.country || co.websiteLink) && <p className="text-[10.5px] text-[var(--color-muted)] mt-2 font-sans">{[co.industry, co.subCategory, co.country].filter(Boolean).join(" · ")}{co.websiteLink ? ` · ${co.websiteLink}` : ""}</p>}
        <table className="w-full border-collapse mt-8 font-sans text-[11.5px]">
          <tbody>
            <tr>
              <td className="border border-[var(--color-forest)] bg-[var(--color-forest)] text-white font-semibold px-3 py-2 w-1/4">Document No.</td>
              <td className="border border-[var(--color-forest)] px-3 py-2 w-1/4 text-center">{co.docNum || "—"}</td>
              <td className="border border-[var(--color-forest)] bg-[var(--color-forest)] text-white font-semibold px-3 py-2 w-1/4">Effective Date</td>
              <td className="border border-[var(--color-forest)] px-3 py-2 w-1/4 text-center">{co.effectiveDate || "—"}</td>
            </tr>
            <tr>
              <td className="border border-[var(--color-forest)] bg-[var(--color-forest)] text-white font-semibold px-3 py-2">Revision No.</td>
              <td className="border border-[var(--color-forest)] px-3 py-2 text-center">{co.revNum || "01"}</td>
              <td className="border border-[var(--color-forest)] bg-[var(--color-forest)] text-white font-semibold px-3 py-2">Next Review</td>
              <td className="border border-[var(--color-forest)] px-3 py-2 text-center">{co.reviewDate || "—"}</td>
            </tr>
          </tbody>
        </table>
      </header>
      <div className="px-12 lg:px-16 py-12 space-y-9">
        {policy.declaration.preface && (
          <section>
            <SectionHeading>Preface</SectionHeading>
            {policy.declaration.preface.split(/\r?\n+/).map((p, i) => (
              <p key={i} className="text-[14px] leading-[1.8] text-[#1f1f1f] text-justify mb-3 last:mb-0">{p}</p>
            ))}
          </section>
        )}

        {policy.declaration.declaration && (
          <section>
            <SectionHeading>Policy Declaration</SectionHeading>
            {policy.declaration.declaration.split(/\r?\n+/).map((p, i) => (
              <p key={i} className="text-[14px] leading-[1.8] text-[#1f1f1f] text-justify mb-3 last:mb-0">{p}</p>
            ))}
          </section>
        )}

        {policy.declaration.scope && (
          <section>
            <SectionHeading>Scope</SectionHeading>
            {policy.declaration.scope.split(/\r?\n+/).map((p, i) => (
              <p key={i} className="text-[14px] leading-[1.8] text-[#1f1f1f] text-justify mb-3 last:mb-0">{p}</p>
            ))}
            {sites.length > 0 && (
              <div className="mt-4 border border-[#e5e1d3] rounded-md overflow-hidden font-sans">
                <div className="bg-[#f3eee3] px-4 py-2 font-semibold text-[12px] text-[var(--color-ink)] border-b border-[#e5e1d3]">
                  Site Coverage
                </div>
                <table className="w-full text-[12px]">
                  <thead className="bg-[#fcfaf4]">
                    <tr>
                      <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2 border-b border-[#e5e1d3] w-1/4">Location</th>
                      <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2 border-b border-[#e5e1d3] w-1/2">Address</th>
                      <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2 border-b border-[#e5e1d3] w-1/4">Primary Function</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sites.map((st, i) => (
                      <tr key={i} className="border-b border-[#e5e1d3] last:border-b-0">
                        <td className="px-4 py-2 font-medium">{st.location || co.name || `Site ${i + 1}`}</td>
                        <td className="px-4 py-2">{st.address}</td>
                        <td className="px-4 py-2 text-[var(--color-muted)]">{st.primaryFunction || "Operating Site"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {policy.definitions?.content && (
          <section>
            <SectionHeading>{policy.definitions.title || "Definitions"}</SectionHeading>
            {policy.definitions.content.split(/\r?\n+/).map((p, i) => (
              <p key={i} className="text-[14px] leading-[1.8] text-[#1f1f1f] text-justify mb-3 last:mb-0">{p}</p>
            ))}
          </section>
        )}

        {policy.standards.some((standard) => FRAMEWORK_ALIGNMENT[standard]) && (
          <section>
            <SectionHeading>Framework Alignment</SectionHeading>
            <ul className="space-y-2 list-none pl-0">
              {policy.standards.filter((standard) => FRAMEWORK_ALIGNMENT[standard]).map((standard) => (
                <li key={standard} className="text-[13.5px] leading-[1.7] text-[#1f1f1f]"><strong>{standard}:</strong> {FRAMEWORK_ALIGNMENT[standard]}</li>
              ))}
            </ul>
          </section>
        )}

        {policy.presentationTemplate !== "executive" && areas.length > 0 && (
          <section>
            <SectionHeading>Key Focus Areas</SectionHeading>
            <ol className="space-y-1.5 list-none pl-0">
              {areas.map((a, i) => (
                <li key={i} className="text-[14px] leading-[1.6] text-[#1f1f1f] flex items-start gap-2.5">
                  <span className="font-mono text-[12px] text-[var(--color-forest)] font-semibold mt-0.5 w-7 flex-shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-semibold">{a}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {policy.presentationTemplate === "comprehensive" && qualEntries.length > 0 && (
          <section>
            <SectionHeading>Qualitative Objectives</SectionHeading>
            <div className="space-y-5">
              {qualEntries.map(([k, v], i) => (
                <div key={k}>
                  <h4 className="font-sans text-[13px] font-bold text-[var(--color-ink)] mb-1.5">
                    {i + 1}. {k}
                  </h4>
                  <ul className="space-y-1.5 pl-0 list-none">
                    {v.map((o, j) => (
                      <li key={j} className="text-[13.5px] leading-[1.7] text-[#1f1f1f] flex items-start gap-2">
                        <svg className="w-4 h-4 text-[var(--color-forest)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        <span>{o}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {quantEntries.length > 0 && (
          <section>
            <SectionHeading>Quantitative Targets</SectionHeading>
            <p className="text-[12px] text-[var(--color-muted)] mb-3 font-sans italic">
              Targets are either tracked against a defined period or reported annually as ongoing commitments.
            </p>
            {policy.visualStyle === "modern" ? (
              <div className="space-y-4">
                {quantEntries.map((q, qi) => (
                  <div key={qi}>
                    <h4 className="font-sans text-[13.5px] font-bold text-[#1a1a1a] mb-1">
                      {q.area}
                    </h4>
                    <div className="space-y-2">
                      {q.targets.filter((t) => t.target).map((t, ti) => (
                        <p key={ti} className="text-[13.5px] leading-[1.7] text-[#1f1f1f] m-0">
                          {t.target}{t.reportingFrequency === "Annually" ? " (Reported annually)." : ` (Baseline: ${t.baseline}, Deadline: ${t.deadline}).`}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="font-sans border border-[#e5e1d3] rounded-md overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[var(--color-forest)] text-white">
                    <tr>
                      <th className="text-left font-semibold px-3 py-2 w-10">#</th>
                      <th className="text-left font-semibold px-3 py-2">Focus Area</th>
                      <th className="text-left font-semibold px-3 py-2">Target</th>
                      <th className="text-left font-semibold px-3 py-2">Baseline</th>
                      <th className="text-left font-semibold px-3 py-2">Deadline</th>
                      <th className="text-left font-semibold px-3 py-2">Reporting</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quantEntries.flatMap((q, qi) =>
                      q.targets
                        .filter((t) => t.target)
                        .map((t, ti) => (
                          <tr key={`${qi}-${ti}`} className={ti % 2 === 0 ? "bg-white" : "bg-[#fafaf3]"}>
                            <td className="px-3 py-2 border-t border-[#e5e1d3] align-top font-semibold">
                              {ti === 0 ? qi + 1 : ""}
                            </td>
                            <td className="px-3 py-2 border-t border-[#e5e1d3] align-top font-semibold">
                              {ti === 0 ? q.area : ""}
                            </td>
                            <td className="px-3 py-2 border-t border-[#e5e1d3]">{t.target}</td>
                            <td className="px-3 py-2 border-t border-[#e5e1d3] align-top">{t.reportingFrequency === "Annually" ? "" : t.baseline}</td>
                            <td className="px-3 py-2 border-t border-[#e5e1d3] align-top">{t.reportingFrequency === "Annually" ? "" : t.deadline}</td>
                            <td className="px-3 py-2 border-t border-[#e5e1d3] align-top">{t.reportingFrequency || "Target period"}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {policy.presentationTemplate !== "standard" && policy.sdgs.length > 0 && (
          <section>
            <SectionHeading>SDG Alignment</SectionHeading>
            <p className="text-[13.5px] leading-[1.7] text-[#1f1f1f] font-sans">
              This policy aligns with the following United Nations Sustainable Development Goals:
            </p>
            <div className="flex flex-wrap gap-2 mt-4 font-sans">
              {policy.sdgs.map((n) => {
                const s = SDG_DATA.find((d) => d.n === n)!;
                return (
                  <span
                    key={n}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11.5px] font-semibold border"
                    style={{ background: `${s.c}18`, color: s.c, borderColor: `${s.c}40` }}
                  >
                    <span
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                      style={{ background: s.c }}
                    >
                      {s.n}
                    </span>
                    SDG {s.n}: {s.label}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {policy.presentationTemplate !== "executive" && policy.responsibilities.length > 0 && (
          <section>
            <SectionHeading>Responsibilities</SectionHeading>
            {policy.visualStyle === "modern" ? (
              <div className="space-y-2.5">
                {policy.responsibilities.map((r, i) => (
                  <p key={i} className="text-[13.5px] leading-[1.7] text-[#1f1f1f] m-0">
                    <strong>{r.role}</strong> {r.duty}
                  </p>
                ))}
              </div>
            ) : (
              <div className="font-sans border border-[#e5e1d3] rounded-md overflow-hidden">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-[#f3eee3]">
                    <tr>
                      <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2.5 border-b border-[#e5e1d3] w-[30%]">
                        Role / Department
                      </th>
                      <th className="text-left font-semibold text-[var(--color-ink-2)] px-4 py-2.5 border-b border-[#e5e1d3]">
                        Responsibility
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {policy.responsibilities.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#fafaf3]"}>
                        <td className="px-4 py-2.5 border-t border-[#e5e1d3] font-semibold align-top">{r.role}</td>
                        <td className="px-4 py-2.5 border-t border-[#e5e1d3] align-top">{r.duty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {policy.monitoring && (
          <section>
            <SectionHeading>Monitoring, Reporting & Transparency</SectionHeading>
            {policy.monitoring.split(/\r?\n+/).map((p, i) => (
              <p key={i} className="text-[14px] leading-[1.8] text-[#1f1f1f] text-justify mb-3 last:mb-0">{p}</p>
            ))}
          </section>
        )}

        {policy.reviewMechanism && (
          <section>
            <SectionHeading>Review Mechanism & Continuous Improvement</SectionHeading>
            {policy.reviewMechanism.split(/\r?\n+/).map((p, i) => (
              <p key={i} className="text-[14px] leading-[1.8] text-[#1f1f1f] text-justify mb-3 last:mb-0">{p}</p>
            ))}
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="px-12 lg:px-16 py-8 border-t-2 border-[var(--color-forest)] font-sans text-[11px] text-[var(--color-muted)] flex items-center justify-between">
        <span>Effective Date: {co.effectiveDate || "—"}</span>
        <span className="font-display text-[12px] tracking-wide text-[var(--color-forest)] font-semibold">
          Approved by: {co.approver || "_____________________"}
        </span>
        <span>Revision: {co.revNum || "01"}</span>
      </footer>

      {/* Acknowledgment form (always shown at the end of the doc) */}
      <div className="px-12 lg:px-16 py-10 border-t border-dashed border-[#e5e1d3] font-sans bg-[#fbf9f3]">
        <h3 className="font-display text-[18px] font-semibold text-center mb-1 text-[var(--color-ink)]">
          Employee Acknowledgement Form
        </h3>
        <p className="text-center text-[11px] text-[var(--color-muted)] mb-6">
          {profile.label} · {co.name}
        </p>
        <p className="text-[12.5px] leading-[1.75] text-[#1f1f1f] mb-3">
          I hereby acknowledge that I have read and understood the <strong>{profile.label}</strong> of{" "}
          {co.name || "[Company Name]"}. I am aware of the company's commitment to responsible practices as outlined
          in this policy and agree to uphold these standards in my daily work.
        </p>
        <p className="text-[12.5px] leading-[1.75] text-[#1f1f1f] mb-6">
          By signing below, I confirm my personal commitment to the values and obligations set forth in this policy.
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-5">
          {["Employee Name", "Employee ID", "Department", "Date"].map((f) => (
            <div key={f}>
              <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-1">{f}</div>
              <div className="border-b border-[#b8b3a3] h-7" />
            </div>
          ))}
        </div>
        <div className="mt-5">
          <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted)] font-semibold mb-1">Signature</div>
          <div className="border-b border-[#b8b3a3] h-10" />
        </div>
      </div>
    </article>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="font-sans text-[12.5px] font-bold uppercase tracking-[0.14em] text-[var(--color-forest)] pb-2 border-b border-[#c8e2d2]">
        {children}
      </h2>
    </div>
  );
}
