import { describe, expect, it } from 'vitest';
import { balloonStrokeWidth } from './balloonStrokeAnimation';

describe('Balloon Stroke timing', () => {
  it('keeps future words bare, balloons the active word, and settles completed words', () => {
    const start = 1;
    const end = 2;
    const normal = 3;
    const balloon = 28;
    const peak = 0.34;

    expect(balloonStrokeWidth(0.9, start, end, normal, balloon, peak)).toBe(0);
    expect(balloonStrokeWidth(start, start, end, normal, balloon, peak)).toBe(0);
    expect(balloonStrokeWidth(start + peak, start, end, normal, balloon, peak)).toBeCloseTo(balloon);
    expect(balloonStrokeWidth(1.8, start, end, normal, balloon, peak)).toBeGreaterThan(normal);
    expect(balloonStrokeWidth(end, start, end, normal, balloon, peak)).toBe(normal);
    expect(balloonStrokeWidth(3, start, end, normal, balloon, peak)).toBe(normal);
  });
});
