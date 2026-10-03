import { getPolicyCraftAdminResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { findSharedAccountByEmail, grantExistingPolicyCraftManagerAccess, createPolicyCraftManagerInvitation, listPolicyCraftManagers, listPolicyCraftOrganizations } from "@/lib/policycraft-access-repository";
import { sendPolicyCraftManagerInvitation } from "@/lib/policycraft-invitation-mail";
import { normalizePolicyCraftEmail } from "@/lib/policycraft-access-policy";
import { ManagerGrantError } from "@/lib/policycraft-manager-grant-workflow";
import { ManagerOnboardingError, onboardPolicyCraftManager } from "@/lib/policycraft-manager-onboarding-workflow";

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
    name?: unknown; email?: unknown; organizationIds?: unknown; linkExisting?: unknown; confirmedExistingAccountId?: unknown;
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
  try {
    const confirmedId = typeof body.confirmedExistingAccountId === "string" && /^\d+$/.test(body.confirmedExistingAccountId)
      ? Number(body.confirmedExistingAccountId)
      : undefined;
    const result = await onboardPolicyCraftManager({
      findAccount: findSharedAccountByEmail,
      async grantExisting(managerEmail, expectedAccountId, organizationIds, adminId) {
        const managerUserId = await grantExistingPolicyCraftManagerAccess(managerEmail, expectedAccountId, organizationIds, adminId);
        const { managers } = await listPolicyCraftManagers();
        const manager = managers.find((item) => item.id === String(managerUserId));
        if (!manager || manager.status !== "active") throw new Error("Granted manager access could not be loaded.");
        return manager;
      },
      inviteNew: (draft, adminId) => createPolicyCraftManagerInvitation(draft, adminId, sendPolicyCraftManagerInvitation),
    }, {
      draft: {
        name: body.name.trim(), email, organizationIds: body.organizationIds as number[],
        linkExisting: body.linkExisting === true, confirmedExistingAccountId: confirmedId,
      },
      grantedByUserId: Number(auth.actor!.user.id),
    });
    if (result.mode === "confirmation_required") {
      return Response.json({
        code: "ACCOUNT_EXISTS",
        error: "An account uses this email. Review the account and confirm before granting manager access.",
        existingAccount: { id: String(result.existingAccount.id), name: result.existingAccount.name, email: result.existingAccount.email },
      }, { status: 409 });
    }
    if (result.mode === "existing") {
      return Response.json({ mode: "existing", manager: result.manager, delivery: { sent: false } }, { status: 200 });
    }
    const created = result;
    const allOrganizations = await listPolicyCraftOrganizations();
    const assignedOrganizations = allOrganizations.filter((organization) => created.invitation.organizationIds.includes(organization.id));
    return Response.json({
      mode: "new",
      manager: {
        id: `pending:${created.invitation.id}`, name: created.invitation.name, email: created.invitation.email,
        status: created.invitation.status, organizations: assignedOrganizations, policyCount: 0,
        invitationId: created.invitation.id, expiresAt: created.invitation.expiresAt,
      },
      invitation: created.invitation,
      delivery: { sent: created.sent },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ManagerOnboardingError) {
      return Response.json({ code: error.code, error: error.message }, { status: 409 });
    }
    if (error instanceof ManagerGrantError) {
      const conflict = ["ACCOUNT_NOT_FOUND", "ACCOUNT_CHANGED", "ACCOUNT_UNAVAILABLE", "ADMIN_ACCOUNT", "MANAGER_DISABLED", "ACCESS_CONFLICT"].includes(error.code);
      return Response.json({ code: error.code, error: error.message }, { status: conflict ? 409 : 400 });
    }
    console.error("PolicyCraft manager onboarding failed", error);
    return Response.json({ error: error instanceof Error ? error.message : "Could not add manager." }, { status: 400 });
  }
}
