export async function register() {
  // Warm the Typst policy engine in the background so the first live preview
  // after a start (or a cold serverless instance) renders at warm speed.
  // POLICY_TYPST_WARMUP is fixed at build time (next.config.ts). Off on Vercel:
  // every function bundles instrumentation's files, and this import would put
  // the compiler and fonts in all of them.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.POLICY_PDF_ENGINE !== "typst" || process.env.POLICY_TYPST_WARMUP !== "boot") return;
  const { warmPolicyTypst } = await import("./lib/typst/policy/render");
  const started = performance.now();
  void warmPolicyTypst()
    .then(() => console.log(`Typst policy engine warm in ${Math.round(performance.now() - started)} ms`))
    .catch((error) => console.error("Typst policy warm-up failed", error));
}
