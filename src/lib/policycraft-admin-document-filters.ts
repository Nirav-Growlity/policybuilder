export type AdminDocumentFilters = {
  organizationId?: number;
  creatorId?: number;
  policyType?: string;
  archived?: boolean;
};

export function parseAdminDocumentFilters(params: URLSearchParams): AdminDocumentFilters {
  const organizationValue = params.has("organizationId") ? params.get("organizationId") : params.get("orgId");
  const view = params.get("view");
  const archived = params.has("archived")
    ? params.get("archived") === "true"
    : view === "active" ? false : view === "archived" ? true : undefined;
  const organizationId = integer(organizationValue);
  const creatorId = integer(params.get("creatorId"));
  const policyType = params.get("policyType");

  return {
    ...(organizationId ? { organizationId } : {}),
    ...(creatorId ? { creatorId } : {}),
    ...(policyType ? { policyType } : {}),
    ...(archived !== undefined ? { archived } : {}),
  };
}

function integer(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}
