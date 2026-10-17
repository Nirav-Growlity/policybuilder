import type { SopPalette } from "./templates";

/**
 * Template artwork for image-led covers when the user has not uploaded or
 * generated a picture. It is an SVG turned into a PNG, so the PDF and the
 * Word file place exactly the same image.
 */
export function coverArtSvg(palette: SopPalette, widthPx = 1240, heightPx = 1000): string {
  const { primary, primaryDark, accent, soft } = palette;
  const w = widthPx;
  const h = heightPx;
  // Layered arcs and bands: calm, abstract, and readable at thumbnail size.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${primary}"/>
  <circle cx="${w * 0.86}" cy="${h * 0.18}" r="${h * 0.62}" fill="${primaryDark}" opacity="0.55"/>
  <circle cx="${w * 0.86}" cy="${h * 0.18}" r="${h * 0.44}" fill="none" stroke="${soft}" stroke-opacity="0.22" stroke-width="2"/>
  <circle cx="${w * 0.86}" cy="${h * 0.18}" r="${h * 0.30}" fill="none" stroke="${soft}" stroke-opacity="0.18" stroke-width="2"/>
  <path d="M0 ${h * 0.78} C ${w * 0.3} ${h * 0.6}, ${w * 0.55} ${h * 0.95}, ${w} ${h * 0.7} L ${w} ${h} L 0 ${h} Z" fill="${primaryDark}" opacity="0.7"/>
  <path d="M0 ${h * 0.88} C ${w * 0.35} ${h * 0.74}, ${w * 0.6} ${h * 1.0}, ${w} ${h * 0.82} L ${w} ${h} L 0 ${h} Z" fill="${primaryDark}"/>
  <rect x="${w * 0.08}" y="${h * 0.62}" width="${w * 0.12}" height="8" fill="${accent}"/>
  ${Array.from({ length: 7 }, (_, row) => Array.from({ length: 7 }, (_, column) =>
    `<circle cx="${w * 0.08 + column * 22}" cy="${h * 0.32 + row * 22}" r="2.6" fill="${soft}" opacity="0.35"/>`).join("")).join("")}
</svg>`;
}
