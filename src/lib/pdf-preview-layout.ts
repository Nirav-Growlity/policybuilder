/** Keep every PDF page on one shared preview scale, including the saved cover. */
export function getPdfPageWidth(_number: number, targetWidth: number): number {
  return targetWidth;
}

/** Map the viewport across the rounded HiDPI backing dimensions. */
export function getPdfCanvasTransform(viewportWidth: number, viewportHeight: number, canvasWidth: number, canvasHeight: number): [number, number, number, number, number, number] {
  return [canvasWidth / viewportWidth, 0, 0, canvasHeight / viewportHeight, 0, 0];
}
