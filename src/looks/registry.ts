import { collapseLookDefinition } from './collapse';
import { crumpleLookDefinition } from './crumple';
import type {
  AnyLookDefinition,
  CollapseLookState,
  CrumpleLookState,
  LookId,
  LookParameterDefinition,
  LookParameterValue,
  LookState,
  MeshLookParameters,
  SharedLookParameters,
} from './types';

export const lookDefinitions = [collapseLookDefinition, crumpleLookDefinition] as const;

export function lookDefinitionFor(id: LookId): AnyLookDefinition {
  return id === 'collapse' ? collapseLookDefinition : crumpleLookDefinition;
}

export function createCollapseLook(): CollapseLookState {
  return { id: 'collapse', parameters: { ...collapseLookDefinition.defaults } };
}

export function createCrumpleLook(): CrumpleLookState {
  return { id: 'crumple', parameters: { ...crumpleLookDefinition.defaults } };
}

export function meshParametersForLook(look: LookState): MeshLookParameters {
  return look.id === 'collapse'
    ? collapseLookDefinition.meshParameters(look.parameters)
    : crumpleLookDefinition.meshParameters(look.parameters);
}

export function effectUniformsForLook(look: LookState): readonly [number, number, number, number] {
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
  Parameters extends SharedLookParameters,
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
  look: LookState,
  key: string,
  rawValue: LookParameterValue,
): LookState {
  return look.id === 'collapse'
    ? updateDefinedParameter(look, collapseLookDefinition.parameters, key, rawValue)
    : updateDefinedParameter(look, crumpleLookDefinition.parameters, key, rawValue);
}
