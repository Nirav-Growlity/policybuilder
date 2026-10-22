import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import nextConfig, { SOP_FONT_SLUGS } from "../next.config";
import { SOP_FONT_FAMILIES } from "./sop/design/templates";
import { sopFontFiles } from "./typst/fonts";

// Next matches route keys and exclude globs with picomatch ({ dot, contains })
// against "<project>/<file>" paths (next/dist/build/collect-build-traces.js).
// Paths are posix here, as on Vercel; on Windows Next's excludes never match.
const picomatch = createRequire(import.meta.url)("next/dist/compiled/picomatch") as (glob: string | string[], options: object) => (value: string) => boolean;
const PROJECT = "/project";

function globsFor(map: Record<string, string[]> | undefined, route: string) {
  return Object.entries(map ?? {}).filter(([key]) => picomatch(key, { dot: true, contains: true })(route)).flatMap(([, globs]) => globs);
}

function shipped(route: string, file: string) {
  const excludes = globsFor(nextConfig.outputFileTracingExcludes, route).map((glob) => path.posix.join(PROJECT, glob));
  return !excludes.length || !picomatch(excludes, { dot: true, contains: true })(path.posix.join(PROJECT, file));
}

function included(route: string, file: string) {
  return globsFor(nextConfig.outputFileTracingIncludes, route).some((glob) => picomatch(path.posix.normalize(glob), { dot: true })(file));
}

const projectFile = (absolute: string) => path.relative(process.cwd(), absolute).replaceAll("\\", "/");

test("the SOP font list in next.config.ts matches the SOP templates", () => {
  assert.deepEqual([...SOP_FONT_SLUGS].sort(), SOP_FONT_FAMILIES.map((family) => family.toLowerCase().replaceAll(" ", "-")).sort());
});

for (const route of ["/api/documents/manuals/[id]/pdf", "/api/documents/manuals/[id]/preview", "/api/documents/manuals/[id]/docx"]) {
  test(`${route} ships the SOP template and every SOP font face`, () => {
    for (const file of ["lib/typst/sop/manual.typ", ...sopFontFiles().map(projectFile)]) {
      assert.ok(included(route, file), `${file} is not included`);
      assert.ok(shipped(route, file), `${file} is excluded`);
    }
    assert.ok(shipped(route, "node_modules/@myriaddreamin/typst-ts-node-compiler-linux-x64-gnu/typst-ts-node-compiler.linux-x64-gnu.node"));
    assert.ok(!shipped(route, "public/fonts/typst/inter-400.ttf"));
    assert.ok(!shipped(route, "public/fonts/word/inter-regular.ttf"));
  });
}

test("the policy PDF route ships only the Chromium engine by default", { skip: process.env.POLICY_PDF_ENGINE === "typst" }, () => {
  const route = "/api/export/pdf";
  assert.ok(included(route, "node_modules/@sparticuz/chromium/bin/chromium.br"));
  assert.ok(shipped(route, "node_modules/@sparticuz/chromium/bin/chromium.br"));
  assert.ok(shipped(route, "node_modules/playwright-core/index.js"));
  assert.ok(included(route, "public/fonts/inter-400.woff2"));
  assert.ok(shipped(route, "public/fonts/inter-400.woff2"));
  assert.ok(shipped(route, "public/E SDG Icons WEB/E-WEB-Goal-01.png"));
  assert.ok(!shipped(route, "node_modules/@myriaddreamin/typst-ts-node-compiler-linux-x64-gnu/typst-ts-node-compiler.linux-x64-gnu.node"));
  assert.ok(!shipped(route, "public/fonts/typst/inter-400.ttf"));
  assert.ok(!shipped(route, "public/E SDG Icons PRINT/E_SDG_PRINT-01.jpg"));
});

test("the policy Word route keeps its embedded fonts and print SDG icons", () => {
  const route = "/api/export/docx";
  assert.ok(included(route, "public/fonts/word/inter-regular.ttf"));
  assert.ok(shipped(route, "public/fonts/word/inter-regular.ttf"));
  assert.ok(shipped(route, "public/E SDG Icons PRINT/E_SDG_PRINT-01.jpg"));
  assert.ok(!shipped(route, "public/fonts/typst/inter-400.ttf"));
  assert.ok(!shipped(route, "public/fonts/inter-400.woff2"));
});

test("musl builds of native modules stay out of every function", () => {
  assert.ok(!shipped("/api/ai", "node_modules/@img/sharp-libvips-linuxmusl-x64/lib/libvips-cpp.so"));
  assert.ok(shipped("/api/ai", "node_modules/@img/sharp-libvips-linux-x64/lib/libvips-cpp.so"));
});
