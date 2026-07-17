<script setup lang="ts">
import { computed } from 'vue';
import {
  lookDefinitionFor,
  lookDefinitions,
  updateLookParameter,
} from '../looks/registry';
import type {
  LookId,
  LookParameterDefinition,
  LookParameterValue,
  LookState,
} from '../looks/types';
import type { ActiveCaptionState, CaptionDocument } from '../types';

const props = defineProps<{
  text: string;
  document: CaptionDocument;
  look: LookState;
  active: ActiveCaptionState;
}>();

const emit = defineEmits<{
  'update:text': [value: string];
  'update:look': [value: LookState];
  'select:look': [id: LookId];
}>();

const definition = computed(() => lookDefinitionFor(props.look.id));
const rangeParameters = computed(() => definition.value.parameters.filter(
  (parameter) => parameter.kind === 'range',
));
const toggleParameters = computed(() => definition.value.parameters.filter(
  (parameter) => parameter.kind === 'toggle',
));
const colorParameters = computed(() => definition.value.parameters.filter(
  (parameter) => parameter.kind === 'color',
));

function updateParameter(key: string, value: LookParameterValue): void {
  emit('update:look', updateLookParameter(props.look, key, value));
}

function numericValue(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
}

function parameterValue(parameter: LookParameterDefinition): LookParameterValue {
  return props.look.parameters[parameter.key] ?? '';
}

function formatValue(parameter: LookParameterDefinition): string {
  const value = parameterValue(parameter);
  if (parameter.kind !== 'range' || typeof value !== 'number') return String(value);
  const formatted = parameter.precision === undefined ? String(value) : value.toFixed(parameter.precision);
  return `${formatted}${parameter.suffix ?? ''}`;
}
</script>

<template>
  <aside class="editor-panel">
    <div class="panel-heading">
      <p class="eyebrow">Caption source</p>
      <span class="block-count">{{ document.blocks.length }} blocks</span>
    </div>

    <label class="editor-label" for="caption-source">One newline becomes one timed block</label>
    <textarea
      id="caption-source"
      :value="text"
      spellcheck="true"
      data-testid="caption-editor"
      @input="emit('update:text', ($event.target as HTMLTextAreaElement).value)"
    />

    <div class="active-readout" aria-live="polite">
      <span>Now resolving</span>
      <strong>{{ active.word?.text ?? '—' }}</strong>
      <small>{{ active.block ? `Block ${active.block.sourceLine + 1}` : 'Between blocks' }}</small>
    </div>

    <section class="controls" :aria-label="`${definition.label} look parameters`">
      <div class="look-switcher" role="group" aria-label="Typography look">
        <button
          v-for="option in lookDefinitions"
          :key="option.id"
          type="button"
          class="look-option"
          :class="{ active: option.id === look.id }"
          :aria-pressed="option.id === look.id"
          @click="emit('select:look', option.id)"
        >
          <span class="look-number">{{ option.number }}</span>
          <span class="look-icon" :class="`look-icon-${option.id}`" aria-hidden="true"><i /><i /><i /></span>
          <strong>{{ option.label }}</strong>
          <small>{{ option.shortDescription }}</small>
        </button>
      </div>

      <div class="section-heading">
        <p class="eyebrow">Look {{ definition.number }}</p>
        <h2>{{ definition.label }} / Resolve</h2>
        <p>{{ definition.description }}</p>
      </div>

      <label v-for="parameter in rangeParameters" :key="parameter.key" class="control-row">
        <span>{{ parameter.label }} <output>{{ formatValue(parameter) }}</output></span>
        <input
          type="range"
          :min="parameter.min"
          :max="parameter.max"
          :step="parameter.step"
          :value="parameterValue(parameter)"
          @input="updateParameter(parameter.key, numericValue($event))"
        />
      </label>

      <label v-for="parameter in toggleParameters" :key="parameter.key" class="mesh-toggle">
        <input
          type="checkbox"
          :checked="Boolean(parameterValue(parameter))"
          @change="updateParameter(parameter.key, ($event.target as HTMLInputElement).checked)"
        />
        <span>{{ parameter.label }}</span>
      </label>

      <div class="color-grid">
        <label v-for="parameter in colorParameters" :key="parameter.key">
          {{ parameter.label }}
          <input
            type="color"
            :value="String(parameterValue(parameter))"
            @input="updateParameter(parameter.key, ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </section>
  </aside>
</template>
