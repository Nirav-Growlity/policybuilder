import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyManual } from "./initial-manual";
import { ManualConflictError, downloadSopManual, generateSopAiCover, importSopDocx, isImportAvailable, listSopManuals, manualsUrl, saveSopManual } from "./client-api";

type Call = { url: string; init?: RequestInit };

function mockFetch(respond: (call: Call) => Response) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return respond(call);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("every manuals URL carries the organization", async () => {
  assert.equal(manualsUrl("/abc/preview", 11), "/api/documents/manuals/abc/preview?orgId=11");
  const mock = mockFetch(() => json({ manuals: [] }));
  try {
    await listSopManuals(11, "archived");
    assert.equal(mock.calls[0].url, "/api/documents/manuals?kind=sop&view=archived&orgId=11");
  } finally { mock.restore(); }
});

test("a 409 on save is a conflict the builder can tell apart from being offline", async () => {
  const mock = mockFetch(() => json({ error: "changed" }, 409));
  try {
    await assert.rejects(saveSopManual(11, "m1", { title: "T", stage: "write", manual: createEmptyManual(), lockVersion: 2 }), ManualConflictError);
    const body = JSON.parse(String(mock.calls[0].init?.body));
    assert.equal(body.lockVersion, 2);
    assert.equal(body.orgId, 11);
  } finally { mock.restore(); }
});

test("routes still being built report unavailable instead of failing", async () => {
  const mock = mockFetch(() => new Response("Not found", { status: 404 }));
  try {
    assert.equal(await isImportAvailable(11), false);
    assert.deepEqual(await importSopDocx(11, "m1", new File(["x"], "manual.docx")), { status: "unavailable" });
    assert.deepEqual(await generateSopAiCover(11, "m1", createEmptyManual()), { status: "unavailable" });
    assert.deepEqual(await downloadSopManual(11, "m1", "docx", "Manual"), { status: "unavailable" });
  } finally { mock.restore(); }
});

test("a POST-only import route answers 405 to the availability check", async () => {
  const mock = mockFetch(() => new Response(null, { status: 405 }));
  try {
    assert.equal(await isImportAvailable(11), true);
  } finally { mock.restore(); }
});
