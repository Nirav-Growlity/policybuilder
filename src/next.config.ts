import { readdirSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

/*
 * Server function bundles (Vercel "Functions Storage").
 *
 * Code that reads from `process.cwd()` makes the tracer copy whole folders
 * (all of public/, every font) into the route, and each route is its own
 * function in every deployment. The lists below give each route only the
 * files it opens at run time. Route keys are globs, so `[id]` is written `*`.
 */

const policyPdfEngine = process.env.POLICY_PDF_ENGINE === "typst" ? "typst" : "chromium";

/** Must equal SOP_FONT_FAMILIES (lib/sop/design/templates.ts); lib/output-tracing.test.ts checks it. */
export const SOP_FONT_SLUGS = ["caladea", "carlito", "montserrat", "open-sans", "poppins", "lato", "arimo", "merriweather", "pt-sans", "tinos"];

/** Word TTFs no SOP template uses; the SOP routes leave them out. */
function nonSopWordFonts(): string[] {
  try {
    return readdirSync(join(process.cwd(), "public", "fonts", "word"))
      .filter((file) => !SOP_FONT_SLUGS.some((slug) => /^(regular|bold|italic|bold-italic)\.ttf$/.test(file.slice(slug.length + 1)) && file.startsWith(`${slug}-`)))
      .map((file) => `./public/fonts/word/${file}`);
  } catch {
    return [];
  }
}

// Exclude globs match anywhere in a path, so `public/fonts/*` would also drop
// public/fonts/word; name the top-level faces by extension instead.
const BROWSER_FONTS = ["./public/fonts/*.woff2", "./public/fonts/*.ttf"];
const TYPST_COMPILER = "./node_modules/@myriaddreamin/typst-ts-node-compiler*/**/*";
const CHROMIUM = ["./node_modules/@sparticuz/chromium/**/*", "./node_modules/playwright-core/**/*"];
/** Only lib/docx/generate.ts embeds these (20 MB of print JPEGs). */
const PRINT_SDG_ICONS = "./public/E SDG Icons PRINT/**/*";
/** Typst-only faces: extra weights and optical sizes for the Typst policy PDF. */
const TYPST_POLICY_FONTS = "./public/fonts/typst/**/*";
/** Static files the browser fetches; no server code reads them. */
const BROWSER_ONLY_PUBLIC = ["./public/home/**/*", "./public/template-previews/**/*", "./public/sop-templates/**/*", "./public/sdg/**/*", "./public/*.svg"];

export const outputFileTracingIncludes: NextConfig["outputFileTracingIncludes"] = {
  // Chromium inlines the woff2 faces and public images; Typst reads its template and TTFs.
  "/api/export/pdf": policyPdfEngine === "typst"
    ? ["./lib/typst/policy/**/*", "./public/fonts/word/**/*", "./public/fonts/typst/**/*"]
    : ["./public/fonts/*", "./node_modules/playwright-core/browsers.json", "./node_modules/@sparticuz/chromium/bin/**/*"],
  "/api/export/docx": ["./public/fonts/word/**/*"],
  "/api/pdf-worker": ["./node_modules/pdfjs-dist/build/pdf.worker.min.mjs"],
  // The SOP manual engine reads its Typst template and TTF fonts from disk;
  // the Word download lays the manual out once for its page numbers.
  "/api/documents/manuals/*/pdf": ["./lib/typst/sop/**/*", "./public/fonts/word/**/*"],
  "/api/documents/manuals/*/preview": ["./lib/typst/sop/**/*", "./public/fonts/word/**/*"],
  "/api/documents/manuals/*/docx": ["./lib/typst/sop/**/*", "./public/fonts/word/**/*"],
};

const sopManualExcludes = [TYPST_POLICY_FONTS, ...BROWSER_FONTS, ...nonSopWordFonts(), PRINT_SDG_ICONS, ...BROWSER_ONLY_PUBLIC];

export const outputFileTracingExcludes: NextConfig["outputFileTracingExcludes"] = {
  // Vercel runs x64 glibc Linux; musl builds of the native modules never load.
  "**": [
    "./node_modules/@myriaddreamin/typst-ts-node-compiler-linux-x64-musl/**/*",
    "./node_modules/@img/sharp-linuxmusl-x64/**/*",
    "./node_modules/@img/sharp-libvips-linuxmusl-x64/**/*",
  ],
  // lib/pdf/generate.tsx loads only the engine picked at build time, so the other one's binaries stay out.
  "/api/export/pdf": policyPdfEngine === "typst"
    ? [...CHROMIUM, ...BROWSER_FONTS, PRINT_SDG_ICONS]
    : [TYPST_COMPILER, "./lib/typst/**/*", "./public/fonts/word/**/*", TYPST_POLICY_FONTS, PRINT_SDG_ICONS],
  "/api/export/docx": [TYPST_POLICY_FONTS, ...BROWSER_FONTS, ...BROWSER_ONLY_PUBLIC],
  "/api/documents/manuals/*/pdf": sopManualExcludes,
  "/api/documents/manuals/*/preview": sopManualExcludes,
  "/api/documents/manuals/*/docx": sopManualExcludes,
};

const nextConfig: NextConfig = {
  // Keep a stale development trace from blocking local compilation.
  distDir: process.env.NODE_ENV === "development" ? ".next-local" : ".next",
  // The policy PDF engine (lib/pdf/generate.tsx); the client reads it to pace the live preview.
  // POLICY_TYPST_WARMUP: instrumentation.ts warms the Typst engine at boot on a
  // long-running server. Vercel copies instrumentation's traced files into every
  // function (about 90 MB with the compiler and fonts), so there the first
  // export starts the compiler instead.
  env: { POLICY_PDF_ENGINE: policyPdfEngine, POLICY_TYPST_WARMUP: process.env.VERCEL ? "off" : "boot" },
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium", "@myriaddreamin/typst-ts-node-compiler"],
  // Route changes run inside document view transitions; only the workspace
  // shell declares <ViewTransition> boundaries, so other pages are unaffected.
  experimental: { viewTransition: true },
  outputFileTracingIncludes,
  outputFileTracingExcludes,
};

export default nextConfig;
