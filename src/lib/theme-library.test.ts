import assert from "node:assert/strict";
import test from "node:test";
import { initialPolicy } from "./store";
import {
  createSavedDocumentTheme,
  getSavedThemePatch,
  isSavedThemeNameAvailable,
  nextThemeCopyName,
  normalizeSavedDocumentTheme,
} from "./theme-library";

test("saved theme names are unique regardless of case", () => {
  const theme = createSavedDocumentTheme(initialPolicy(), "Annual Report");
  assert.equal(isSavedThemeNameAvailable([theme], "annual report"), false);
  assert.equal(isSavedThemeNameAvailable([theme], "annual report", theme.id), true);
  assert.equal(nextThemeCopyName([theme], "Annual Report"), "Annual Report copy");
});

test("applying a saved theme copies an independent policy snapshot", () => {
  const policy = initialPolicy();
  policy.documentThemeOverrides = {
    schemaVersion: 1,
    colors: { primary: "#224466" },
    background: { kind: "solid", color: "#F8F8F8" },
    density: "spacious",
    logoScale: "small",
  };
  const saved = createSavedDocumentTheme(policy, "Quiet blue");
  const first = getSavedThemePatch(saved);
  const second = getSavedThemePatch(saved);

  first.documentThemeOverrides!.colors!.primary = "#FFFFFF";
  assert.equal(second.documentThemeOverrides!.colors!.primary, "#224466");
  assert.equal(saved.overrides.colors!.primary, "#224466");
  assert.equal(first.documentThemeOverrides!.customThemeName, "Quiet blue");
});

test("malformed persisted themes are ignored", () => {
  assert.equal(normalizeSavedDocumentTheme({ schemaVersion: 1, id: "broken" }), null);
  assert.equal(normalizeSavedDocumentTheme({
    schemaVersion: 1,
    id: "broken",
    name: "Broken",
    baseThemeId: "unknown",
    typography: {},
    visualStyle: "corporate",
    logoPosition: "left",
    sdgDisplay: "tiles",
  }), null);
});

test("legacy saved base IDs migrate while preserving the saved overrides", () => {
  const current = createSavedDocumentTheme(initialPolicy(), "Legacy green");
  const migrated = normalizeSavedDocumentTheme({ ...current, baseThemeId: "evergreen-heritage" });
  assert.equal(migrated?.baseThemeId, "governance-manual");
  assert.deepEqual(migrated?.overrides, current.overrides);
});
