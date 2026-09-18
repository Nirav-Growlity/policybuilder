import type { CoverComposition, CoverLibraryItem } from "./types";

export type CoverLibraryResponse = { templates?: CoverLibraryItem[]; error?: string };

export function createAICoverName(now = new Date()): string {
  const timestamp = now.toISOString().slice(0, 16).replace("T", " ");
  return `AI cover · ${timestamp}`;
}

export function coverCompositionsEqual(left: CoverComposition | undefined, right: CoverComposition | undefined): boolean {
  return Boolean(left && right && JSON.stringify(left) === JSON.stringify(right));
}

export async function persistCoverArtwork(composition: CoverComposition): Promise<CoverComposition> {
  const assetId = composition.background.assetId;
  if (!assetId?.startsWith("data:image/")) return composition;

  const image = await fetch(assetId);
  if (!image.ok) throw new Error("The generated cover artwork could not be prepared for saving.");
  const blob = await image.blob();
  const form = new FormData();
  form.append("file", new File([blob], "ai-cover.png", { type: blob.type || "image/png" }));
  const response = await fetch("/api/policycraft/cover-assets", { method: "POST", body: form });
  const body = await response.json().catch(() => ({})) as { asset?: { id?: string }; error?: string };
  const storedId = body.asset?.id;
  if (!response.ok || !storedId) throw new Error(body.error || "The generated artwork could not be saved.");
  return { ...composition, background: { ...composition.background, assetId: storedId } };
}

export async function saveAICoverToLibrary(composition: CoverComposition, name = createAICoverName()): Promise<{ id: string }> {
  const response = await fetch("/api/policycraft/cover-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, composition, previewAssetId: composition.background.assetId || null }),
  });
  const body = await response.json().catch(() => ({})) as { id?: string; error?: string };
  if (!response.ok || !body.id) throw new Error(body.error || "The AI cover could not be added to the library.");
  return { id: body.id };
}

export async function fetchAICoverLibrary(): Promise<CoverLibraryItem[]> {
  const response = await fetch("/api/policycraft/cover-templates?source=ai", { cache: "no-store" });
  const body = await response.json().catch(() => ({})) as CoverLibraryResponse;
  if (!response.ok) throw new Error(body.error || "The AI cover library could not be loaded.");
  return (body.templates || []).filter((item) => item.source === "ai");
}

export async function archiveAICover(id: string): Promise<void> {
  const response = await fetch(`/api/policycraft/cover-templates/${encodeURIComponent(id)}`, { method: "DELETE" });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "The AI cover could not be deleted.");
}
