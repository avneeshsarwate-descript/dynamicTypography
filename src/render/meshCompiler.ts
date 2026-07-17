import libtess from 'libtess';
import type paper from 'paper';

type Point2 = [number, number];

export type TriangleMesh = {
  triangles: Point2[][];
};

/** Tessellate font contours using the OpenType non-zero winding fill rule. */
export function triangulateCompoundPath(compound: paper.CompoundPath): TriangleMesh {
  const contours = compound.children
    .map((child) => (child as paper.Path).segments.map(
      (segment) => [segment.point.x, segment.point.y] as Point2,
    ))
    .filter((points) => points.length >= 3);

  const triangles: Point2[][] = [];
  let pendingTriangle: Point2[] = [];
  const tessellator = new libtess.GluTesselator();
  tessellator.gluTessNormal(0, 0, 1);
  tessellator.gluTessProperty(
    libtess.gluEnum.GLU_TESS_WINDING_RULE,
    libtess.windingRule.GLU_TESS_WINDING_NONZERO,
  );
  tessellator.gluTessCallback(libtess.gluEnum.GLU_TESS_BEGIN, (primitive: number) => {
    if (primitive !== libtess.primitiveType.GL_TRIANGLES) {
      throw new Error(`Unexpected tessellation primitive ${primitive}`);
    }
  });
  tessellator.gluTessCallback(libtess.gluEnum.GLU_TESS_VERTEX, (point: Point2) => {
    pendingTriangle.push(point);
    if (pendingTriangle.length === 3) {
      triangles.push(pendingTriangle);
      pendingTriangle = [];
    }
  });
  tessellator.gluTessCallback(
    libtess.gluEnum.GLU_TESS_COMBINE,
    (coordinates: [number, number, number]): Point2 => [coordinates[0], coordinates[1]],
  );
  tessellator.gluTessCallback(libtess.gluEnum.GLU_TESS_ERROR, (errorCode: number) => {
    throw new Error(`Font outline tessellation failed with GLU error ${errorCode}`);
  });

  tessellator.gluTessBeginPolygon(null);
  for (const contour of contours) {
    tessellator.gluTessBeginContour();
    for (const point of contour) {
      tessellator.gluTessVertex([point[0], point[1], 0], point);
    }
    tessellator.gluTessEndContour();
  }
  tessellator.gluTessEndPolygon();
  if (pendingTriangle.length !== 0) {
    throw new Error('Font outline tessellation returned an incomplete triangle');
  }

  return { triangles };
}
