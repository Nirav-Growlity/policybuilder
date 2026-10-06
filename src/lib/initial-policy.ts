import type { Policy, PolicyType } from "./types";
import { REVISION_HISTORY_DEFAULT, getPolicyProfile } from "./constants";
import { DEFAULT_DOCUMENT_THEME_ID } from "./document-themes";
import { normalizePolicyStructure } from "./sections";

export const initialPolicy = (policyType: PolicyType = "environmental"): Policy => {
  const profile = getPolicyProfile(policyType);
  return normalizePolicyStructure({
    policyType,
    documentTemplate: DEFAULT_DOCUMENT_THEME_ID,
    documentTheme: DEFAULT_DOCUMENT_THEME_ID,
    visualStyle: "corporate",
    brandColorSource: "logo",
    showTableOfContents: true,
    showAcknowledgement: true,
    sdgDisplay: "tiles",
    company: {
      name: "",
      industry: "",
      subCategory: "",
      industryDetail: "",
      country: "",
      websiteLink: "",
      companyLogo: "",
      logoPalette: undefined,
      reportingPeriod: "FY",
      site: "",
      sites: [],
      docNum: "",
      revNum: "01",
      effectiveDate: "",
      lastReviewDate: "",
      reviewDate: "",
      reviewFrequency: "Yearly",
      approver: "",
      reviewerDesignations: [],
    },
    standards: [],
    declaration: { preface: "", declaration: "", scope: "" },
    focusAreas: [...profile.focusAreas],
    focusAreaSelection: { mode: "profile-default" },
    qualitative: {},
    quantitative: [],
    sdgs: [],
    responsibilities: profile.responsibilities.map((item) => ({ ...item })),
    monitoring: "",
    reviewMechanism: "",
    showRevisionHistory: true,
    revisionHistory: [...REVISION_HISTORY_DEFAULT],
    activeCoverVariant: "manual",
    definitions: policyType === "living-wage" ? {
      title: "Living Wage",
      content: "A living wage is remuneration sufficient to provide a decent standard of living for a worker and their family, considering local conditions and statutory requirements.",
    } : undefined,
  });
};
