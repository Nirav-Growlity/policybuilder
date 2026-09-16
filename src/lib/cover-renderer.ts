import { getCoverBindingValue } from "./cover-composition";
import type { CoverComposition, CoverElement, Policy } from "./types";

type CoverSvgOptions = {
  includeText?: boolean;
  width?: number;
  height?: number;
  resolveAsset?: (assetId: string | undefined) => string | undefined;
};

const MM_PER_POINT = 25.4 / 72;

function escapeXml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function alignment(value: number): "Min" | "Mid" | "Max" {
  return value <= 33 ? "Min" : value >= 67 ? "Max" : "Mid";
}

function defaultAssetSource(assetId: string | undefined): string | undefined {
  if (!assetId) return undefined;
  return assetId.startsWith("data:image/") ? assetId : `/api/policycraft/cover-assets/${encodeURIComponent(assetId)}`;
}

function imageMarkup(element: { assetId?: string; fit: "contain" | "cover"; focalPoint: { x: number; y: number }; opacity: number; altText: string }, x: number, y: number, width: number, height: number, resolveAsset: (assetId: string | undefined) => string | undefined): string {
  const source = resolveAsset(element.assetId);
  if (!source) return "";
  const preserveAspectRatio = `x${alignment(element.focalPoint.x)}Y${alignment(element.focalPoint.y)} ${element.fit === "contain" ? "meet" : "slice"}`;
  return `<image x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="${preserveAspectRatio}" opacity="${element.opacity}" href="${escapeXml(source)}" aria-label="${escapeXml(element.altText)}" />`;
}

function elementMarkup(policy: Policy, element: CoverElement, includeText: boolean, resolveAsset: (assetId: string | undefined) => string | undefined): string {
  const transform = `translate(${element.x} ${element.y}) rotate(${element.rotation} ${element.width / 2} ${element.height / 2})`;
  if (element.type === "text") {
    if (!includeText) return "";
    const text = element.content.kind === "binding" ? getCoverBindingValue(policy, element.content.binding) : element.content.text;
    const lines = text.split(/\r?\n/).slice(0, 40);
    const fontSize = element.fontSize * MM_PER_POINT;
    const lineHeight = fontSize * element.lineHeight;
    const anchor = element.align === "center" ? "middle" : element.align === "right" ? "end" : "start";
    const anchorX = element.align === "center" ? element.width / 2 : element.align === "right" ? element.width : 0;
    const styles = [
      `font-family:${escapeXml(element.fontFamily)}`,
      `font-size:${fontSize}`,
      `font-weight:${element.bold ? 700 : 400}`,
      `font-style:${element.italic ? "italic" : "normal"}`,
      `text-decoration:${element.underline ? "underline" : "none"}`,
      `letter-spacing:${element.letterSpacing * MM_PER_POINT}`,
      `fill:${element.color}`,
    ].join(";");
    const tspans = lines.map((line, index) => `<tspan x="${anchorX}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("");
    return `<g transform="${transform}" opacity="${element.opacity}"><text x="${anchorX}" y="0" dominant-baseline="hanging" text-anchor="${anchor}" style="${styles}">${tspans}</text></g>`;
  }
  const assetId = element.type === "logo" ? element.assetId || policy.company.companyLogo : element.assetId;
  return `<g transform="${transform}">${imageMarkup({ assetId, fit: element.fit, focalPoint: element.focalPoint, opacity: element.opacity, altText: element.altText }, 0, 0, element.width, element.height, resolveAsset)}</g>`;
}

/** Canonical first-page composition used by the editor, browser preview, PDF, and DOCX raster. */
export function createCoverCompositionSvg(policy: Policy, composition: CoverComposition, options: CoverSvgOptions = {}): string {
  const width = options.width ?? 210;
  const height = options.height ?? 297;
  const includeText = options.includeText !== false;
  const resolveAsset = options.resolveAsset || defaultAssetSource;
  const background = imageMarkup({
    assetId: composition.background.assetId,
    fit: composition.background.fit,
    focalPoint: composition.background.focalPoint,
    opacity: 1,
    altText: "Cover background",
  }, 0, 0, 210, 297, resolveAsset);
  const elements = composition.elements.filter((element) => element.visible).sort((left, right) => left.zIndex - right.zIndex).map((element) => elementMarkup(policy, element, includeText, resolveAsset)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 210 297"><rect width="210" height="297" fill="${composition.background.color}"/>${background}${elements}</svg>`;
}

export function coverCompositionSvgDataUrl(policy: Policy, composition: CoverComposition, options: Omit<CoverSvgOptions, "width" | "height"> = {}): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createCoverCompositionSvg(policy, composition, options))}`;
}
