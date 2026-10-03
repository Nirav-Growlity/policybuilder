import { getPolicyCraftAdminResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { findSharedAccountByEmail, createPolicyCraftManagerInvitation, listPolicyCraftManagers, listPolicyCraftOrganizations } from "@/lib/policycraft-access-repository";
import { sendPolicyCraftManagerInvitation } from "@/lib/policycraft-invitation-mail";
import { normalizePolicyCraftEmail } from "@/lib/policycraft-access-policy";

export async function GET() {
  const auth = await getPolicyCraftAdminResult();
  if (auth.response) return auth.response;
  const { managers, organizations } = await listPolicyCraftManagers();
  return Response.json({ managers, organizations }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const auth = await getPolicyCraftAdminResult();
  if (auth.response) return auth.response;
  const requestFailure = policyCraftMutationFailure(request, "json");
  if (requestFailure) return requestFailure;
  const body = await request.json().catch(() => null) as {
    name?: unknown; email?: unknown; organizationIds?: unknown; linkExisting?: unknown;
  } | null;
  if (!body || typeof body.name !== "string" || !body.name.trim() || typeof body.email !== "string"
    || !Array.isArray(body.organizationIds) || body.organizationIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)
    || (body.linkExisting !== undefined && typeof body.linkExisting !== "boolean")) {
    return Response.json({ error: "Name, email, and one or more valid organization IDs are required." }, { status: 400 });
  }
  const email = normalizePolicyCraftEmail(body.email);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const existing = await findSharedAccountByEmail(email);
  if (existing && body.linkExisting !== true) {
    return Response.json({
      code: "ACCOUNT_EXISTS",
      error: "An account already uses this email. Explicitly link the existing account to continue.",
      existingAccount: { id: String(existing.id), name: existing.name, email: existing.email },
    }, { status: 409 });
  }
  if (existing && (!existing.active || existing.isDeleted)) {
    return Response.json({ code: "ACCOUNT_UNAVAILABLE", error: "The existing account is disabled and cannot be linked." }, { status: 409 });
  }
  if (!existing && body.linkExisting === true) {
    return Response.json({ code: "ACCOUNT_NOT_FOUND", error: "No existing account matches this email." }, { status: 409 });
  }

  try {
    const created = await createPolicyCraftManagerInvitation({
      name: body.name.trim(), email, organizationIds: body.organizationIds as number[], linkExisting: body.linkExisting === true,
    }, Number(auth.actor!.user.id), sendPolicyCraftManagerInvitation);
    if (created.existingAccount && body.linkExisting !== true) {
      return Response.json({
        code: "ACCOUNT_EXISTS",
        error: "An account already uses this email. Explicitly link the existing account to continue.",
        existingAccount: { id: String(created.existingAccount.id), name: created.existingAccount.name, email: created.existingAccount.email },
      }, { status: 409 });
    }
    const allOrganizations = await listPolicyCraftOrganizations();
    const assignedOrganizations = allOrganizations.filter((organization) => created.invitation.organizationIds.includes(organization.id));
    return Response.json({
      manager: {
        id: `pending:${created.invitation.id}`, name: created.invitation.name, email: created.invitation.email,
        status: created.invitation.status, organizations: assignedOrganizations, policyCount: 0,
        invitationId: created.invitation.id, expiresAt: created.invitation.expiresAt,
      },
      invitation: created.invitation,
      delivery: { sent: created.sent },
    }, { status: 201 });
  } catch (error) {
    console.error("PolicyCraft manager invitation creation failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not create manager invitation." }, { status: 400 });
  }
}
