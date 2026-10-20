import { policyCraftScopeKey, usePolicyCraftScope } from "../policycraft-client-scope";
import type { PolicyCraftWorkspaceScope } from "../policycraft-access-types";

type PreviewRequest = {
  key: string;
  body: string;
  includeAuthorSignature: boolean;
  scope: PolicyCraftWorkspaceScope;
  /** Aborted when the caller no longer wants this preview (a newer edit superseded it). */
  signal?: AbortSignal;
};

/** One fetch, shared by every caller asking for the same preview; aborted once none of them waits. */
type PendingPreview = { key: string; promise: Promise<Uint8Array>; controller: AbortController; waiters: number };

const previewCache = new Map<string, Uint8Array>();
const previewRequests = new Map<string, PendingPreview>();
const MAX_CACHED_PREVIEWS = 6;
const PREVIEW_REQUEST_TIMEOUT_MS = 150_000;
let cacheGeneration = 0;
let activeScopeKey = policyCraftScopeKey(usePolicyCraftScope.getState().scope);

/** Prevent a previous account or organization from seeding another workspace's preview. */
export function clearPolicyPreviewCache(): void {
  cacheGeneration += 1;
  previewCache.clear();
  previewRequests.clear();
}

usePolicyCraftScope.subscribe((state) => {
  const nextScopeKey = policyCraftScopeKey(state.scope);
  if (nextScopeKey === activeScopeKey) return;
  activeScopeKey = nextScopeKey;
  clearPolicyPreviewCache();
});

function cachePreview(key: string, bytes: Uint8Array): void {
  previewCache.delete(key);
  previewCache.set(key, bytes);
  while (previewCache.size > MAX_CACHED_PREVIEWS) previewCache.delete(previewCache.keys().next().value!);
}

function abortError() {
  return new DOMException("The preview was superseded.", "AbortError");
}

/** Resolves with the shared fetch, or rejects with an AbortError as soon as this caller's signal aborts. */
function follow(pending: PendingPreview, signal: AbortSignal | undefined): Promise<Uint8Array> {
  if (!signal) {
    // A caller that cannot cancel keeps the fetch alive.
    pending.waiters = Infinity;
    return pending.promise;
  }
  if (signal.aborted) return Promise.reject(abortError());
  pending.waiters += 1;
  return new Promise<Uint8Array>((resolve, reject) => {
    const leave = () => {
      pending.waiters -= 1;
      if (pending.waiters <= 0) {
        // Nobody waits any more: stop the fetch and let the next request start afresh.
        if (previewRequests.get(pending.key) === pending) previewRequests.delete(pending.key);
        pending.controller.abort();
      }
      reject(abortError());
    };
    signal.addEventListener("abort", leave, { once: true });
    pending.promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", leave));
  });
}

export function requestPolicyPreview({ key, body, includeAuthorSignature, scope, signal }: PreviewRequest): Promise<Uint8Array> {
  const scopedKey = JSON.stringify([policyCraftScopeKey(scope), key]);
  const cached = includeAuthorSignature ? undefined : previewCache.get(scopedKey);
  if (cached) {
    previewCache.delete(scopedKey);
    previewCache.set(scopedKey, cached);
    return Promise.resolve(cached);
  }
  const existing = includeAuthorSignature ? undefined : previewRequests.get(scopedKey);
  if (existing) return follow(existing, signal);

  const generation = cacheGeneration;
  const controller = new AbortController();
  const promise = fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.any([controller.signal, AbortSignal.timeout(PREVIEW_REQUEST_TIMEOUT_MS)]),
  }).then(async (response) => {
    if (!response.ok) throw new Error("The preview could not be generated.");
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("The preview returned an invalid PDF.");
    if (!includeAuthorSignature && generation === cacheGeneration) cachePreview(scopedKey, bytes);
    return bytes;
  }).catch((error) => {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("Preview generation timed out. Please retry.");
    }
    throw error;
  }).finally(() => {
    if (previewRequests.get(scopedKey) === pending) previewRequests.delete(scopedKey);
  });
  // Every follower handles the rejection; this keeps an abandoned fetch from reporting it unhandled.
  promise.catch(() => undefined);
  const pending: PendingPreview = { key: scopedKey, promise, controller, waiters: 0 };
  if (!includeAuthorSignature) previewRequests.set(scopedKey, pending);
  return follow(pending, signal);
}
