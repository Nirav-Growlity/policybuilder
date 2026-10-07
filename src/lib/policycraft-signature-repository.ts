import type { ResultSetHeader, RowDataPacket } from "mysql2";
import sharp from "sharp";
import { policyCraftPool } from "./db";

const MAX_INPUT_BYTES = 1 * 1024 * 1024;
const MAX_STORED_BYTES = 512 * 1024;
const MAX_INPUT_PIXELS = 20_000_000;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 400;

type SignatureRow = RowDataPacket & {
  content: Buffer;
  updated_at: Date | string;
};

export type PolicyCraftSignatureScope = {
  organizationId: number;
  documentId: string;
};

export type StoredPolicyCraftSignature = {
  bytes: Buffer;
  updatedAt: string;
};

export class InvalidSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidSignatureError";
  }
}

function normalizeUserId(userId: string | number): number {
  const parsed = typeof userId === "number" ? userId : Number(userId);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("Invalid PolicyCraft user ID");
  return parsed;
}

function normalizeScope(scope: PolicyCraftSignatureScope): PolicyCraftSignatureScope {
  if (!Number.isSafeInteger(scope.organizationId) || scope.organizationId <= 0) {
    throw new Error("Invalid PolicyCraft organization ID");
  }
  if (typeof scope.documentId !== "string" || !scope.documentId.trim() || scope.documentId.length > 128) {
    throw new Error("Invalid PolicyCraft document ID");
  }
  return { organizationId: scope.organizationId, documentId: scope.documentId.trim() };
}

function toIsoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** Decode and normalize an uploaded PNG into a size-limited transparent PNG. */
export async function normalizePolicyCraftSignature(dataUrl: unknown): Promise<Buffer> {
  if (typeof dataUrl !== "string") throw new InvalidSignatureError("A PNG signature is required.");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new InvalidSignatureError("The signature must be a base64 PNG image.");

  const encoded = match[1];
  const estimatedBytes = Math.floor(encoded.length * 3 / 4) - (encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0);
  if (!estimatedBytes || estimatedBytes > MAX_INPUT_BYTES) {
    throw new InvalidSignatureError("The signature image must be smaller than 1 MB.");
  }

  const input = Buffer.from(encoded, "base64");
  if (input.byteLength !== estimatedBytes || input.toString("base64") !== encoded) {
    throw new InvalidSignatureError("The signature image is not valid base64.");
  }

  try {
    const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const metadata = await image.metadata();
    if (metadata.format !== "png") throw new InvalidSignatureError("The signature must be a PNG image.");
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_INPUT_PIXELS) {
      throw new InvalidSignatureError("The signature image dimensions are too large.");
    }

    const normalized = await image
      .rotate()
      .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: "inside", withoutEnlargement: true })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
    if (normalized.byteLength > MAX_STORED_BYTES) {
      throw new InvalidSignatureError("The normalized signature image must be smaller than 512 KB.");
    }
    return normalized;
  } catch (error) {
    if (error instanceof InvalidSignatureError) throw error;
    throw new InvalidSignatureError("The signature image could not be processed.");
  }
}

export async function getPolicyCraftUserSignature(
  userId: string | number,
  scope: PolicyCraftSignatureScope,
): Promise<StoredPolicyCraftSignature | null> {
  const normalizedScope = normalizeScope(scope);
  const [rows] = await policyCraftPool.execute<SignatureRow[]>(
    `SELECT signature.content, signature.updated_at
       FROM policycraft_user_signatures signature
       INNER JOIN policycraft_documents document
         ON document.id = signature.document_id AND document.org_id = signature.org_id
      WHERE signature.user_id = ?
        AND signature.org_id = ?
        AND signature.document_id = ?
      LIMIT 1`,
    [normalizeUserId(userId), normalizedScope.organizationId, normalizedScope.documentId],
  );
  const row = rows[0];
  if (!row) return null;
  return { bytes: Buffer.from(row.content), updatedAt: toIsoDate(row.updated_at) };
}

export async function savePolicyCraftUserSignature(
  userId: string | number,
  scope: PolicyCraftSignatureScope,
  bytes: Buffer,
): Promise<boolean> {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength === 0 || bytes.byteLength > MAX_STORED_BYTES) {
    throw new InvalidSignatureError("The normalized signature image is invalid.");
  }
  const normalizedScope = normalizeScope(scope);
  const [result] = await policyCraftPool.execute<ResultSetHeader>(
    `INSERT INTO policycraft_user_signatures (user_id, org_id, document_id, content)
     SELECT ?, document.org_id, document.id, ?
       FROM policycraft_documents document
      WHERE document.id = ? AND document.org_id = ?
     ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = CURRENT_TIMESTAMP(3)`,
    [normalizeUserId(userId), bytes, normalizedScope.documentId, normalizedScope.organizationId],
  );
  return result.affectedRows > 0;
}

export async function deletePolicyCraftUserSignature(
  userId: string | number,
  scope: PolicyCraftSignatureScope,
): Promise<void> {
  const normalizedScope = normalizeScope(scope);
  await policyCraftPool.execute<ResultSetHeader>(
    `DELETE FROM policycraft_user_signatures
      WHERE user_id = ? AND org_id = ? AND document_id = ?`,
    [normalizeUserId(userId), normalizedScope.organizationId, normalizedScope.documentId],
  );
}
