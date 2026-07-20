export type LookId = 'collapse' | 'crumple' | 'balloon-stroke' | 'elastic';

export type LookParameterValue = number | string | boolean;

export type BaseLookParameters = {
  [key: string]: LookParameterValue;
  wordDuration: number;
  blockGap: number;
  background: string;
};

export type SharedLookParameters = BaseLookParameters & {
  fontSize: number;
  revealDuration: number;
  letterSpacing: number;
  meshDensity: number;
  seed: number;
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

export type BalloonStrokeLookParameters = BaseLookParameters & {
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  curveDetail: number;
  normalStroke: number;
  balloonStroke: number;
  peakPosition: number;
  fill: string;
  stroke: string;
};

export type ElasticLookParameters = BaseLookParameters & {
  fontSize: number;
  fontWeight: number;
  letterSpacing: number;
  curveDetail: number;
  strokeWidth: number;
  peakScale: number;
  pullDuration: number;
  frequency: number;
  dampingRatio: number;
  fill: string;
  stroke: string;
};

export type CollapseLookState = {
  id: 'collapse';
  parameters: CollapseLookParameters;
};

export type CrumpleLookState = {
  id: 'crumple';
  parameters: CrumpleLookParameters;
};

export type BalloonStrokeLookState = {
  id: 'balloon-stroke';
  parameters: BalloonStrokeLookParameters;
};

export type ElasticLookState = {
  id: 'elastic';
  parameters: ElasticLookParameters;
};

export type MeshDeformationLookState = CollapseLookState | CrumpleLookState;

export type LookState = MeshDeformationLookState | BalloonStrokeLookState | ElasticLookState;

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
  Parameters extends BaseLookParameters,
> = {
  id: Id;
  number: string;
  label: string;
  shortDescription: string;
  description: string;
  defaults: Parameters;
  parameters: readonly LookParameterDefinition<Extract<keyof Parameters, string>>[];
};

export type MeshLookDefinition<
  Id extends MeshDeformationLookState['id'],
  Parameters extends SharedLookParameters,
> = LookDefinition<Id, Parameters> & {
  deformationWgsl: string;
  meshParameters: (parameters: Parameters) => MeshLookParameters;
  effectUniforms: (parameters: Parameters) => readonly [number, number, number, number];
};

export type AnyLookDefinition =
  | MeshLookDefinition<'collapse', CollapseLookParameters>
  | MeshLookDefinition<'crumple', CrumpleLookParameters>
  | LookDefinition<'balloon-stroke', BalloonStrokeLookParameters>
  | LookDefinition<'elastic', ElasticLookParameters>;

export type AnyMeshLookDefinition = Extract<
  AnyLookDefinition,
  { id: MeshDeformationLookState['id'] }
>;
