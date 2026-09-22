import { coverAssetIdFromReference, getActiveCoverComposition, getActiveCoverVariant } from "../cover-composition";
import type { Policy } from "../types";

async function coverAssetDataUrl(assetReference: string | undefined): Promise<string | undefined> {
  const assetId = coverAssetIdFromReference(assetReference);
  if (!assetId || assetId.startsWith("data:")) return assetId;
  const response = await fetch(`/api/policycraft/cover-assets/${encodeURIComponent(assetId)}`, { credentials: "same-origin" });
  if (!response.ok) throw new Error("The cover artwork could not be loaded for Word export.");
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

/** Resolve private cover and running-header assets only in the transient export payload. */
export async function preparePolicyForDocxExport(policy: Policy): Promise<Policy> {
  const composition = getActiveCoverComposition(policy);
  const companyLogo = await coverAssetDataUrl(policy.company.companyLogo);
  if (!composition) {
    if (companyLogo === policy.company.companyLogo) return policy;
    return { ...policy, company: { ...policy.company, companyLogo } };
  }
  const backgroundAssetId = await coverAssetDataUrl(composition.background.assetId);
  const elements = await Promise.all(composition.elements.map(async (element) => {
    if (element.type !== "image" && element.type !== "logo") return element;
    const assetId = await coverAssetDataUrl(element.assetId || (element.type === "logo" ? policy.company.companyLogo : undefined));
    return { ...element, ...(assetId ? { assetId } : {}) };
  }));
  const resolvedComposition = { ...composition, background: { ...composition.background, assetId: backgroundAssetId }, elements };
  return {
    ...policy,
    company: { ...policy.company, companyLogo },
    ...(getActiveCoverVariant(policy) === "ai" ? { aiCoverComposition: resolvedComposition } : { coverComposition: resolvedComposition }),
  };
}
