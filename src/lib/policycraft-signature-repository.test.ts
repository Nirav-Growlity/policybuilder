import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { InvalidSignatureError, normalizePolicyCraftSignature } from "./policycraft-signature-repository";

test("normalizes a PNG signature and constrains its dimensions", async () => {
  const source = await sharp({
    create: { width: 2400, height: 600, channels: 4, background: { r: 20, g: 40, b: 80, alpha: 0.6 } },
  }).png().toBuffer();

  const normalized = await normalizePolicyCraftSignature(`data:image/png;base64,${source.toString("base64")}`);
  const metadata = await sharp(normalized).metadata();

  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 400);
  assert.ok(normalized.byteLength <= 512 * 1024);
});

test("rejects non-PNG, malformed, and oversized signature input", async () => {
  await assert.rejects(
    normalizePolicyCraftSignature("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="),
    InvalidSignatureError,
  );
  await assert.rejects(
    normalizePolicyCraftSignature("data:image/png;base64,not-base64!"),
    InvalidSignatureError,
  );
  await assert.rejects(
    normalizePolicyCraftSignature(`data:image/png;base64,${"A".repeat(1_400_000)}`),
    InvalidSignatureError,
  );
});
