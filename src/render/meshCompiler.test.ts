import { readFileSync } from 'node:fs';
import * as fontkit from 'fontkit';
import type paper from 'paper';
import { describe, expect, test } from 'vitest';
import { flattenedClone, fontPathToPaper } from './paperGeometry';
import { triangulateCompoundPath } from './meshCompiler';

type Point2 = [number, number];

const font = fontkit.create(
  readFileSync(new URL('../../public/Sora-Bold.ttf', import.meta.url)) as unknown as Parameters<typeof fontkit.create>[0],
) as fontkit.Font;

function isLeft([x1, y1]: Point2, [x2, y2]: Point2, [x, y]: Point2): number {
  return (x2 - x1) * (y - y1) - (x - x1) * (y2 - y1);
}

function windingNumber(contours: Point2[][], point: Point2): number {
  let winding = 0;
  for (const contour of contours) {
    for (let index = 0; index < contour.length; index += 1) {
      const start = contour[index]!;
      const end = contour[(index + 1) % contour.length]!;
      if (start[1] <= point[1]) {
        if (end[1] > point[1] && isLeft(start, end, point) > 0) winding += 1;
      } else if (end[1] <= point[1] && isLeft(start, end, point) < 0) {
        winding -= 1;
      }
    }
  }
  return winding;
}

function pointInTriangle(point: Point2, [a, b, c]: Point2[]): boolean {
  const side1 = isLeft(a!, b!, point);
  const side2 = isLeft(b!, c!, point);
  const side3 = isLeft(c!, a!, point);
  const hasNegative = side1 < 0 || side2 < 0 || side3 < 0;
  const hasPositive = side1 > 0 || side2 > 0 || side3 > 0;
  return !(hasNegative && hasPositive);
}

function signedArea(points: Point2[]): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    area += start[0] * end[1] - end[0] * start[1];
  }
  return area / 2;
}

function compareGlyph(character: string): {
  iou: number;
  areaError: number;
  contourAreas: number[];
  triangleArea: number;
  triangleCount: number;
} {
  const glyph = font.layout(character).glyphs[0]!;
  const compound = fontPathToPaper(glyph.path.commands, {
    scale: 100 / font.unitsPerEm,
    x: 0,
    baseline: 110,
  });
  const expectedGeometry = compound.clone({ insert: false }) as paper.CompoundPath;
  for (const child of expectedGeometry.children as paper.Path[]) child.flatten(0.7);
  const meshGeometry = flattenedClone(compound, 0.7);
  const contours = expectedGeometry.children.map((child) => (child as paper.Path).segments.map(
    (segment) => [segment.point.x, segment.point.y] as Point2,
  ));
  const { triangles } = triangulateCompoundPath(meshGeometry);
  const bounds = expectedGeometry.bounds.expand(4);
  const resolution = 128;
  let expectedCount = 0;
  let meshCount = 0;
  let intersectionCount = 0;
  let unionCount = 0;

  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const point: Point2 = [
        bounds.left + (column + 0.5) / resolution * bounds.width,
        bounds.top + (row + 0.5) / resolution * bounds.height,
      ];
      const expected = windingNumber(contours, point) !== 0;
      const meshed = triangles.some((triangle) => pointInTriangle(point, triangle));
      if (expected) expectedCount += 1;
      if (meshed) meshCount += 1;
      if (expected && meshed) intersectionCount += 1;
      if (expected || meshed) unionCount += 1;
    }
  }

  expectedGeometry.remove();
  meshGeometry.remove();
  compound.remove();
  return {
    iou: unionCount === 0 ? 1 : intersectionCount / unionCount,
    areaError: expectedCount === 0 ? 0 : Math.abs(meshCount - expectedCount) / expectedCount,
    contourAreas: contours.map(signedArea),
    triangleArea: triangles.reduce((sum, triangle) => sum + Math.abs(signedArea(triangle)), 0),
    triangleCount: triangles.length,
  };
}

describe('font outline triangulation', () => {
  test('matches the font non-zero fill across printable ASCII and extended Latin', () => {
    const printableAscii = Array.from(
      { length: 94 },
      (_, index) => String.fromCodePoint(index + 33),
    ).join('');
    const characters = Array.from(new Set(
      'Type can remember being tangled. Every word finds its shape. Motion makes language physical.'
      + printableAscii
      + 'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØŒÙÚÛÜÝßàáâãäåæçèéêëìíîïñòóôõöøœùúûüýÿ',
    )).filter((character) => character.trim());
    const results = characters.map((character) => ({ character, ...compareGlyph(character) }));
    const failures = results.filter(({ iou, areaError }) => iou < 0.985 || areaError > 0.015);
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });
});
