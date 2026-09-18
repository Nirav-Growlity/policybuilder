import assert from "node:assert/strict";
import test from "node:test";
import { createAICoverName, coverCompositionsEqual } from "./ai-cover-library";
import type { CoverComposition } from "./types";

const composition = (assetId = "asset-1"): CoverComposition => ({
  schemaVersion: 1,
  sourceTemplateId: "ai-generated",
  background: { color: "#FFFFFF", assetId, fit: "cover", focalPoint: { x: 50, y: 50 } },
  elements: [],
});

test("AI cover names are timestamped and suitable for library entries", () => {
  assert.equal(createAICoverName(new Date("2026-09-18T10:30:00.000Z")), "AI cover · 2026-09-18 10:30");
});

test("AI cover composition equality distinguishes old library items", () => {
  assert.equal(coverCompositionsEqual(composition(), composition()), true);
  assert.equal(coverCompositionsEqual(composition(), composition("asset-2")), false);
  assert.equal(coverCompositionsEqual(composition(), undefined), false);
});
