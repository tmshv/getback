export interface LetterboxResult {
  scale:   number; // integer ≥ 1
  offsetX: number; // px from left edge of the window to the logical canvas left
  offsetY: number; // px from top edge of the window to the logical canvas top
}

/**
 * Pure. Computes an integer nearest-neighbour letterbox scale and centering
 * offsets so the logical canvas (logicalW × logicalH) fills the window as
 * large as possible without cropping or fractional scaling.
 *
 * Scale is always ≥ 1 (never shrinks below the logical size — if the window
 * is smaller than logical, scale=1 and the canvas overflows, which is a
 * degenerate case for a desktop game).
 */
export function computeLetterbox(
  winW:     number,
  winH:     number,
  logicalW: number,
  logicalH: number,
): LetterboxResult {
  const scaleX = Math.floor(winW / logicalW);
  const scaleY = Math.floor(winH / logicalH);
  const scale  = Math.max(1, Math.min(scaleX, scaleY));

  const scaledW = logicalW * scale;
  const scaledH = logicalH * scale;

  const offsetX = Math.floor((winW - scaledW) / 2);
  const offsetY = Math.floor((winH - scaledH) / 2);

  return { scale, offsetX, offsetY };
}
