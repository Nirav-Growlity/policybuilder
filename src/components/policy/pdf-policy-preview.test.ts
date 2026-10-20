import assert from "node:assert/strict";
import test from "node:test";
import { getPdfCanvasTransform, getPdfPageWidth } from "@/lib/pdf-preview-layout";
import { clearPolicyPreviewCache, requestPolicyPreview } from "@/lib/pdf/policy-preview-request";
import { policyCraftExportContext, usePolicyCraftScope } from "@/lib/policycraft-client-scope";
import type { PolicyCraftWorkspaceScope } from "@/lib/policycraft-access-types";

const scope = (userId: string, organizationId: number, documentId = "document-7"): PolicyCraftWorkspaceScope => ({
  userId,
  role: "manager",
  organizationId,
  organizationName: `Organization ${organizationId}`,
  documentId,
});

test("all rendered PDF pages use the same preview width", () => {
  const targetWidth = 1000;

  assert.equal(getPdfPageWidth(1, targetWidth), targetWidth);
  assert.equal(getPdfPageWidth(2, targetWidth), targetWidth);
});

test("fractional PDF preview dimensions map across the entire rounded canvas", () => {
  const viewportWidth = 997.25;
  const viewportHeight = 1410.67;
  for (const devicePixelRatio of [1, 1.25, 2]) {
    const canvasWidth = Math.ceil(viewportWidth * devicePixelRatio);
    const canvasHeight = Math.ceil(viewportHeight * devicePixelRatio);
    const transform = getPdfCanvasTransform(viewportWidth, viewportHeight, canvasWidth, canvasHeight);

    assert.ok(Math.abs(transform[0] * viewportWidth - canvasWidth) < 1e-9);
    assert.ok(Math.abs(transform[3] * viewportHeight - canvasHeight) < 1e-9);
  }
});

test("preview requests are deduplicated within a workspace and invalidated across accounts", async () => {
  const originalFetch = globalThis.fetch;
  const originalScope = usePolicyCraftScope.getState().scope;
  const pending: ((response: Response) => void)[] = [];
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return await new Promise<Response>((resolve) => pending.push(resolve));
  };
  const firstScope = scope("manager-a", 41);
  const secondScope = scope("manager-b", 41);
  const body = JSON.stringify({ policy: { id: "document-7" }, ...policyCraftExportContext(firstScope) });
  const request = (workspace: PolicyCraftWorkspaceScope) => requestPolicyPreview({ key: "same-document", body, includeAuthorSignature: false, scope: workspace });
  try {
    clearPolicyPreviewCache();
    usePolicyCraftScope.getState().setScope(firstScope);
    const first = request(firstScope);
    const duplicate = request(firstScope);
    assert.strictEqual(first, duplicate, "same-workspace previews should share an in-flight request");
    assert.equal(requests, 1);

    usePolicyCraftScope.getState().setScope(secondScope);
    const otherAccount = request(secondScope);
    assert.equal(requests, 2, "another account must not reuse the first account's in-flight PDF");
    pending[0](new Response(new Uint8Array([37, 80, 68, 70, 45, 1])));
    pending[1](new Response(new Uint8Array([37, 80, 68, 70, 45, 2])));
    await Promise.all([first, otherAccount]);

    const cachedForSecond = await request(secondScope);
    assert.equal(cachedForSecond[5], 2, "the active account may reuse its own completed preview");
    assert.equal(requests, 2);
  } finally {
    clearPolicyPreviewCache();
    usePolicyCraftScope.getState().setScope(originalScope);
    globalThis.fetch = originalFetch;
  }
});

test("signature-bearing previews are never cached", async () => {
  const originalFetch = globalThis.fetch;
  const originalScope = usePolicyCraftScope.getState().scope;
  const workspace = scope("manager-signature", 42);
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(new Uint8Array([37, 80, 68, 70, 45, requests]));
  };
  try {
    clearPolicyPreviewCache();
    usePolicyCraftScope.getState().setScope(workspace);
    const preview = () => requestPolicyPreview({ key: "signed-document", body: "{}", includeAuthorSignature: true, scope: workspace });
    await preview();
    await preview();
    assert.equal(requests, 2);
  } finally {
    clearPolicyPreviewCache();
    usePolicyCraftScope.getState().setScope(originalScope);
    globalThis.fetch = originalFetch;
  }
});

test("a superseded preview stops its fetch only once no preview waits for it", async () => {
  const originalFetch = globalThis.fetch;
  const originalScope = usePolicyCraftScope.getState().scope;
  const workspace = scope("manager-abort", 43);
  const signals: AbortSignal[] = [];
  globalThis.fetch = async (_input, init) => {
    signals.push(init!.signal!);
    return await new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)));
  };
  const request = (signal: AbortSignal) => requestPolicyPreview({ key: "edited-document", body: "{}", includeAuthorSignature: false, scope: workspace, signal });
  try {
    clearPolicyPreviewCache();
    usePolicyCraftScope.getState().setScope(workspace);
    const pane = new AbortController();
    const design = new AbortController();
    const fromPane = request(pane.signal);
    const fromDesign = request(design.signal);
    assert.equal(signals.length, 1, "both previews share one fetch");

    pane.abort();
    await assert.rejects(fromPane, { name: "AbortError" });
    assert.equal(signals[0].aborted, false, "the design preview still waits for the shared fetch");

    design.abort();
    await assert.rejects(fromDesign, { name: "AbortError" });
    assert.equal(signals[0].aborted, true, "the fetch stops once nobody waits");

    const again = new AbortController();
    void request(again.signal).catch(() => undefined);
    assert.equal(signals.length, 2, "an undo back to the same content starts a fresh request");
    again.abort();
  } finally {
    clearPolicyPreviewCache();
    usePolicyCraftScope.getState().setScope(originalScope);
    globalThis.fetch = originalFetch;
  }
});
