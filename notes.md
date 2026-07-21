- original look uses vertex shader to calculate crumple/uncrumple - do we want this in shader, or in cpu land?

## Preview vs. final-render quality

A render-quality profile is the right first step. Avoid switching techniques wholesale because preview/export mismatches are especially undesirable in a video editor.

Keep quality separate from user-facing look parameters:

```ts
type RenderQuality = {
  mode: 'preview' | 'final';
  curveTolerancePx: number;
  sampleCount: 1 | 4;
  resolutionScale: number;
  temporalSamples: number;
};
```

The canvas/export host supplies this profile to each look renderer. Geometry caches include the geometry-affecting quality values.

| Setting | Preview | Final render |
|---|---:|---:|
| Curve flattening tolerance | ~0.75–1 px | ~0.1–0.25 output px |
| MSAA | 1× or 4× | 4× |
| Resolution | viewport resolution | actual output resolution |
| Round-join subdivisions | modest | projected-size adaptive |
| Motion samples | 1 per frame | multiple subframes |

The biggest final-quality improvements would be:

1. Output-space adaptive tessellation. Curve tolerance should depend on final pixel size and transformation, not the current fixed `curveDetail`.
2. Better antialiasing. Keep 4× MSAA for final rendering.
3. Optional supersampling and downsampling. This looks excellent, but avoid combining aggressive supersampling with 4× MSAA at 4K because memory grows quickly.
4. Temporal supersampling. For animated typography, rendering multiple subframes and accumulating them for motion blur may improve perceived quality more than extra spatial tessellation.
5. Adaptive stroke joins. Subdivide round joins based on their projected radius and an error tolerance rather than a fixed segment count.

Alternative techniques only become worthwhile where the mesh approach has an intrinsic limitation:

- **Collapse and Elastic:** These are affine transformations of glyphs. An analytic vector renderer could preserve Bézier curves until rasterization, but denser output-aware meshes should already look very good.
- **Crumple:** This is genuinely vertex-deformed geometry. A mesh is the natural representation; higher tessellation and sampling are the correct final-quality controls.
- **Balloon Stroke:** Very thick strokes can self-intersect, close counters, or expose offset-geometry artifacts. A robust path stroker—or possibly an SDF technique—could outperform the current parametric strip here.
- **MSDF:** Excellent for fast previews and animated stroke width, but switching only final rendering to vector meshes risks visible differences. It is better treated as a look-specific backend than a universal preview backend.

Recommendation:

- Add `preview` and `final` quality profiles first.
- Keep the same rendering technique for each look initially.
- Measure where final-quality profiles still fail.
- Introduce alternative final backends only for those specific look families.

The current “caption/TAUs/parameters in, flat texture out” boundary is well suited to this: a look can use one backend with two profiles, or later select different preview and final implementations without changing the editor model.
