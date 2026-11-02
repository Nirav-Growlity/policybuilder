import type { SopDesign } from "./templates";

/** A4 millimetres, scaled with the page in both renderers. */
export type PhotoCoverLayout = {
  variant: NonNullable<SopDesign["photoCover"]>;
  image: { x: number; y: number; width: number; height: number };
  titleY: number;
  titleHeight: number;
  dark: boolean;
  calmSpace: string;
};

export function photoCoverLayout(design: Pick<SopDesign, "photoCover">): PhotoCoverLayout {
  const variant = design.photoCover ?? "inset-photo";
  const layouts = {
    "inset-photo": { image: { x: 20, y: 110, width: 170, height: 133 }, titleY: 43, titleHeight: 64, dark: false, calmSpace: "Keep the entire scene visible within the inset landscape photo. Title and logo are above it, outside the image." },
    "pillar-photo": { image: { x: 0, y: 0, width: 210, height: 122 }, titleY: 148, titleHeight: 72, dark: false, calmSpace: "Keep the upper left quiet for a logo plate. Keep all people and equipment within the middle 70 percent; title and pillar bands are below the photo." },
    "panel-photo": { image: { x: 19, y: 16, width: 172, height: 130 }, titleY: 158, titleHeight: 76, dark: true, calmSpace: "Keep the upper left quiet for a logo plate. Keep the scene within the inset landscape panel; the title is below the photograph." },
    "photo-strip": { image: { x: 28, y: 126, width: 166, height: 116 }, titleY: 57, titleHeight: 66, dark: false, calmSpace: "Compose a wide, modest photographic strip with a complete subject at its centre. Title and logo are above the strip, outside the image." },
    "full-photo": { image: { x: 0, y: 0, width: 210, height: 297 }, titleY: 163, titleHeight: 73, dark: true, calmSpace: "Keep the upper left quiet for a logo plate and the lower 45 percent calm for a solid title plate and control details. Place complete people and key objects in the upper right, between 15 and 50 percent of canvas height." },
  } satisfies Record<NonNullable<SopDesign["photoCover"]>, Omit<PhotoCoverLayout, "variant">>;
  return { variant, ...layouts[variant] };
}

/** Dimensions are multiples of 16, within the image endpoint's 2.5:1 limit. */
export function photoCoverImageSize(design: Pick<SopDesign, "photoCover">): string {
  const { width, height } = photoCoverLayout(design).image;
  const aspect = Math.max(0.4, Math.min(2.5, width / height));
  const long = 1536;
  const short = Math.ceil(long / Math.max(aspect, 1 / aspect) / 16) * 16;
  return aspect >= 1 ? `${long}x${short}` : `${short}x${long}`;
}
