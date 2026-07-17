import { sharedLookDefaults, sharedParameterDefinitions } from './sharedParameters';
import type { CrumpleLookParameters, LookDefinition } from './types';

const MAX_GATHER_RADIUS = 100;

function gatherScale(parameters: CrumpleLookParameters): number {
  return parameters.gather / MAX_GATHER_RADIUS;
}

const defaults: CrumpleLookParameters = {
  ...sharedLookDefaults,
  gather: 20,
  compression: 0.34,
  distortion: 30,
  folds: 4.2,
  twist: 112,
};

export const crumpleLookDefinition: LookDefinition<'crumple', CrumpleLookParameters> = {
  id: 'crumple',
  number: '02',
  label: 'Crumple',
  shortDescription: 'Letter meshes crease and unfold vertex by vertex.',
  description: 'Position-dependent folds bend each letter’s triangles before the active word resolves to the original outline.',
  defaults,
  parameters: [
    { kind: 'range', key: 'fontSize', label: 'Type size', min: 48, max: 180, step: 1 },
    { kind: 'range', key: 'gather', label: 'Gather radius', min: 0, max: MAX_GATHER_RADIUS, step: 1, suffix: 'px' },
    { kind: 'range', key: 'compression', label: 'Compression', min: 0.08, max: 0.9, step: 0.01, precision: 2 },
    { kind: 'range', key: 'distortion', label: 'Distortion', min: 0, max: 70, step: 1, suffix: 'px' },
    { kind: 'range', key: 'folds', label: 'Fold count', min: 0.5, max: 9, step: 0.1, precision: 1 },
    { kind: 'range', key: 'twist', label: 'Fold twist', min: 0, max: 240, step: 1, suffix: '°' },
    ...sharedParameterDefinitions.slice(1),
  ],
  deformationWgsl: /* wgsl */ `
fn rotatePoint(point: vec2f, angle: f32) -> vec2f {
  let cosine = cos(angle);
  let sine = sin(angle);
  return vec2f(
    point.x * cosine - point.y * sine,
    point.x * sine + point.y * cosine,
  );
}

fn deformGlyph(input: VertexInput, progress: f32) -> vec2f {
  let local = input.position - input.glyphCenter;
  let orientation = input.deformation.x;
  let axis = vec2f(cos(orientation), sin(orientation));
  let normal = vec2f(-axis.y, axis.x);
  let typeSize = max(globals.effect.w, 1.0);
  let phase = dot(local, axis) / typeSize * globals.effect.y * 6.2831853 + input.random * 9.7;
  let crossPhase = dot(local, normal) / typeSize * globals.effect.y * 4.3982297 - input.random * 13.1;
  let primaryFold = sin(phase);
  let crossFold = cos(crossPhase + primaryFold * 1.35);
  let sharpCrease = sin(phase * 2.0 + crossPhase) * abs(cos(phase * 0.5));
  let wrinkle = axis * primaryFold + normal * (crossFold * 0.72 + sharpCrease * 0.38);
  let compressed = local * input.deformation.y;
  let crumpled = compressed + wrinkle * globals.effect.x;
  let localTwist = sin(phase * 0.5 + crossPhase * 0.8) * globals.effect.z;
  let twisted = rotatePoint(crumpled, localTwist);
  let resolvedLocal = mix(twisted, local, progress);
  let resolvedCenter = mix(input.effectCenter, input.glyphCenter, progress);
  let settle = sin(progress * 3.14159265) * sin(globals.time * 8.0 + input.random * 17.0);
  return resolvedCenter + resolvedLocal + vec2f(settle * 1.4, settle * -0.8);
}
`,
  meshParameters: (parameters) => ({
    fontSize: parameters.fontSize,
    letterSpacing: parameters.letterSpacing,
    meshDensity: parameters.meshDensity,
    seed: parameters.seed,
    scatter: parameters.gather,
    initialScale: parameters.compression * gatherScale(parameters),
    rotation: 360,
    anchor: 'word',
  }),
  effectUniforms: (parameters) => [
    parameters.distortion * gatherScale(parameters),
    parameters.folds,
    parameters.twist * Math.PI / 180,
    parameters.fontSize,
  ],
};
