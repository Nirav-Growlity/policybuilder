import assert from "node:assert/strict";
import test from "node:test";
import { makeSamplePolicy } from "../store";
import { generatePdf } from "./generate";

test("generatePdf returns a non-empty PDF buffer", async () => {
  const output = await generatePdf(makeSamplePolicy());

  assert.ok(Buffer.isBuffer(output));
  assert.ok(output.length > 0);
  assert.equal(output.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(output.toString("latin1"), /\/MediaBox \[0 0 59[45]\.\d+ 84[12]\.\d+\]/);
});

test("generatePdf renders a custom gradient theme as A4", async () => {
  const policy = makeSamplePolicy();
  policy.documentThemeOverrides = {
    schemaVersion: 1,
    colors: { primary: "#315C49", accent: "#B47B36" },
    background: { kind: "gradient", from: "#FFFFFF", to: "#E7F0EA", direction: "vertical" },
    density: "compact",
    logoScale: "large",
  };
  const output = await generatePdf(policy);

  assert.ok(output.length > 0);
  assert.equal(output.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(output.toString("latin1"), /\/MediaBox \[0 0 59[45]\.\d+ 84[12]\.\d+\]/);
});
