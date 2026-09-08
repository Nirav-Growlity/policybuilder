import { motifSvg, type CoverMotifScene, type MotifColors } from "@/lib/cover-motifs";

export type { CoverMotifScene };

/** Source-derived cover artwork shared by the document preview and thumbnails. */
export function CoverArt({
  scene,
  colors,
  className = "",
  label,
}: {
  scene: CoverMotifScene;
  colors: MotifColors;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label={label || `${scene} motif`}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: motifSvg(scene, colors) }}
    />
  );
}

export { motifSvg };
