import type { ElasticLookParameters, LookDefinition } from './types';

const defaults: ElasticLookParameters = {
  fontSize: 104,
  fontWeight: 650,
  wordDuration: 0.9,
  blockGap: 0.34,
  letterSpacing: -0.5,
  curveDetail: 7,
  strokeWidth: 3,
  peakScale: 1.34,
  pullDuration: 0.16,
  frequency: 4,
  dampingRatio: 0.38,
  background: '#0b1020',
  fill: '#f4efe5',
  stroke: '#58d6b0',
};

export const elasticLookDefinition: LookDefinition<'elastic', ElasticLookParameters> = {
  id: 'elastic',
  number: '04',
  label: 'Elastic',
  shortDescription: 'Outlined words stretch, release, and ring around rest.',
  description: 'The full line is present immediately. Each active word pulls outward, then crosses through its resting size with a damped spring oscillation.',
  defaults,
  parameters: [
    { kind: 'range', key: 'fontSize', label: 'Type size', min: 48, max: 180, step: 1 },
    { kind: 'range', key: 'fontWeight', label: 'Font weight', min: 100, max: 900, step: 10 },
    { kind: 'range', key: 'strokeWidth', label: 'Stroke width', min: 0, max: 16, step: 0.5, precision: 1, suffix: 'px' },
    { kind: 'range', key: 'peakScale', label: 'Pull scale', min: 1, max: 2, step: 0.01, precision: 2, suffix: '×' },
    { kind: 'range', key: 'pullDuration', label: 'Pull time', min: 0.04, max: 0.4, step: 0.01, precision: 2, suffix: 's' },
    { kind: 'range', key: 'frequency', label: 'Spring frequency', min: 1, max: 8, step: 0.1, precision: 1, suffix: 'Hz' },
    { kind: 'range', key: 'dampingRatio', label: 'Damping ratio', min: 0.05, max: 0.95, step: 0.01, precision: 2 },
    { kind: 'range', key: 'wordDuration', label: 'Word time', min: 0.3, max: 2, step: 0.02, precision: 2, suffix: 's' },
    { kind: 'range', key: 'blockGap', label: 'Block gap', min: 0, max: 1, step: 0.02, precision: 2, suffix: 's' },
    { kind: 'range', key: 'letterSpacing', label: 'Letter spacing', min: -8, max: 12, step: 0.5, precision: 1, suffix: 'px' },
    { kind: 'range', key: 'curveDetail', label: 'Curve detail', min: 2, max: 10, step: 1 },
    { kind: 'color', key: 'background', label: 'Stage' },
    { kind: 'color', key: 'fill', label: 'Type' },
    { kind: 'color', key: 'stroke', label: 'Stroke' },
  ],
};
