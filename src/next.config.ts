import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep a stale development trace from blocking local compilation.
  distDir: process.env.NODE_ENV === "development" ? ".next-local" : ".next",
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // Route changes run inside document view transitions; only the workspace
  // shell declares <ViewTransition> boundaries, so other pages are unaffected.
  experimental: { viewTransition: true },
  outputFileTracingIncludes: {
    "/api/export/pdf": ["./public/fonts/**/*", "./node_modules/playwright-core/browsers.json", "./node_modules/@sparticuz/chromium/bin/**/*"],
    "/api/export/docx": ["./public/fonts/**/*"],
    "/api/pdf-worker": ["./node_modules/pdfjs-dist/build/pdf.worker.min.mjs"],
  },
};

export default nextConfig;
