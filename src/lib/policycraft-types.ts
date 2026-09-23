import type { ImportedPolicyContext, Policy, PolicyType, StepId } from "./types";

export type PolicyCoverPreviewSnapshot = Pick<Policy,
  | "policyType"
  | "presentationTemplate"
  | "documentTemplate"
  | "documentTheme"
  | "documentThemeOverrides"
  | "templateBrandOverrides"
  | "brandColorSource"
  | "visualStyle"
  | "logoPosition"
  | "typography"
  | "featureImage"
  | "coverComposition"
  | "aiCoverComposition"
  | "activeCoverVariant"
> & {
  company: Pick<Policy["company"], "name" | "companyLogo" | "logoPalette" | "docNum" | "effectiveDate" | "revNum" | "reviewDate">;
};

export type CompanyMasterSite = {
  id: string;
  location: string;
  address: string;
  primaryFunction: string;
};

export type CompanyMasterSnapshot = {
  id: number;
  code: string;
  name: string;
  industry: string;
  subCategory: string;
  country: string;
  websiteLink: string;
  address: string;
  city: string;
  sites: CompanyMasterSite[];
};

export type PolicyCraftDocumentState = {
  step: StepId;
  policy: Policy;
  importedPolicy: ImportedPolicyContext | null;
};

export type PolicyDocumentSummary = {
  id: string;
  title: string;
  policyType: PolicyType;
  currentStep: StepId;
  lockVersion: number;
  updatedAt: string;
  createdAt: string;
  archivedAt: string | null;
  coverPreview?: PolicyCoverPreviewSnapshot;
};

export type StoredPolicyDocument = PolicyDocumentSummary & {
  state: PolicyCraftDocumentState;
};
