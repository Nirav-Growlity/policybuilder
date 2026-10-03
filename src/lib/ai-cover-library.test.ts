import assert from "node:assert/strict";
import test from "node:test";
import { createAICoverName, coverCompositionsEqual, filterAICoverLibrary, persistCoverArtwork, saveAICoverToLibrary } from "./ai-cover-library";
import { usePolicyCraftScope } from "./policycraft-client-scope";
import type { CoverComposition, CoverLibraryItem } from "./types";

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

test("AI cover library only returns templates for the active policy type", () => {
  const item = (id: string, policyType?: CoverLibraryItem["policyType"], source: CoverLibraryItem["source"] = "ai"): CoverLibraryItem => ({
    id, name: id, policyType, source, composition: composition(id), previewAssetId: null, lockVersion: 1, createdByUserId: 1,
    createdAt: "2026-09-18T10:30:00.000Z", updatedAt: "2026-09-18T10:30:00.000Z",
  });

  assert.deepEqual(
    filterAICoverLibrary([item("environmental", "environmental"), item("ethics", "ethics"), item("legacy"), item("manual", "environmental", "manual")], "environmental").map((entry) => entry.id),
    ["environmental"],
  );
});

test("AI cover library removes duplicate compositions", () => {
  const item = (id: string, name: string, composition: CoverComposition): CoverLibraryItem => ({
    id, name, policyType: "environmental", source: "ai", composition, previewAssetId: null, lockVersion: 1, createdByUserId: 1,
    createdAt: "2026-09-18T10:30:00.000Z", updatedAt: "2026-09-18T10:30:00.000Z",
  });

  assert.deepEqual(
    filterAICoverLibrary([item("first", "AI cover", composition()), item("duplicate", "Recovered AI cover", composition()), item("other", "Other", composition("asset-2"))], "environmental").map((entry) => entry.id),
    ["first", "other"],
  );
});

test("saving an AI cover reuses an existing identical composition", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const existing: CoverLibraryItem = {
    id: "existing-id", name: "AI cover", policyType: "environmental", source: "ai", composition: composition(), previewAssetId: null, lockVersion: 1, createdByUserId: 1,
    createdAt: "2026-09-18T10:30:00.000Z", updatedAt: "2026-09-18T10:30:00.000Z",
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("source=ai")) return Response.json({ templates: [existing] });
    return Response.json({ id: "new-id" }, { status: 201 });
  };
  try {
    assert.deepEqual(await saveAICoverToLibrary(composition(), "environmental"), { id: "existing-id" });
    assert.deepEqual(calls, ["/api/policycraft/cover-templates?source=ai&policyType=environmental"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("AI cover library reads and saves carry the captured organization", async () => {
  const originalFetch = globalThis.fetch;
  const originalScope = usePolicyCraftScope.getState().scope;
  const scope = { userId: "manager-library", role: "manager" as const, organizationId: 54, organizationName: "Northwind" };
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return String(input).includes("source=ai") ? Response.json({ templates: [] }) : Response.json({ id: "saved-cover" }, { status: 201 });
  };
  try {
    usePolicyCraftScope.getState().setScope(scope);
    assert.deepEqual(await saveAICoverToLibrary(composition(), "environmental", "Scoped cover", scope), { id: "saved-cover" });
    assert.deepEqual(calls, [
      "/api/policycraft/cover-templates?source=ai&policyType=environmental&orgId=54",
      "/api/policycraft/cover-templates?orgId=54",
    ]);
  } finally {
    usePolicyCraftScope.getState().setScope(originalScope);
    globalThis.fetch = originalFetch;
  }
});

test("AI cover artwork uploads use the organization captured before the upload", async () => {
  const originalFetch = globalThis.fetch;
  const originalScope = usePolicyCraftScope.getState().scope;
  const scope = { userId: "manager-upload", role: "manager" as const, organizationId: 63, organizationName: "Northwind" };
  const requests: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("data:")) return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    requests.push({ url, init });
    return Response.json({ asset: { id: "uploaded-cover" } }, { status: 201 });
  };
  try {
    usePolicyCraftScope.getState().setScope(scope);
    const persisted = await persistCoverArtwork(composition("data:image/png;base64,YQ=="), scope);
    assert.equal(persisted.background.assetId, "uploaded-cover");
    assert.equal(new URL(requests[0].url, "https://policycraft.invalid").searchParams.get("orgId"), "63");
    assert.equal(requests[0].init?.cache, "no-store");
    assert.ok(requests[0].init?.body instanceof FormData);
  } finally {
    usePolicyCraftScope.getState().setScope(originalScope);
    globalThis.fetch = originalFetch;
  }
});
