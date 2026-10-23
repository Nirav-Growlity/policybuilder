import sharp from "sharp";
import type { LoadedImage } from "../typst/images";

type Slot = { width: number; height: number };
type FocalPoint = { x: number; y: number };
export const PHOTO_CROP_TOLERANCE = 0.08;

/** A substantial aspect mismatch needs an explicit crop around the saved focus. */
export function photoCoverCrop(width: number, height: number, slot: Slot, focal: FocalPoint = { x: 50, y: 50 }) {
  const aspect = slot.width / slot.height;
  if (Math.abs(width / height / aspect - 1) <= PHOTO_CROP_TOLERANCE) return null;
  const cropWidth = Math.min(width, Math.round(height * aspect));
  const cropHeight = Math.min(height, Math.round(width / aspect));
  const position = (value: number, size: number, crop: number) => Math.max(0, Math.min(size - crop, Math.round(size * value / 100 - crop / 2)));
  return { left: position(focal.x, width, cropWidth), top: position(focal.y, height, cropHeight), width: cropWidth, height: cropHeight };
}

/** Shared raster for PDF and Word: crop, never contain or stretch. */
export async function preparePhotoCoverImage(image: LoadedImage, slot: Slot, focal?: FocalPoint) {
  const oriented = await sharp(image.content).rotate().png().toBuffer();
  const meta = await sharp(oriented).metadata();
  const crop = photoCoverCrop(meta.width!, meta.height!, slot, focal);
  const pipeline = sharp(oriented);
  if (crop) pipeline.extract(crop);
  const width = Math.min(2000, crop?.width ?? meta.width!);
  // Correct even a small mismatch here, so neither renderer adds bars or recrops.
  const content = await pipeline.resize({ width, height: Math.round(width * slot.height / slot.width), fit: "cover" }).png().toBuffer();
  return { ext: "png", content };
}
