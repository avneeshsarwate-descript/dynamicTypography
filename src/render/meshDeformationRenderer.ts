import { effectUniformsForLook, meshParametersForLook } from '../looks/registry';
import type {
  AnyMeshLookDefinition,
  MeshDeformationLookState,
} from '../looks/types';
import { compileBlockMesh, vertexStrideBytes } from './fontGeometry';
import type {
  LookRenderContext,
  LookRenderFrame,
  LookRenderer,
  LookRenderSource,
  LookRenderStats,
} from './lookRenderer';
import { colorComponents } from './webgpuUtilities';

function shaderForLook(look: AnyMeshLookDefinition): string {
  return /* wgsl */ `
struct Globals {
  viewport: vec2f,
  time: f32,
  revealDuration: f32,
  fill: vec4f,
  activeFill: vec4f,
  showMesh: f32,
  meshOpacity: f32,
  padding: vec2f,
  effect: vec4f,
}

@group(0) @binding(0) var<uniform> globals: Globals;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) glyphCenter: vec2f,
  @location(2) effectCenter: vec2f,
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

${look.deformationWgsl}

@vertex
fn vertexMain(input: VertexInput) -> VertexOutput {
  let rawProgress = clamp((globals.time - input.timing.x) / max(globals.revealDuration, 0.001), 0.0, 1.0);
  let progress = smootherstep(rawProgress);
  let world = deformGlyph(input, progress);
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
}

function isSupportedLook(
  look: LookRenderSource['look'] | LookRenderFrame['look'],
  id: MeshDeformationLookState['id'],
): look is MeshDeformationLookState {
  return look.id === id;
}

export class MeshDeformationRenderer implements LookRenderer {
  private constructor(
    private readonly context: LookRenderContext,
    private readonly definition: AnyMeshLookDefinition,
    private readonly pipeline: GPURenderPipeline,
    private readonly globalsBuffer: GPUBuffer,
    private readonly bindGroup: GPUBindGroup,
  ) {
    this.lookId = definition.id;
  }

  readonly lookId: MeshDeformationLookState['id'];
  private vertexBuffer: GPUBuffer | undefined;
  private vertexCount = 0;
  private sourceKey = '';
  private stats: LookRenderStats | undefined;
  private width = 1;
  private height = 1;

  static async create(
    context: LookRenderContext,
    definition: AnyMeshLookDefinition,
  ): Promise<MeshDeformationRenderer> {
    const module = context.device.createShaderModule({
      code: shaderForLook(definition),
      label: `${definition.label} typography shader`,
    });
    const shaderInfo = await module.getCompilationInfo();
    const errors = shaderInfo.messages.filter((message) => message.type === 'error');
    if (errors.length) {
      throw new Error(errors.map(
        (message) => `${definition.label} WGSL ${message.lineNum}:${message.linePos} ${message.message}`,
      ).join('\n'));
    }
    const globalsBuffer = context.device.createBuffer({
      label: `${definition.label} globals`,
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroupLayout = context.device.createBindGroupLayout({
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      }],
    });
    const pipeline = await context.device.createRenderPipelineAsync({
      label: `${definition.label} typography pipeline`,
      layout: context.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
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
        targets: [{ format: context.format }],
      },
      primitive: { topology: 'triangle-list' },
      multisample: { count: context.sampleCount },
    });
    const bindGroup = context.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: globalsBuffer } }],
    });
    return new MeshDeformationRenderer(context, definition, pipeline, globalsBuffer, bindGroup);
  }

  setSource(source: LookRenderSource): LookRenderStats | undefined {
    if (!isSupportedLook(source.look, this.lookId)) {
      throw new Error(`${this.lookId} renderer received ${source.look.id}`);
    }
    this.width = source.width;
    this.height = source.height;
    const key = JSON.stringify({
      block: source.block,
      width: source.width,
      height: source.height,
      mesh: meshParametersForLook(source.look),
    });
    if (key === this.sourceKey) return this.stats;
    this.sourceKey = key;
    this.vertexBuffer?.destroy();
    this.vertexBuffer = undefined;
    this.vertexCount = 0;
    this.stats = undefined;
    if (!source.block) return undefined;

    const mesh = compileBlockMesh(
      source.font,
      source.block,
      source.look,
      source.width,
      source.height,
    );
    this.vertexCount = mesh.vertexCount;
    if (mesh.vertices.byteLength) {
      this.vertexBuffer = this.context.device.createBuffer({
        label: `${this.definition.label} ${mesh.blockId}`,
        size: mesh.vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      this.context.device.queue.writeBuffer(this.vertexBuffer, 0, mesh.vertices);
    }
    this.stats = { ...mesh, technique: 'deformed fill mesh' };
    return this.stats;
  }

  encode(frame: LookRenderFrame): GPUCommandBuffer {
    if (!isSupportedLook(frame.look, this.lookId)) {
      throw new Error(`${this.lookId} renderer received ${frame.look.id}`);
    }
    const parameters = frame.look.parameters;
    const globals = new Float32Array([
      this.width,
      this.height,
      frame.time,
      parameters.revealDuration,
      ...colorComponents(parameters.fill),
      ...colorComponents(parameters.activeFill),
      parameters.showMesh ? 1 : 0,
      0.68,
      0,
      0,
      ...effectUniformsForLook(frame.look),
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
    if (this.vertexBuffer && this.vertexCount > 0) {
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.draw(this.vertexCount);
    }
    pass.end();
    return encoder.finish();
  }

  destroy(): void {
    this.vertexBuffer?.destroy();
    this.globalsBuffer.destroy();
  }
}
