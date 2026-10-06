/** Public workspace contracts. Roles here never change shared ESG roles. */
export type PolicyCraftRole = "admin" | "manager" | "user";

export type PolicyCraftOrganization = {
  id: number;
  code: string;
  name: string;
  source: "esg" | "standalone";
  deleted: boolean;
  expired: boolean;
};

export type PolicyCraftActorSummary = {
  id: string;
  name: string;
  email: string;
  role: PolicyCraftRole;
};

export type PolicyCraftAccess = {
  actor: PolicyCraftActorSummary;
  organizations: PolicyCraftOrganization[];
  homeHref: string;
};

export type PolicyCraftManagerSummary = {
  id: string;
  name: string;
  email: string;
  status: "active" | "disabled" | "pending" | "delivery_failed";
  organizations: PolicyCraftOrganization[];
  policyCount: number;
  invitationId?: string;
  expiresAt?: string;
};

/** Browser context is a selector only; every server request reauthorizes it. */
export type PolicyCraftWorkspaceScope = {
  userId: string;
  role: PolicyCraftRole;
  organizationId: number;
  organizationName: string;
  documentId?: string;
  readOnly?: boolean;
};
