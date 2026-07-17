declare module 'libtess' {
  class GluTesselator {
    gluTessNormal(x: number, y: number, z: number): void;
    gluTessProperty(property: number, value: number | boolean): void;
    gluTessCallback(callbackType: number, callback: unknown): void;
    gluTessBeginPolygon(data: unknown): void;
    gluTessBeginContour(): void;
    gluTessVertex(coordinates: number[], data: unknown): void;
    gluTessEndContour(): void;
    gluTessEndPolygon(): void;
  }

  const libtess: {
    GluTesselator: typeof GluTesselator;
    gluEnum: Record<string, number>;
    windingRule: Record<string, number>;
    primitiveType: Record<string, number>;
  };

  export default libtess;
}
