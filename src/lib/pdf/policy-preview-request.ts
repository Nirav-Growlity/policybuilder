import { policyCraftScopeKey, usePolicyCraftScope } from "../policycraft-client-scope";
import type { PolicyCraftWorkspaceScope } from "../policycraft-access-types";

type PreviewRequest = {
  key: string;
  body: string;
  includeAuthorSignature: boolean;
  scope: PolicyCraftWorkspaceScope;
};

const previewCache = new Map<string, Uint8Array>();
const previewRequests = new Map<string, Promise<Uint8Array>>();
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

export function requestPolicyPreview({ key, body, includeAuthorSignature, scope }: PreviewRequest): Promise<Uint8Array> {
  const scopedKey = JSON.stringify([policyCraftScopeKey(scope), key]);
  const cached = includeAuthorSignature ? undefined : previewCache.get(scopedKey);
  if (cached) {
    previewCache.delete(scopedKey);
    previewCache.set(scopedKey, cached);
    return Promise.resolve(cached);
  }
  const pending = includeAuthorSignature ? undefined : previewRequests.get(scopedKey);
  if (pending) return pending;

  const generation = cacheGeneration;
  const request = fetch("/api/export/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(PREVIEW_REQUEST_TIMEOUT_MS),
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
    if (previewRequests.get(scopedKey) === request) previewRequests.delete(scopedKey);
  });
  if (!includeAuthorSignature) previewRequests.set(scopedKey, request);
  return request;
}
