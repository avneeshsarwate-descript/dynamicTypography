import type { Font } from 'fontkit';
import type { BalloonStrokeLookParameters } from '../looks/types';
import type { CaptionBlock } from '../types';
import {
  compileFillStrokeMesh,
  fillVertexStrideBytes,
  strokeVertexStrideBytes,
  type FillStrokeMesh,
} from './fillStrokeGeometry';

export type BalloonStrokeMesh = FillStrokeMesh;

export function compileBalloonStrokeMesh(
  font: Font,
  block: CaptionBlock,
  parameters: BalloonStrokeLookParameters,
  width: number,
  height: number,
): BalloonStrokeMesh {
  return compileFillStrokeMesh(font, block, parameters, width, height);
}

export {
  fillVertexStrideBytes,
  strokeVertexStrideBytes,
};
