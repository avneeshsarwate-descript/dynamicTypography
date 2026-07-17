<script setup lang="ts">
import { computed } from 'vue';
import type { ActiveCaptionState, CaptionDocument } from '../types';

const props = defineProps<{
  document: CaptionDocument;
  time: number;
  playing: boolean;
  active: ActiveCaptionState;
}>();

const emit = defineEmits<{
  seek: [time: number];
  toggle: [];
  restart: [];
}>();

const sliderValue = computed(() => Math.min(props.time, props.document.duration));

function percentage(value: number): number {
  return (value / props.document.duration) * 100;
}

function formatTime(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
}
</script>

<template>
  <footer class="playhead-panel">
    <div class="transport">
      <button class="icon-button" type="button" aria-label="Restart" title="Restart" @click="emit('restart')">↺</button>
      <button class="play-button" type="button" :aria-label="playing ? 'Pause' : 'Play'" data-testid="play-toggle" @click="emit('toggle')">
        {{ playing ? 'Pause' : 'Play' }}
      </button>
      <time>{{ formatTime(time) }}</time>
    </div>

    <div class="timeline-shell">
      <div class="block-lane" aria-hidden="true">
        <div
          v-for="block in document.blocks"
          :key="block.id"
          class="block-segment"
          :class="{ active: active.block?.id === block.id, empty: !block.text.trim() }"
          :style="{
            left: `${percentage(block.startTime)}%`,
            width: `${percentage(block.endTime - block.startTime)}%`,
          }"
        >
          <i
            v-for="word in block.words"
            :key="word.id"
            :class="{ active: active.word?.id === word.id }"
            :style="{ left: `${((word.startTime - block.startTime) / (block.endTime - block.startTime)) * 100}%` }"
          />
        </div>
        <div class="needle" :style="{ left: `${percentage(time)}%` }" />
      </div>
      <input
        class="timeline-input"
        type="range"
        min="0"
        :max="document.duration"
        step="0.001"
        :value="sliderValue"
        aria-label="Playhead"
        data-testid="playhead"
        @input="emit('seek', Number(($event.target as HTMLInputElement).value))"
      />
      <div class="timeline-labels">
        <span>0:00</span>
        <span>{{ formatTime(document.duration) }}</span>
      </div>
    </div>
  </footer>
</template>
