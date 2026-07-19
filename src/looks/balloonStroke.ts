import type { BalloonStrokeLookParameters, LookDefinition } from './types';

const defaults: BalloonStrokeLookParameters = {
  fontSize: 112,
  fontWeight: 240,
  wordDuration: 0.84,
  blockGap: 0.34,
  letterSpacing: 0,
  curveDetail: 7,
  normalStroke: 3,
  balloonStroke: 28,
  peakPosition: 0.34,
  background: '#f0ede5',
  fill: '#17181b',
  stroke: '#ff4f2e',
};

export const balloonStrokeLookDefinition: LookDefinition<
  'balloon-stroke',
  BalloonStrokeLookParameters
> = {
  id: 'balloon-stroke',
  number: '03',
  label: 'Balloon Stroke',
  shortDescription: 'A live outline swells, then settles around each word.',
  description: 'The full line is present immediately. Each active word grows a round parametric outline that finishes at a restrained width.',
  defaults,
  parameters: [
    { kind: 'range', key: 'fontSize', label: 'Type size', min: 48, max: 180, step: 1 },
    { kind: 'range', key: 'fontWeight', label: 'Font weight', min: 100, max: 900, step: 10 },
    { kind: 'range', key: 'normalStroke', label: 'Settled stroke', min: 0, max: 18, step: 0.5, precision: 1, suffix: 'px' },
    { kind: 'range', key: 'balloonStroke', label: 'Balloon stroke', min: 1, max: 64, step: 1, suffix: 'px' },
    { kind: 'range', key: 'peakPosition', label: 'Peak timing', min: 0.08, max: 0.8, step: 0.01, precision: 2 },
    { kind: 'range', key: 'wordDuration', label: 'Word time', min: 0.25, max: 1.8, step: 0.02, precision: 2, suffix: 's' },
    { kind: 'range', key: 'blockGap', label: 'Block gap', min: 0, max: 1, step: 0.02, precision: 2, suffix: 's' },
    { kind: 'range', key: 'letterSpacing', label: 'Letter spacing', min: -8, max: 12, step: 0.5, precision: 1, suffix: 'px' },
    { kind: 'range', key: 'curveDetail', label: 'Curve detail', min: 2, max: 10, step: 1 },
    { kind: 'color', key: 'background', label: 'Stage' },
    { kind: 'color', key: 'fill', label: 'Type' },
    { kind: 'color', key: 'stroke', label: 'Stroke' },
  ],
};
