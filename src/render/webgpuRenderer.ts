import type { LookParameters } from '../types';
import type { CompiledBlockMesh } from './fontGeometry';
import { vertexStrideBytes } from './fontGeometry';

const shader = /* wgsl */ `
struct Globals {
  viewport: vec2f,
  time: f32,
  revealDuration: f32,
  fill: vec4f,
  activeFill: vec4f,
  showMesh: f32,
  meshOpacity: f32,
  padding: vec2f,
}

@group(0) @binding(0) var<uniform> globals: Globals;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) glyphCenter: vec2f,
  @location(2) crumpleCenter: vec2f,
  @location(3) deformation: vec2f,
  @location(4) timing: vec2f,
  @location(5) barycentric: vec3f,
  @location(6) random: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) barycentric: vec3f,
  @location(1) activeWord: f32,
  @location(2) progress: f32,
}

fn smootherstep(value: f32) -> f32 {
  return value * value * (3.0 - 2.0 * value);
}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  let rawProgress = clamp((globals.time - input.timing.x) / max(globals.revealDuration, 0.001), 0.0, 1.0);
  let progress = smootherstep(rawProgress);
  let folded = 1.0 - progress;
  let angle = input.deformation.x * folded;
  let cosine = cos(angle);
  let sine = sin(angle);
  let local = input.position - input.glyphCenter;
  let rotated = vec2f(
    local.x * cosine - local.y * sine,
    local.x * sine + local.y * cosine,
  );
  let scale = mix(input.deformation.y, 1.0, progress);
  let resolvedCenter = mix(input.crumpleCenter, input.glyphCenter, progress);
  let settle = sin(progress * 3.14159265) * sin(globals.time * 8.0 + input.random * 17.0);
  let world = resolvedCenter + rotated * scale + vec2f(settle * 2.0, settle * -1.2);
  let clip = vec2f(
    world.x / globals.viewport.x * 2.0 - 1.0,
    1.0 - world.y / globals.viewport.y * 2.0,
  );
  let isActive = select(0.0, 1.0, globals.time >= input.timing.x && globals.time < input.timing.y);

  var output: VertexOutput;
  output.position = vec4f(clip, 0.0, 1.0);
  output.barycentric = input.barycentric;
  output.activeWord = isActive;
  output.progress = progress;
  return output;
}

@fragment
fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let base = mix(globals.fill, globals.activeFill, input.activeWord);
  let edgeDistance = min(input.barycentric.x, min(input.barycentric.y, input.barycentric.z));
  let edge = 1.0 - smoothstep(0.0, fwidth(edgeDistance) * 1.15, edgeDistance);
  let meshColor = vec4f(0.35, 0.47, 1.0, 1.0);
  let meshMix = edge * globals.showMesh * globals.meshOpacity;
  return mix(base, meshColor, meshMix);
}
`;

function colorComponents(value: string): [number, number, number, number] {
  const normalized = value.replace('#', '').trim();
  const expanded = normalized.length === 3
    ? normalized.split('').map((character) => `${character}${character}`).join('')
    : normalized;
  const number = Number.parseInt(expanded, 16);
  if (!Number.isFinite(number) || expanded.length !== 6) return [1, 1, 1, 1];
  return [
    ((number >> 16) & 255) / 255,
    ((number >> 8) & 255) / 255,
    (number & 255) / 255,
    1,
  ];
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export class WebGpuTextRenderer {
  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly context: GPUCanvasContext,
    private readonly pipeline: GPURenderPipeline,
    private readonly globalsBuffer: GPUBuffer,
    private readonly bindGroup: GPUBindGroup,
    private readonly format: GPUTextureFormat,
  ) {}

  private vertexBuffer: GPUBuffer | undefined;
  private vertexCount = 0;

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

    const module = device.createShaderModule({ code: shader, label: 'dynamic typography shader' });
    const shaderInfo = await module.getCompilationInfo();
    const shaderErrors = shaderInfo.messages.filter((message) => message.type === 'error');
    if (shaderErrors.length) {
      throw new Error(shaderErrors.map(
        (message) => `WGSL ${message.lineNum}:${message.linePos} ${message.message}`,
      ).join('\n'));
    }
    const globalsBuffer = device.createBuffer({
      label: 'render globals',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const pipeline = await device.createRenderPipelineAsync({
      label: 'dynamic typography pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module,
        entryPoint: 'vertexMain',
        buffers: [{
          arrayStride: vertexStrideBytes,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x2' },
            { shaderLocation: 2, offset: 16, format: 'float32x2' },
            { shaderLocation: 3, offset: 24, format: 'float32x2' },
            { shaderLocation: 4, offset: 32, format: 'float32x2' },
            { shaderLocation: 5, offset: 40, format: 'float32x3' },
            { shaderLocation: 6, offset: 52, format: 'float32' },
          ],
        }],
      },
      fragment: {
        module,
        entryPoint: 'fragmentMain',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
    const bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: globalsBuffer } }],
    });
    return new WebGpuTextRenderer(canvas, device, context, pipeline, globalsBuffer, bindGroup, format);
  }

  resize(width: number, height: number): boolean {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
    const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
    if (this.canvas.width === pixelWidth && this.canvas.height === pixelHeight) return false;
    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    return true;
  }

  setMesh(mesh: CompiledBlockMesh | undefined): void {
    this.vertexBuffer?.destroy();
    this.vertexBuffer = undefined;
    this.vertexCount = mesh?.vertexCount ?? 0;
    if (!mesh?.vertices.byteLength) return;
    this.vertexBuffer = this.device.createBuffer({
      label: `caption block ${mesh.blockId}`,
      size: mesh.vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, mesh.vertices);
  }

  private encodeFrame(time: number, look: LookParameters, texture: GPUTexture): GPUCommandEncoder {
    const fill = colorComponents(look.fill);
    const activeFill = colorComponents(look.activeFill);
    const globals = new Float32Array([
      this.canvas.clientWidth,
      this.canvas.clientHeight,
      time,
      look.revealDuration,
      ...fill,
      ...activeFill,
      look.showMesh ? 1 : 0,
      0.68,
      0,
      0,
    ]);
    this.device.queue.writeBuffer(this.globalsBuffer, 0, globals);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: texture.createView(),
        clearValue: colorComponents(look.background),
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    if (this.vertexBuffer && this.vertexCount > 0) {
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.draw(this.vertexCount);
    }
    pass.end();
    return encoder;
  }

  render(time: number, look: LookParameters): void {
    const encoder = this.encodeFrame(time, look, this.context.getCurrentTexture());
    this.device.queue.submit([encoder.finish()]);
  }

  async capturePng(time: number, look: LookParameters): Promise<Blob> {
    this.device.pushErrorScope('validation');
    const width = this.canvas.width;
    const height = this.canvas.height;
    const texture = this.device.createTexture({
      label: 'canvas capture target',
      size: { width, height },
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const encoder = this.encodeFrame(time, look, texture);
    const bytesPerPixel = 4;
    const unpaddedBytesPerRow = width * bytesPerPixel;
    const bytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;
    const readback = this.device.createBuffer({
      label: 'canvas capture readback',
      size: bytesPerRow * height,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    encoder.copyTextureToBuffer(
      { texture },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: 1 },
    );
    this.device.queue.submit([encoder.finish()]);
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
    const context = bitmap.getContext('2d');
    if (!context) throw new Error('Could not create a canvas encoder');
    context.putImageData(new ImageData(pixels, width, height), 0, 0);
    return bitmap.convertToBlob({ type: 'image/png' });
  }

  destroy(): void {
    this.vertexBuffer?.destroy();
    this.globalsBuffer.destroy();
  }
}
