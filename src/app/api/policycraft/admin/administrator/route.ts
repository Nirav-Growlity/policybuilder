import { getPolicyCraftAdminResult, policyCraftMutationFailure } from "@/lib/policycraft-auth";
import {
  addPolicyCraftAdministrator,
  isValidAdminAddEmail,
  lookupPolicyCraftAdminRecipient,
  normalizeAdminAddEmail,
  PolicyCraftAdminAddError,
} from "@/lib/policycraft-admin-add";
import { policyCraftAdminAddRepository } from "@/lib/policycraft-admin-add-repository";
import { verifyPolicyCraftPasswordHash } from "@/lib/policycraft-password";

type RequestBody = {
  action?: unknown;
  email?: unknown;
  recipientId?: unknown;
  confirmed?: unknown;
  password?: unknown;
};

function addErrorResponse(error: PolicyCraftAdminAddError): Response {
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
  if (!body || (body.action !== "lookup" && body.action !== "add") || typeof body.email !== "string") {
    return Response.json({ error: "Provide a valid action and email address." }, { status: 400 });
  }
  const email = normalizeAdminAddEmail(body.email);
  if (!isValidAdminAddEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    if (body.action === "lookup") {
      const recipient = await lookupPolicyCraftAdminRecipient(
        policyCraftAdminAddRepository,
        Number(actor.user.id),
        email,
      );
      return Response.json({ recipient }, { headers: { "Cache-Control": "private, no-store" } });
    }

    if (typeof body.recipientId !== "string" || body.confirmed !== true || typeof body.password !== "string" || !body.password) {
      return Response.json({ error: "Confirm the reviewed account and enter your current administrator password." }, { status: 400 });
    }
    const recipient = await addPolicyCraftAdministrator(policyCraftAdminAddRepository, {
      actorId: Number(actor.user.id),
      email,
      recipientId: body.recipientId,
      confirmed: true,
      password: body.password,
    }, verifyPolicyCraftPasswordHash);
    return Response.json({ added: true, recipient }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof PolicyCraftAdminAddError) return addErrorResponse(error);
    return Response.json({ error: "Could not add the administrator." }, { status: 500 });
  }
}
