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
