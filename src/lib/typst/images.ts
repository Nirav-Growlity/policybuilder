import sharp from "sharp";

export type LoadedImage = { content: Buffer; mime: string };

export function decodeDataUrl(value: string): LoadedImage | null {
  const match = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(value);
  return match ? { mime: match[1], content: Buffer.from(match[2], "base64") } : null;
}

/** Typst reads PNG, JPEG and SVG; anything else becomes PNG. Large photos are scaled for print. */
export async function toTypstImage(image: LoadedImage, maxWidth: number): Promise<{ ext: string; content: Buffer }> {
  if (image.mime === "image/svg+xml") return { ext: "svg", content: image.content };
  const pipeline = sharp(image.content).resize({ width: maxWidth, withoutEnlargement: true });
  if (image.mime === "image/jpeg") return { ext: "jpg", content: await pipeline.jpeg({ quality: 88 }).toBuffer() };
  return { ext: "png", content: await pipeline.png().toBuffer() };
}
