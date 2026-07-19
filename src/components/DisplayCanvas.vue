<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { LookState } from '../looks/types';
import type { ActiveCaptionState, CaptionDocument } from '../types';
import { connectCaptureBridge, type CanvasCaptureRequest } from '../render/captureBridge';
import { loadPrototypeFont } from '../render/fontGeometry';
import type { LookRenderStats } from '../render/lookRenderer';
import { WebGpuTextRenderer } from '../render/webgpuRenderer';

const props = defineProps<{
  document: CaptionDocument;
  time: number;
  look: LookState;
  active: ActiveCaptionState;
}>();

const emit = defineEmits<{
  seek: [time: number];
  'select:look': [id: LookState['id']];
}>();

const canvas = ref<HTMLCanvasElement>();
const stage = ref<HTMLElement>();
const status = ref<'loading' | 'ready' | 'error'>('loading');
const errorMessage = ref('');
const renderStats = ref<LookRenderStats>();
const captureState = ref<'idle' | 'capturing' | 'saved'>('idle');

let renderer: WebGpuTextRenderer | undefined;
let font: Awaited<ReturnType<typeof loadPrototypeFont>> | undefined;
let resizeObserver: ResizeObserver | undefined;

const statusLabel = computed(() => {
  if (status.value === 'loading') return 'Preparing font geometry';
  if (status.value === 'error') return errorMessage.value;
  if (!props.active.block) return 'Inter-block gap';
  return `Block ${props.active.block.sourceLine + 1} · ${props.active.word?.text ?? 'settled'}`;
});

function rebuildLookSource(): void {
  if (!renderer || !font || !canvas.value) return;
  const width = canvas.value.clientWidth;
  const height = canvas.value.clientHeight;
  if (width === 0 || height === 0) return;
  renderStats.value = renderer.setSource({
    block: props.active.block,
    font,
    look: props.look,
    width,
    height,
  });
  renderer.render(props.time, props.look);
}

function render(): void {
  renderer?.render(props.time, props.look);
}

async function downloadScreenshot(): Promise<void> {
  if (!renderer) return;
  captureState.value = 'capturing';
  try {
    const blob = await renderer.capturePng(props.time, props.look);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dynamic-type-${props.look.id}-${props.time.toFixed(2)}s.png`;
    link.click();
    URL.revokeObjectURL(url);
    captureState.value = 'saved';
    window.setTimeout(() => { captureState.value = 'idle'; }, 1400);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    status.value = 'error';
    captureState.value = 'idle';
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function reportCaptureStatus(state: 'loading' | 'ready' | 'error', detail?: string): void {
  if (!import.meta.env.DEV) return;
  void fetch('/__canvas-capture/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, detail, userAgent: navigator.userAgent }),
  });
}

async function captureAt(request: CanvasCaptureRequest): Promise<Blob> {
  if (!renderer) {
    throw new Error(
      status.value === 'error'
        ? `Renderer failed to initialize: ${errorMessage.value}`
        : 'Renderer is still initializing',
    );
  }
  const stateChanged = request.time !== undefined || (
    request.look !== undefined && request.look !== props.look.id
  );
  if (request.look !== undefined && request.look !== props.look.id) {
    emit('select:look', request.look);
  }
  if (request.time !== undefined) emit('seek', request.time);
  if (stateChanged) {
    await nextTick();
    await nextFrame();
  }
  reportCaptureStatus('ready', JSON.stringify({
    requestedTime: request.time,
    requestedLook: request.look,
    actualTime: props.time,
    lookId: props.look.id,
    blockId: props.active.block?.id,
    wordId: props.active.word?.id,
    renderedBlockId: renderStats.value?.blockId,
    technique: renderStats.value?.technique,
    glyphCount: renderStats.value?.glyphCount,
    vertexCount: renderStats.value?.vertexCount,
    glyphTimingStarts: renderStats.value?.glyphTimingStarts,
  }));
  return renderer.capturePng(props.time, props.look);
}

onMounted(async () => {
  if (!canvas.value || !stage.value) return;
  reportCaptureStatus('loading');
  try {
    [renderer, font] = await Promise.all([
      WebGpuTextRenderer.create(canvas.value),
      loadPrototypeFont('/Sora-Variable.ttf'),
    ]);
    const resize = (): void => {
      if (!canvas.value || !renderer) return;
      const changed = renderer.resize(canvas.value.clientWidth, canvas.value.clientHeight);
      if (changed) rebuildLookSource();
      else render();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage.value);
    resize();
    status.value = 'ready';
    reportCaptureStatus('ready');
    if (import.meta.env.DEV) connectCaptureBridge(captureAt);
  } catch (error) {
    status.value = 'error';
    errorMessage.value = error instanceof Error ? error.message : String(error);
    reportCaptureStatus('error', errorMessage.value);
  }
});

watch(() => props.time, render);
watch(
  [
    () => props.document.revision,
    () => props.active.block?.id,
    () => props.look.id,
    () => JSON.stringify(props.look.parameters),
  ],
  rebuildLookSource,
);

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  renderer?.destroy();
});
</script>

<template>
  <main ref="stage" class="display-stage">
    <canvas ref="canvas" data-testid="render-canvas" aria-label="Dynamic typography WebGPU canvas" />

    <div class="canvas-chrome canvas-topline">
      <span class="render-light" :class="status" />
      <span data-testid="render-status">{{ statusLabel }}</span>
    </div>

    <div v-if="status === 'error'" class="canvas-error">
      <strong>Renderer unavailable</strong>
      <p>{{ errorMessage }}</p>
    </div>

    <div class="canvas-chrome canvas-footer">
      <span v-if="renderStats">{{ renderStats.glyphCount }} glyphs · {{ renderStats.triangleCount.toLocaleString() }} triangles · {{ renderStats.technique }}</span>
      <span v-else>Raw WebGPU stage</span>
      <button type="button" :disabled="status !== 'ready' || captureState === 'capturing'" data-testid="download-screenshot" @click="downloadScreenshot">
        {{ captureState === 'capturing' ? 'Capturing…' : captureState === 'saved' ? 'PNG saved' : 'Save frame' }}
      </button>
    </div>
  </main>
</template>
