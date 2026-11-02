import type { ManualKind } from "./manual-repository";
import { handbookManualSchema } from "./handbook/schema";
import { sopManualSchema } from "./sop/schema";

export type ManualValidation = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

const MAX_SOPS = 120;
const MAX_CHAPTERS = 80;

/** Validates a manual sent by the builder against its kind's schema before it is stored. */
export function validateManualPayload(kind: ManualKind, value: unknown): ManualValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "A manual object is required." };
  }
  if (kind === "sop") {
    const parsed = sopManualSchema.safeParse(value);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `The SOP manual is not valid${issue ? ` at ${issue.path.join(".") || "root"}: ${issue.message}` : "."}` };
    }
    if (parsed.data.sops.length > MAX_SOPS) return { ok: false, error: `An SOP manual can hold at most ${MAX_SOPS} SOPs.` };
    return { ok: true, value: parsed.data as Record<string, unknown> };
  }
  const parsed = handbookManualSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `The employee handbook is not valid${issue ? ` at ${issue.path.join(".") || "root"}: ${issue.message}` : "."}` };
  }
  if (parsed.data.chapters.length > MAX_CHAPTERS) return { ok: false, error: `An employee handbook can hold at most ${MAX_CHAPTERS} chapters.` };
  return { ok: true, value: parsed.data as Record<string, unknown> };
}
