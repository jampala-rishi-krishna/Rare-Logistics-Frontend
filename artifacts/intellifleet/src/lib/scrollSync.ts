/** Pure helpers for the mirrored (top + bottom) horizontal scrollbars of the Load Planning tables. */

/** Width the top scrollbar's inner spacer must have so it scrolls exactly as far as the table. */
export function topScrollbarWidth(tableScrollWidth: number, containerClientWidth = 0): number {
  const w = Number.isFinite(tableScrollWidth) ? Math.max(0, Math.ceil(tableScrollWidth)) : 0;
  return Math.max(w, Math.max(0, Math.ceil(containerClientWidth || 0)));
}

/** True when the table overflows its container (a scrollbar is useful). */
export function hasHorizontalOverflow(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth - clientWidth > 1;
}

/** The scrollLeft to apply to the other scroller, clamped to its own scrollable range. */
export function mirroredScrollLeft(sourceLeft: number, targetScrollWidth: number, targetClientWidth: number): number {
  const max = Math.max(0, targetScrollWidth - targetClientWidth);
  return Math.min(Math.max(0, sourceLeft), max);
}
