import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

export function hasUsablePolicyCraftPasswordHash(hash: string | null): hash is string {
  return !!hash && (/^[a-f0-9]{64}$/.test(hash) || /^\$2[aby]\$(0[4-9]|[12]\d|3[01])\$[./A-Za-z0-9]{53}$/.test(hash));
}

/** Verify the legacy ESG SHA-256 hashes and current Better Auth bcrypt hashes. */
export async function verifyPolicyCraftPasswordHash(hash: string, password: string): Promise<boolean> {
  if (/^[a-f0-9]{64}$/i.test(hash)) {
    return createHash("sha256").update(password).digest("hex") === hash;
  }
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
