import { balloonStrokeLookDefinition } from './balloonStroke';
import { collapseLookDefinition } from './collapse';
import { crumpleLookDefinition } from './crumple';
import type {
  BalloonStrokeLookState,
  BaseLookParameters,
  AnyLookDefinition,
  CollapseLookState,
  CrumpleLookState,
  LookId,
  LookParameterDefinition,
  LookParameterValue,
  LookState,
  MeshLookParameters,
  MeshDeformationLookState,
} from './types';

export const lookDefinitions = [
  collapseLookDefinition,
  crumpleLookDefinition,
  balloonStrokeLookDefinition,
] as const;

export function lookDefinitionFor(id: LookId): AnyLookDefinition {
  if (id === 'collapse') return collapseLookDefinition;
  if (id === 'crumple') return crumpleLookDefinition;
  return balloonStrokeLookDefinition;
}

export function createCollapseLook(): CollapseLookState {
  return { id: 'collapse', parameters: { ...collapseLookDefinition.defaults } };
}

export function createCrumpleLook(): CrumpleLookState {
  return { id: 'crumple', parameters: { ...crumpleLookDefinition.defaults } };
}

export function createBalloonStrokeLook(): BalloonStrokeLookState {
  return { id: 'balloon-stroke', parameters: { ...balloonStrokeLookDefinition.defaults } };
}

export function meshParametersForLook(look: MeshDeformationLookState): MeshLookParameters {
  return look.id === 'collapse'
    ? collapseLookDefinition.meshParameters(look.parameters)
    : crumpleLookDefinition.meshParameters(look.parameters);
}

export function effectUniformsForLook(look: MeshDeformationLookState): readonly [number, number, number, number] {
  return look.id === 'collapse'
    ? collapseLookDefinition.effectUniforms(look.parameters)
    : crumpleLookDefinition.effectUniforms(look.parameters);
}

function normalizedParameterValue(
  definition: LookParameterDefinition,
  rawValue: LookParameterValue,
): LookParameterValue {
  if (definition.kind === 'toggle') return Boolean(rawValue);
  if (definition.kind === 'color') return String(rawValue);
  const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  if (!Number.isFinite(numericValue)) return definition.min;
  return Math.min(definition.max, Math.max(definition.min, numericValue));
}

function updateDefinedParameter<
  Id extends LookId,
  Parameters extends BaseLookParameters,
>(
  look: { id: Id; parameters: Parameters },
  definitions: readonly LookParameterDefinition<Extract<keyof Parameters, string>>[],
  key: string,
  rawValue: LookParameterValue,
): { id: Id; parameters: Parameters } {
  const definition = definitions.find((candidate) => candidate.key === key);
  if (!definition) return look;
  const value = normalizedParameterValue(definition, rawValue);
  return {
    ...look,
    parameters: Object.assign({}, look.parameters, { [definition.key]: value }),
  };
}

export function updateLookParameter(
  look: CollapseLookState,
  key: string,
  rawValue: LookParameterValue,
): CollapseLookState;
export function updateLookParameter(
  look: CrumpleLookState,
  key: string,
  rawValue: LookParameterValue,
): CrumpleLookState;
export function updateLookParameter(
  look: BalloonStrokeLookState,
  key: string,
  rawValue: LookParameterValue,
): BalloonStrokeLookState;
export function updateLookParameter(
  look: LookState,
  key: string,
  rawValue: LookParameterValue,
): LookState;
export function updateLookParameter(
  look: LookState,
  key: string,
  rawValue: LookParameterValue,
): LookState {
  if (look.id === 'collapse') {
    return updateDefinedParameter(look, collapseLookDefinition.parameters, key, rawValue);
  }
  if (look.id === 'crumple') {
    return updateDefinedParameter(look, crumpleLookDefinition.parameters, key, rawValue);
  }
  return updateDefinedParameter(look, balloonStrokeLookDefinition.parameters, key, rawValue);
}
