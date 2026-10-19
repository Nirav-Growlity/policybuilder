import sharp from "sharp";
import type { SopRenderModel } from "./render-types";

/** Share of the page height the cover image fills (manual.typ and sop-generate.ts draw the same band). */
export const COVER_BAND = 0.58;

/** Zoom the band crop may add to skip blank rows. */
const MAX_COVER_ZOOM = 1.5;

/** First and last rows (as fractions of the height) with visible detail; rows that are one flat colour don't count. */
async function detailSpan(flat: Buffer): Promise<{ top: number; bottom: number }> {
  const columns = 96;
  const rows = 256;
  const { data } = await sharp(flat).resize({ width: columns, height: rows, fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const busy = (row: number) => {
    let sum = 0, squares = 0;
    for (let x = 0; x < columns; x += 1) { const value = data[row * columns + x]; sum += value; squares += value * value; }
    const mean = sum / columns;
    return Math.sqrt(Math.max(0, squares / columns - mean * mean)) > 6;
  };
  let first = 0;
  while (first < rows && !busy(first)) first += 1;
  let last = rows - 1;
  while (last > first && !busy(last)) last -= 1;
  if (first >= last) return { top: 0, bottom: 1 };
  // A sampled row on the edge of a blank run is part blank: step past it.
  return { top: first ? (first + 1) / rows : 0, bottom: last < rows - 1 ? last / rows : 1 };
}

/**
 * Crops a cover photo or AI artwork to the cover band's shape, flattened onto
 * `background`. Artwork made for policy covers keeps a blank or transparent
 * area for overlay text, and a centre crop could land on it and leave a pale
 * band above the title; blank rows at the top and bottom are cut first
 * (zooming in at most 1.5×), then the busiest region is kept. Typst and Word
 * draw the result without cropping it again.
 */
export async function toCoverBand(image: { content: Buffer; mime: string }, page: SopRenderModel["page"], background: string): Promise<{ ext: string; content: Buffer }> {
  if (image.mime === "image/svg+xml") return { ext: "svg", content: image.content };
  const flat = await sharp(image.content).flatten({ background }).png().toBuffer();
  const { width = 0, height = 0 } = await sharp(flat).metadata();
  const ratio = (page.heightMm * COVER_BAND) / page.widthMm;

  const span = await detailSpan(flat);
  const keep = Math.min(height, Math.max(Math.round((span.bottom - span.top) * height), Math.round((width * ratio) / MAX_COVER_ZOOM)));
  const centre = ((span.top + span.bottom) / 2) * height;
  const top = Math.round(Math.min(height - keep, Math.max(0, centre - keep / 2)));

  const targetWidth = Math.min(2000, width);
  const targetHeight = Math.round(targetWidth * ratio);
  const pipeline = sharp(flat)
    .extract({ left: 0, top, width, height: keep })
    .resize({ width: targetWidth, height: targetHeight, fit: "cover", position: sharp.strategy.attention });
  if (image.mime === "image/jpeg") return { ext: "jpg", content: await pipeline.jpeg({ quality: 88 }).toBuffer() };
  return { ext: "png", content: await pipeline.png().toBuffer() };
}
