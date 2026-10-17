import { NextResponse } from "next/server";
import {
  getPolicyCraftAuthResult,
  parsePolicyCraftOrganizationSelector,
  type PolicyCraftAuthContext,
} from "./policycraft-auth";
import type { ManualKind } from "./manual-repository";

export const MANUAL_KINDS: readonly ManualKind[] = ["sop", "handbook"];

export function isManualKind(value: unknown): value is ManualKind {
  return typeof value === "string" && (MANUAL_KINDS as readonly string[]).includes(value);
}

/**
 * Resolves who is acting and on which organization, from `?orgId=` and/or a
 * body `orgId`, the same way the policy document routes do. A manual id, when
 * given, must belong to that organization.
 */
export async function resolveManualAuth(
  request: Request,
  options: { manualId?: string; operation: "read" | "write"; bodyOrgId?: unknown; bodyProvidesOrg?: boolean },
): Promise<{ auth: PolicyCraftAuthContext } | { response: Response }> {
  const selector = parsePolicyCraftOrganizationSelector(new URL(request.url).searchParams.get("orgId"));
  if (selector.provided && !selector.valid) {
    return { response: NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 }) };
  }
  let organizationId = selector.provided ? selector.organizationId : undefined;
  if (options.bodyProvidesOrg) {
    const bodyOrgId = options.bodyOrgId;
    if (typeof bodyOrgId !== "number" || !Number.isSafeInteger(bodyOrgId) || bodyOrgId <= 0) {
      return { response: NextResponse.json({ error: "orgId must be a positive integer." }, { status: 400 }) };
    }
    if (organizationId !== undefined && organizationId !== bodyOrgId) {
      return { response: NextResponse.json({ error: "Conflicting organization selectors." }, { status: 400 }) };
    }
    organizationId = bodyOrgId;
  }
  const { auth, response } = await getPolicyCraftAuthResult({
    ...(options.manualId ? { manualId: options.manualId } : {}),
    ...(organizationId ? { organizationId } : {}),
    operation: options.operation,
  });
  if (!auth) {
    return { response: response || NextResponse.json({ error: options.operation === "write" ? "Organization access denied." : "Unauthorized" }, { status: options.operation === "write" ? 403 : 401 }) };
  }
  return { auth };
}

export async function manualMutationResponse(
  result: "updated" | "conflict" | "not_found",
  loadManual: () => Promise<unknown | null>,
): Promise<Response> {
  if (result === "conflict") {
    return NextResponse.json({ error: "This manual changed in another session. Reload before saving." }, { status: 409 });
  }
  if (result === "updated") {
    const manual = await loadManual();
    if (manual) return NextResponse.json({ manual });
  }
  return NextResponse.json({ error: "Manual not found." }, { status: 404 });
}

/** Rejects request bodies that are far larger than any real manual (images live in the asset store). */
export const MAX_MANUAL_JSON_BYTES = 8 * 1024 * 1024;
