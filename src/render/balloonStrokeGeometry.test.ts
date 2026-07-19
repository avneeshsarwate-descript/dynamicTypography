import { describe, expect, it } from 'vitest';
import { exportedForTesting } from './balloonStrokeGeometry';

describe('Balloon Stroke contour geometry', () => {
  it('uses offset strips with exterior quarter-circle joins', () => {
    const vertices: number[] = [];
    const triangles = exportedForTesting.addRoundStrokeContour(
      vertices,
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [0, 1],
      16,
    );

    expect(triangles).toBe(24);
    expect(vertices).toHaveLength(triangles * 3 * 6);
    const extrusions = Array.from(
      { length: vertices.length / 6 },
      (_, index) => Math.hypot(vertices[index * 6 + 2]!, vertices[index * 6 + 3]!),
    );
    expect(Math.max(...extrusions)).toBeCloseTo(1);
  });
});
