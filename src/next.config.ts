import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep a stale development trace from blocking local compilation.
  distDir: process.env.NODE_ENV === "development" ? ".next-local" : ".next",
  // The policy PDF engine (lib/pdf/generate.tsx); the client reads it to pace the live preview.
  env: { POLICY_PDF_ENGINE: process.env.POLICY_PDF_ENGINE === "typst" ? "typst" : "chromium" },
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium", "@myriaddreamin/typst-ts-node-compiler"],
  // Route changes run inside document view transitions; only the workspace
  // shell declares <ViewTransition> boundaries, so other pages are unaffected.
  experimental: { viewTransition: true },
  outputFileTracingIncludes: {
    // Chromium prints today's PDF; the Typst engine (POLICY_PDF_ENGINE=typst) reads its template and the Word TTFs.
    "/api/export/pdf": ["./public/fonts/**/*", "./lib/typst/policy/**/*", "./node_modules/playwright-core/browsers.json", "./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/export/docx": ["./public/fonts/**/*"],
    "/api/pdf-worker": ["./node_modules/pdfjs-dist/build/pdf.worker.min.mjs"],
    // The SOP manual engine reads its Typst template and TTF fonts from disk.
    "/api/documents/manuals/[id]/pdf": ["./lib/typst/sop/**/*", "./public/fonts/word/**/*"],
    "/api/documents/manuals/[id]/preview": ["./lib/typst/sop/**/*", "./public/fonts/word/**/*"],
    "/api/documents/manuals/[id]/docx": ["./public/fonts/word/**/*"],
  },
};

export default nextConfig;
