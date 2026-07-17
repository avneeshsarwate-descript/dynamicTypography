import { sharedLookDefaults, sharedParameterDefinitions } from './sharedParameters';
import type { CollapseLookParameters, LookDefinition } from './types';

const defaults: CollapseLookParameters = {
  ...sharedLookDefaults,
  scatter: 142,
  collapsedScale: 0.18,
  rotation: 190,
};

export const collapseLookDefinition: LookDefinition<'collapse', CollapseLookParameters> = {
  id: 'collapse',
  number: '01',
  label: 'Collapse',
  shortDescription: 'Rigid glyphs gather, then expand into place.',
  description: 'Whole letters rotate, scale, and travel from a shared center without bending their outlines.',
  defaults,
  parameters: [
    { kind: 'range', key: 'fontSize', label: 'Type size', min: 48, max: 180, step: 1 },
    { kind: 'range', key: 'scatter', label: 'Collapse radius', min: 0, max: 260, step: 1 },
    { kind: 'range', key: 'collapsedScale', label: 'Collapsed size', min: 0.04, max: 0.8, step: 0.01, precision: 2 },
    { kind: 'range', key: 'rotation', label: 'Rotation', min: 0, max: 360, step: 1, suffix: '°' },
    ...sharedParameterDefinitions.slice(1),
  ],
  deformationWgsl: /* wgsl */ `
fn deformGlyph(input: VertexInput, progress: f32) -> vec2f {
  let folded = 1.0 - progress;
  let angle = input.deformation.x * folded;
  let cosine = cos(angle);
  let sine = sin(angle);
  let local = input.position - input.glyphCenter;
  let rotated = vec2f(
    local.x * cosine - local.y * sine,
    local.x * sine + local.y * cosine,
  );
  let scale = mix(input.deformation.y, 1.0, progress);
  let resolvedCenter = mix(input.effectCenter, input.glyphCenter, progress);
  let settle = sin(progress * 3.14159265) * sin(globals.time * 8.0 + input.random * 17.0);
  return resolvedCenter + rotated * scale + vec2f(settle * 2.0, settle * -1.2);
}
`,
  meshParameters: (parameters) => ({
    fontSize: parameters.fontSize,
    letterSpacing: parameters.letterSpacing,
    meshDensity: parameters.meshDensity,
    seed: parameters.seed,
    scatter: parameters.scatter,
    initialScale: parameters.collapsedScale,
    rotation: parameters.rotation,
    anchor: 'block',
  }),
  effectUniforms: () => [0, 0, 0, 0],
};
