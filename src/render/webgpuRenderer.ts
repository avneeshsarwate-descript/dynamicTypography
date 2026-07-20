import { collapseLookDefinition } from '../looks/collapse';
import { crumpleLookDefinition } from '../looks/crumple';
import type { LookId, LookState } from '../looks/types';
import { BalloonStrokeRenderer } from './balloonStrokeRenderer';
import { ElasticRenderer } from './elasticRenderer';
import type {
  LookRenderSource,
  LookRenderer,
  LookRenderStats,
} from './lookRenderer';
import { MeshDeformationRenderer } from './meshDeformationRenderer';
import { withTimeout } from './webgpuUtilities';

const SAMPLE_COUNT = 4;

/**
 * Owns only the GPU device, canvas target, capture target, and look selection.
 * Technique-specific geometry and draw passes live behind LookRenderer.
 */
export class WebGpuTextRenderer {
  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly renderers: ReadonlyMap<LookId, LookRenderer>,
    private readonly format: GPUTextureFormat,
  ) {}

  private activeRenderer: LookRenderer | undefined;
  private multisampleTexture: GPUTexture | undefined;

  static async create(canvas: HTMLCanvasElement): Promise<WebGpuTextRenderer> {
    if (!navigator.gpu) throw new Error('WebGPU is not available in this browser');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter was found');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('Could not create a WebGPU canvas context');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const renderContext = { device, format, sampleCount: SAMPLE_COUNT };
    const runtimeEntries = await Promise.all([
      MeshDeformationRenderer.create(renderContext, collapseLookDefinition),
      MeshDeformationRenderer.create(renderContext, crumpleLookDefinition),
      BalloonStrokeRenderer.create(renderContext),
      ElasticRenderer.create(renderContext),
    ]);
    const renderers = new Map<LookId, LookRenderer>(
      runtimeEntries.map((renderer) => [renderer.lookId, renderer]),
    );
    return new WebGpuTextRenderer(canvas, device, context, renderers, format);
  }

  resize(width: number, height: number): boolean {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
    const sizeChanged = this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight;
    if (!sizeChanged && this.multisampleTexture) return false;
    if (sizeChanged) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.multisampleTexture?.destroy();
    this.multisampleTexture = this.device.createTexture({
      label: 'shared 4x MSAA look target',
      size: { width: pixelWidth, height: pixelHeight },
      sampleCount: SAMPLE_COUNT,
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    return true;
  }

  setSource(source: LookRenderSource): LookRenderStats | undefined {
    const renderer = this.renderers.get(source.look.id);
    if (!renderer) throw new Error(`No renderer is registered for ${source.look.id}`);
    this.activeRenderer = renderer;
    return renderer.setSource(source);
  }

  private encodeFrame(time: number, look: LookState, output: GPUTexture): GPUCommandBuffer {
    const renderer = this.activeRenderer;
    if (!renderer || renderer.lookId !== look.id) {
      throw new Error(`The ${look.id} look has not received its caption source`);
    }
    if (!this.multisampleTexture) {
      throw new Error('The multisample render target has not been sized');
    }
    return renderer.encode({
      time,
      look,
      target: {
        multisampleView: this.multisampleTexture.createView(),
        resolveView: output.createView(),
      },
    });
  }

  render(time: number, look: LookState): void {
    const command = this.encodeFrame(time, look, this.context.getCurrentTexture());
    this.device.queue.submit([command]);
  }

  async capturePng(time: number, look: LookState): Promise<Blob> {
    this.device.pushErrorScope('validation');
    const width = this.canvas.width;
    const height = this.canvas.height;
    const texture = this.device.createTexture({
      label: 'look capture target',
      size: { width, height },
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const command = this.encodeFrame(time, look, texture);
    const bytesPerPixel = 4;
    const unpaddedBytesPerRow = width * bytesPerPixel;
    const bytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;
    const readback = this.device.createBuffer({
      label: 'look capture readback',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer(
      { texture },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: 1 },
    );
    this.device.queue.submit([command, encoder.finish()]);
    const validationError = await this.device.popErrorScope();
    if (validationError) {
      readback.destroy();
      texture.destroy();
      throw new Error(`WebGPU capture validation failed: ${validationError.message}`);
    }
    await withTimeout(
      readback.mapAsync(GPUMapMode.READ),
      4_000,
      'WebGPU capture timed out while mapping the rendered texture',
    );

    const mapped = new Uint8Array(readback.getMappedRange());
    const pixels = new Uint8ClampedArray(unpaddedBytesPerRow * height);
    const isBgra = this.format.startsWith('bgra');
    for (let y = 0; y < height; y += 1) {
      const sourceRow = mapped.subarray(y * bytesPerRow, y * bytesPerRow + unpaddedBytesPerRow);
      const destinationOffset = y * unpaddedBytesPerRow;
      pixels.set(sourceRow, destinationOffset);
      if (isBgra) {
        for (let x = 0; x < width; x += 1) {
          const offset = destinationOffset + x * bytesPerPixel;
          const blue = pixels[offset]!;
          pixels[offset] = pixels[offset + 2]!;
          pixels[offset + 2] = blue;
        }
      }
    }
    readback.unmap();
    readback.destroy();
    texture.destroy();

    const bitmap = new OffscreenCanvas(width, height);
    const bitmapContext = bitmap.getContext('2d');
    if (!bitmapContext) throw new Error('Could not create a canvas encoder');
    bitmapContext.putImageData(new ImageData(pixels, width, height), 0, 0);
    return bitmap.convertToBlob({ type: 'image/png' });
  }

  destroy(): void {
    this.multisampleTexture?.destroy();
    for (const renderer of this.renderers.values()) renderer.destroy();
  }
}
