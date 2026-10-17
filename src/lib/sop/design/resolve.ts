import { normalizeLogoPalette } from "../../logo-palette";
import type { LogoColorPalette } from "../../types";
import type { ResolvedSopDesign } from "../render-types";
import { getSopDesign, getSopFontPair, type SopPalette } from "./templates";

export type SopDesignOptions = {
  templateId: string;
  /** Hex accent chosen by the user; "" keeps the template colours. */
  accent?: string;
  /** "" or unknown ids keep the template's own pair. */
  fontPair?: string;
  showSopHeaderCard?: boolean;
  /** Logo colours, used when the user chose brand colours (accent "brand"). */
  logoPalette?: LogoColorPalette;
};

const HEX = /^#[0-9a-f]{6}$/i;

function mix(first: string, second: string, amount: number) {
  const parse = (value: string) => value.slice(1).match(/.{2}/g)!.map((channel) => Number.parseInt(channel, 16));
  const a = parse(first);
  const b = parse(second);
  return `#${a.map((channel, index) => Math.round(channel + (b[index] - channel) * amount).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** Builds a full palette around one brand colour, keeping text and rules legible. */
export function paletteFromPrimary(base: SopPalette, primary: string, accent?: string): SopPalette {
  return {
    ...base,
    primary,
    primaryDark: mix(primary, "#000000", 0.32),
    soft: mix(primary, "#FFFFFF", 0.9),
    line: mix(primary, "#FFFFFF", 0.78),
    muted: mix(mix(primary, "#000000", 0.32), "#FFFFFF", 0.42),
    accent: accent && HEX.test(accent) ? accent.toUpperCase() : base.accent,
  };
}

export function resolveSopDesign(options: SopDesignOptions): ResolvedSopDesign {
  const design = getSopDesign(options.templateId);
  const pair = getSopFontPair(options.fontPair, design.fontPair);
  let palette = design.palette;
  if (options.accent === "brand") {
    const logo = normalizeLogoPalette(options.logoPalette);
    if (logo) palette = paletteFromPrimary(palette, logo.primary, logo.accent);
  } else if (options.accent && HEX.test(options.accent)) {
    palette = paletteFromPrimary(palette, options.accent.toUpperCase());
  }
  const { fontPair: _fontPair, palette: _palette, ...rest } = design;
  return {
    ...rest,
    palette,
    fonts: { heading: pair.heading, body: pair.body },
    showSopHeaderCard: Boolean(options.showSopHeaderCard),
  };
}

export const SOP_PAGE_SIZES = {
  A4: { widthMm: 210, heightMm: 297 },
  Letter: { widthMm: 215.9, heightMm: 279.4 },
} as const;
