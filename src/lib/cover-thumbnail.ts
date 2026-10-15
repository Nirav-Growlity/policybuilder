import sharp from "sharp";

// List thumbnails draw a cover at about 50x70 CSS pixels; this leaves room for
// high-density screens without shipping full-size (often ~2 MB) originals.
const THUMBNAIL_BOX = { width: 240, height: 340 };

/** A small WebP rendition of a cover image, or null when the image cannot be decoded. */
export async function coverThumbnail(content: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(content).resize({ ...THUMBNAIL_BOX, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
  } catch {
    return null;
  }
}

export const COVER_THUMBNAIL_HEADERS = {
  "Content-Type": "image/webp",
  "Cache-Control": "private, max-age=86400",
  "X-Content-Type-Options": "nosniff",
};
