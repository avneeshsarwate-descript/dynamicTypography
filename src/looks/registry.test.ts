import { describe, expect, it } from 'vitest';
import { balloonStrokeLookDefinition } from './balloonStroke';
import { collapseLookDefinition } from './collapse';
import { crumpleLookDefinition } from './crumple';
import { elasticLookDefinition } from './elastic';
import {
  createBalloonStrokeLook,
  createCollapseLook,
  createCrumpleLook,
  createElasticLook,
  effectUniformsForLook,
  lookDefinitions,
  meshParametersForLook,
  updateLookParameter,
} from './registry';

describe('typography look registry', () => {
  it('gives every look a complete, uniquely keyed parameter schema', () => {
    for (const look of lookDefinitions) {
      const parameterKeys = look.parameters.map((parameter) => parameter.key);
      expect(new Set(parameterKeys).size).toBe(parameterKeys.length);
      expect([...parameterKeys].sort()).toEqual(Object.keys(look.defaults).sort());
    }
  });

  it('keeps look values independent and validates updates through each schema', () => {
    const collapse = createCollapseLook();
    const crumple = createCrumpleLook();
    const changedCollapse = updateLookParameter(collapse, 'scatter', 999);
    const invalidForCrumple = updateLookParameter(crumple, 'scatter', 40);

    expect(changedCollapse.parameters.scatter).toBe(260);
    expect(crumple.parameters.gather).toBe(20);
    expect(invalidForCrumple).toBe(crumple);
  });

  it('gives Balloon Stroke its own technique-specific controls', () => {
    const look = createBalloonStrokeLook();
    const changed = updateLookParameter(look, 'balloonStroke', 999);

    expect(changed.parameters.balloonStroke).toBe(64);
    expect(balloonStrokeLookDefinition.parameters.map(({ key }) => key)).toContain('fontWeight');
    expect(balloonStrokeLookDefinition.parameters.map(({ key }) => key)).not.toContain('showMesh');
    expect(balloonStrokeLookDefinition.defaults.fontWeight).toBeLessThan(400);
  });

  it('gives Elastic independent spring and outline controls', () => {
    const look = createElasticLook();
    const changed = updateLookParameter(look, 'peakScale', 9);
    const keys = elasticLookDefinition.parameters.map(({ key }) => key);

    expect(changed.parameters.peakScale).toBe(2);
    expect(keys).toContain('strokeWidth');
    expect(keys).toContain('frequency');
    expect(keys).toContain('dampingRatio');
    expect(keys).toContain('pullDuration');
    expect(keys).not.toContain('balloonStroke');
  });

  it('preserves the old rigid-glyph settings as Collapse', () => {
    const mesh = meshParametersForLook(createCollapseLook());

    expect(mesh).toMatchObject({
      scatter: 142,
      initialScale: 0.18,
      rotation: 190,
    });
    expect(effectUniformsForLook(createCollapseLook())).toEqual([0, 0, 0, 0]);
    expect(collapseLookDefinition.deformationWgsl).toContain('rotated * scale');
  });

  it('defines Crumple with position-dependent vertex folds', () => {
    const shader = crumpleLookDefinition.deformationWgsl;
    const uniforms = effectUniformsForLook(createCrumpleLook());

    expect(shader).toContain('dot(local, axis)');
    expect(shader).toContain('dot(local, normal)');
    expect(shader).toContain('resolvedLocal = mix(twisted, local, progress)');
    expect(uniforms[0]).toBeGreaterThan(0);
    expect(uniforms[1]).toBeGreaterThan(1);
    expect(uniforms[2]).toBeGreaterThan(0);
    expect(meshParametersForLook(createCrumpleLook()).anchor).toBe('word');
  });

  it('uses Gather to scale the entire initial Crumple bundle to zero', () => {
    const look = createCrumpleLook();
    const zeroGather = updateLookParameter(look, 'gather', 0);
    const halfGather = updateLookParameter(look, 'gather', 50);
    const zeroMesh = meshParametersForLook(zeroGather);
    const halfMesh = meshParametersForLook(halfGather);

    expect(zeroMesh.scatter).toBe(0);
    expect(zeroMesh.initialScale).toBe(0);
    expect(effectUniformsForLook(zeroGather)[0]).toBe(0);
    expect(halfMesh.scatter).toBe(50);
    expect(halfMesh.initialScale).toBeCloseTo(look.parameters.compression * 0.5);
    expect(effectUniformsForLook(halfGather)[0]).toBeCloseTo(
      look.parameters.distortion * 0.5,
    );
  });
});
