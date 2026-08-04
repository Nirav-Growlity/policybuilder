"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Policy, StepId } from "./types";
import { FOCUS_AREAS_DEFAULT, RESPONSIBILITIES_DEFAULT } from "./constants";

const initialPolicy = (): Policy => ({
  policyType: "environmental",
  presentationTemplate: "standard",
  visualStyle: "corporate",
  company: {
    name: "",
    industry: "",
    site: "",
    docNum: "",
    revNum: "01",
    effectiveDate: "",
    reviewDate: "",
    approver: "",
  },
  standards: ["GRI", "SDGs", "ISO 14001"],
  declaration: { preface: "", declaration: "", scope: "" },
  focusAreas: [...FOCUS_AREAS_DEFAULT],
  qualitative: {},
  quantitative: [],
  sdgs: [],
  responsibilities: RESPONSIBILITIES_DEFAULT.map((r) => ({ ...r })),
  monitoring: "",
  reviewMechanism: "",
});

interface BuilderState {
  step: StepId;
  policy: Policy;
  hydrated: boolean;
  setStep: (s: StepId) => void;
  next: () => void;
  prev: () => void;
  updatePolicy: (updater: (p: Policy) => Partial<Policy> | void) => void;
  setPolicy: (p: Policy) => void;
  reset: () => void;
  loadSample: () => void;
}

export function getStepOrder(tpl?: string): StepId[] {
  if (tpl === "executive") {
    return ["setup", "declaration", "quantitative", "sdg", "export"];
  }
  if (tpl === "standard") {
    return ["setup", "declaration", "focus", "quantitative", "responsibilities", "export"];
  }
  // comprehensive
  return [
    "setup",
    "declaration",
    "focus",
    "qualitative",
    "quantitative",
    "sdg",
    "responsibilities",
    "export",
  ];
}

export const useBuilder = create<BuilderState>()(
  persist(
    (set, get) => ({
      step: "setup",
      policy: initialPolicy(),
      hydrated: false,
      setStep: (s) => set({ step: s }),
      next: () => {
        const order = getStepOrder(get().policy.presentationTemplate);
        const i = order.indexOf(get().step);
        if (i < order.length - 1) set({ step: order[i + 1] });
      },
      prev: () => {
        const order = getStepOrder(get().policy.presentationTemplate);
        const i = order.indexOf(get().step);
        if (i > 0) set({ step: order[i - 1] });
      },
      updatePolicy: (updater) => {
        const current = get().policy;
        const patch = updater(current);
        set({ policy: patch ? { ...current, ...patch } : current });
      },
      setPolicy: (p) => set({ policy: p }),
      reset: () => set({ policy: initialPolicy(), step: "setup" }),
      loadSample: () => {
        const sample = makeSamplePolicy();
        set({ policy: sample, step: "export" });
      },
    }),
    {
      name: "policycraft-builder-v1",
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          };
        }
        return window.localStorage;
      }),
      partialize: (s) => ({ step: s.step, policy: s.policy }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    }
  )
);

export const ALL_STEPS: StepId[] = [
  "setup",
  "declaration",
  "focus",
  "qualitative",
  "quantitative",
  "sdg",
  "responsibilities",
  "export",
];

export function makeSamplePolicy(): Policy {
  return {
    policyType: "environmental",
    presentationTemplate: "comprehensive",
    visualStyle: "modern",
    company: {
      name: "Acme Specialty Chemicals Pvt. Ltd.",
      industry: "Specialty chemicals manufacturing",
      site: "Plot 14, Sector 4, IMT Manesar, Gurugram - 122051, Haryana, India",
      docNum: "ASC-ENV-001",
      revNum: "01",
      effectiveDate: "2025-01-15",
      reviewDate: "2027-01-14",
      approver: "Managing Director",
    },
    standards: ["GRI", "SDGs", "EcoVadis", "ISO 14001", "BRSR"],
    declaration: {
      preface:
        "Acme Specialty Chemicals Pvt. Ltd. is committed to environmental stewardship across every facility, process and product. As a manufacturer of specialty intermediates, we recognize our responsibility to minimize ecological impact, conserve natural resources and operate in line with internationally recognized environmental standards. This Environmental Policy establishes the framework through which we set objectives, allocate resources and measure progress toward a more sustainable future.",
      declaration:
        "Acme Specialty Chemicals affirms its unwavering commitment to protecting the environment, preventing pollution, and continually improving its environmental performance. The Company will comply with all applicable legal requirements, reduce its carbon and water intensity, manage waste responsibly, and integrate environmental considerations into every business decision.",
      scope:
        "This Environmental Policy applies to all operations, sites and activities of Acme Specialty Chemicals Pvt. Ltd., including manufacturing, R&D, warehousing, logistics, and corporate functions. It covers all employees, contractors, suppliers and visitors acting on behalf of the Company.",
    },
    focusAreas: [...FOCUS_AREAS_DEFAULT],
    qualitative: {
      "Energy Consumption & GHG Emissions": [
        "Improve energy efficiency across all manufacturing operations and reduce absolute Scope 1 and Scope 2 GHG emissions year-on-year.",
        "Increase the share of renewable electricity in our total energy mix and procure credible renewable energy certificates where feasible.",
        "Maintain an energy management system aligned with ISO 50001 and disclose progress in our annual sustainability report.",
      ],
      "Air Emissions Control": [
        "Operate and maintain air pollution control equipment to keep all stack emissions well below regulatory limits.",
        "Monitor fugitive emissions through periodic Leak Detection and Repair (LDAR) programs.",
        "Progressively replace high-global-warming-potential process gases with low-GWP alternatives.",
      ],
      "Raw Materials & Resource Efficiency": [
        "Optimize raw material use, increase process yields and reduce process losses through continuous improvement.",
        "Prefer bio-based, recycled and sustainably sourced inputs where technically and commercially viable.",
        "Collaborate with R&D and procurement to design products with reduced environmental footprint.",
      ],
      "Waste Management & Circularity": [
        "Apply the waste hierarchy - prevent, reduce, reuse, recycle, recover, dispose - across all operations.",
        "Achieve diversion of operational waste from landfill through segregation, recycling and co-processing.",
        "Engage with licensed third-party waste processors and maintain auditable manifests for all hazardous waste streams.",
      ],
      "Water Stewardship": [
        "Reduce freshwater withdrawal per unit of production and recycle treated wastewater in suitable applications.",
        "Maintain zero-liquid-discharge compliant treatment systems and conduct periodic third-party water-quality audits.",
        "Conduct site-level water risk assessments using tools such as WRI Aqueduct and respond to high-risk findings.",
      ],
      "Biodiversity & Land Use": [
        "Avoid operating in or near ecologically sensitive areas and conduct biodiversity impact assessments for new projects.",
        "Implement landscaping and habitat programs on owned land to support local flora and fauna.",
        "Engage with local communities and conservation groups on biodiversity stewardship initiatives.",
      ],
      "Climate Risk & Emergency Preparedness": [
        "Identify, assess and mitigate climate-related physical and transition risks as part of enterprise risk management.",
        "Maintain site-level emergency response plans for spills, releases and natural events, and conduct regular drills.",
        "Disclose climate-related risks and opportunities aligned with TCFD recommendations.",
      ],
      "Product End-of-Life & Environmental Stewardship": [
        "Apply life-cycle thinking to product design and provide customers with end-of-life and disposal guidance.",
        "Extend producer responsibility by participating in take-back and recycling programs where applicable.",
        "Continuously improve packaging to reduce material use and increase recycled content.",
      ],
    },
    quantitative: [
      {
        area: "Energy Consumption & GHG Emissions",
        targets: [
          { target: "Reduce specific energy consumption (kWh per tonne of product) by 15%", baseline: "FY 2022-23", deadline: "FY 2029-30" },
          { target: "Reduce absolute Scope 1 + Scope 2 GHG emissions by 30%", baseline: "FY 2022-23", deadline: "FY 2030-31" },
          { target: "Source 50% of electricity from renewables", baseline: "FY 2024-25", deadline: "FY 2028-29" },
        ],
      },
      {
        area: "Water Stewardship",
        targets: [
          { target: "Reduce specific freshwater withdrawal by 25%", baseline: "FY 2022-23", deadline: "FY 2029-30" },
          { target: "Recycle / reuse 70% of process wastewater", baseline: "FY 2022-23", deadline: "FY 2028-29" },
        ],
      },
      {
        area: "Waste Management & Circularity",
        targets: [
          { target: "Achieve 95% diversion of operational waste from landfill", baseline: "FY 2022-23", deadline: "FY 2028-29" },
          { target: "Reduce hazardous waste generation per unit by 20%", baseline: "FY 2022-23", deadline: "FY 2029-30" },
        ],
      },
      {
        area: "Air Emissions Control",
        targets: [
          { target: "Maintain zero exceedance of statutory air emission limits", baseline: "FY 2022-23", deadline: "Ongoing" },
          { target: "Replace 100% of high-GWP refrigerants with low-GWP alternatives", baseline: "FY 2024-25", deadline: "FY 2028-29" },
        ],
      },
    ],
    sdgs: [6, 7, 12, 13, 14, 15, 17],
    responsibilities: RESPONSIBILITIES_DEFAULT.map((r) => ({ ...r })),
    monitoring:
      "Environmental performance is monitored continuously through a centralized EHS dashboard, with KPIs reviewed monthly by site leadership and quarterly by the Executive Committee. Independent third-party audits are conducted annually for ISO 14001 and as required by customers. Findings, progress against targets, and incidents are reported in the annual Sustainability Report prepared in line with GRI Standards and BRSR.",
    reviewMechanism:
      "This Policy is reviewed every two years or earlier if there are significant changes in operations, regulations, or stakeholder expectations. The EHS team initiates the review, the Executive Committee approves revisions, and updated versions are communicated to all employees and relevant stakeholders. Feedback collected through employee engagement, customer audits and investor dialogues is incorporated into each revision.",
  };
}

export function makeTemplatePolicy(): Policy {
  return {
    policyType: "environmental",
    presentationTemplate: "comprehensive",
    visualStyle: "modern",
    company: {
      name: "[Company Name]",
      industry: "[Industry]",
      site: "[Site Address]",
      docNum: "[DOC-001]",
      revNum: "[01]",
      effectiveDate: "[YYYY-MM-DD]",
      reviewDate: "[YYYY-MM-DD]",
      approver: "[Approver Title]",
    },
    standards: ["GRI", "SDGs", "ISO 14001"],
    declaration: {
      preface:
        "[Company Name] is committed to environmental stewardship across every facility, process and product. We recognize our responsibility to minimize ecological impact, conserve natural resources and operate in line with internationally recognized environmental standards.",
      declaration:
        "[Company Name] affirms its unwavering commitment to protecting the environment, preventing pollution, and continually improving its environmental performance.",
      scope:
        "This Environmental Policy applies to all operations, sites and activities of [Company Name]. It covers all employees, contractors, suppliers and visitors acting on behalf of the Company.",
    },
    focusAreas: ["[Focus Area 1]", "[Focus Area 2]", "[Focus Area 3]"],
    qualitative: {
      "[Focus Area 1]": [
        "[Qualitative objective 1 related to Focus Area 1]",
        "[Qualitative objective 2 related to Focus Area 1]",
      ],
      "[Focus Area 2]": [
        "[Qualitative objective 1 related to Focus Area 2]",
      ],
    },
    quantitative: [
      {
        area: "[Focus Area 1]",
        targets: [
          { target: "[Specific target to reduce/increase metric]", baseline: "[Baseline Year]", deadline: "[Target Year]" },
          { target: "[Another quantitative target]", baseline: "[Baseline Year]", deadline: "[Target Year]" },
        ],
      },
    ],
    sdgs: [12, 13],
    responsibilities: [
      { role: "[Role 1]", duty: "[Responsibility for Role 1]" },
      { role: "[Role 2]", duty: "[Responsibility for Role 2]" },
    ],
    monitoring:
      "[Monitoring and Reporting framework describing how often KPIs are reviewed and by whom.]",
    reviewMechanism:
      "[Review mechanism describing how frequently the policy is updated and the process for doing so.]",
  };
}
