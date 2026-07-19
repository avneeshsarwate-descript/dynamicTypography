export function balloonStrokeWidth(
  time: number,
  startTime: number,
  endTime: number,
  normalWidth: number,
  balloonWidth: number,
  peakPosition: number,
): number {
  if (time < startTime) return 0;
  if (time >= endTime) return normalWidth;
  const progress = Math.min(1, Math.max(0, (time - startTime) / Math.max(0.001, endTime - startTime)));
  const peak = Math.min(0.99, Math.max(0.01, peakPosition));
  const phase = progress < peak
    ? progress / peak
    : (progress - peak) / (1 - peak);
  const eased = phase * phase * (3 - 2 * phase);
  return progress < peak
    ? balloonWidth * eased
    : balloonWidth + (normalWidth - balloonWidth) * eased;
}
