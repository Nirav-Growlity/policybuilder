import { getPolicyCraftAdminResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import {
  isValidTransferEmail,
  lookupPolicyCraftAdminTransferRecipient,
  normalizeTransferEmail,
  PolicyCraftAdminTransferError,
  transferPolicyCraftAdministrator,
} from "@/lib/policycraft-admin-transfer";
import { policyCraftAdminTransferRepository } from "@/lib/policycraft-admin-transfer-repository";
import { verifyPolicyCraftPasswordHash } from "@/lib/policycraft-password";

type RequestBody = {
  action?: unknown;
  email?: unknown;
  recipientId?: unknown;
  confirmed?: unknown;
  password?: unknown;
};

function transferErrorResponse(error: PolicyCraftAdminTransferError): Response {
  const status = error.code === "ACTOR_UNAUTHORIZED" ? 401
    : error.code === "INVALID_PASSWORD" ? 403
      : error.code === "RECIPIENT_NOT_FOUND" ? 404
        : 409;
  return Response.json({ code: error.code, error: error.message }, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const { actor, response } = await getPolicyCraftAdminResult();
  if (!actor) return response || Response.json({ error: "Unauthorized" }, { status: 401 });

  const mutationFailure = policyCraftMutationFailure(request, "json");
  if (mutationFailure) return mutationFailure;

  const body = await request.json().catch(() => null) as RequestBody | null;
  if (!body || (body.action !== "lookup" && body.action !== "transfer") || typeof body.email !== "string") {
    return Response.json({ error: "Provide a valid action and email address." }, { status: 400 });
  }
  const email = normalizeTransferEmail(body.email);
  if (!isValidTransferEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    if (body.action === "lookup") {
      const recipient = await lookupPolicyCraftAdminTransferRecipient(
        policyCraftAdminTransferRepository,
        Number(actor.user.id),
        email,
      );
      return Response.json({ recipient }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (typeof body.recipientId !== "string" || body.confirmed !== true || typeof body.password !== "string" || !body.password) {
      return Response.json({ error: "Confirm the reviewed recipient and enter your current administrator password." }, { status: 400 });
    }
    const recipient = await transferPolicyCraftAdministrator(policyCraftAdminTransferRepository, {
      actorId: Number(actor.user.id),
      email,
      recipientId: body.recipientId,
      confirmed: true,
      password: body.password,
    }, verifyPolicyCraftPasswordHash);
    return Response.json({ transferred: true, recipient }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PolicyCraftAdminTransferError) return transferErrorResponse(error);
    return Response.json({ error: "Could not complete the administrator transfer." }, { status: 500 });
  }
}
