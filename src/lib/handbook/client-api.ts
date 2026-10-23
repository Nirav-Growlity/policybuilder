/**
 * Browser fetch helpers for employee handbooks. Handbooks share the manuals
 * API with SOP manuals; these wrappers carry the handbook kind and type.
 */
import { getSopManual, manualsUrl, saveSopManual, ManualApiError, ManualConflictError } from "../sop/client-api";
import type { StoredHandbook } from "./store";
import type { HandbookManual } from "./types";

export { ManualConflictError };

export async function createHandbook(orgId: number, input: { title: string; manual: HandbookManual; stage?: string }): Promise<StoredHandbook> {
  const response = await fetch(manualsUrl("", orgId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "handbook", title: input.title, stage: input.stage ?? "write", manual: input.manual, orgId }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new ManualApiError(typeof body?.error === "string" ? body.error : "Could not create the handbook.", response.status);
  }
  return (await response.json() as { manual: StoredHandbook }).manual;
}

/** Without an organization, the server resolves it from the handbook. */
export async function getHandbook(orgId: number | null, id: string): Promise<StoredHandbook> {
  const stored = await getSopManual(orgId, id) as unknown as StoredHandbook;
  if (stored.kind !== "handbook") throw new ManualApiError("This document is not an employee handbook.", 404);
  return stored;
}

export async function saveHandbook(orgId: number, id: string, input: { title: string; stage: string; manual: HandbookManual; lockVersion: number }): Promise<StoredHandbook> {
  return await saveSopManual(orgId, id, input as never) as unknown as StoredHandbook;
}
