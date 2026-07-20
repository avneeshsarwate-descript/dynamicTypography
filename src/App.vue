<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import DisplayCanvas from './components/DisplayCanvas.vue';
import Playhead from './components/Playhead.vue';
import TextEditor from './components/TextEditor.vue';
import {
  createBalloonStrokeLook,
  createCollapseLook,
  createCrumpleLook,
  createElasticLook,
} from './looks/registry';
import type { LookId, LookState } from './looks/types';
import { activeCaptionAt, buildCaptionDocument } from './model/captionDocument';

const sourceText = ref(`Type can remember being tangled.
Every word finds its shape.
Motion makes language physical.`);

const collapseLook = ref(createCollapseLook());
const crumpleLook = ref(createCrumpleLook());
const balloonStrokeLook = ref(createBalloonStrokeLook());
const elasticLook = ref(createElasticLook());
const selectedLookId = ref<LookId>('collapse');
const look = computed<LookState>(() => {
  if (selectedLookId.value === 'collapse') return collapseLook.value;
  if (selectedLookId.value === 'crumple') return crumpleLook.value;
  if (selectedLookId.value === 'balloon-stroke') return balloonStrokeLook.value;
  return elasticLook.value;
});

const revision = ref(1);
const time = ref(0);
const playing = ref(false);
const document = computed(() => buildCaptionDocument(
  sourceText.value,
  look.value.parameters,
  revision.value,
));
const active = computed(() => activeCaptionAt(document.value, time.value));

let frameRequest: number | undefined;
let previousFrame = 0;

function playbackFrame(timestamp: number): void {
  if (!playing.value) return;
  if (!previousFrame) previousFrame = timestamp;
  time.value += (timestamp - previousFrame) / 1000;
  previousFrame = timestamp;
  if (time.value >= document.value.duration) {
    time.value = document.value.duration;
    playing.value = false;
    previousFrame = 0;
    return;
  }
  frameRequest = requestAnimationFrame(playbackFrame);
}

function togglePlayback(): void {
  if (playing.value) {
    playing.value = false;
    previousFrame = 0;
    if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
    return;
  }
  if (time.value >= document.value.duration) time.value = 0;
  playing.value = true;
  previousFrame = 0;
  frameRequest = requestAnimationFrame(playbackFrame);
}

function seek(value: number): void {
  time.value = Math.min(document.value.duration, Math.max(0, value));
  previousFrame = 0;
}

function restart(): void {
  seek(0);
}

function updateText(value: string): void {
  sourceText.value = value;
}

function updateLook(value: LookState): void {
  if (value.id === 'collapse') collapseLook.value = value;
  else if (value.id === 'crumple') crumpleLook.value = value;
  else if (value.id === 'balloon-stroke') balloonStrokeLook.value = value;
  else elasticLook.value = value;
}

function selectLook(id: LookId): void {
  selectedLookId.value = id;
}

function handleKeyboard(event: KeyboardEvent): void {
  if (event.code !== 'Space') return;
  const target = event.target as HTMLElement | null;
  if (target?.matches('textarea, input, button')) return;
  event.preventDefault();
  togglePlayback();
}

watch(
  [
    sourceText,
    selectedLookId,
    () => look.value.parameters.wordDuration,
    () => look.value.parameters.blockGap,
  ],
  () => {
    revision.value += 1;
    time.value = Math.min(time.value, document.value.duration);
  },
);

onMounted(() => window.addEventListener('keydown', handleKeyboard));
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard);
  if (frameRequest !== undefined) cancelAnimationFrame(frameRequest);
});
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true"><i /><i /><i /></div>
        <div>
          <p>DYNAMIC TYPOGRAPHY LAB</p>
          <span>Caption / TAU model → modular look renderers → flat WebGPU frames</span>
        </div>
      </div>
      <div class="prototype-badge"><i /> Live prototype</div>
    </header>

    <div class="workspace">
      <TextEditor
        :text="sourceText"
        :document="document"
        :look="look"
        :active="active"
        @update:text="updateText"
        @update:look="updateLook"
        @select:look="selectLook"
      />
      <DisplayCanvas
        :document="document"
        :time="time"
        :look="look"
        :active="active"
        @seek="seek"
        @select:look="selectLook"
      />
    </div>

    <Playhead
      :document="document"
      :time="time"
      :playing="playing"
      :active="active"
      @seek="seek"
      @toggle="togglePlayback"
      @restart="restart"
    />
  </div>
</template>
