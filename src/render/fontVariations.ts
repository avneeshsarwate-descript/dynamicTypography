import type { Font } from 'fontkit';

export function fontAtWeight(font: Font, requestedWeight: number): Font {
  const axis = font.variationAxes.wght;
  if (!axis) return font;
  const weight = Math.min(axis.max, Math.max(axis.min, requestedWeight));
  return font.getVariation({ wght: weight });
}
