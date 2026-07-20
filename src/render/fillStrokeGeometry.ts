import type { Font } from 'fontkit';
import type paper from 'paper';
import type { CaptionBlock } from '../types';
import { fontAtWeight } from './fontVariations';
import { triangulateCompoundPath } from './meshCompiler';
import { flattenedClone, fontPathToPaper } from './paperGeometry';

const FILL_FLOATS_PER_VERTEX = 6;
const STROKE_FLOATS_PER_VERTEX = 8;

export interface FillStrokeGeometryParameters {
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  curveDetail: number;
}

export interface FillStrokeMesh {
  blockId: string;
  fillVertices: Float32Array;
  strokeVertices: Float32Array;
  fillVertexCount: number;
  strokeVertexCount: number;
  glyphCount: number;
  triangleCount: number;
  glyphTimingStarts: number[];
}

type Point2 = [number, number];

interface GlyphOutline {
  compound: paper.CompoundPath;
  wordIndex: number;
  timing: Point2;
}

function wordIndexForOffset(block: CaptionBlock, offset: number): number {
  const index = block.words.findIndex(
    (word) => offset >= word.textStart && offset < word.textStart + word.textLength,
  );
  if (index >= 0) return index;
  for (let index = block.words.length - 1; index >= 0; index -= 1) {
    if (block.words[index]!.textStart <= offset) return index;
  }
  return 0;
}

function pushStrokeVertex(
  output: number[],
  point: Point2,
  extrusion: Point2,
  center: Point2,
  timing: Point2,
): void {
  output.push(
    point[0],
    point[1],
    extrusion[0],
    extrusion[1],
    center[0],
    center[1],
    timing[0],
    timing[1],
  );
}

function vectorBetween(start: Point2, end: Point2): Point2 | undefined {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const length = Math.hypot(deltaX, deltaY);
  if (length < 0.001) return undefined;
  return [deltaX / length, deltaY / length];
}

function normalFor(direction: Point2): Point2 {
  return [-direction[1], direction[0]];
}

function cross(left: Point2, right: Point2): number {
  return left[0] * right[1] - left[1] * right[0];
}

function dot(left: Point2, right: Point2): number {
  return left[0] * right[0] + left[1] * right[1];
}

function addRoundJoin(
  output: number[],
  point: Point2,
  previousDirection: Point2,
  nextDirection: Point2,
  center: Point2,
  timing: Point2,
  circleSegments: number,
): number {
  const turn = cross(previousDirection, nextDirection);
  if (Math.abs(turn) < 0.0001) return 0;
  const outsideScale = turn > 0 ? -1 : 1;
  const previousNormal = normalFor(previousDirection);
  const nextNormal = normalFor(nextDirection);
  const start: Point2 = [
    previousNormal[0] * outsideScale,
    previousNormal[1] * outsideScale,
  ];
  const end: Point2 = [
    nextNormal[0] * outsideScale,
    nextNormal[1] * outsideScale,
  ];
  const angle = Math.atan2(cross(start, end), dot(start, end));
  const segmentCount = Math.max(
    1,
    Math.ceil(Math.abs(angle) / (Math.PI * 2) * circleSegments),
  );

  for (let segment = 0; segment < segmentCount; segment += 1) {
    const startProgress = segment / segmentCount;
    const endProgress = (segment + 1) / segmentCount;
    const startAngle = Math.atan2(start[1], start[0]) + angle * startProgress;
    const endAngle = Math.atan2(start[1], start[0]) + angle * endProgress;
    pushStrokeVertex(output, point, [0, 0], center, timing);
    pushStrokeVertex(
      output,
      point,
      [Math.cos(startAngle), Math.sin(startAngle)],
      center,
      timing,
    );
    pushStrokeVertex(
      output,
      point,
      [Math.cos(endAngle), Math.sin(endAngle)],
      center,
      timing,
    );
  }
  return segmentCount;
}

function addRoundStrokeContour(
  output: number[],
  points: Point2[],
  center: Point2,
  timing: Point2,
  circleSegments: number,
): number {
  if (points.length < 2) return 0;
  let triangleCount = 0;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    const direction = vectorBetween(start, end);
    if (!direction) continue;
    const normal = normalFor(direction);
    const inverse: Point2 = [-normal[0], -normal[1]];

    pushStrokeVertex(output, start, normal, center, timing);
    pushStrokeVertex(output, start, inverse, center, timing);
    pushStrokeVertex(output, end, normal, center, timing);
    pushStrokeVertex(output, start, inverse, center, timing);
    pushStrokeVertex(output, end, inverse, center, timing);
    pushStrokeVertex(output, end, normal, center, timing);
    triangleCount += 2;
  }

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length]!;
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    const previousDirection = vectorBetween(previous, point);
    const nextDirection = vectorBetween(point, next);
    if (!previousDirection || !nextDirection) continue;
    triangleCount += addRoundJoin(
      output,
      point,
      previousDirection,
      nextDirection,
      center,
      timing,
      circleSegments,
    );
  }
  return triangleCount;
}

function wordCentersForGlyphs(
  block: CaptionBlock,
  glyphs: GlyphOutline[],
  fallback: Point2,
): ReadonlyMap<number, Point2> {
  const centers = new Map<number, Point2>();
  block.words.forEach((_word, wordIndex) => {
    const visibleGlyphs = glyphs.filter(({ compound, wordIndex: glyphWordIndex }) => (
      glyphWordIndex === wordIndex
      && (compound.bounds.width > 0 || compound.bounds.height > 0)
    ));
    if (!visibleGlyphs.length) {
      centers.set(wordIndex, fallback);
      return;
    }
    const left = Math.min(...visibleGlyphs.map(({ compound }) => compound.bounds.left));
    const top = Math.min(...visibleGlyphs.map(({ compound }) => compound.bounds.top));
    const right = Math.max(...visibleGlyphs.map(({ compound }) => compound.bounds.right));
    const bottom = Math.max(...visibleGlyphs.map(({ compound }) => compound.bounds.bottom));
    centers.set(wordIndex, [(left + right) / 2, (top + bottom) / 2]);
  });
  return centers;
}

export function compileFillStrokeMesh(
  sourceFont: Font,
  block: CaptionBlock,
  parameters: FillStrokeGeometryParameters,
  width: number,
  height: number,
): FillStrokeMesh {
  if (!block.text.trim()) {
    return {
      blockId: block.id,
      fillVertices: new Float32Array(),
      strokeVertices: new Float32Array(),
      fillVertexCount: 0,
      strokeVertexCount: 0,
      glyphCount: 0,
      triangleCount: 0,
      glyphTimingStarts: [],
    };
  }

  const font = fontAtWeight(sourceFont, parameters.fontWeight);
  const run = font.layout(block.text);
  const scale = parameters.fontSize / font.unitsPerEm;
  const advances = run.positions.map(
    (position) => position.xAdvance * scale + parameters.letterSpacing,
  );
  const totalWidth = advances.reduce((sum, advance) => sum + advance, 0)
    - parameters.letterSpacing;
  const fitScale = Math.min(1, (width * 0.82) / Math.max(1, totalWidth));
  const actualScale = scale * fitScale;
  const baseline = height / 2 + parameters.fontSize * fitScale * 0.32;
  let cursorX = (width - totalWidth * fitScale) / 2;
  const sourceCodePoints = Array.from(block.text.matchAll(/./gu), (match) => match.index ?? 0);
  let sourceCodePointIndex = 0;
  const stringOffsets = run.glyphs.map((glyph) => {
    const offset = sourceCodePoints[sourceCodePointIndex] ?? block.text.length;
    sourceCodePointIndex += Math.max(1, glyph.codePoints.length);
    return offset;
  });
  const glyphs = run.glyphs.map((glyph, glyphIndex): GlyphOutline => {
    const position = run.positions[glyphIndex]!;
    const stringIndex = stringOffsets[glyphIndex] ?? glyphIndex;
    const wordIndex = wordIndexForOffset(block, stringIndex);
    const word = block.words[wordIndex];
    const timing: Point2 = word
      ? [word.startTime, word.endTime]
      : [block.startTime, block.endTime];
    const compound = fontPathToPaper(glyph.path.commands, {
      scale: actualScale,
      x: cursorX + position.xOffset * actualScale,
      baseline: baseline - position.yOffset * actualScale,
    });
    cursorX += position.xAdvance * actualScale + parameters.letterSpacing * fitScale;
    return { compound, wordIndex, timing };
  });
  const wordCenters = wordCentersForGlyphs(block, glyphs, [width / 2, height / 2]);
  const fillData: number[] = [];
  const strokeData: number[] = [];
  const glyphTimingStarts: number[] = [];
  const flatness = Math.max(0.12, 1.5 - parameters.curveDetail * 0.16);
  const circleSegments = Math.max(16, Math.round(parameters.curveDetail * 4));
  let triangleCount = 0;

  for (const { compound, wordIndex, timing } of glyphs) {
    const center = wordCenters.get(wordIndex) ?? [width / 2, height / 2];
    glyphTimingStarts.push(timing[0]);
    const flattened = flattenedClone(compound, flatness);
    const { triangles } = triangulateCompoundPath(flattened);
    for (const triangle of triangles) {
      for (const [x, y] of triangle) {
        fillData.push(x, y, center[0], center[1], timing[0], timing[1]);
      }
    }
    triangleCount += triangles.length;

    for (const child of flattened.children as paper.Path[]) {
      const points = child.segments.map(
        (segment) => [segment.point.x, segment.point.y] as Point2,
      );
      triangleCount += addRoundStrokeContour(
        strokeData,
        points,
        center,
        timing,
        circleSegments,
      );
    }
    flattened.remove();
    compound.remove();
  }

  return {
    blockId: block.id,
    fillVertices: new Float32Array(fillData),
    strokeVertices: new Float32Array(strokeData),
    fillVertexCount: fillData.length / FILL_FLOATS_PER_VERTEX,
    strokeVertexCount: strokeData.length / STROKE_FLOATS_PER_VERTEX,
    glyphCount: run.glyphs.length,
    triangleCount,
    glyphTimingStarts,
  };
}

export const fillVertexStrideBytes = FILL_FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
export const strokeVertexStrideBytes = STROKE_FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;

export const exportedForTesting = {
  addRoundStrokeContour,
};
