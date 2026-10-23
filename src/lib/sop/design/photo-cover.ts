import type { SopDesign } from "./templates";

/** A4 millimetres, scaled with the page in both renderers. */
export type PhotoCoverLayout = {
  variant: NonNullable<SopDesign["photoCover"]>;
  image: { x: number; y: number; width: number; height: number };
  titleY: number;
  titleHeight: number;
  detailsY: number;
  dark: boolean;
  calmSpace: string;
};

export function photoCoverLayout(design: Pick<SopDesign, "photoCover">): PhotoCoverLayout {
  const variant = design.photoCover ?? "inset-photo";
  const layouts = {
    "inset-photo": { image: { x: 20, y: 119, width: 170, height: 99 }, titleY: 43, titleHeight: 72, detailsY: 228, dark: false, calmSpace: "Keep the entire scene visible within the inset landscape photo. Title and logo are above it, outside the image." },
    "pillar-photo": { image: { x: 0, y: 0, width: 210, height: 122 }, titleY: 148, titleHeight: 72, detailsY: 228, dark: false, calmSpace: "Keep the upper left quiet for a logo plate. Keep all people and equipment within the middle 70 percent; title and pillar bands are below the photo." },
    "panel-photo": { image: { x: 19, y: 16, width: 172, height: 104 }, titleY: 132, titleHeight: 76, detailsY: 220, dark: true, calmSpace: "Keep the upper left quiet for a logo plate. Keep the scene within the inset landscape panel; the title is below the photograph." },
    "photo-strip": { image: { x: 28, y: 132, width: 166, height: 64 }, titleY: 57, titleHeight: 69, detailsY: 208, dark: false, calmSpace: "Compose a wide, modest photographic strip with a complete subject at its centre. Title and logo are above the strip, outside the image." },
    "full-photo": { image: { x: 0, y: 0, width: 210, height: 297 }, titleY: 163, titleHeight: 73, detailsY: 245, dark: true, calmSpace: "Keep the upper left quiet for a logo plate and the lower 45 percent calm for a solid title plate and control details. Place complete people and key objects in the upper right, between 15 and 50 percent of canvas height." },
  } satisfies Record<NonNullable<SopDesign["photoCover"]>, Omit<PhotoCoverLayout, "variant">>;
  return { variant, ...layouts[variant] };
}

/** Image endpoint accepts dimensions in multiples of 16. Match the actual slot. */
export function photoCoverImageSize(design: Pick<SopDesign, "photoCover">): string {
  const { width, height } = photoCoverLayout(design).image;
  return width >= height ? `1536x${Math.round(1536 * height / width / 16) * 16}` : `1024x${Math.round(1024 * height / width / 16) * 16}`;
}
