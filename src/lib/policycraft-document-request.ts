import type { PolicyCraftRole } from "./policycraft-access-types";

export type PolicyCraftDocumentAction = "archive" | "restore" | "delete";

/** Retain the existing client archive flag alongside the admin action API. */
export function policyCraftDocumentAction(body: { action?: unknown; archived?: unknown }): PolicyCraftDocumentAction | null {
  if (body.action === "archive" || body.archived === true) return "archive";
  if (body.action === "restore" || body.archived === false) return "restore";
  return body.action === "delete" ? "delete" : null;
}

export function canPerformPolicyCraftDocumentAction(role: PolicyCraftRole, action: PolicyCraftDocumentAction): boolean {
  return action === "archive" || role === "admin" || role === "user";
}

/** Successful saves must return the new document version for the next save. */
export async function policyCraftDocumentMutationResponse(
  result: "updated" | "conflict" | "not_found",
  loadDocument: () => Promise<unknown | null>,
): Promise<Response> {
  if (result === "conflict") return Response.json({ error: "This document changed in another session. Reload before saving." }, { status: 409 });
  if (result === "updated") {
    const document = await loadDocument();
    if (document) return Response.json({ document });
  }
  return Response.json({ error: "Document not found." }, { status: 404 });
}
