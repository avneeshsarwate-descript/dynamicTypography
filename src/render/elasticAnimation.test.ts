import { describe, expect, it } from 'vitest';
import { exportedForTesting } from './elasticAnimation';

const PEAK_SCALE = 1.34;
const PULL_DURATION = 0.16;
const FREQUENCY = 4;
const DAMPING_RATIO = 0.38;

function scaleAt(time: number, endTime: number): number {
  return exportedForTesting.elasticScaleAtTime(
    time,
    0,
    endTime,
    PEAK_SCALE,
    PULL_DURATION,
    FREQUENCY,
    DAMPING_RATIO,
  );
}

describe('Elastic word timing', () => {
  it('uses the same pull duration and real-time spring curve for every TAU', () => {
    expect(scaleAt(0, 0.7)).toBe(1);
    expect(scaleAt(PULL_DURATION, 0.7)).toBeCloseTo(PEAK_SCALE);
    expect(scaleAt(PULL_DURATION, 1.4)).toBeCloseTo(PEAK_SCALE);
    expect(scaleAt(0.3, 0.7)).toBeCloseTo(scaleAt(0.3, 1.4));
    expect(scaleAt(0.3, 0.7)).toBeLessThan(1);
  });

  it('models release from rest with the closed-form underdamped solution', () => {
    const amplitude = PEAK_SCALE - 1;
    const epsilon = 0.00001;
    const displacement = exportedForTesting.springDisplacement(
      epsilon,
      amplitude,
      FREQUENCY,
      DAMPING_RATIO,
    );
    const initialVelocity = (displacement - amplitude) / epsilon;

    expect(initialVelocity).toBeCloseTo(0, 2);
    expect(exportedForTesting.springSettleTime(
      amplitude,
      FREQUENCY,
      DAMPING_RATIO,
    )).toBeGreaterThan(0);
  });

  it('smoothly forces an overlong tail to rest during the final ten percent', () => {
    const lowDamping = 0.05;
    const endTime = 0.6;
    const scaleNearEnd = exportedForTesting.elasticScaleAtTime(
      0.594,
      0,
      endTime,
      PEAK_SCALE,
      PULL_DURATION,
      FREQUENCY,
      lowDamping,
    );

    expect(exportedForTesting.springSettleTime(
      PEAK_SCALE - 1,
      FREQUENCY,
      lowDamping,
    )).toBeGreaterThan(endTime - PULL_DURATION);
    expect(scaleNearEnd).toBeCloseTo(1, 2);
    expect(scaleAt(0.7, 0.7)).toBe(1);
  });
});
