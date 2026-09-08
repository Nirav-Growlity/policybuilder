import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core"],
  outputFileTracingIncludes: {
    "/api/export/pdf": ["./public/fonts/**/*"],
    "/api/export/docx": ["./public/fonts/**/*"],
    "/api/pdf-worker": ["./node_modules/pdfjs-dist/build/pdf.worker.min.mjs"],
  },
};

export default nextConfig;
