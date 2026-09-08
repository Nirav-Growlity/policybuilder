import assert from "node:assert/strict";
import test from "node:test";
import { COVER_MOTIF_SCENES, isCoverMotifScene, motifSvg } from "./cover-motifs";
import { DOCUMENT_THEMES } from "./document-themes";
import { DOCUMENT_FONT_FAMILIES, fontFaceCssFor } from "./document-fonts";

const HEX = /^#[0-9A-F]{6}$/i;

test("all 25 cover scenes produce valid self-contained SVG motifs", () => {
  assert.equal(COVER_MOTIF_SCENES.length, 25);
  assert.equal(new Set(COVER_MOTIF_SCENES).size, 25);
  for (const scene of COVER_MOTIF_SCENES) {
    const svg = motifSvg(scene, {
      primary: "#123456",
      accent: "#ABCDEF",
      soft: "#F0F0F0",
      line: "#CCCCCC",
      paper: "#FFFFFF",
      ink: "#111111",
    });
    assert.ok(svg.startsWith("<svg xmlns="), scene);
    assert.ok(svg.includes("viewBox="), scene);
    assert.ok(svg.endsWith("</svg>"), scene);
    // Self-contained: no remote references, no text elements (font-dependent in Word).
    const withoutXmlns = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
    assert.ok(!/xlink:href|https?:\/\//.test(withoutXmlns), `${scene} references remote assets`);
    assert.ok(!/<text[\s>]/.test(svg), `${scene} uses font-dependent text`);
    // Theme colors are actually applied.
    assert.ok(svg.includes("#123456"), `${scene} ignores primary`);
    // Deterministic output.
    assert.equal(motifSvg(scene), motifSvg(scene), `${scene} is not deterministic`);
  }
});

test("every template cover scene has a matching motif", () => {
  for (const theme of DOCUMENT_THEMES) {
    assert.ok(isCoverMotifScene(theme.layout.cover), `${theme.id} cover has no motif`);
    assert.equal(theme.layout.motif, theme.layout.cover, `${theme.id} motif does not match cover`);
  }
});

test("every template font family ships self-hosted @font-face rules", () => {
  const themed = new Set<string>();
  for (const theme of DOCUMENT_THEMES) {
    themed.add(theme.defaults.typography.fontFamily);
    if (theme.defaults.typography.headingFontFamily) themed.add(theme.defaults.typography.headingFontFamily);
  }
  for (const family of themed) {
    assert.ok(DOCUMENT_FONT_FAMILIES.includes(family), `no @font-face rules for ${family}`);
    const css = fontFaceCssFor([family]);
    assert.ok(css.includes(`font-family:'${family}'`), `empty @font-face for ${family}`);
  }
  // Filtering returns only the requested families (keeps exported PDFs small).
  const single = fontFaceCssFor(["Inter"]);
  assert.ok(single.includes("font-family:'Inter'"));
  assert.ok(!single.includes("font-family:'Fraunces'"));
  assert.equal(fontFaceCssFor([]), "");
});

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => {
    const channel = parseInt(hex.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

test("every template palette keeps body text and headings readable", () => {
  for (const theme of DOCUMENT_THEMES) {
    const { colors } = theme;
    for (const [key, value] of Object.entries(colors)) assert.match(value as string, HEX, `${theme.id}.${key}`);
    // Body copy on paper must meet WCAG AA.
    assert.ok(contrast(colors.ink, colors.paper) >= 4.5, `${theme.id} ink/paper contrast`);
    // Primary accents on paper must work for large headings.
    assert.ok(contrast(colors.primary, colors.paper) >= 3, `${theme.id} primary/paper contrast`);
  }
});
