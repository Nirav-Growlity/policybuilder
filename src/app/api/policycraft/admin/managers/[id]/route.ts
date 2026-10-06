import { NextResponse } from "next/server";
import { getPolicyCraftAdminResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { updatePolicyCraftManager } from "@/lib/policycraft-access-repository";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid manager id." }, { status: 400 });
  const body = await request.json().catch(() => null) as { organizationIds?: unknown; active?: unknown; addOrganizationId?: unknown } | null;
  const hasAddition = body?.addOrganizationId !== undefined;
  if (hasAddition && (body?.organizationIds !== undefined || body?.active !== undefined)) {
    return NextResponse.json({ error: "addOrganizationId cannot be combined with organizationIds or active." }, { status: 400 });
  }
  if (!body || (!hasAddition && body.organizationIds === undefined && typeof body.active !== "boolean")) {
    return NextResponse.json({ error: "Provide addOrganizationId, organizationIds, or active." }, { status: 400 });
  }
  if (hasAddition && (!Number.isSafeInteger(body.addOrganizationId) || Number(body.addOrganizationId) <= 0)) {
    return NextResponse.json({ error: "addOrganizationId must be a positive integer." }, { status: 400 });
  }
  if (body.organizationIds !== undefined && (!Array.isArray(body.organizationIds) || body.organizationIds.some((value) => !Number.isInteger(value) || Number(value) <= 0))) {
    return NextResponse.json({ error: "organizationIds must contain positive integer ids." }, { status: 400 });
  }
  try {
    const updated = await updatePolicyCraftManager(id, Number(actor.user.id), {
      ...(body.organizationIds !== undefined ? { organizationIds: body.organizationIds as number[] } : {}),
      ...(typeof body.active === "boolean" ? { active: body.active } : {}),
      ...(hasAddition ? { addOrganizationId: Number(body.addOrganizationId) } : {}),
    });
    return updated ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Manager not found." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update manager." }, { status: 400 });
  }
}
