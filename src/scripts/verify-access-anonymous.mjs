// No cookies are sent; the access guards must stop before any database query.
import assert from "node:assert/strict";
const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3000";
for (const path of ["/api/ai", "/api/grammar", "/api/export/pdf", "/api/export/docx", "/api/policycraft/admin/administrator"]) {
  const response = await fetch(`${base}${path}?orgId=11`, {
    method: "POST", headers: { Origin: new URL(base).origin, "Content-Type": "application/json" }, body: "{}",
  });
  assert.equal(response.status, 401, `${path} must reject anonymous callers before processing policy content`);
}
const form = new FormData();
form.set("file", new Blob(["not a policy"]), "policy.docx");
const response = await fetch(`${base}/api/parse/docx?orgId=11`, { method: "POST", headers: { Origin: new URL(base).origin }, body: form });
assert.equal(response.status, 401, "DOCX import must reject anonymous callers before reading a file");
console.log("PASS: all six protected generation/import/export/add-administrator handlers deny anonymous requests before processing.");
