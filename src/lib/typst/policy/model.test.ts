import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { DOCUMENT_FONT_ALIASES, DOCUMENT_FONT_FAMILIES } from "../../document-fonts";
import { DOCUMENT_THEMES, getDocumentThemePatch } from "../../document-themes";
import { makeSamplePolicy } from "../../store";
import type { Policy } from "../../types";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { policyFontFiles, typstFontFamily } from "../fonts";
import { TYPST_FONT_FAMILIES, TYPST_OPTICAL_SIZES } from "../typst-font-set";
import { preparePolicyTypstRender, type PolicyTypstModel } from "./model";

const ONE_PIXEL_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function themedPolicy(themeId: (typeof DOCUMENT_THEMES)[number]["id"]): Policy {
  const policy = structuredClone(makeSamplePolicy());
  Object.assign(policy, getDocumentThemePatch(themeId), { documentTheme: themeId });
  return policy;
}

/** Every "/assets/..." path the model points at. */
function referencedAssets(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string" && value.startsWith("/assets/")) found.add(value);
  else if (Array.isArray(value)) value.forEach((item) => referencedAssets(item, found));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => referencedAssets(item, found));
  return found;
}

const contentOf = <T extends PolicyTypstModel["sections"][number]["content"]["type"]>(model: PolicyTypstModel, type: T) =>
  model.sections.find((section) => section.content.type === type)?.content as Extract<PolicyTypstModel["sections"][number]["content"], { type: T }> | undefined;

test("every template yields a JSON model whose fonts and images all exist", async () => {
  for (const theme of DOCUMENT_THEMES) {
    const { model, assets } = await preparePolicyTypstRender(themedPolicy(theme.id));
    // Typst reads model.json; an undefined value would vanish and break a key lookup.
    assert.deepEqual(JSON.parse(JSON.stringify(model)), model, `${theme.id}: model must survive JSON without losing keys`);
    for (const family of [model.typography.body, model.typography.heading]) {
      assert.equal(typstFontFamily(family, "missing"), family, `${theme.id}: ${family} must have a TTF`);
    }
    const files = new Set(assets.map((asset) => `/${asset.path}`));
    for (const reference of referencedAssets(model)) assert.ok(files.has(reference), `${theme.id}: ${reference} must be a workspace file`);
    assert.equal(model.theme.id, theme.id);
    assert.ok(model.sections.length > 0, `${theme.id}: sections`);
    assert.equal(model.cover.kind, "standard");
  }
});

test("every family the font picker offers has a TTF for Typst", () => {
  for (const family of DOCUMENT_FONT_FAMILIES) {
    assert.equal(typstFontFamily(family, "missing"), DOCUMENT_FONT_ALIASES[family] ?? family, `${family} must not fall back`);
  }
  assert.equal(typstFontFamily("Arial", "Inter"), "Arimo");
  assert.equal(typstFontFamily("'Times New Roman', serif", "Inter"), "Tinos");
  assert.equal(typstFontFamily("Comic Sans MS", "Inter"), "Inter");
});

test("the page geometry follows the Chromium print margins", async () => {
  const plain = (await preparePolicyTypstRender(themedPolicy("standard-pack"))).model;
  assert.deepEqual([plain.page.marginTopMm, plain.page.marginXMm, plain.page.marginBottomMm], [22, 22, 22]);
  assert.deepEqual(plain.header.brand, { kind: "name", text: plain.meta.author, widthMm: 28 });

  const withLogo = themedPolicy("standard-pack");
  withLogo.company.companyLogo = ONE_PIXEL_PNG;
  // At the default size the logo fits the 22 mm margin; a large one needs more room.
  withLogo.documentThemeOverrides = { schemaVersion: 1, logoScale: 180 };
  const logoModel = (await preparePolicyTypstRender(withLogo)).model;
  assert.equal(logoModel.header.brand.kind, "logo");
  assert.ok(logoModel.page.marginTopMm > 22, "a logo reserves a taller header band");
});

test("an AI cover becomes one full-page raster with live text layers", async () => {
  const policy = themedPolicy("standard-pack");
  const artwork = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="140"><rect width="100" height="140" fill="#126845"/></svg>').toString("base64")}`;
  policy.activeCoverVariant = "ai";
  policy.aiCoverComposition = {
    schemaVersion: 1,
    sourceTemplateId: "ai-generated",
    background: { color: "#FFFFFF", assetId: artwork, fit: "cover", focalPoint: { x: 50, y: 50 } },
    elements: [{
      id: "policy-title", type: "text", x: 20, y: 150, width: 170, height: 60, rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false,
      content: { kind: "binding", binding: "policyTitle" }, fontFamily: "Arial", fontSize: 36, color: "#FFFFFF",
      bold: true, italic: false, underline: false, align: "left", lineHeight: 1.16, letterSpacing: 0,
    }],
  };
  const { model, assets } = await preparePolicyTypstRender(policy);
  assert.equal(model.cover.kind, "composition");
  if (model.cover.kind !== "composition") return;
  const coverImage = model.cover.image;
  const raster = assets.find((asset) => `/${asset.path}` === coverImage);
  assert.ok(raster);
  const metadata = await sharp(raster.content).metadata();
  assert.deepEqual([metadata.format, metadata.width, metadata.height], ["jpeg", 2480, 3508]);
  const pixel = await sharp(raster.content).extract({ left: 400, top: 400, width: 1, height: 1 }).raw().toBuffer();
  assert.ok(pixel[1] > pixel[0] * 2, "the artwork is drawn at full strength into the raster");
  const title = model.cover.texts.find((text) => text.lines.join(" ").includes("Policy"));
  assert.ok(title, "the title stays a text layer");
  assert.equal(title.font, "Arimo");
  assert.equal(title.outline, true, "AI titles keep the Word-style outline");
});

test("data treatments, SDG display and lists follow the HTML preview", async () => {
  const corporate = themedPolicy("sustainability-charter");
  corporate.visualStyle = "corporate";
  corporate.sdgDisplay = "names";
  const formal = (await preparePolicyTypstRender(corporate)).model;
  assert.equal(contentOf(formal, "quantitative")?.treatment, "table");
  assert.equal(contentOf(formal, "responsibilities")?.treatment, "table");
  const names = contentOf(formal, "sdg");
  assert.ok(names?.goals.length, "the sample policy has SDG goals");
  assert.ok(names.goals.every((goal) => goal.icon === null));

  const modern = themedPolicy("sustainability-charter");
  modern.visualStyle = "modern";
  modern.sdgDisplay = "tiles";
  const { model, assets } = await preparePolicyTypstRender(modern);
  const quantitative = contentOf(model, "quantitative");
  assert.ok(quantitative && ["bands", "modern"].includes(quantitative.treatment), "target-bands templates use bands unless dense");
  assert.ok(quantitative.groups.every((group) => group.targets.every((target) => target.length > 0)));
  const tiles = contentOf(model, "sdg");
  assert.ok(tiles);
  assert.ok(tiles.goals.every((goal) => goal.icon && assets.some((asset) => `/${asset.path}` === goal.icon)), "each tile has its icon file");
  assert.equal(tiles.mosaic, true);
});

test("contents, acknowledgement and signature", async () => {
  const policy = themedPolicy("people-charter");
  policy.showTableOfContents = true;
  policy.showAcknowledgement = true;
  const signed = await preparePolicyTypstRender(policy, { displayName: "A. Raman", date: "19-10-2026", signatureDataUrl: ONE_PIXEL_PNG });
  assert.equal(signed.model.toc?.entries.at(-1)?.id, "acknowledgement");
  assert.equal(signed.model.toc?.entries.length, signed.model.sections.length + 1);
  assert.ok(signed.model.acknowledgement?.signature);
  assert.ok(signed.assets.some((asset) => asset.path.startsWith("assets/signature.")));

  policy.showTableOfContents = false;
  const unsigned = await preparePolicyTypstRender(policy);
  assert.equal(unsigned.model.toc, null);
  assert.equal(unsigned.model.acknowledgement?.signature, null);
  assert.ok(!unsigned.assets.some((asset) => asset.path.startsWith("assets/signature.")));
});

test("the Typst font set replaces the Word faces it covers and has every optical size it lists", () => {
  const slug = (family: string) => family.toLowerCase().replaceAll(" ", "-");
  const files = policyFontFiles().map((file) => basename(file));
  for (const family of TYPST_FONT_FAMILIES) {
    for (const slot of ["regular", "bold", "italic", "bold-italic"]) assert.ok(!files.includes(`${slug(family)}-${slot}.ttf`), `${family}: Word ${slot} face must not load`);
    assert.ok(existsSync(join("public", "fonts", "typst", `${slug(family)}-600.ttf`)), `${family}: Typst set missing`);
  }
  for (const [family, weights] of Object.entries(TYPST_OPTICAL_SIZES)) {
    for (const sizes of Object.values(weights)) {
      for (const size of sizes) assert.ok(files.some((file) => file.startsWith(`${slug(`${family} Opsz ${size}`)}-`)), `${family} at ${size}px`);
    }
  }
});
