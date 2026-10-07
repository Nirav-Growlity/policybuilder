import type { PolicyCraftActor } from "./policycraft-auth";

export type PolicyCraftSignatureRequestScope = {
  organizationId: number;
  documentId: string;
};

export type ParsedPolicyCraftSignatureScope =
  | { scope: PolicyCraftSignatureRequestScope }
  | { error: string; status?: 400 | 403 };

type SignatureOrganizationResolver = (
  actor: PolicyCraftActor,
  request: PolicyCraftSignatureRequestScope & { operation: "read" | "write" },
) => Promise<{ id: number } | null>;

export async function authorizePolicyCraftSignatureScope(
  actor: PolicyCraftActor,
  url: URL,
  operation: "read" | "write",
  resolveOrganization: SignatureOrganizationResolver,
): Promise<ParsedPolicyCraftSignatureScope> {
  const parsed = parsePolicyCraftSignatureScope(url);
  if ("error" in parsed) return parsed;
  const organization = await resolveOrganization(actor, { ...parsed.scope, operation });
  if (!organization) return { error: "Organization access denied.", status: 403 };
  return { scope: { organizationId: organization.id, documentId: parsed.scope.documentId } };
}

/** Signature operations always identify both the organization and saved policy draft. */
export function parsePolicyCraftSignatureScope(url: URL): ParsedPolicyCraftSignatureScope {
  const organization = url.searchParams.get("orgId");
  if (organization === null || !/^\d+$/.test(organization)) {
    return { error: "Choose a valid organization." };
  }
  const organizationId = Number(organization);
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    return { error: "Choose a valid organization." };
  }

  const documentId = url.searchParams.get("documentId");
  if (documentId === null || !documentId.trim() || documentId.length > 128) {
    return { error: "A valid saved policy identifier is required." };
  }

  return { scope: { organizationId, documentId: documentId.trim() } };
}
