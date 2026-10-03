import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getActivePolicyCraftSessionUserId, policyCraftAuthFailure, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import { acceptManagerInvitation, getPolicyCraftInvitation, listPolicyCraftOrganizations } from "@/lib/policycraft-access-repository";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!validToken(token)) return NextResponse.json({ error: "Invitation is invalid." }, { status: 404 });
  const invitation = await getPolicyCraftInvitation(token);
  if (!invitation || invitation.acceptedAt || invitation.cancelledAt || invitation.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Invitation is expired or no longer available." }, { status: 410 });
  }
  const organizations = await listPolicyCraftOrganizations();
  return NextResponse.json({
    invitation: {
      name: invitation.name,
      email: invitation.email,
      expiresAt: invitation.expiresAt.toISOString(),
      mode: invitation.existingUserId ? "existing" : "new",
      organizations: organizations.filter((organization) => invitation.organizationIds.includes(organization.id)),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: RouteContext) {
  const invalid = policyCraftMutationFailure(request);
  if (invalid) return invalid;
  const { token } = await context.params;
  if (!validToken(token)) return NextResponse.json({ error: "Invitation is invalid." }, { status: 404 });
  const body = await request.json().catch(() => null) as { password?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const invitation = await getPolicyCraftInvitation(token);
  if (!invitation) return NextResponse.json({ error: "Invitation is invalid." }, { status: 404 });
  const currentUserId = await getActivePolicyCraftSessionUserId();
  let password: string | undefined;
  if (invitation.existingUserId === null) {
    if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
      return NextResponse.json({ error: "Choose a password between 8 and 128 characters." }, { status: 400 });
    }
    password = body.password;
  } else if (body.password !== undefined) {
    return NextResponse.json({ error: "Sign in to the invited account to accept this link." }, { status: 400 });
  }
  let result: Awaited<ReturnType<typeof acceptManagerInvitation>>;
  try {
    result = await acceptManagerInvitation(token, password, currentUserId || undefined, (value) => bcrypt.hash(value, 10));
  } catch (error) {
    const unavailable = policyCraftAuthFailure(error);
    if (unavailable) return unavailable;
    throw error;
  }
  if (result.status !== "accepted") {
    const statuses = { invalid: 404, expired: 410, already_used: 410, session_mismatch: 403, account_exists: 409 } as const;
    return NextResponse.json({ code: result.status.toUpperCase(), error: invitationError(result.status) }, { status: statuses[result.status] });
  }
  return NextResponse.json({ accepted: true, mode: result.mode, userId: String(result.userId), next: "/login" });
}

function validToken(token: string): boolean { return /^[A-Za-z0-9_-]{40,64}$/.test(token); }
function invitationError(status: "invalid" | "expired" | "already_used" | "session_mismatch" | "account_exists"): string {
  switch (status) {
    case "expired": return "This invitation has expired.";
    case "already_used": return "This invitation has already been used or cancelled.";
    case "session_mismatch": return "Sign in with the email address that received this invitation.";
    case "account_exists": return "An account already uses this email. Ask an administrator to link the existing account.";
    default: return "This invitation is invalid.";
  }
}
