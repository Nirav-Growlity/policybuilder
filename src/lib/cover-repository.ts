import { createHash, randomUUID } from "node:crypto";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import type { CoverComposition, CoverLibrarySource, Policy, PolicyType } from "./types";
import { coverAssetIdFromReference, normalizeCoverComposition } from "./cover-composition";
import type { PolicyCraftAuthContext } from "./policycraft-auth";
import { policyCraftPool } from "./db";

type TemplateRow = RowDataPacket & { id: string; name: string; policy_type: PolicyType | null; composition_json: unknown; preview_asset_id: string | null; lock_version: number; created_by_user_id: number; created_at: Date | string; updated_at: Date | string };
type AssetRow = RowDataPacket & { id: string; mime_type: string; width: number; height: number; content: Buffer };
const iso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const parse = <T>(value: unknown): T => typeof value === "string" ? JSON.parse(value) as T : value as T;
const stableAICoverTemplateId = (orgId: number, policyType: PolicyType, composition: CoverComposition) => {
  const hash = createHash("sha256").update(`${orgId}:${policyType}:${JSON.stringify(composition)}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};

export function assetIdForBytes(bytes: Buffer): string { return createHash("sha256").update(bytes).digest("hex"); }

export async function createCoverAsset(auth: PolicyCraftAuthContext, bytes: Buffer, mimeType: string, width: number, height: number) {
  const hash = assetIdForBytes(bytes);
  const [existing] = await policyCraftPool.execute<AssetRow[]>("SELECT id, mime_type, width, height, content FROM policycraft_cover_assets WHERE org_id = ? AND sha256 = ? AND archived_at IS NULL LIMIT 1", [auth.organization.id, hash]);
  if (existing[0]) return { id: existing[0].id, mimeType: existing[0].mime_type, width: existing[0].width, height: existing[0].height };
  const [usage] = await policyCraftPool.execute<RowDataPacket[]>("SELECT COALESCE(SUM(byte_size), 0) AS total FROM policycraft_cover_assets WHERE org_id = ? AND archived_at IS NULL", [auth.organization.id]);
  if (Number(usage[0]?.total || 0) + bytes.byteLength > 250 * 1024 * 1024) throw new Error("The organization cover asset limit has been reached.");
  const id = randomUUID();
  await policyCraftPool.execute("INSERT INTO policycraft_cover_assets (id, org_id, created_by_user_id, mime_type, width, height, byte_size, sha256, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [id, auth.organization.id, Number(auth.user.id), mimeType, width, height, bytes.byteLength, hash, bytes]);
  return { id, mimeType, width, height };
}

export async function getCoverAsset(orgId: number, id: string) {
  const [rows] = await policyCraftPool.execute<AssetRow[]>("SELECT mime_type, width, height, content FROM policycraft_cover_assets WHERE id = ? AND org_id = ? AND archived_at IS NULL LIMIT 1", [id, orgId]);
  return rows[0] || null;
}

export async function resolveCoverAssets(policy: Policy, orgId: number): Promise<Policy> {
  if (!policy.coverComposition && !policy.aiCoverComposition && !policy.company.companyLogo) return policy;
  const resolve = async (id?: string) => {
    const assetId = coverAssetIdFromReference(id);
    if (!assetId || assetId.startsWith("data:")) return assetId;
    const asset = await getCoverAsset(orgId, assetId);
    return asset ? `data:${asset.mime_type};base64,${asset.content.toString("base64")}` : undefined;
  };
  const companyLogo = await resolve(policy.company.companyLogo);
  const resolveComposition = async (composition: CoverComposition | undefined) => {
    if (!composition) return undefined;
    const backgroundAsset = await resolve(composition.background.assetId);
    const elements = await Promise.all(composition.elements.map(async (element) => {
      if (element.type !== "image" && element.type !== "logo") return element;
      return { ...element, ...(element.assetId ? { assetId: (await resolve(element.assetId)) || element.assetId } : {}) };
    }));
    return { ...composition, background: { ...composition.background, assetId: backgroundAsset }, elements };
  };
  const coverComposition = await resolveComposition(policy.coverComposition);
  const aiCoverComposition = await resolveComposition(policy.aiCoverComposition);
  return {
    ...policy,
    company: { ...policy.company, companyLogo },
    coverComposition,
    aiCoverComposition,
  };
}

export async function listCoverTemplates(orgId: number, source?: CoverLibrarySource, policyType?: PolicyType) {
  const [rows] = await policyCraftPool.execute<TemplateRow[]>("SELECT id, name, policy_type, composition_json, preview_asset_id, lock_version, created_by_user_id, created_at, updated_at FROM policycraft_cover_templates WHERE org_id = ? AND archived_at IS NULL AND (? IS NULL OR policy_type = ?) ORDER BY updated_at DESC", [orgId, policyType || null, policyType || null]);
  return rows.map((row) => {
    const composition = normalizeCoverComposition(parse<CoverComposition>(row.composition_json));
    if (!composition) return null;
    const itemSource: CoverLibrarySource = composition.sourceTemplateId === "ai-generated" ? "ai" : "manual";
    return { id: row.id, name: row.name, ...(row.policy_type ? { policyType: row.policy_type } : {}), composition, previewAssetId: row.preview_asset_id, lockVersion: row.lock_version, createdByUserId: row.created_by_user_id, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), source: itemSource };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item && (!source || item.source === source)));
}

export async function createCoverTemplate(auth: PolicyCraftAuthContext, name: string, composition: CoverComposition, previewAssetId?: string | null, policyType?: PolicyType) {
  const isAICover = composition.sourceTemplateId === "ai-generated" && Boolean(policyType);
  if (isAICover && policyType) {
    const [existingRows] = await policyCraftPool.execute<RowDataPacket[]>("SELECT id, composition_json FROM policycraft_cover_templates WHERE org_id = ? AND policy_type = ? AND archived_at IS NULL", [auth.organization.id, policyType]);
    const compositionJson = JSON.stringify(composition);
    const existing = existingRows.find((row) => {
      const existingComposition = normalizeCoverComposition(parse<CoverComposition>(row.composition_json));
      return existingComposition && JSON.stringify(existingComposition) === compositionJson;
    });
    if (existing?.id) return String(existing.id);
  }
  const id = isAICover && policyType ? stableAICoverTemplateId(auth.organization.id, policyType, composition) : randomUUID();
  try {
    await policyCraftPool.execute("INSERT INTO policycraft_cover_templates (id, org_id, created_by_user_id, name, policy_type, composition_json, preview_asset_id) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?)", [id, auth.organization.id, Number(auth.user.id), name.trim().slice(0, 160), policyType || null, JSON.stringify(composition), previewAssetId || null]);
  } catch (cause) {
    const code = typeof cause === "object" && cause !== null && "code" in cause ? cause.code : undefined;
    if (!isAICover || code !== "ER_DUP_ENTRY") throw cause;
  }
  return id;
}

export async function updateCoverTemplate(auth: PolicyCraftAuthContext, id: string, name: string, composition: CoverComposition, lockVersion: number) {
  const [result] = await policyCraftPool.execute<ResultSetHeader>("UPDATE policycraft_cover_templates SET name = ?, composition_json = CAST(? AS JSON), lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND org_id = ? AND created_by_user_id = ? AND archived_at IS NULL AND lock_version = ?", [name.trim().slice(0, 160), JSON.stringify(composition), id, auth.organization.id, Number(auth.user.id), lockVersion]);
  return result.affectedRows > 0;
}

export async function archiveCoverTemplate(auth: PolicyCraftAuthContext, id: string) {
  const [result] = await policyCraftPool.execute<ResultSetHeader>("UPDATE policycraft_cover_templates SET archived_at = CURRENT_TIMESTAMP(3), updated_at = CURRENT_TIMESTAMP(3) WHERE id = ? AND org_id = ? AND created_by_user_id = ? AND archived_at IS NULL", [id, auth.organization.id, Number(auth.user.id)]);
  return result.affectedRows > 0;
}
