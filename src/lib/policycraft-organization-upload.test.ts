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
    new File(["svg"], "logo.svg", { type: "image/svg+xml" }),
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
