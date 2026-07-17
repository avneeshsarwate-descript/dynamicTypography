import * as fontkit from 'fontkit';
import { meshParametersForLook } from '../looks/registry';
import type { LookState } from '../looks/types';
import type { CaptionBlock } from '../types';
import { flattenedClone, fontPathToPaper } from './paperGeometry';
import { triangulateCompoundPath } from './meshCompiler';

const FLOATS_PER_VERTEX = 14;

export type CompiledBlockMesh = {
  blockId: string;
  vertices: Float32Array;
  vertexCount: number;
  glyphCount: number;
  triangleCount: number;
  glyphTimingStarts: number[];
};

type LoadedFont = fontkit.Font;

let cachedFont: Promise<LoadedFont> | undefined;

export function loadPrototypeFont(url: string): Promise<LoadedFont> {
  cachedFont ??= fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load prototype font (${response.status})`);
      return response.arrayBuffer();
    })
    .then((buffer) => fontkit.create(
      new Uint8Array(buffer) as unknown as Parameters<typeof fontkit.create>[0],
    ) as fontkit.Font);
  return cachedFont;
}

function hashNoise(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return value - Math.floor(value);
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

export function compileBlockMesh(
  font: LoadedFont,
  block: CaptionBlock,
  look: LookState,
  width: number,
  height: number,
): CompiledBlockMesh {
  if (!block.text.trim()) {
    return {
      blockId: block.id,
      vertices: new Float32Array(),
      vertexCount: 0,
      glyphCount: 0,
      triangleCount: 0,
      glyphTimingStarts: [],
    };
  }

  const parameters = meshParametersForLook(look);
  const run = font.layout(block.text);
  const scale = parameters.fontSize / font.unitsPerEm;
  const advances = run.positions.map((position) => position.xAdvance * scale + parameters.letterSpacing);
  const totalWidth = advances.reduce((sum, advance) => sum + advance, 0) - parameters.letterSpacing;
  const fitScale = Math.min(1, (width * 0.82) / Math.max(1, totalWidth));
  const actualScale = scale * fitScale;
  const baseline = height / 2 + parameters.fontSize * fitScale * 0.32;
  let cursorX = (width - totalWidth * fitScale) / 2;
  const glyphs: Array<{
    compound: ReturnType<typeof fontPathToPaper>;
    glyphIndex: number;
    wordIndex: number;
    center: [number, number];
    bounds: [number, number, number, number];
  }> = [];

  const sourceCodePoints = Array.from(block.text.matchAll(/./gu), (match) => match.index ?? 0);
  let sourceCodePointIndex = 0;
  const stringOffsets = run.glyphs.map((glyph) => {
    const offset = sourceCodePoints[sourceCodePointIndex] ?? block.text.length;
    sourceCodePointIndex += Math.max(1, glyph.codePoints.length);
    return offset;
  });

  run.glyphs.forEach((glyph, glyphIndex) => {
    const position = run.positions[glyphIndex]!;
    const stringIndex = stringOffsets[glyphIndex] ?? glyphIndex;
    const compound = fontPathToPaper(glyph.path.commands, {
      scale: actualScale,
      x: cursorX + position.xOffset * actualScale,
      baseline: baseline - position.yOffset * actualScale,
    });
    const bounds = compound.bounds;
    glyphs.push({
      compound,
      glyphIndex,
      wordIndex: wordIndexForOffset(block, stringIndex),
      center: [bounds.center.x, bounds.center.y],
      bounds: [bounds.left, bounds.top, bounds.right, bounds.bottom],
    });
    cursorX += position.xAdvance * actualScale + parameters.letterSpacing * fitScale;
  });

  const blockCenter: [number, number] = [width / 2, height / 2];
  const wordCenters = new Map<number, [number, number]>();
  block.words.forEach((_word, wordIndex) => {
    const visibleGlyphs = glyphs.filter(({ bounds, wordIndex: glyphWordIndex }) => (
      glyphWordIndex === wordIndex
      && (bounds[2] > bounds[0] || bounds[3] > bounds[1])
    ));
    if (visibleGlyphs.length === 0) return;
    const left = Math.min(...visibleGlyphs.map(({ bounds }) => bounds[0]));
    const top = Math.min(...visibleGlyphs.map(({ bounds }) => bounds[1]));
    const right = Math.max(...visibleGlyphs.map(({ bounds }) => bounds[2]));
    const bottom = Math.max(...visibleGlyphs.map(({ bounds }) => bounds[3]));
    wordCenters.set(wordIndex, [(left + right) / 2, (top + bottom) / 2]);
  });
  const data: number[] = [];
  const glyphTimingStarts: number[] = [];
  let triangleCount = 0;

  glyphs.forEach(({ compound, glyphIndex, wordIndex, center }) => {
    const flatness = Math.max(0.18, 2.4 - parameters.meshDensity * 0.21);
    const flattened = flattenedClone(compound, flatness);
    const { triangles } = triangulateCompoundPath(flattened);
    flattened.remove();
    compound.remove();

    const n1 = hashNoise(parameters.seed + glyphIndex * 3.17);
    const n2 = hashNoise(parameters.seed + glyphIndex * 7.91);
    const n3 = hashNoise(parameters.seed + glyphIndex * 13.73);
    const angle = (n3 - 0.5) * parameters.rotation * (Math.PI / 180);
    const radius = parameters.scatter * (0.35 + n1 * 0.65);
    const anchor = parameters.anchor === 'word'
      ? wordCenters.get(wordIndex) ?? blockCenter
      : blockCenter;
    const effectCenter: [number, number] = [
      anchor[0] + Math.cos(n2 * Math.PI * 2) * radius,
      anchor[1] + Math.sin(n2 * Math.PI * 2) * radius * 0.62,
    ];
    const word = block.words[wordIndex];
    const timings: [number, number] = word
      ? [word.startTime, word.endTime]
      : [block.startTime, block.endTime];
    glyphTimingStarts.push(timings[0]);

    triangles.forEach((triangle) => {
      const barycentric = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      triangle.forEach(([x, y], index) => {
        data.push(
          x,
          y,
          center[0],
          center[1],
          effectCenter[0],
          effectCenter[1],
          angle,
          parameters.initialScale,
          timings[0],
          timings[1],
          ...barycentric[index]!,
          n1,
        );
      });
      triangleCount += 1;
    });
  });

  return {
    blockId: block.id,
    vertices: new Float32Array(data),
    vertexCount: data.length / FLOATS_PER_VERTEX,
    glyphCount: glyphs.length,
    triangleCount,
    glyphTimingStarts,
  };
}

export const vertexStrideBytes = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;
