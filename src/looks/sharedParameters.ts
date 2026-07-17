import type { LookParameterDefinition, SharedLookParameters } from './types';

export const sharedLookDefaults: SharedLookParameters = {
  fontSize: 104,
  revealDuration: 0.42,
  wordDuration: 0.68,
  blockGap: 0.34,
  letterSpacing: -1,
  meshDensity: 7,
  seed: 23,
  background: '#0a0b10',
  fill: '#eee9dd',
  activeFill: '#fe5a36',
  showMesh: false,
};

export const sharedParameterDefinitions = [
  { kind: 'range', key: 'fontSize', label: 'Type size', min: 48, max: 180, step: 1 },
  { kind: 'range', key: 'revealDuration', label: 'Resolve time', min: 0.08, max: 1.2, step: 0.01, precision: 2, suffix: 's' },
  { kind: 'range', key: 'wordDuration', label: 'Word time', min: 0.2, max: 1.4, step: 0.02, precision: 2, suffix: 's' },
  { kind: 'range', key: 'blockGap', label: 'Block gap', min: 0, max: 1, step: 0.02, precision: 2, suffix: 's' },
  { kind: 'range', key: 'letterSpacing', label: 'Letter spacing', min: -8, max: 12, step: 0.5, precision: 1, suffix: 'px' },
  { kind: 'range', key: 'meshDensity', label: 'Mesh detail', min: 2, max: 10, step: 1 },
  { kind: 'range', key: 'seed', label: 'Variation', min: 1, max: 100, step: 1 },
  { kind: 'toggle', key: 'showMesh', label: 'Reveal triangle mesh' },
  { kind: 'color', key: 'background', label: 'Stage' },
  { kind: 'color', key: 'fill', label: 'Type' },
  { kind: 'color', key: 'activeFill', label: 'Active' },
] as const satisfies readonly LookParameterDefinition<Extract<keyof SharedLookParameters, string>>[];
