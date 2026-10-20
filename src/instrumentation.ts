export async function register() {
  // Warm the Typst policy engine in the background so the first live preview
  // after a start (or a cold serverless instance) renders at warm speed.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.POLICY_PDF_ENGINE !== "typst") return;
  const { warmPolicyTypst } = await import("./lib/typst/policy/render");
  const started = performance.now();
  void warmPolicyTypst()
    .then(() => console.log(`Typst policy engine warm in ${Math.round(performance.now() - started)} ms`))
    .catch((error) => console.error("Typst policy warm-up failed", error));
}
