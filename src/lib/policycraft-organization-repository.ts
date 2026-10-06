import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { policyCraftPool } from "./db";
import type { PolicyCraftActor, PolicyCraftOrganizationScope } from "./policycraft-auth";
import type { PolicyCraftOrganization } from "./policycraft-access-types";
import type { CompanyMasterSite, CompanyMasterSnapshot } from "./policycraft-types";
import { mapCompanyMaster } from "./policycraft-mapping";

export type OrganizationSource = "esg" | "standalone";
export class PolicyCraftOrganizationsMigrationRequiredError extends Error {
  constructor() {
    super("PolicyCraft organization registry migration is incomplete. Apply src/migrations/2026_10_create_policycraft_organizations.sql and verify its seed completed.");
    this.name = "PolicyCraftOrganizationsMigrationRequiredError";
  }
}
export type StandaloneOrganizationSite = { id?: string; location: string; address: string; primaryFunction: string };
export type StandaloneOrganizationProfile = {
  name: string; industry: string; subCategory: string; industryDetail?: string; country: string; websiteLink: string;
  reportingPeriod: "FY" | "CY"; sites: StandaloneOrganizationSite[]; companyLogo?: string;
};
type Executor = Pick<Pool | PoolConnection, "execute">;
type RegistryRow = RowDataPacket & {
  id: number; source: OrganizationSource; esg_org_id: number | null; lock_version: number;
  profile_json: unknown; org_code: string | null; company_name: string | null; address: string | null;
  country: string | null; city: string | null; website: string | null; sector: string | null; sub_sector: string | null;
  industry?: string | null;
  is_deleted: number | null; expiry_date: Date | string | null;
};

function parseJson<T>(value: unknown): T {
  return typeof value === "string" ? JSON.parse(value) as T : value as T;
}
function expired(value: Date | string | null): boolean {
  return value !== null && new Date(value).getTime() < Date.now();
}
function profileFrom(row: RegistryRow): StandaloneOrganizationProfile | null {
  if (row.source !== "standalone" || row.profile_json == null) return null;
  const profile = parseJson<StandaloneOrganizationProfile>(row.profile_json);
  return { ...profile, industryDetail: profile.industryDetail || "" };
}
const registryJoin = `FROM policycraft_organizations pco
  LEFT JOIN organizations esg ON esg.id = pco.esg_org_id AND pco.source = 'esg'
  LEFT JOIN policycraft_organization_profiles pop ON pop.org_id = pco.id`;
const registrySelect = `SELECT pco.id, pco.source, pco.esg_org_id, pco.lock_version, pop.profile_json,
  esg.org_code, esg.company_name, esg.address, esg.country, esg.city, esg.website,
  esg.sector, esg.sub_sector, esg.industry, esg.is_deleted, esg.expiry_date`;

export const policyCraftOrganizationLookupSql = `SELECT pco.id,
  pco.source,
  CASE WHEN pco.source = 'esg' THEN esg.org_code ELSE CONCAT('PC-', pco.id) END AS org_code,
  CASE WHEN pco.source = 'esg' THEN esg.company_name ELSE JSON_UNQUOTE(JSON_EXTRACT(pop.profile_json, '$.name')) END AS company_name,
  CASE WHEN pco.source = 'esg' THEN COALESCE(esg.is_deleted, 1) ELSE 0 END AS is_deleted,
  CASE WHEN pco.source = 'esg' THEN esg.expiry_date ELSE NULL END AS expiry_date
  FROM policycraft_organizations pco
  LEFT JOIN organizations esg ON esg.id = pco.esg_org_id AND pco.source = 'esg'
  LEFT JOIN policycraft_organization_profiles pop ON pop.org_id = pco.id`;

export async function getPolicyCraftOrganizationRecord(id: number, executor: Executor = policyCraftPool, lock = false): Promise<RegistryRow | null> {
  await requireCompleteSeed(executor);
  const [rows] = await executor.execute<RegistryRow[]>(`${registrySelect} ${registryJoin} WHERE pco.id = ? LIMIT 1${lock ? " FOR UPDATE" : ""}`, [id]);
  const row = rows[0];
  if (!row || (row.source === "esg" && row.company_name === null) || (row.source === "standalone" && row.profile_json == null)) return null;
  return row;
}

export async function registerESGOrganization(esgOrganizationId: number, executor: Executor = policyCraftPool): Promise<number | null> {
  if (!Number.isSafeInteger(esgOrganizationId) || esgOrganizationId <= 0) return null;
  await requireCompleteSeed(executor);
  const [existing] = await executor.execute<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM policycraft_organizations WHERE source = 'esg' AND esg_org_id = ? LIMIT 1`, [esgOrganizationId],
  );
  if (existing[0]) return existing[0].id;
  // Allocate a PolicyCraft ID. Never copy the shared table ID after the migration seed.
  await executor.execute(
    `INSERT IGNORE INTO policycraft_organizations (source, esg_org_id)
     SELECT 'esg', id FROM organizations WHERE id = ?`, [esgOrganizationId],
  );
  const [rows] = await executor.execute<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM policycraft_organizations WHERE source = 'esg' AND esg_org_id = ? LIMIT 1`, [esgOrganizationId],
  );
  return rows[0]?.id ?? null;
}

export async function resolveLegacyESGOrganizationId(esgOrganizationId: number): Promise<number | null> {
  return registerESGOrganization(esgOrganizationId);
}

export function organizationSummary(row: RegistryRow): PolicyCraftOrganization {
  const profile = profileFrom(row);
  const isESG = row.source === "esg";
  return {
    id: row.id,
    code: isESG ? row.org_code || "" : `PC-${row.id}`,
    name: isESG ? row.company_name || "" : profile?.name || "",
    source: row.source,
    deleted: isESG ? Boolean(row.is_deleted) : false,
    expired: isESG ? expired(row.expiry_date) : false,
  };
}

export async function listPolicyCraftOrganizationRecords(executor: Executor = policyCraftPool): Promise<PolicyCraftOrganization[]> {
  await requireCompleteSeed(executor);
  await executor.execute(
    `INSERT IGNORE INTO policycraft_organizations (source, esg_org_id)
     SELECT 'esg', esg.id FROM organizations esg
       LEFT JOIN policycraft_organizations existing ON existing.source = 'esg' AND existing.esg_org_id = esg.id
      WHERE existing.id IS NULL`,
  );
  const [rows] = await executor.execute<RegistryRow[]>(`${registrySelect} ${registryJoin} ORDER BY COALESCE(esg.company_name, JSON_UNQUOTE(JSON_EXTRACT(pop.profile_json, '$.name'))) ASC, pco.id ASC`);
  return rows.filter((row) => row.source !== "esg" || row.company_name !== null).map(organizationSummary);
}

export async function ensurePolicyCraftOrganizationRegistry(executor: Executor = policyCraftPool): Promise<void> {
  await requireCompleteSeed(executor);
}

export function companySnapshotFromRecord(row: RegistryRow): CompanyMasterSnapshot {
  if (row.source === "standalone") {
    const profile = profileFrom(row);
    if (!profile) throw new Error("Standalone organization profile is missing.");
    return standaloneCompanySnapshot(row.id, profile);
  }
  return {
    id: row.id, code: row.org_code || "", name: row.company_name || "", industry: row.sector || "",
    subCategory: row.sub_sector || "", industryDetail: row.industry || "", country: row.country || "", websiteLink: row.website || "",
    address: row.address || "", city: row.city || "", sites: [], source: "esg",
  };
}

export function standaloneCompanySnapshot(id: number, profile: StandaloneOrganizationProfile): CompanyMasterSnapshot {
  const sites: CompanyMasterSite[] = profile.sites.map((site, index) => ({
    id: site.id || `site-${index + 1}`, location: site.location, address: site.address, primaryFunction: site.primaryFunction,
  }));
  return {
    id, code: `PC-${id}`, name: profile.name, industry: profile.industry, subCategory: profile.subCategory,
    industryDetail: profile.industryDetail || "",
    country: profile.country, websiteLink: profile.websiteLink, address: sites[0]?.address || "", city: "", sites,
    reportingPeriod: profile.reportingPeriod,
    companyLogo: profile.companyLogo ? `/api/policycraft/cover-assets/${encodeURIComponent(profile.companyLogo)}?orgId=${id}` : "",
    source: "standalone",
  };
}

export async function getStandaloneProfile(id: number): Promise<{ organization: PolicyCraftOrganization; profile: StandaloneOrganizationProfile; lockVersion: number } | null> {
  const row = await getPolicyCraftOrganizationRecord(id);
  if (!row || row.source !== "standalone") return null;
  const profile = profileFrom(row);
  if (!profile) return null;
  return { organization: organizationSummary(row), profile, lockVersion: row.lock_version };
}

export function validateStandaloneOrganizationProfile(input: unknown): { ok: true; profile: Omit<StandaloneOrganizationProfile, "companyLogo"> & { companyLogo?: string } } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "profile must be an object." };
  const raw = input as Record<string, unknown>;
  const strings = ["name", "industry", "subCategory", "country", "websiteLink"] as const;
  const values = Object.fromEntries(strings.map((key) => [key, typeof raw[key] === "string" ? raw[key].trim() : ""])) as Record<(typeof strings)[number], string>;
  if (raw.industryDetail !== undefined && typeof raw.industryDetail !== "string") return { ok: false, error: "industryDetail must be a string." };
  const industryDetail = typeof raw.industryDetail === "string" ? raw.industryDetail.trim() : "";
  if (industryDetail.length > 500) return { ok: false, error: "industryDetail must be at most 500 characters." };
  if (strings.some((key) => !values[key]) || strings.some((key) => values[key].length > 500)) return { ok: false, error: "Company name, sector, subsector, country and website are required." };
  try {
    const website = new URL(values.websiteLink);
    if (website.protocol !== "https:" && website.protocol !== "http:") return { ok: false, error: "websiteLink must be an HTTP or HTTPS URL." };
  } catch { return { ok: false, error: "websiteLink must be a valid HTTP or HTTPS URL." }; }
  if (raw.reportingPeriod !== "FY" && raw.reportingPeriod !== "CY") return { ok: false, error: "reportingPeriod must be FY or CY." };
  if (!Array.isArray(raw.sites) || raw.sites.length === 0 || raw.sites.length > 100) return { ok: false, error: "At least one operating site is required." };
  const sites: StandaloneOrganizationSite[] = [];
  const siteIds = new Set<string>();
  for (const [index, value] of raw.sites.entries()) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: `Site ${index + 1} is invalid.` };
    const site = value as Record<string, unknown>;
    const location = typeof site.location === "string" ? site.location.trim() : "";
    const address = typeof site.address === "string" ? site.address.trim() : "";
    const primaryFunction = typeof site.primaryFunction === "string" ? site.primaryFunction.trim() : "";
    if (!location || !address || !primaryFunction) return { ok: false, error: `Site ${index + 1} requires a name, address and primary function.` };
    const id = typeof site.id === "string" && site.id.trim() ? site.id.trim().slice(0, 64) : randomUUID();
    if (siteIds.has(id)) return { ok: false, error: `Site ${index + 1} has a duplicate site ID.` };
    siteIds.add(id);
    sites.push({ id, location: location.slice(0, 255), address: address.slice(0, 1000), primaryFunction: primaryFunction.slice(0, 255) });
  }
  if (raw.companyLogo !== undefined && typeof raw.companyLogo !== "string") return { ok: false, error: "companyLogo must be an asset ID." };
  return { ok: true, profile: { ...values, industryDetail, reportingPeriod: raw.reportingPeriod, sites, ...(raw.companyLogo ? { companyLogo: raw.companyLogo as string } : {}) } };
}

async function saveOrganizationLogo(connection: PoolConnection, orgId: number, actorId: number, bytes: Buffer, width: number, height: number): Promise<string> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const [existing] = await connection.execute<(RowDataPacket & { id: string })[]>(
    `SELECT id FROM policycraft_cover_assets WHERE org_id = ? AND sha256 = ? AND archived_at IS NULL LIMIT 1`, [orgId, hash],
  );
  if (existing[0]) return existing[0].id;
  const [usage] = await connection.execute<(RowDataPacket & { total: number })[]>(
    `SELECT COALESCE(SUM(byte_size), 0) AS total FROM policycraft_cover_assets WHERE org_id = ? AND archived_at IS NULL`, [orgId],
  );
  if (Number(usage[0]?.total || 0) + bytes.byteLength > 250 * 1024 * 1024) throw new Error("The organization cover asset limit has been reached.");
  const id = randomUUID();
  await connection.execute(
    `INSERT INTO policycraft_cover_assets (id, org_id, created_by_user_id, mime_type, width, height, byte_size, sha256, content)
     VALUES (?, ?, ?, 'image/png', ?, ?, ?, ?, ?)`, [id, orgId, actorId, width, height, bytes.byteLength, hash, bytes],
  );
  return id;
}

export async function createStandaloneOrganization(actor: PolicyCraftActor, profile: Omit<StandaloneOrganizationProfile, "companyLogo">, logo: { bytes: Buffer; width: number; height: number }) {
  const connection = await policyCraftPool.getConnection();
  let id = 0;
  try {
    await connection.beginTransaction();
    await assertActiveAdmin(connection, actor.user.id);
    const [insert] = await connection.execute<ResultSetHeader>(`INSERT INTO policycraft_organizations (source) VALUES ('standalone')`);
    id = Number(insert.insertId);
    const companyLogo = await saveOrganizationLogo(connection, id, Number(actor.user.id), logo.bytes, logo.width, logo.height);
    const fullProfile = { ...profile, companyLogo };
    await connection.execute(`INSERT INTO policycraft_organization_profiles (org_id, profile_json) VALUES (?, CAST(? AS JSON))`, [id, JSON.stringify(fullProfile)]);
    await connection.commit();
  } catch (error) {
    await connection.rollback(); throw error;
  } finally { connection.release(); }
  return (await getStandaloneProfile(id))!;
}

async function assertActiveAdmin(connection: PoolConnection, actorId: string) {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT a.user_id FROM policycraft_user_access a INNER JOIN users u ON u.id = a.user_id
      WHERE a.user_id = ? AND a.role = 'admin' AND a.status = 'active' AND u.active = 1 AND u.is_deleted = 0 FOR UPDATE`, [Number(actorId)],
  );
  if (!rows.length) throw new Error("Administrator access is no longer active.");
}

export async function updateStandaloneOrganization(actor: PolicyCraftActor, organizationId: number, lockVersion: number, profile: Omit<StandaloneOrganizationProfile, "companyLogo">, logo?: { bytes: Buffer; width: number; height: number }) {
  const connection = await policyCraftPool.getConnection();
  let result: "updated" | "conflict" | "not_found" = "not_found";
  try {
    await connection.beginTransaction();
    if (actor.role === "admin") await assertActiveAdmin(connection, actor.user.id);
    else if (actor.role === "manager") {
      const [editors] = await connection.execute<RowDataPacket[]>(
        `SELECT a.user_id FROM policycraft_user_access a
          INNER JOIN users u ON u.id = a.user_id
          INNER JOIN policycraft_manager_organizations m ON m.manager_user_id = u.id AND m.org_id = ? AND m.active = 1
         WHERE a.user_id = ? AND a.role = 'manager' AND a.status = 'active' AND u.active = 1 AND u.is_deleted = 0 FOR UPDATE`,
        [organizationId, Number(actor.user.id)],
      );
      if (!editors.length) throw new Error("Organization access denied.");
    } else throw new Error("Organization access denied.");
    const row = await getPolicyCraftOrganizationRecord(organizationId, connection, true);
    if (!row || row.source !== "standalone") { await connection.rollback(); return null; }
    if (row.lock_version !== lockVersion) { await connection.rollback(); return "conflict"; }
    const companyLogo = logo ? await saveOrganizationLogo(connection, organizationId, Number(actor.user.id), logo.bytes, logo.width, logo.height) : profileFrom(row)?.companyLogo;
    if (!companyLogo) throw new Error("A company logo is required.");
    const fullProfile = { ...profile, companyLogo };
    const [updated] = await connection.execute<ResultSetHeader>(
      `UPDATE policycraft_organization_profiles SET profile_json = CAST(? AS JSON), updated_at = CURRENT_TIMESTAMP(3) WHERE org_id = ?`,
      [JSON.stringify(fullProfile), organizationId],
    );
    if (!updated.affectedRows) { await connection.rollback(); return null; }
    await connection.execute(`UPDATE policycraft_organizations SET lock_version = lock_version + 1, updated_at = CURRENT_TIMESTAMP(3) WHERE id = ?`, [organizationId]);
    await connection.commit(); result = "updated";
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  return result === "updated" ? await getStandaloneProfile(organizationId) : result;
}

export async function getCompanyMasterFromRegistry(id: number, executor: Executor = policyCraftPool): Promise<CompanyMasterSnapshot> {
  const row = await getPolicyCraftOrganizationRecord(id, executor);
  if (!row) throw new Error("Organization not found");
  if (row.source === "standalone") return companySnapshotFromRecord(row);
  const [sites] = await executor.execute<(RowDataPacket & { id: number; name: string; address: string; type: string })[]>(
    `SELECT id, name, address, type FROM sites WHERE org_id = ? AND is_deleted = 0 ORDER BY id ASC`, [String(row.esg_org_id)],
  );
  const snapshot = mapCompanyMaster({
    id: row.id, org_code: row.org_code || "", company_name: row.company_name || "", address: row.address || "",
    country: row.country || "", city: row.city || "", website: row.website || "", sector: row.sector, sub_sector: row.sub_sector,
    industry: row.industry,
  }, sites.map((site) => ({ id: site.id, site_code: "", name: site.name || "", address: site.address || "", type: site.type || "" })));
  return { ...snapshot, source: "esg" };
}

export async function resolvePolicyCraftOrganizationScope(id: number): Promise<PolicyCraftOrganizationScope | null> {
  const row = await getPolicyCraftOrganizationRecord(id);
  if (!row) return null;
  return { ...organizationSummary(row), readOnly: row.source === "esg" && Boolean(row.is_deleted) };
}

async function requireCompleteSeed(executor: Executor): Promise<void> {
  let rows: RowDataPacket[];
  try {
    [rows] = await executor.execute<RowDataPacket[]>(
      `SELECT marker FROM policycraft_organization_migration_state WHERE marker = 'initial_esg_seed_complete' LIMIT 1`,
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "ER_NO_SUCH_TABLE") {
      throw new PolicyCraftOrganizationsMigrationRequiredError();
    }
    throw error;
  }
  if (!rows.length) throw new PolicyCraftOrganizationsMigrationRequiredError();
}
