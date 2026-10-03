import { NextResponse } from "next/server";
import { getPolicyCraftAdminResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { updatePolicyCraftManagerInvitation } from "@/lib/policycraft-access-repository";
import { sendPolicyCraftManagerInvitation } from "@/lib/policycraft-invitation-mail";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as {
    action?: unknown; name?: unknown; email?: unknown; organizationIds?: unknown; linkExisting?: unknown;
  } | null;
  if (!body || !["edit", "resend", "cancel"].includes(String(body.action))) {
    return NextResponse.json({ error: "action must be edit, resend, or cancel." }, { status: 400 });
  }
  const action = body.action as "edit" | "resend" | "cancel";
  const draft = action === "edit" ? {
    name: typeof body.name === "string" ? body.name : "",
    email: typeof body.email === "string" ? body.email : "",
    organizationIds: Array.isArray(body.organizationIds) ? body.organizationIds.map(Number) : [],
    linkExisting: body.linkExisting === true,
  } : undefined;
  if (draft && (!draft.name.trim() || !draft.email.includes("@") || draft.organizationIds.some((value) => !Number.isInteger(value) || value <= 0))) {
    return NextResponse.json({ error: "Provide a name, valid email, and organization ids." }, { status: 400 });
  }
  try {
    const result = await updatePolicyCraftManagerInvitation(id, action, Number(actor.user.id), sendPolicyCraftManagerInvitation, draft);
    if (result.existingAccount) return NextResponse.json({ code: "ACCOUNT_EXISTS", error: "This email already belongs to an account.", existingAccount: result.existingAccount }, { status: 409 });
    if (action === "cancel") return NextResponse.json({ ok: true });
    return NextResponse.json({ invitation: result.invitation, delivery: { sent: result.sent } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update invitation.";
    return NextResponse.json({ error: message }, { status: message.includes("not found") ? 404 : 400 });
  }
}
