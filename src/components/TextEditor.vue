<script setup lang="ts">
import type { ActiveCaptionState, CaptionDocument, LookParameters } from '../types';

const props = defineProps<{
  text: string;
  document: CaptionDocument;
  look: LookParameters;
  active: ActiveCaptionState;
}>();

const emit = defineEmits<{
  'update:text': [value: string];
  'update:look': [value: LookParameters];
}>();

function updateLook<Key extends keyof LookParameters>(key: Key, value: LookParameters[Key]): void {
  emit('update:look', { ...props.look, [key]: value });
}

function numericValue(event: Event): number {
  return Number((event.target as HTMLInputElement).value);
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

    <section class="controls" aria-label="Crumple look parameters">
      <div class="section-heading">
        <p class="eyebrow">Look 01</p>
        <h2>Crumple / Resolve</h2>
      </div>

      <label class="control-row">
        <span>Type size <output>{{ look.fontSize }}</output></span>
        <input type="range" min="48" max="180" step="1" :value="look.fontSize" @input="updateLook('fontSize', numericValue($event))" />
      </label>
      <label class="control-row">
        <span>Crumple <output>{{ look.crumpleStrength }}</output></span>
        <input type="range" min="0" max="260" step="1" :value="look.crumpleStrength" @input="updateLook('crumpleStrength', numericValue($event))" />
      </label>
      <label class="control-row">
        <span>Fold scale <output>{{ look.crumpleScale.toFixed(2) }}</output></span>
        <input type="range" min="0.04" max="0.8" step="0.01" :value="look.crumpleScale" @input="updateLook('crumpleScale', numericValue($event))" />
      </label>
      <label class="control-row">
        <span>Twist <output>{{ look.twist }}°</output></span>
        <input type="range" min="0" max="360" step="1" :value="look.twist" @input="updateLook('twist', numericValue($event))" />
      </label>
      <label class="control-row">
        <span>Resolve time <output>{{ look.revealDuration.toFixed(2) }}s</output></span>
        <input type="range" min="0.08" max="1.2" step="0.01" :value="look.revealDuration" @input="updateLook('revealDuration', numericValue($event))" />
      </label>
      <label class="control-row">
        <span>Word time <output>{{ look.wordDuration.toFixed(2) }}s</output></span>
        <input type="range" min="0.2" max="1.4" step="0.02" :value="look.wordDuration" @input="updateLook('wordDuration', numericValue($event))" />
      </label>
      <label class="control-row">
        <span>Block gap <output>{{ look.blockGap.toFixed(2) }}s</output></span>
        <input type="range" min="0" max="1" step="0.02" :value="look.blockGap" @input="updateLook('blockGap', numericValue($event))" />
      </label>
      <label class="control-row">
        <span>Mesh detail <output>{{ look.meshDensity }}</output></span>
        <input type="range" min="2" max="10" step="1" :value="look.meshDensity" @input="updateLook('meshDensity', numericValue($event))" />
      </label>

      <label class="mesh-toggle">
        <input type="checkbox" :checked="look.showMesh" @change="updateLook('showMesh', ($event.target as HTMLInputElement).checked)" />
        <span>Reveal triangle mesh</span>
      </label>

      <div class="color-grid">
        <label>Stage <input type="color" :value="look.background" @input="updateLook('background', ($event.target as HTMLInputElement).value)" /></label>
        <label>Type <input type="color" :value="look.fill" @input="updateLook('fill', ($event.target as HTMLInputElement).value)" /></label>
        <label>Active <input type="color" :value="look.activeFill" @input="updateLook('activeFill', ($event.target as HTMLInputElement).value)" /></label>
      </div>
    </section>
  </aside>
</template>
