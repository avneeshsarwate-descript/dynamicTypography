import { describe, expect, it } from 'vitest';
import { exportedForTesting } from './fillStrokeGeometry';

describe('Balloon Stroke contour geometry', () => {
  it('uses offset strips with exterior quarter-circle joins', () => {
    const vertices: number[] = [];
    const triangles = exportedForTesting.addRoundStrokeContour(
      vertices,
      [[0, 0], [10, 0], [10, 10], [0, 10]],
      [5, 5],
      [0, 1],
      16,
    );

    expect(triangles).toBe(24);
    expect(vertices).toHaveLength(triangles * 3 * 8);
    const extrusions = Array.from(
      { length: vertices.length / 8 },
      (_, index) => Math.hypot(vertices[index * 8 + 2]!, vertices[index * 8 + 3]!),
    );
    expect(Math.max(...extrusions)).toBeCloseTo(1);
  });
});
