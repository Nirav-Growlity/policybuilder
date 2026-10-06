// These requests carry no cookies. Guards must deny them before any profile,
// image, or database processing, even when the submitted content is invalid.
import assert from "node:assert/strict";

const base = process.env.POLICYCRAFT_UI_URL || "http://localhost:3000";
const origin = new URL(base).origin;
const operations = [
  ["GET", "/api/policycraft/admin/organizations"],
  ["POST", "/api/policycraft/admin/organizations"],
  ["GET", "/api/policycraft/organizations/11"],
  ["PATCH", "/api/policycraft/organizations/11"],
];

for (const [method, path] of operations) {
  const form = new FormData();
  form.set("profile", "invalid JSON");
  form.set("lockVersion", "invalid version");
  form.set("logo", new Blob(["invalid image"], { type: "image/png" }), "logo.png");
  const response = await fetch(`${base}${path}`, {
    method, headers: { Origin: origin }, ...(method === "GET" ? {} : { body: form }),
  });
  assert.equal(response.status, 401, `${method} ${path} must deny anonymous callers before processing content`);
}

for (const [method, path] of operations.filter(([method]) => method !== "GET")) {
  const response = await fetch(`${base}${path}`, {
    method, headers: { Origin: "https://untrusted.example" }, body: new FormData(),
  });
  assert.ok([401, 403].includes(response.status), `${method} ${path} must deny anonymous requests with an untrusted origin`);
}

console.log("PASS: all four organization operations deny anonymous requests, including mutation requests with untrusted origins. No account cookies or database writes.");
