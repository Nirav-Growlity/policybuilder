import type { LogoColorPalette } from "./types";

export type LogoColorSample = { r: number; g: number; b: number; a?: number };

const WHITE = "#FFFFFF";
const DARK_INK = "#17251F";

function clamp(value: number, min = 0, max = 255) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function finiteChannel(value: number) {
  return Number.isFinite(value) ? clamp(value) : 0;
}

function hex({ r, g, b }: LogoColorSample): string {
  return `#${[r, g, b].map((value) => clamp(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function luminance({ r, g, b }: LogoColorSample) {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function saturation({ r, g, b }: LogoColorSample) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lightness = (max + min) / 2;
  if (max === min) return 0;
  const denominator = 1 - Math.abs(2 * lightness - 1);
  return denominator === 0 ? 0 : (max - min) / denominator;
}

function distance(a: LogoColorSample, b: LogoColorSample) {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function mix(a: LogoColorSample, b: LogoColorSample, amount: number): LogoColorSample {
  return { r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount };
}

function contrastRatio(a: LogoColorSample, b: LogoColorSample) {
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
}

function asSample(value: string): LogoColorSample {
  const normalized = value.replace(/^#/, "");
  return { r: Number.parseInt(normalized.slice(0, 2), 16), g: Number.parseInt(normalized.slice(2, 4), 16), b: Number.parseInt(normalized.slice(4, 6), 16) };
}

function normalizeHex(value: unknown): string | undefined {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : undefined;
}

export function normalizeLogoPalette(value: unknown): LogoColorPalette | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<LogoColorPalette>;
  const primary = normalizeHex(raw.primary);
  const primaryDark = normalizeHex(raw.primaryDark);
  const soft = normalizeHex(raw.soft);
  const accent = normalizeHex(raw.accent);
  const onPrimary = normalizeHex(raw.onPrimary);
  if (!primary || !primaryDark || !soft || !accent || !onPrimary) return undefined;
  return { primary, primaryDark, soft, accent, onPrimary };
}

/** Quantizes visible logo pixels so anti-aliasing does not change the chosen brand color. */
export function deriveLogoPalette(samples: readonly LogoColorSample[]): LogoColorPalette | undefined {
  const buckets = new Map<string, { sample: LogoColorSample; weight: number }>();
  for (const sample of samples) {
    if (![sample.r, sample.g, sample.b].every(Number.isFinite)) continue;
    const alpha = sample.a === undefined ? 255 : finiteChannel(sample.a);
    if (alpha < 8) continue;
    const candidate = { r: finiteChannel(sample.r), g: finiteChannel(sample.g), b: finiteChannel(sample.b) };
    // Semi-transparent pixels are usually anti-aliased edges. Squaring alpha
    // prevents a large soft edge from overpowering the smaller opaque mark.
    const weight = (alpha / 255) ** 2;
    const key = [candidate.r, candidate.g, candidate.b].map((value) => Math.floor(value / 32)).join(":");
    const current = buckets.get(key);
    if (current) {
      current.sample.r += candidate.r * weight;
      current.sample.g += candidate.g * weight;
      current.sample.b += candidate.b * weight;
      current.weight += weight;
    } else {
      buckets.set(key, { sample: { r: candidate.r * weight, g: candidate.g * weight, b: candidate.b * weight }, weight });
    }
  }

  const ranked = [...buckets.values()].map((entry) => ({
    sample: {
      r: entry.sample.r / entry.weight,
      g: entry.sample.g / entry.weight,
      b: entry.sample.b / entry.weight,
    },
    weight: entry.weight,
  })).sort((a, b) => {
    const score = (entry: { sample: LogoColorSample; weight: number }) => entry.weight * (0.6 + saturation(entry.sample)) * (0.7 + (1 - luminance(entry.sample)) * 0.3);
    return score(b) - score(a);
  });

  if (!ranked.length) return undefined;
  const nonBackground = ranked.filter((entry) => !(luminance(entry.sample) > 0.96 && saturation(entry.sample) < 0.12));
  // A white-only logo has no chromatic signal. Use the application's dark ink
  // as a safe theme anchor instead of returning no palette at all.
  const primary = (nonBackground[0] || (ranked.length ? { sample: asSample(DARK_INK), weight: 1 } : undefined))?.sample;
  if (!primary) return undefined;
  const accent = ranked.find((entry) => distance(entry.sample, primary) >= 72)?.sample || primary;
  const primaryDark = hex(mix(primary, { r: 0, g: 0, b: 0 }, 0.3));
  const soft = hex(mix(primary, { r: 255, g: 255, b: 255 }, 0.88));
  const onPrimary = contrastRatio(primary, asSample(WHITE)) >= contrastRatio(primary, asSample(DARK_INK)) ? WHITE : DARK_INK;
  return { primary: hex(primary), primaryDark, soft, accent: hex(accent), onPrimary };
}

/** Extracts visible logo pixels in the browser; only the small HEX palette is persisted. */
export async function extractLogoPalette(dataUrl: string): Promise<LogoColorPalette | undefined> {
  if (typeof window === "undefined" || typeof document === "undefined") return undefined;

  const image = await loadLogoImage(dataUrl);
  // SVGs without explicit width/height can report zero intrinsic dimensions
  // even though the browser can paint their viewBox. A square fallback gives
  // those assets a drawable surface while raster images still use their real
  // dimensions.
  const sourceWidth = image.naturalWidth || image.width || 256;
  const sourceHeight = image.naturalHeight || image.height || 256;
  const longestSide = Math.max(sourceWidth, sourceHeight);
  if (!longestSide) return undefined;
  const scale = Math.min(1, 96 / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const samples: LogoColorSample[] = [];
  for (let index = 0; index < pixels.length; index += 4) samples.push({ r: pixels[index], g: pixels[index + 1], b: pixels[index + 2], a: pixels[index + 3] });
  return deriveLogoPalette(samples);
}

function loadLogoImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    image.decoding = "async";
    image.onload = () => finish(() => resolve(image));
    image.onerror = () => finish(() => reject(new Error("The logo image could not be decoded.")));
    image.src = dataUrl;

    // `decode()` is not consistently implemented for data URLs and SVGs.
    // Treat it as an optimization, while onload remains the compatibility path.
    if (typeof image.decode === "function") {
      void image.decode().then(
        () => {
          if (image.complete && (image.naturalWidth || image.width)) finish(() => resolve(image));
        },
        () => undefined,
      );
    }
  });
}
