import assert from "node:assert/strict";
import test from "node:test";
import { initialPolicy } from "./initial-policy";
import type { PolicyCraftAuthContext } from "./policycraft-auth";
import type { PolicyCraftDocumentState } from "./policycraft-types";

type FakeConnection = {
  beginTransaction: () => Promise<void>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
  release: () => void;
  execute: (sql: string, values?: unknown[]) => Promise<[unknown, unknown]>;
};

const auth = (role: "manager" | "user" | "admin"): PolicyCraftAuthContext => ({
  user: { id: "27", name: "Test Actor", email: "actor@example.test" },
  role,
  organization: { id: 9, code: "TEST", name: "Test Org", source: "esg", deleted: false, expired: false, readOnly: false },
});

const state: PolicyCraftDocumentState = {
  step: "structure",
  policy: initialPolicy("environmental"),
  importedPolicy: null,
};

async function withFakeConnection(
  execute: FakeConnection["execute"],
  run: (calls: string[], counts: { commit: number; rollback: number }) => Promise<void>,
) {
  process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";
  const { policyCraftPool } = await import("./db");
  const { updateDocument } = await import("./policycraft-repository");
  const calls: string[] = [];
  const counts = { commit: 0, rollback: 0 };
  const connection: FakeConnection = {
    async beginTransaction() {},
    async commit() { counts.commit += 1; },
    async rollback() { counts.rollback += 1; },
    release() {},
    async execute(sql, values) { calls.push(sql); return execute(sql, values); },
  };
  const descriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "getConnection");
  Object.defineProperty(policyCraftPool, "getConnection", { configurable: true, value: async () => connection });
  try {
    await run(calls, counts);
    return { calls, counts, updateDocument };
  } finally {
    if (descriptor) Object.defineProperty(policyCraftPool, "getConnection", descriptor);
    else Reflect.deleteProperty(policyCraftPool, "getConnection");
  }
}

async function withTaskConnection(
  execute: FakeConnection["execute"],
  run: (counts: { commit: number; rollback: number }) => Promise<void>,
  poolExecute?: (sql: string, values?: unknown[]) => Promise<[unknown, unknown]>,
) {
  process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";
  const { policyCraftPool } = await import("./db");
  const counts = { commit: 0, rollback: 0 };
  const connection: FakeConnection = {
    async beginTransaction() {},
    async commit() { counts.commit += 1; },
    async rollback() { counts.rollback += 1; },
    release() {},
    execute,
  };
  const descriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "getConnection");
  const executeDescriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "execute");
  Object.defineProperty(policyCraftPool, "getConnection", { configurable: true, value: async () => connection });
  if (poolExecute) Object.defineProperty(policyCraftPool, "execute", { configurable: true, value: poolExecute });
  try {
    await run(counts);
  } finally {
    if (descriptor) Object.defineProperty(policyCraftPool, "getConnection", descriptor);
    else Reflect.deleteProperty(policyCraftPool, "getConnection");
    if (executeDescriptor) Object.defineProperty(policyCraftPool, "execute", executeDescriptor);
    else Reflect.deleteProperty(policyCraftPool, "execute");
  }
}

function result<T>(rows: T): [T, unknown] {
  return [rows, undefined];
}

test("document saves skip manager progress until all task tables exist", async () => {
  await withFakeConnection(async (sql) => {
    if (sql.includes("information_schema.tables")) return result([{ table_count: 2 }]);
    if (sql.includes("UPDATE policycraft_documents")) return result({ affectedRows: 1 });
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls, counts) => {
    const { updateDocument } = await import("./policycraft-repository");
    const saved = await updateDocument(auth("manager"), "doc-id", "Environment Policy", state, 4);
    assert.equal(saved, "updated");
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO policycraft_manager_progress")), false);
    assert.equal(counts.commit, 1);
    assert.equal(counts.rollback, 0);
  });
});

test("document saves attribute snapshots only to a manager actor", async () => {
  for (const role of ["user", "admin"] as const) {
    await withFakeConnection(async (sql) => {
      if (sql.includes("information_schema.tables")) return result([{ table_count: 3 }]);
      if (sql.includes("SELECT id FROM policycraft_tasks")) return result([]);
      if (sql.includes("UPDATE policycraft_documents")) return result({ affectedRows: 1 });
      throw new Error(`Unexpected query: ${sql}`);
    }, async (calls, counts) => {
      const { updateDocument } = await import("./policycraft-repository");
      assert.equal(await updateDocument(auth(role), "doc-id", "Environment Policy", state, 4), "updated");
      assert.equal(calls.some((sql) => sql.includes("INSERT INTO policycraft_manager_progress")), false);
      assert.equal(counts.commit, 1);
      assert.equal(counts.rollback, 0);
    });
  }
});

test("a failed manager snapshot rolls the document save back", async () => {
  await withFakeConnection(async (sql) => {
    if (sql.includes("information_schema.tables")) return result([{ table_count: 3 }]);
    if (sql.includes("SELECT id FROM policycraft_tasks")) return result([]);
    if (sql.includes("UPDATE policycraft_documents")) return result({ affectedRows: 1 });
    if (sql.includes("INSERT INTO policycraft_manager_progress")) throw new Error("snapshot write failed");
    throw new Error(`Unexpected query: ${sql}`);
  }, async (calls, counts) => {
    const { updateDocument } = await import("./policycraft-repository");
    await assert.rejects(updateDocument(auth("manager"), "doc-id", "Environment Policy", state, 4), /snapshot write failed/);
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO policycraft_manager_progress")), true);
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });
});

test("task completion rejects a draft version that changed after the manager loaded it", async () => {
  const { PolicyCraftTaskError, completePolicyCraftTask } = await import("./policycraft-task-repository");
  await withTaskConnection(async (sql) => {
    if (sql.includes("SELECT t.id, t.org_id")) return result([{
      id: "task-id", org_id: 9, assigned_manager_user_id: 27, policy_type: "environmental", title: "Test",
      status: "in_progress", document_id: "doc-id", linked_document_id: "doc-id", lock_version: 3,
      organization_deleted: 0, organization_expiry: null, manager_active: 1, manager_deleted: 0,
      manager_access_status: "active", manager_org_active: 1, document_archived: null,
    }]);
    if (sql.includes("SELECT lock_version, archived_at FROM policycraft_documents")) {
      return result([{ lock_version: 8, archived_at: null }]);
    }
    throw new Error(`Unexpected query: ${sql}`);
  }, async (counts) => {
    await assert.rejects(
      completePolicyCraftTask({ taskId: "task-id", managerId: 27, version: 3, documentVersion: 7, confirmIncomplete: true }),
      (error: unknown) => error instanceof PolicyCraftTaskError && error.code === "conflict",
    );
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });
});

test("completion below 100 percent requires confirmation and still records completion", async () => {
  const { PolicyCraftTaskError, completePolicyCraftTask } = await import("./policycraft-task-repository");
  const taskRow = {
    id: "task-id", org_id: 9, assigned_manager_user_id: 27, title: "Environment policy", instructions: "",
    policy_type: "environmental", due_at: new Date("2026-10-05T18:29:59.999Z"), status: "completed",
    lock_version: 4, document_id: "doc-id", started_at: new Date("2026-10-05T12:00:00Z"),
    completed_at: new Date("2026-10-05T13:00:00Z"), created_at: new Date("2026-10-05T10:00:00Z"),
    updated_at: new Date("2026-10-05T13:00:00Z"), organization_code: "TEST", organization_name: "Test Org",
    organization_deleted: 0, organization_expiry: null, manager_name: "Test Actor", manager_email: "actor@example.test",
    manager_active: 1, manager_deleted: 0, manager_access_status: "active", manager_org_active: 1,
    document_archived: null, current_document_version: 8, progress_percentage: 27, progress_filled_sections: 3,
    progress_total_sections: 11, progress_sections_json: [], progress_saved_at: new Date("2026-10-05T12:59:00Z"),
    progress_document_version: 8,
  };
  const baseExecute: FakeConnection["execute"] = async (sql) => {
    if (sql.includes("SELECT t.id, t.org_id")) return result([{
      id: "task-id", org_id: 9, assigned_manager_user_id: 27, policy_type: "environmental", title: "Environment policy",
      status: "in_progress", document_id: "doc-id", linked_document_id: "doc-id", lock_version: 3,
      organization_deleted: 0, organization_expiry: null, manager_active: 1, manager_deleted: 0,
      manager_access_status: "active", manager_org_active: 1, document_archived: null,
    }]);
    if (sql.includes("SELECT lock_version, archived_at FROM policycraft_documents")) return result([{ lock_version: 8, archived_at: null }]);
    if (sql.includes("SELECT percentage, document_version FROM policycraft_manager_progress")) return result([{ percentage: 27, document_version: 8 }]);
    if (sql.includes("UPDATE policycraft_tasks SET status = 'completed'")) return result({ affectedRows: 1 });
    if (sql.includes("INSERT INTO policycraft_task_events")) return result({ affectedRows: 1 });
    throw new Error(`Unexpected query: ${sql}`);
  };

  await withTaskConnection(baseExecute, async (counts) => {
    await assert.rejects(
      completePolicyCraftTask({ taskId: "task-id", managerId: 27, version: 3, documentVersion: 8, confirmIncomplete: false }),
      (error: unknown) => error instanceof PolicyCraftTaskError && error.code === "invalid",
    );
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });

  let completed = false;
  await withTaskConnection(async (sql, values) => {
    if (sql.includes("UPDATE policycraft_tasks SET status = 'completed'")) completed = true;
    return baseExecute(sql, values);
  }, async (counts) => {
    const task = await completePolicyCraftTask({ taskId: "task-id", managerId: 27, version: 3, documentVersion: 8, confirmIncomplete: true });
    assert.equal(task.status, "completed");
    assert.equal(counts.commit, 1);
    assert.equal(counts.rollback, 0);
  }, async () => result([taskRow]));
  assert.equal(completed, true);
});

test("starting an in-progress task is an idempotent retry and does not refresh its initial snapshot", async () => {
  for (const source of ["esg", "standalone"] as const) {
  process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";
  const { policyCraftPool } = await import("./db");
  const { startPolicyCraftTask } = await import("./policycraft-task-repository");
  const calls: string[] = [];
  const counts = { commit: 0, rollback: 0 };
  let savedCompany: typeof state.policy.company | null = null;
  const taskState: { status: "assigned" | "in_progress"; documentId: string | null; version: number } = {
    status: "assigned", documentId: null, version: 1,
  };
  const connection: FakeConnection = {
    async beginTransaction() {},
    async commit() { counts.commit += 1; },
    async rollback() { counts.rollback += 1; },
    release() {},
    async execute(sql, values = []) {
      calls.push(sql);
      if (sql.includes("SELECT t.id, t.org_id")) return result([{
        id: "task-id", org_id: 9, assigned_manager_user_id: 27, policy_type: "environmental", title: "Environment policy",
        status: taskState.status, document_id: taskState.documentId, linked_document_id: taskState.documentId, lock_version: taskState.version,
        organization_deleted: 0, organization_expiry: null, manager_active: 1, manager_deleted: 0,
        manager_access_status: "active", manager_org_active: 1, document_archived: null,
      }]);
      if (sql.includes("FROM policycraft_organization_migration_state")) return result([{ marker: "initial_esg_seed_complete" }]);
      if (sql.includes("WHERE pco.id = ?")) return result([{
        source, esg_org_id: source === "esg" ? 9 : null, lock_version: 1,
        profile_json: source === "standalone" ? {
          name: "Private Org", industry: "Manufacturing", subCategory: "Chemicals", country: "India",
          websiteLink: "https://private.example", reportingPeriod: "CY", companyLogo: "logo-asset",
          sites: [{ id: "plant", location: "Plant", address: "2 Private Road", primaryFunction: "Manufacturing" }],
        } : null,
        id: 9, org_code: "TEST", company_name: "Test Org", address: "1 Test Road", country: "India", city: "Pune",
        website: "", sector: null, sub_sector: null, is_deleted: 0, expiry_date: null,
      }]);
      if (sql.includes("FROM sites WHERE org_id = ?")) return result([]);
      if (sql.includes("SELECT title FROM policycraft_documents")) return result([]);
      if (sql.includes("INSERT INTO policycraft_documents")) {
        savedCompany = (JSON.parse(String(values[7])) as typeof state.policy).company;
        return result({ affectedRows: 1 });
      }
      if (sql.includes("INSERT INTO policycraft_manager_progress")) return result({ affectedRows: 1 });
      if (sql.includes("UPDATE policycraft_tasks SET status = 'in_progress'")) {
        taskState.status = "in_progress";
        taskState.documentId = String(values[0]);
        taskState.version += 1;
        return result({ affectedRows: 1 });
      }
      if (sql.includes("INSERT INTO policycraft_task_events")) return result({ affectedRows: 1 });
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const connectionDescriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "getConnection");
  const executeDescriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "execute");
  Object.defineProperty(policyCraftPool, "getConnection", { configurable: true, value: async () => connection });
  Object.defineProperty(policyCraftPool, "execute", {
    configurable: true,
    value: async (sql: string) => {
      assert.match(sql, /WHERE t\.id = \?/);
      return result([{
        id: "task-id", org_id: 9, assigned_manager_user_id: 27, title: "Environment policy", instructions: "",
        policy_type: "environmental", due_at: new Date("2026-10-05T18:29:59.999Z"), status: taskState.status,
        lock_version: taskState.version, document_id: taskState.documentId, started_at: new Date("2026-10-05T12:00:00Z"),
        completed_at: null, created_at: new Date("2026-10-05T10:00:00Z"), updated_at: new Date("2026-10-05T12:00:00Z"),
        organization_code: source === "esg" ? "TEST" : "PC-9", organization_name: source === "esg" ? "Test Org" : "Private Org", organization_source: source, organization_deleted: 0, organization_expiry: null,
        manager_name: "Test Actor", manager_email: "actor@example.test", manager_active: 1, manager_deleted: 0,
        manager_access_status: "active", manager_org_active: 1, document_archived: null, current_document_version: 1,
        progress_percentage: null, progress_filled_sections: null, progress_total_sections: null,
        progress_sections_json: null, progress_saved_at: null, progress_document_version: null,
      }]);
    },
  });
  try {
    const first = await startPolicyCraftTask("task-id", 27);
    const retry = await startPolicyCraftTask("task-id", 27);
    assert.match(first.documentId, /^[0-9a-f-]{36}$/i);
    assert.equal(retry.documentId, first.documentId);
    assert.equal(retry.task.status, "in_progress");
    assert.equal(retry.task.organization.source, source);
    assert.ok(savedCompany);
    const company = savedCompany as typeof state.policy.company;
    if (source === "standalone") {
      assert.equal(company.name, "Private Org");
      assert.equal(company.reportingPeriod, "CY");
      assert.equal(company.companyLogo, "/api/policycraft/cover-assets/logo-asset?orgId=9");
      assert.equal(company.websiteLink, "https://private.example");
      assert.equal(company.industry, "Manufacturing");
      assert.equal(company.subCategory, "Chemicals");
      assert.equal(company.sites?.[0]?.address, "2 Private Road");
      assert.equal(calls.some((sql) => sql.includes("FROM sites WHERE")), false);
    } else {
      assert.equal(company.name, "Test Org");
      assert.equal(company.reportingPeriod, "FY");
      assert.equal(company.sites?.[0]?.address, "1 Test Road");
    }
    assert.equal(calls.filter((sql) => sql.includes("INSERT INTO policycraft_documents")).length, 1);
    assert.equal(calls.filter((sql) => sql.includes("INSERT INTO policycraft_manager_progress")).length, 1);
    assert.equal(calls.filter((sql) => sql.includes("INSERT INTO policycraft_task_events")).length, 1);
    assert.equal(calls.filter((sql) => sql.includes("FOR UPDATE")).length, 3);
    assert.equal(counts.commit, 2);
    assert.equal(counts.rollback, 0);
  } finally {
    if (connectionDescriptor) Object.defineProperty(policyCraftPool, "getConnection", connectionDescriptor);
    else Reflect.deleteProperty(policyCraftPool, "getConnection");
    if (executeDescriptor) Object.defineProperty(policyCraftPool, "execute", executeDescriptor);
    else Reflect.deleteProperty(policyCraftPool, "execute");
  }
  }
});

test("a manager whose org assignment was revoked cannot start the task", async () => {
  const { PolicyCraftTaskError, startPolicyCraftTask } = await import("./policycraft-task-repository");
  const calls: string[] = [];
  await withTaskConnection(async (sql) => {
    calls.push(sql);
    if (sql.includes("SELECT t.id, t.org_id")) return result([{
      id: "task-id", org_id: 9, assigned_manager_user_id: 27, policy_type: "environmental", title: "Environment policy",
      status: "assigned", document_id: null, linked_document_id: null, lock_version: 1,
      organization_deleted: 0, organization_expiry: null, manager_active: 1, manager_deleted: 0,
      manager_access_status: "disabled", manager_org_active: 1, document_archived: null,
    }]);
    throw new Error(`Unexpected query after revoked assignment: ${sql}`);
  }, async (counts) => {
    await assert.rejects(
      startPolicyCraftTask("task-id", 27),
      (error: unknown) => error instanceof PolicyCraftTaskError && error.code === "forbidden",
    );
    assert.equal(calls.some((sql) => sql.includes("INSERT INTO policycraft_documents")), false);
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });
});

test("manager task listing binds both the authenticated manager and requested document", async () => {
  process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";
  const { policyCraftPool } = await import("./db");
  const { listPolicyCraftTasks } = await import("./policycraft-task-repository");
  const descriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "execute");
  let sqlSeen = "";
  let valuesSeen: unknown[] = [];
  Object.defineProperty(policyCraftPool, "execute", {
    configurable: true,
    value: async (sql: string, values: unknown[]) => {
      sqlSeen = sql;
      valuesSeen = values;
      return result([]);
    },
  });
  try {
    assert.deepEqual(await listPolicyCraftTasks({ managerId: 27, documentId: "doc-id" }), []);
    assert.match(sqlSeen, /WHERE t\.assigned_manager_user_id = \? AND t\.document_id = \?/);
    assert.match(sqlSeen, /mo\.active = 1/);
    assert.match(sqlSeen, /o\.is_deleted = 0/);
    assert.deepEqual(valuesSeen, [27, "doc-id"]);
    assert.doesNotMatch(sqlSeen, /policy_json|imported_policy_json/);
  } finally {
    if (descriptor) Object.defineProperty(policyCraftPool, "execute", descriptor);
    else Reflect.deleteProperty(policyCraftPool, "execute");
  }
});

test("admin reassignment refuses a manager who is disabled or not assigned to the organization", async () => {
  const { PolicyCraftTaskError, updatePolicyCraftTask } = await import("./policycraft-task-repository");
  const calls: string[] = [];
  await withTaskConnection(async (sql) => {
    calls.push(sql);
    if (sql.includes("a.role = 'admin'")) return result([{ active: 1, is_deleted: 0, access_status: "active" }]);
    if (sql.includes("FROM policycraft_tasks WHERE id = ?")) return result([{
      id: "task-id", org_id: 9, assigned_manager_user_id: 27, title: "Environment policy", instructions: "",
      policy_type: "environmental", due_at: new Date("2026-10-05T18:29:59.999Z"), status: "assigned",
      document_id: null, lock_version: 2,
    }]);
    if (sql.includes("INNER JOIN users u ON u.id = ?")) return result([{
      organization_deleted: 0, organization_expiry: null, manager_active: 0, manager_deleted: 0,
      access_status: "disabled", assignment_active: 1,
    }]);
    throw new Error(`Unexpected query: ${sql}`);
  }, async (counts) => {
    await assert.rejects(
      updatePolicyCraftTask({
        taskId: "task-id", version: 2, action: "reassign", managerId: 55,
        admin: { user: { id: "1", name: "Admin", email: "admin@example.test" }, role: "admin" },
      }),
      (error: unknown) => error instanceof PolicyCraftTaskError && error.code === "invalid",
    );
    assert.equal(calls.some((sql) => sql.startsWith("UPDATE policycraft_tasks")), false);
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });
});

test("admin edits refuse tasks in deleted or expired organizations", async () => {
  const { PolicyCraftTaskError, updatePolicyCraftTask } = await import("./policycraft-task-repository");
  const calls: string[] = [];
  await withTaskConnection(async (sql) => {
    calls.push(sql);
    if (sql.includes("a.role = 'admin'")) return result([{ active: 1, is_deleted: 0, access_status: "active" }]);
    if (sql.includes("FROM policycraft_tasks WHERE id = ?")) return result([{
      id: "task-id", org_id: 9, assigned_manager_user_id: 27, title: "Environment policy", instructions: "",
      policy_type: "environmental", due_at: new Date("2026-10-05T18:29:59.999Z"), status: "assigned",
      document_id: null, lock_version: 2,
    }]);
    if (sql.includes("SELECT o.is_deleted, o.expiry_date")) return result([{ is_deleted: 1, expiry_date: null }]);
    throw new Error(`Unexpected query: ${sql}`);
  }, async (counts) => {
    await assert.rejects(
      updatePolicyCraftTask({
        taskId: "task-id", version: 2, action: "edit", title: "Renamed",
        admin: { user: { id: "1", name: "Admin", email: "admin@example.test" }, role: "admin" },
      }),
      (error: unknown) => error instanceof PolicyCraftTaskError && error.code === "invalid",
    );
    assert.equal(calls.some((sql) => sql.startsWith("UPDATE policycraft_tasks")), false);
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });
});

test("reopening a linked task requires its existing unarchived draft", async () => {
  const { PolicyCraftTaskError, updatePolicyCraftTask } = await import("./policycraft-task-repository");
  const calls: string[] = [];
  await withTaskConnection(async (sql) => {
    calls.push(sql);
    if (sql.includes("a.role = 'admin'")) return result([{ active: 1, is_deleted: 0, access_status: "active" }]);
    if (sql.includes("FROM policycraft_tasks WHERE id = ?")) return result([{
      id: "task-id", org_id: 9, assigned_manager_user_id: 27, title: "Environment policy", instructions: "",
      policy_type: "environmental", due_at: new Date("2026-10-05T18:29:59.999Z"), status: "completed",
      document_id: "doc-id", lock_version: 4,
    }]);
    if (sql.includes("INNER JOIN users u ON u.id = ?")) return result([{
      organization_deleted: 0, organization_expiry: null, manager_active: 1, manager_deleted: 0,
      access_status: "active", assignment_active: 1,
    }]);
    if (sql.includes("FROM policycraft_documents WHERE id = ?")) return result([]);
    throw new Error(`Unexpected query: ${sql}`);
  }, async (counts) => {
    await assert.rejects(
      updatePolicyCraftTask({
        taskId: "task-id", version: 4, action: "reopen",
        admin: { user: { id: "1", name: "Admin", email: "admin@example.test" }, role: "admin" },
      }),
      (error: unknown) => error instanceof PolicyCraftTaskError && error.code === "conflict",
    );
    assert.equal(calls.some((sql) => sql.startsWith("UPDATE policycraft_tasks")), false);
    assert.equal(counts.commit, 0);
    assert.equal(counts.rollback, 1);
  });
});

test("task history remains visible after a pre-start organization change", async () => {
  process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";
  const { policyCraftPool } = await import("./db");
  const { listPolicyCraftTaskEvents } = await import("./policycraft-task-repository");
  const descriptor = Object.getOwnPropertyDescriptor(policyCraftPool, "execute");
  let sqlSeen = "";
  let valuesSeen: unknown[] = [];
  Object.defineProperty(policyCraftPool, "execute", {
    configurable: true,
    value: async (sql: string, values: unknown[]) => {
      sqlSeen = sql;
      valuesSeen = values;
      return result([{
        id: 1, task_id: "task-id", event_type: "edited", actor_user_id: 1,
        actor_name: "Admin", actor_role: "admin", details_json: { fromOrganizationId: 9, toOrganizationId: 11 },
        created_at: new Date("2026-10-05T10:00:00Z"),
      }]);
    },
  });
  try {
    const events = await listPolicyCraftTaskEvents("task-id");
    assert.equal(events.length, 1);
    assert.deepEqual(events[0].details, { fromOrganizationId: 9, toOrganizationId: 11 });
    assert.match(sqlSeen, /WHERE e\.task_id = \?/);
    assert.doesNotMatch(sqlSeen, /e\.org_id = \?/);
    assert.deepEqual(valuesSeen, ["task-id"]);
  } finally {
    if (descriptor) Object.defineProperty(policyCraftPool, "execute", descriptor);
    else Reflect.deleteProperty(policyCraftPool, "execute");
  }
});

test("an optimistic document-save conflict never writes a manager snapshot", async () => {
  process.env.DATABASE_URL ||= "mysql://test:test@127.0.0.1:3306/test";
  const { initialPolicy } = await import("./initial-policy");
  const policy = initialPolicy("environmental");
  await withTaskConnection(async (sql) => {
    if (sql.includes("information_schema.tables")) return result([{ table_count: 3 }]);
    if (sql.includes("SELECT id FROM policycraft_tasks")) return result([]);
    if (sql.includes("UPDATE policycraft_documents")) return result({ affectedRows: 0 });
    throw new Error(`Unexpected transaction query: ${sql}`);
  }, async () => {
    const { updateDocument } = await import("./policycraft-repository");
    const saved = await updateDocument(auth("manager"), "doc-id", "Environment Policy", {
      step: "structure", policy, importedPolicy: null,
    }, 4);
    assert.equal(saved, "conflict");
  }, async (sql) => {
    assert.match(sql, /WHERE d\.id = \? AND d\.org_id = \?/);
    return result([{
      id: "doc-id", title: "Environment Policy", policy_type: "environmental", current_step: "structure",
      lock_version: 5, created_at: new Date("2026-10-05T10:00:00Z"), updated_at: new Date("2026-10-05T11:00:00Z"),
      archived_at: null, created_by_user_id: 27, created_by_name: "Test Actor", created_by_email: "actor@example.test",
      organization_id: 9, organization_code: "TEST", organization_name: "Test Org", organization_deleted: 0,
      organization_expiry: null, policy_json: policy, imported_policy_json: null,
    }]);
  });
});
