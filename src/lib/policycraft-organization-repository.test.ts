import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "mysql2/promise";

process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:1/policycraft_test";
const modules = Promise.all([import("./db"), import("./policycraft-organization-repository"), import("./policycraft-auth")]);
type PoolExecute = Pool["execute"];

const validProfile = {
  name: "Example Co", industry: "Manufacturing", subCategory: "Food processing", country: "India",
  websiteLink: "https://example.test", reportingPeriod: "FY" as const, sites: [
    { location: "Pune Plant", address: "Industrial Area", primaryFunction: "Manufacturing" },
  ],
};

test("standalone profiles require all company fields, an HTTP(S) website, and complete operating sites", async () => {
  const [, repository] = await modules;
  assert.equal(repository.validateStandaloneOrganizationProfile(validProfile).ok, true);
  const legacy = repository.validateStandaloneOrganizationProfile(validProfile);
  assert.equal(legacy.ok && legacy.profile.industryDetail, "", "missing industryDetail defaults to a blank string");
  const custom = repository.validateStandaloneOrganizationProfile({ ...validProfile, industryDetail: "Custom legacy industry" });
  assert.equal(custom.ok && custom.profile.industryDetail, "Custom legacy industry");
  assert.equal(repository.validateStandaloneOrganizationProfile({ ...validProfile, industryDetail: 17 }).ok, false);
  assert.equal(repository.validateStandaloneOrganizationProfile({ ...validProfile, industryDetail: "x".repeat(501) }).ok, false);
  assert.equal(repository.validateStandaloneOrganizationProfile({ ...validProfile, websiteLink: "javascript:alert(1)" }).ok, false);
  assert.equal(repository.validateStandaloneOrganizationProfile({ ...validProfile, sites: [] }).ok, false);
  assert.equal(repository.validateStandaloneOrganizationProfile({ ...validProfile, sites: [{ location: "Pune", address: "", primaryFunction: "Plant" }] }).ok, false);
  assert.equal(repository.validateStandaloneOrganizationProfile({ ...validProfile, reportingPeriod: "Calendar" }).ok, false);
});

test("site IDs stay stable when sites are removed and new sites receive distinct IDs", async () => {
  const [, repository] = await modules;
  const created = repository.validateStandaloneOrganizationProfile({
    ...validProfile,
    sites: [
      { location: "North Plant", address: "Address A", primaryFunction: "Manufacturing" },
      { location: "South Plant", address: "Address B", primaryFunction: "Warehouse" },
    ],
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const retainedId = created.profile.sites[1].id;
  const edited = repository.validateStandaloneOrganizationProfile({
    ...validProfile,
    sites: [
      { ...created.profile.sites[1] },
      { location: "New Plant", address: "Address C", primaryFunction: "Assembly" },
    ],
  });
  assert.equal(edited.ok, true);
  if (!edited.ok) return;
  assert.equal(edited.profile.sites[0].id, retainedId);
  assert.notEqual(edited.profile.sites[0].id, edited.profile.sites[1].id);
  assert.equal(repository.validateStandaloneOrganizationProfile({
    ...validProfile, sites: [{ ...created.profile.sites[0] }, { ...created.profile.sites[0] }],
  }).ok, false);
});

test("ESG registration allocates a registry ID and resolves only by the ESG source key", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  let mapped = false;
  policyCraftPool.execute = (async (sql: string, values?: unknown[]) => {
    calls.push({ sql, values: values || [] });
    if (sql.includes("policycraft_organization_migration_state")) return [[{ marker: "initial_esg_seed_complete" }], []] as never;
    if (sql.includes("SELECT id FROM policycraft_organizations WHERE source = 'esg'")) return [mapped ? [{ id: 1001 }] : [], []] as never;
    if (sql.includes("INSERT IGNORE INTO policycraft_organizations")) {
      assert.match(sql, /SELECT 'esg', id FROM organizations WHERE id = \?/);
      assert.deepEqual(values, [42]);
      mapped = true;
      return [{ affectedRows: 1 }, []] as never;
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }) as unknown as PoolExecute;
  try {
    assert.equal(await repository.registerESGOrganization(42), 1001);
    assert.equal(calls.filter((call) => call.sql.includes("INSERT IGNORE INTO policycraft_organizations")).length, 1);
    assert.doesNotMatch(calls[1].sql, /SELECT\s+\?\s*,\s*'esg'/i);
  } finally { policyCraftPool.execute = originalExecute; }
});

test("registry reads fail closed until the owner-run seed completion marker exists", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  policyCraftPool.execute = (async () => [[], []]) as unknown as PoolExecute;
  try {
    await assert.rejects(repository.ensurePolicyCraftOrganizationRegistry(), repository.PolicyCraftOrganizationsMigrationRequiredError);
  } finally { policyCraftPool.execute = originalExecute; }
});

test("ESG company master reads the distinct industry column and keeps legacy sector fields", async () => {
  const [, repository] = await modules;
  const calls: string[] = [];
  const executor = {
    async execute(sql: string) {
      calls.push(sql);
      if (sql.includes("policycraft_organization_migration_state")) return [[{ marker: "initial_esg_seed_complete" }], []];
      if (sql.includes("FROM policycraft_organizations pco")) return [[{
        id: 44, source: "esg", esg_org_id: 104, lock_version: 1, profile_json: null,
        org_code: "ORG-44", company_name: "Example Co", address: "Address", country: "India", city: "Pune",
        website: "https://example.test", sector: "Manufacturing", sub_sector: "Chemicals", industry: "Industrial gases",
        is_deleted: 0, expiry_date: null,
      }], []];
      if (sql.includes("FROM sites")) return [[{ id: 5, name: "Plant", address: "Site address", type: "Factory" }], []];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const snapshot = await repository.getCompanyMasterFromRegistry(44, executor as never);
  assert.equal(snapshot.industry, "Manufacturing");
  assert.equal(snapshot.subCategory, "Chemicals");
  assert.equal(snapshot.industryDetail, "Industrial gases");
  assert.match(calls.find((sql) => sql.includes("FROM policycraft_organizations pco")) || "", /esg\.industry/);
});

test("authorization requires the matching ESG source and an active manager assignment", async () => {
  const [{ policyCraftPool }, , auth] = await modules;
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  const standaloneRow = {
    id: 12, source: "standalone", esg_org_id: null, lock_version: 1,
    profile_json: JSON.stringify({ ...validProfile, companyLogo: "logo-1" }),
    org_code: null, company_name: null, address: null, country: null, city: null, website: null,
    sector: null, sub_sector: null, is_deleted: null, expiry_date: null,
  };
  let assigned = false;
  policyCraftPool.execute = (async (sql: string) => {
    if (sql.includes("policycraft_organization_migration_state")) return [[{ marker: "initial_esg_seed_complete" }], []] as never;
    if (sql.includes("SELECT pco.id, pco.source, pco.esg_org_id")) return [[standaloneRow], []] as never;
    if (sql.includes("FROM policycraft_manager_organizations")) return [assigned ? [{ manager_user_id: 20 }] : [], []] as never;
    throw new Error(`Unexpected SQL: ${sql}`);
  }) as unknown as PoolExecute;
  try {
    const userScope = await auth.resolvePolicyCraftOrganization({ user: { id: "21", name: "Client", email: "client@example.test" }, role: "user", homeOrganizationId: 12 }, { organizationId: 12, operation: "read" });
    assert.equal(userScope, null, "a matching numeric home ID must not expose a standalone record");
    const manager = { user: { id: "20", name: "Manager", email: "manager@example.test" }, role: "manager" as const };
    assert.equal(await auth.resolvePolicyCraftOrganization(manager, { organizationId: 12, operation: "read" }), null);
    assigned = true;
    const managerScope = await auth.resolvePolicyCraftOrganization(manager, { organizationId: 12, operation: "write" });
    assert.equal(managerScope?.source, "standalone");
    const adminScope = await auth.resolvePolicyCraftOrganization({ user: { id: "1", name: "Admin", email: "admin@example.test" }, role: "admin" }, { organizationId: 12, operation: "write" });
    assert.equal(adminScope?.source, "standalone");
  } finally { policyCraftPool.execute = originalExecute; }
});

test("profile updates reject stale versions before writing a replacement logo", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalGetConnection = policyCraftPool.getConnection.bind(policyCraftPool);
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  const calls: string[] = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { calls.push("ROLLBACK"); }, release() {},
    async execute(sql: string) {
      calls.push(sql);
      if (sql.includes("policycraft_user_access")) return [[{ user_id: 1 }], []];
      if (sql.includes("policycraft_organization_migration_state")) return [[{ marker: "initial_esg_seed_complete" }], []];
      if (sql.includes("SELECT pco.id, pco.source")) return [[{
        id: 30, source: "standalone", esg_org_id: null, lock_version: 4,
        profile_json: JSON.stringify({ ...validProfile, companyLogo: "old-logo" }),
        org_code: null, company_name: null, address: null, country: null, city: null, website: null,
        sector: null, sub_sector: null, is_deleted: null, expiry_date: null,
      }], []];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  policyCraftPool.getConnection = (async () => connection) as never;
  try {
    const result = await repository.updateStandaloneOrganization(
      { user: { id: "1", name: "Admin", email: "admin@example.test" }, role: "admin" }, 30, 3,
      { ...validProfile, name: "Changed Co" }, { bytes: Buffer.from("logo"), width: 1, height: 1 },
    );
    assert.equal(result, "conflict");
    assert.ok(calls.includes("ROLLBACK"));
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO policycraft_cover_assets")), false);
    assert.equal(calls.some((sql) => sql.includes("UPDATE policycraft_organization_profiles")), false);
  } finally {
    policyCraftPool.getConnection = originalGetConnection;
    policyCraftPool.execute = originalExecute;
  }
});

test("profile update rechecks active manager assignment inside its transaction", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalGetConnection = policyCraftPool.getConnection.bind(policyCraftPool);
  const calls: string[] = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() { calls.push("ROLLBACK"); }, release() {},
    async execute(sql: string) {
      calls.push(sql);
      if (sql.includes("policycraft_manager_organizations")) return [[], []];
      throw new Error(`Unexpected SQL after revoked assignment: ${sql}`);
    },
  };
  policyCraftPool.getConnection = (async () => connection) as never;
  try {
    await assert.rejects(repository.updateStandaloneOrganization(
      { user: { id: "20", name: "Manager", email: "manager@example.test" }, role: "manager" },
      31, 4, { ...validProfile },
    ), /Organization access denied/);
    assert.ok(calls.includes("ROLLBACK"));
    assert.equal(calls.some((sql) => sql.includes("UPDATE policycraft_organization_profiles")), false);
  } finally { policyCraftPool.getConnection = originalGetConnection; }
});

test("profile edits retain the existing logo asset when no replacement is uploaded", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalGetConnection = policyCraftPool.getConnection.bind(policyCraftPool);
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  const writes: Array<{ sql: string; values: unknown[] }> = [];
  const profileBefore = { ...validProfile, companyLogo: "old-logo" };
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async execute(sql: string, values?: unknown[]) {
      if (sql.includes("policycraft_user_access")) return [[{ user_id: 1 }], []];
      if (sql.includes("policycraft_organization_migration_state")) return [[{ marker: "initial_esg_seed_complete" }], []];
      if (sql.includes("SELECT pco.id, pco.source")) return [[{
        id: 31, source: "standalone", esg_org_id: null, lock_version: 4, profile_json: JSON.stringify(profileBefore),
        org_code: null, company_name: null, address: null, country: null, city: null, website: null,
        sector: null, sub_sector: null, is_deleted: null, expiry_date: null,
      }], []];
      if (sql.includes("UPDATE policycraft_organization_profiles")) { writes.push({ sql, values: values || [] }); return [{ affectedRows: 1 }, []]; }
      if (sql.includes("UPDATE policycraft_organizations")) return [{ affectedRows: 1 }, []];
      throw new Error(`Unexpected connection SQL: ${sql}`);
    },
  };
  policyCraftPool.getConnection = (async () => connection) as never;
  policyCraftPool.execute = (async (sql: string) => {
    if (sql.includes("policycraft_organization_migration_state")) return [[{ marker: "initial_esg_seed_complete" }], []] as never;
    if (sql.includes("SELECT pco.id, pco.source")) return [[{
      id: 31, source: "standalone", esg_org_id: null, lock_version: 5,
      profile_json: writes.length ? writes[0].values[0] : JSON.stringify(profileBefore),
      org_code: null, company_name: null, address: null, country: null, city: null, website: null,
      sector: null, sub_sector: null, is_deleted: null, expiry_date: null,
    }], []] as never;
    throw new Error(`Unexpected pool SQL: ${sql}`);
  }) as unknown as PoolExecute;
  try {
    const result = await repository.updateStandaloneOrganization(
      { user: { id: "1", name: "Admin", email: "admin@example.test" }, role: "admin" }, 31, 4, { ...validProfile, name: "Edited Co" },
    );
    assert.equal(result && typeof result === "object" ? result.profile.companyLogo : undefined, "old-logo");
    assert.equal(result && typeof result === "object" ? result.profile.industryDetail : undefined, "", "legacy stored profile defaults industryDetail");
    assert.equal(JSON.parse(String(writes[0]?.values[0])).companyLogo, "old-logo");
    assert.equal(writes.some(({ sql }) => sql.includes("policycraft_cover_assets")), false);
  } finally {
    policyCraftPool.getConnection = originalGetConnection;
    policyCraftPool.execute = originalExecute;
  }
});

test("creation saves its registry, profile and logo atomically without creating assignments or shared ESG records", async () => {
  const [{ policyCraftPool }, repository] = await modules;
  const originalGetConnection = policyCraftPool.getConnection.bind(policyCraftPool);
  const originalExecute = policyCraftPool.execute.bind(policyCraftPool) as PoolExecute;
  const admin = { user: { id: "1", name: "Admin", email: "admin@example.test" }, role: "admin" as const };
  for (const failProfile of [false, true]) {
    const calls: string[] = [];
    let savedProfile = "";
    let assetId = "";
    const connection = {
      async beginTransaction() { calls.push("BEGIN"); }, async commit() { calls.push("COMMIT"); },
      async rollback() { calls.push("ROLLBACK"); }, release() {},
      async execute(sql: string, values?: unknown[]) {
        calls.push(sql);
        if (sql.includes("policycraft_user_access")) return [[{ user_id: 1 }], []];
        if (sql.includes("INSERT INTO policycraft_organizations")) return [{ insertId: 99 }, []];
        if (sql.includes("SELECT id FROM policycraft_cover_assets")) return [[], []];
        if (sql.includes("SUM(byte_size)")) return [[{ total: 0 }], []];
        if (sql.includes("INSERT INTO policycraft_cover_assets")) {
          assert.equal(values?.[1], 99);
          assetId = String(values?.[0]);
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes("INSERT INTO policycraft_organization_profiles")) {
          if (failProfile) throw new Error("profile insert failed");
          savedProfile = String(values?.[1]);
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      },
    };
    policyCraftPool.getConnection = (async () => connection) as never;
    policyCraftPool.execute = (async (sql: string) => {
      if (sql.includes("policycraft_organization_migration_state")) return [[{ marker: "initial_esg_seed_complete" }], []] as never;
      if (sql.includes("SELECT pco.id, pco.source")) return [[{ id: 99, source: "standalone", esg_org_id: null, lock_version: 1, profile_json: savedProfile }], []] as never;
      throw new Error(`Unexpected SQL: ${sql}`);
    }) as unknown as PoolExecute;
    try {
      const create = repository.createStandaloneOrganization(admin, validProfile, { bytes: Buffer.from("processed logo"), width: 1, height: 1 });
      if (failProfile) {
        await assert.rejects(create, /profile insert failed/);
        assert.ok(calls.includes("ROLLBACK"));
        assert.equal(calls.includes("COMMIT"), false);
      } else {
        const result = await create;
        assert.equal(result.organization.source, "standalone");
        assert.equal(result.profile.companyLogo, assetId);
        assert.ok(calls.indexOf("COMMIT") > calls.findIndex((sql) => sql.includes("INSERT INTO policycraft_organization_profiles")));
      }
      assert.equal(calls.some((sql) => /INSERT INTO (organizations|sites|policycraft_manager_organizations)\b/.test(sql)), false);
    } finally {
      policyCraftPool.getConnection = originalGetConnection;
      policyCraftPool.execute = originalExecute;
    }
  }
});

test("organization lookup SQL keeps source and ESG identity separate", async () => {
  const [, repository] = await modules;
  assert.match(repository.policyCraftOrganizationLookupSql, /pco\.source/);
  assert.match(repository.policyCraftOrganizationLookupSql, /pco\.esg_org_id/);
  assert.match(repository.policyCraftOrganizationLookupSql, /JSON_EXTRACT\(pop\.profile_json/);
  assert.match(repository.policyCraftOrganizationLookupSql, /COALESCE\(esg\.is_deleted, 1\)/);
});
