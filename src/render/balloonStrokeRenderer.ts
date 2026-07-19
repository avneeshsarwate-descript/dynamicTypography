import { balloonStrokeLookDefinition } from '../looks/balloonStroke';
import type { BalloonStrokeLookState } from '../looks/types';
import {
  compileBalloonStrokeMesh,
  fillVertexStrideBytes,
  strokeVertexStrideBytes,
} from './balloonStrokeGeometry';
import type {
  LookRenderContext,
  LookRenderFrame,
  LookRenderer,
  LookRenderSource,
  LookRenderStats,
} from './lookRenderer';
import { colorComponents } from './webgpuUtilities';

const shader = /* wgsl */ `
struct Globals {
  viewport: vec2f,
  time: f32,
  normalStroke: f32,
  balloonStroke: f32,
  peakPosition: f32,
  padding: vec2f,
  fill: vec4f,
  stroke: vec4f,
}

@group(0) @binding(0) var<uniform> globals: Globals;

struct StrokeInput {
  @location(0) basePosition: vec2f,
  @location(1) extrusion: vec2f,
  @location(2) timing: vec2f,
}

struct FillInput {
  @location(0) position: vec2f,
  @location(1) timing: vec2f,
}

fn smootherstep(value: f32) -> f32 {
  return value * value * (3.0 - 2.0 * value);
}

fn toClip(position: vec2f) -> vec4f {
  return vec4f(
    position.x / globals.viewport.x * 2.0 - 1.0,
    1.0 - position.y / globals.viewport.y * 2.0,
    0.0,
    1.0,
  );
}

fn strokeWidth(timing: vec2f) -> f32 {
  if (globals.time < timing.x) {
    return 0.0;
  }
  if (globals.time >= timing.y) {
    return globals.normalStroke;
  }
  let progress = clamp((globals.time - timing.x) / max(0.001, timing.y - timing.x), 0.0, 1.0);
  let peak = clamp(globals.peakPosition, 0.01, 0.99);
  if (progress < peak) {
    return globals.balloonStroke * smootherstep(progress / peak);
  }
  return mix(
    globals.balloonStroke,
    globals.normalStroke,
    smootherstep((progress - peak) / (1.0 - peak)),
  );
}

@vertex
fn strokeVertex(input: StrokeInput) -> @builtin(position) vec4f {
  return toClip(input.basePosition + input.extrusion * strokeWidth(input.timing));
}

@vertex
fn fillVertex(input: FillInput) -> @builtin(position) vec4f {
  return toClip(input.position);
}

@fragment
fn strokeFragment() -> @location(0) vec4f {
  return globals.stroke;
}

@fragment
fn fillFragment() -> @location(0) vec4f {
  return globals.fill;
}
`;

function isBalloonStrokeLook(
  look: LookRenderSource['look'] | LookRenderFrame['look'],
): look is BalloonStrokeLookState {
  return look.id === 'balloon-stroke';
}

export class BalloonStrokeRenderer implements LookRenderer {
  private constructor(
    private readonly context: LookRenderContext,
    private readonly strokePipeline: GPURenderPipeline,
    private readonly fillPipeline: GPURenderPipeline,
    private readonly globalsBuffer: GPUBuffer,
    private readonly bindGroup: GPUBindGroup,
  ) {}

  readonly lookId = 'balloon-stroke' as const;
  private fillBuffer: GPUBuffer | undefined;
  private strokeBuffer: GPUBuffer | undefined;
  private fillVertexCount = 0;
  private strokeVertexCount = 0;
  private sourceKey = '';
  private stats: LookRenderStats | undefined;
  private width = 1;
  private height = 1;

  static async create(context: LookRenderContext): Promise<BalloonStrokeRenderer> {
    const module = context.device.createShaderModule({
      code: shader,
      label: `${balloonStrokeLookDefinition.label} shader`,
    });
    const info = await module.getCompilationInfo();
    const errors = info.messages.filter((message) => message.type === 'error');
    if (errors.length) {
      throw new Error(errors.map(
        (message) => `Balloon Stroke WGSL ${message.lineNum}:${message.linePos} ${message.message}`,
      ).join('\n'));
    }
    const globalsBuffer = context.device.createBuffer({
      label: 'Balloon Stroke globals',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroupLayout = context.device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });
    const layout = context.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
    const [strokePipeline, fillPipeline] = await Promise.all([
      context.device.createRenderPipelineAsync({
        label: 'Balloon Stroke outline pipeline',
        layout,
        vertex: {
          module,
          entryPoint: 'strokeVertex',
          buffers: [{
            arrayStride: strokeVertexStrideBytes,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
              { shaderLocation: 2, offset: 16, format: 'float32x2' },
            ],
          }],
        },
        fragment: { module, entryPoint: 'strokeFragment', targets: [{ format: context.format }] },
        primitive: { topology: 'triangle-list' },
        multisample: { count: context.sampleCount },
      }),
      context.device.createRenderPipelineAsync({
        label: 'Balloon Stroke fill pipeline',
        layout,
        vertex: {
          module,
          entryPoint: 'fillVertex',
          buffers: [{
            arrayStride: fillVertexStrideBytes,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32x2' },
            ],
          }],
        },
        fragment: { module, entryPoint: 'fillFragment', targets: [{ format: context.format }] },
        primitive: { topology: 'triangle-list' },
        multisample: { count: context.sampleCount },
      }),
    ]);
    const bindGroup = context.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: globalsBuffer } }],
    });
    return new BalloonStrokeRenderer(
      context,
      strokePipeline,
      fillPipeline,
      globalsBuffer,
      bindGroup,
    );
  }

  setSource(source: LookRenderSource): LookRenderStats | undefined {
    if (!isBalloonStrokeLook(source.look)) {
      throw new Error(`Balloon Stroke renderer received ${source.look.id}`);
    }
    this.width = source.width;
    this.height = source.height;
    const parameters = source.look.parameters;
    const key = JSON.stringify({
      block: source.block,
      width: source.width,
      height: source.height,
      fontSize: parameters.fontSize,
      fontWeight: parameters.fontWeight,
      letterSpacing: parameters.letterSpacing,
      curveDetail: parameters.curveDetail,
    });
    if (key === this.sourceKey) return this.stats;
    this.sourceKey = key;
    this.fillBuffer?.destroy();
    this.strokeBuffer?.destroy();
    this.fillBuffer = undefined;
    this.strokeBuffer = undefined;
    this.fillVertexCount = 0;
    this.strokeVertexCount = 0;
    this.stats = undefined;
    if (!source.block) return undefined;

    const mesh = compileBalloonStrokeMesh(
      source.font,
      source.block,
      parameters,
      source.width,
      source.height,
    );
    this.fillVertexCount = mesh.fillVertexCount;
    this.strokeVertexCount = mesh.strokeVertexCount;
    if (mesh.fillVertices.byteLength) {
      this.fillBuffer = this.context.device.createBuffer({
        label: `Balloon Stroke fill ${mesh.blockId}`,
        size: mesh.fillVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.context.device.queue.writeBuffer(this.fillBuffer, 0, mesh.fillVertices);
    }
    if (mesh.strokeVertices.byteLength) {
      this.strokeBuffer = this.context.device.createBuffer({
        label: `Balloon Stroke outline ${mesh.blockId}`,
        size: mesh.strokeVertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.context.device.queue.writeBuffer(this.strokeBuffer, 0, mesh.strokeVertices);
    }
    this.stats = {
      blockId: mesh.blockId,
      technique: 'parametric contour stroke + fill mesh',
      glyphCount: mesh.glyphCount,
      triangleCount: mesh.triangleCount,
      vertexCount: mesh.fillVertexCount + mesh.strokeVertexCount,
      glyphTimingStarts: mesh.glyphTimingStarts,
    };
    return this.stats;
  }

  encode(frame: LookRenderFrame): GPUCommandBuffer {
    if (!isBalloonStrokeLook(frame.look)) {
      throw new Error(`Balloon Stroke renderer received ${frame.look.id}`);
    }
    const parameters = frame.look.parameters;
    const globals = new Float32Array([
      this.width,
      this.height,
      frame.time,
      parameters.normalStroke,
      parameters.balloonStroke,
      parameters.peakPosition,
      0,
      0,
      ...colorComponents(parameters.fill),
      ...colorComponents(parameters.stroke),
    ]);
    this.context.device.queue.writeBuffer(this.globalsBuffer, 0, globals);
    const encoder = this.context.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: frame.target.multisampleView,
        resolveTarget: frame.target.resolveView,
        clearValue: colorComponents(parameters.background),
        loadOp: 'clear',
        storeOp: 'discard',
      }],
    });
    pass.setBindGroup(0, this.bindGroup);
    if (this.strokeBuffer && this.strokeVertexCount > 0) {
      pass.setPipeline(this.strokePipeline);
      pass.setVertexBuffer(0, this.strokeBuffer);
      pass.draw(this.strokeVertexCount);
    }
    if (this.fillBuffer && this.fillVertexCount > 0) {
      pass.setPipeline(this.fillPipeline);
      pass.setVertexBuffer(0, this.fillBuffer);
      pass.draw(this.fillVertexCount);
    }
    pass.end();
    return encoder.finish();
  }

  destroy(): void {
    this.fillBuffer?.destroy();
    this.strokeBuffer?.destroy();
    this.globalsBuffer.destroy();
  }
}
