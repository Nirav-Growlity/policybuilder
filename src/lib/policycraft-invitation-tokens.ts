import { createHash, randomBytes } from "node:crypto";

export function createPolicyCraftInvitationToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashPolicyCraftInvitationToken(token) };
}

export function hashPolicyCraftInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
