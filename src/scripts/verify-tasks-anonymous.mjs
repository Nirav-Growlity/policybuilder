// No cookies or valid mutation payloads are sent; authorization must fail first.
import assert from "node:assert/strict";

const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3000";
const taskId = "00000000-0000-4000-8000-000000000001";
const cases = [
  ["GET", "/api/policycraft/admin/tasks"],
  ["POST", "/api/policycraft/admin/tasks"],
  ["GET", `/api/policycraft/admin/tasks/${taskId}`],
  ["PATCH", `/api/policycraft/admin/tasks/${taskId}`],
  ["GET", "/api/policycraft/admin/manager-work"],
  ["GET", "/api/policycraft/tasks"],
  ["GET", `/api/policycraft/tasks/${taskId}`],
  ["POST", `/api/policycraft/tasks/${taskId}/start`],
  ["POST", `/api/policycraft/tasks/${taskId}/complete`],
];
for (const [method, path] of cases) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Origin: new URL(base).origin, "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: "{}" }),
  });
  assert.equal(response.status, 401, `${method} ${path} must deny anonymous requests before body processing`);
}
console.log("PASS: all nine task/admin-progress operations deny anonymous requests. No account cookies or database mutations.");
