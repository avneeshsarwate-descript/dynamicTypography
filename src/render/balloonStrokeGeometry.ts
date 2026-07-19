import type { Font } from 'fontkit';
import type paper from 'paper';
import type { BalloonStrokeLookParameters } from '../looks/types';
import type { CaptionBlock } from '../types';
import { flattenedClone, fontPathToPaper } from './paperGeometry';
import { triangulateCompoundPath } from './meshCompiler';
import { fontAtWeight } from './fontVariations';

const FILL_FLOATS_PER_VERTEX = 4;
const STROKE_FLOATS_PER_VERTEX = 6;

export type BalloonStrokeMesh = {
  blockId: string;
  fillVertices: Float32Array;
  strokeVertices: Float32Array;
  fillVertexCount: number;
  strokeVertexCount: number;
  glyphCount: number;
  triangleCount: number;
  glyphTimingStarts: number[];
};

type Point2 = [number, number];

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
  timing: Point2,
): void {
  output.push(point[0], point[1], extrusion[0], extrusion[1], timing[0], timing[1]);
}

function addRoundStrokeContour(
  output: number[],
  points: Point2[],
  timing: Point2,
  circleSegments: number,
): number {
  if (points.length < 2) return 0;
  let triangleCount = 0;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]!;
    const end = points[(index + 1) % points.length]!;
    const deltaX = end[0] - start[0];
    const deltaY = end[1] - start[1];
    const length = Math.hypot(deltaX, deltaY);
    if (length < 0.001) continue;
    const normal: Point2 = [-deltaY / length, deltaX / length];
    const inverse: Point2 = [-normal[0], -normal[1]];

    pushStrokeVertex(output, start, normal, timing);
    pushStrokeVertex(output, start, inverse, timing);
    pushStrokeVertex(output, end, normal, timing);
    pushStrokeVertex(output, start, inverse, timing);
    pushStrokeVertex(output, end, inverse, timing);
    pushStrokeVertex(output, end, normal, timing);
    triangleCount += 2;
  }

  for (const point of points) {
    for (let segment = 0; segment < circleSegments; segment += 1) {
      const angle = segment / circleSegments * Math.PI * 2;
      const nextAngle = (segment + 1) / circleSegments * Math.PI * 2;
      pushStrokeVertex(output, point, [0, 0], timing);
      pushStrokeVertex(output, point, [Math.cos(angle), Math.sin(angle)], timing);
      pushStrokeVertex(output, point, [Math.cos(nextAngle), Math.sin(nextAngle)], timing);
      triangleCount += 1;
    }
  }
  return triangleCount;
}

export function compileBalloonStrokeMesh(
  sourceFont: Font,
  block: CaptionBlock,
  parameters: BalloonStrokeLookParameters,
  width: number,
  height: number,
): BalloonStrokeMesh {
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
  const fillData: number[] = [];
  const strokeData: number[] = [];
  const glyphTimingStarts: number[] = [];
  const flatness = Math.max(0.18, 2.4 - parameters.curveDetail * 0.21);
  const circleSegments = Math.max(8, Math.round(parameters.curveDetail * 1.5));
  let triangleCount = 0;

  run.glyphs.forEach((glyph, glyphIndex) => {
    const position = run.positions[glyphIndex]!;
    const stringIndex = stringOffsets[glyphIndex] ?? glyphIndex;
    const wordIndex = wordIndexForOffset(block, stringIndex);
    const word = block.words[wordIndex];
    const timing: Point2 = word
      ? [word.startTime, word.endTime]
      : [block.startTime, block.endTime];
    glyphTimingStarts.push(timing[0]);
    const compound = fontPathToPaper(glyph.path.commands, {
      scale: actualScale,
      x: cursorX + position.xOffset * actualScale,
      baseline: baseline - position.yOffset * actualScale,
    });
    const flattened = flattenedClone(compound, flatness);
    const { triangles } = triangulateCompoundPath(flattened);
    for (const triangle of triangles) {
      for (const [x, y] of triangle) fillData.push(x, y, timing[0], timing[1]);
    }
    triangleCount += triangles.length;

    for (const child of flattened.children as paper.Path[]) {
      const points = child.segments.map(
        (segment) => [segment.point.x, segment.point.y] as Point2,
      );
      triangleCount += addRoundStrokeContour(strokeData, points, timing, circleSegments);
    }
    flattened.remove();
    compound.remove();
    cursorX += position.xAdvance * actualScale + parameters.letterSpacing * fitScale;
  });

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
