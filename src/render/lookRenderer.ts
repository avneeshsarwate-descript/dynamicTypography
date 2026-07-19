import type { Font } from 'fontkit';
import type { LookId, LookState } from '../looks/types';
import type { CaptionBlock } from '../types';

export type LookRenderContext = {
  device: GPUDevice;
  format: GPUTextureFormat;
  sampleCount: number;
};

export type LookRenderSource = {
  block: CaptionBlock | undefined;
  font: Font;
  look: LookState;
  width: number;
  height: number;
};

export type LookRenderTarget = {
  multisampleView: GPUTextureView;
  resolveView: GPUTextureView;
};

export type LookRenderFrame = {
  time: number;
  look: LookState;
  target: LookRenderTarget;
};

export type LookRenderStats = {
  blockId: string;
  technique: string;
  glyphCount: number;
  triangleCount: number;
  vertexCount: number;
  glyphTimingStarts: number[];
};

/** A look owns all work between caption-domain input and a flat render target. */
export interface LookRenderer {
  readonly lookId: LookId;
  setSource(source: LookRenderSource): LookRenderStats | undefined;
  encode(frame: LookRenderFrame): GPUCommandBuffer;
  destroy(): void;
}
