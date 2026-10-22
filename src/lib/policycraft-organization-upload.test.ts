import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { PolicyCraftOrganizationInputError, readPolicyCraftOrganizationLogo } from "./policycraft-organization-upload";

test("logos are mandatory on creation and optional on profile edits", async () => {
  await assert.rejects(readPolicyCraftOrganizationLogo(new FormData(), true), PolicyCraftOrganizationInputError);
  assert.equal(await readPolicyCraftOrganizationLogo(new FormData(), false), undefined);
});

test("logo processing rejects unsupported, oversized and corrupt images", async () => {
  for (const file of [
    new File(["gif"], "logo.gif", { type: "image/gif" }),
    new File(["not svg"], "logo.svg", { type: "image/svg+xml" }),
    new File([new Uint8Array(10 * 1024 * 1024 + 1)], "logo.png", { type: "image/png" }),
    new File(["not an image"], "logo.png", { type: "image/png" }),
  ]) {
    const form = new FormData();
    form.set("logo", file);
    await assert.rejects(readPolicyCraftOrganizationLogo(form, true), PolicyCraftOrganizationInputError);
  }
});

test("valid logos are processed as bounded PNG assets", async () => {
  const input = await sharp({ create: { width: 3200, height: 1600, channels: 3, background: "#123456" } }).jpeg().toBuffer();
  const form = new FormData();
  form.set("logo", new File([new Uint8Array(input)], "logo.jpg", { type: "image/jpeg" }));
  const result = await readPolicyCraftOrganizationLogo(form, true);
  assert.ok(result);
  assert.equal(result.width, 3000);
  assert.equal(result.height, 1500);
  assert.equal((await sharp(result.bytes).metadata()).format, "png");
});

test("SVG logos are rasterized to high-resolution PNG assets", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40" width="120" height="40"><script>alert(1)</script><rect width="120" height="40" fill="#176B45"/></svg>';
  const form = new FormData();
  form.set("logo", new File([svg], "logo.svg", { type: "image/svg+xml" }));
  const result = await readPolicyCraftOrganizationLogo(form, true);
  assert.ok(result);
  assert.equal(result.width, 2000);
  assert.equal(result.height, 667);
  assert.equal((await sharp(result.bytes).metadata()).format, "png");
});

test("SVG logos are recognised by content even when the declared MIME type is missing or generic", async () => {
  const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generator: Adobe Illustrator 27.0.0, SVG Export Plug-In -->\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 80"><rect width="300" height="80" fill="#2E7D32"/></svg>';
  for (const type of ["", "application/octet-stream", "text/xml"]) {
    const outgoing = new FormData();
    outgoing.set("logo", new File([svg], "growlity.svg", { type }));
    // Round-trip through a real multipart body, as a route handler receives it.
    const form = await new Request("http://localhost/upload", { method: "POST", body: outgoing }).formData();
    const result = await readPolicyCraftOrganizationLogo(form, true);
    assert.ok(result, `declared type "${type}"`);
    assert.equal(result.width, 2000);
  }
});
