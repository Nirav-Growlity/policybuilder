import { POLICY_PROFILES } from "./constants";
import { normalizePolicyQuantitative } from "./quantitative";
import type { AuthorApprovalRenderData } from "./document-render-model";
import type { Policy } from "./types";

export class PolicyExportError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

type ExportActor = { user: { id: string; name: string; email: string } };
export type PolicyExportPorts<Actor extends ExportActor> = {
  actor: () => Promise<Actor | null>;
  organization: (actor: Actor, options: { organizationId?: number; documentId?: string; operation: "read" }) => Promise<{ organization: { id: number } } | null>;
  assets: (policy: Policy, organizationId: number) => Promise<Policy>;
  signature: (userId: string) => Promise<{ bytes: Buffer } | null>;
};

/** Shared authorization boundary for PDF/Word, independent of either renderer. */
export async function prepareAuthorizedPolicyExport<Actor extends ExportActor>(
  payload: unknown,
  ports: PolicyExportPorts<Actor>,
): Promise<{ policy: Policy; authorApproval?: AuthorApprovalRenderData; cacheScope: string }> {
  const actor = await ports.actor();
  if (!actor) throw new PolicyExportError(401, "Sign in to export a policy.");
  if (!payload || typeof payload !== "object") throw new PolicyExportError(400, "A policy is required.");
  const body = payload as Record<string, unknown>;
  const policy = body.policy as Policy | undefined;
  if (!policy || typeof policy !== "object" || !policy.company || typeof policy.company !== "object" || !Object.hasOwn(POLICY_PROFILES, policy.policyType)) {
    throw new PolicyExportError(400, "A valid policy is required.");
  }
  let organizationId: number | undefined;
  if (body.orgId !== undefined) {
    if ((typeof body.orgId !== "number" && typeof body.orgId !== "string") || String(body.orgId).trim() === "") {
      throw new PolicyExportError(400, "Choose a valid organization.");
    }
    organizationId = Number(body.orgId);
    if (!Number.isSafeInteger(organizationId) || organizationId <= 0) throw new PolicyExportError(400, "Choose a valid organization.");
  }
  const documentId = body.documentId;
  if (documentId !== undefined && (typeof documentId !== "string" || !documentId.trim() || documentId.length > 128)) {
    throw new PolicyExportError(400, "A valid document identifier is required.");
  }
  const scope = await ports.organization(actor, { organizationId, documentId: documentId as string | undefined, operation: "read" });
  if (!scope) throw new PolicyExportError(403, "You no longer have access to this organization's policy.");

  let authorApproval: AuthorApprovalRenderData | undefined;
  if (body.includeAuthorSignature === true) {
    const date = body.authorSignatureDate;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new PolicyExportError(400, "Choose a valid author signature date.");
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new PolicyExportError(400, "Choose a valid author signature date.");
    const signature = await ports.signature(actor.user.id);
    if (!signature) throw new PolicyExportError(404, "Save a signature before applying it.");
    authorApproval = {
      displayName: actor.user.name.trim() || actor.user.email,
      date,
      signatureDataUrl: `data:image/png;base64,${signature.bytes.toString("base64")}`,
    };
  }
  const resolved = await ports.assets(policy, scope.organization.id);
  return { policy: normalizePolicyQuantitative(resolved), cacheScope: `${actor.user.id}:${scope.organization.id}`, ...(authorApproval ? { authorApproval } : {}) };
}
