export type LookId = 'collapse' | 'crumple';

export type LookParameterValue = number | string | boolean;

export type SharedLookParameters = {
  [key: string]: LookParameterValue;
  fontSize: number;
  revealDuration: number;
  wordDuration: number;
  blockGap: number;
  letterSpacing: number;
  meshDensity: number;
  seed: number;
  background: string;
  fill: string;
  activeFill: string;
  showMesh: boolean;
};

export type CollapseLookParameters = SharedLookParameters & {
  scatter: number;
  collapsedScale: number;
  rotation: number;
};

export type CrumpleLookParameters = SharedLookParameters & {
  gather: number;
  compression: number;
  distortion: number;
  folds: number;
  twist: number;
};

export type CollapseLookState = {
  id: 'collapse';
  parameters: CollapseLookParameters;
};

export type CrumpleLookState = {
  id: 'crumple';
  parameters: CrumpleLookParameters;
};

export type LookState = CollapseLookState | CrumpleLookState;

export type RangeParameterDefinition<Key extends string = string> = {
  kind: 'range';
  key: Key;
  label: string;
  min: number;
  max: number;
  step: number;
  precision?: number;
  suffix?: string;
};

export type ToggleParameterDefinition<Key extends string = string> = {
  kind: 'toggle';
  key: Key;
  label: string;
};

export type ColorParameterDefinition<Key extends string = string> = {
  kind: 'color';
  key: Key;
  label: string;
};

export type LookParameterDefinition<Key extends string = string> =
  | RangeParameterDefinition<Key>
  | ToggleParameterDefinition<Key>
  | ColorParameterDefinition<Key>;

export type MeshLookParameters = {
  fontSize: number;
  letterSpacing: number;
  meshDensity: number;
  seed: number;
  scatter: number;
  initialScale: number;
  rotation: number;
  anchor: 'block' | 'word';
};

export type LookDefinition<
  Id extends LookId,
  Parameters extends SharedLookParameters,
> = {
  id: Id;
  number: string;
  label: string;
  shortDescription: string;
  description: string;
  defaults: Parameters;
  parameters: readonly LookParameterDefinition<Extract<keyof Parameters, string>>[];
  deformationWgsl: string;
  meshParameters: (parameters: Parameters) => MeshLookParameters;
  effectUniforms: (parameters: Parameters) => readonly [number, number, number, number];
};

export type AnyLookDefinition =
  | LookDefinition<'collapse', CollapseLookParameters>
  | LookDefinition<'crumple', CrumpleLookParameters>;
