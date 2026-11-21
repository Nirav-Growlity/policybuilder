import type { Policy } from "../types";

// Pure checks for "Load existing policy": whether a parsed document still belongs
// to the draft on screen, and whether an undo is still safe. Kept out of the
// builder component so they can be tested.

export interface DraftIdentity {
  draftId: string | null;
  backendDocumentId: string | null;
}

/**
 * Whether `now` is the draft `before` was taken from. A scope key only names the
 * user and organization, so two drafts of one organization are told apart here.
 * A new policy gains its backend id once it is created; that is the same draft.
 */
export function sameDraftIdentity(before: DraftIdentity, now: DraftIdentity): boolean {
  // The builder remounts when the URL's draft changes (BuilderClient keys on it),
  // so a new policy that gets saved and named in the URL also drops a pending load
  // through the unmount guard. This check can therefore treat a null-to-id change as the same draft.
  return before.draftId === now.draftId && (before.backendDocumentId === null || before.backendDocumentId === now.backendDocumentId);
}

/** The touched fields as one comparable string. Policy objects are replaced on every store update, so identity is no test of "unchanged". */
export function touchedFieldsSnapshot(policy: Policy, keys: readonly (keyof Policy)[]): string {
  return JSON.stringify(keys.map((key) => policy[key] ?? null));
}

/** The patch that puts the touched fields back to what `previous` had, leaving every other field alone. */
export function revertPatch(previous: Policy, keys: readonly (keyof Policy)[]): Partial<Policy> {
  return Object.fromEntries(keys.map((key) => [key, previous[key]])) as Partial<Policy>;
}
