# Dynamic Typography Lab

A small Vue/Vite prototype for experimenting with caption-aware animated type.

The current rendering path is deliberately close to the proposed text-wrangling stack:

1. `fontkit` shapes each caption block and produces glyph outlines.
2. The outlines become editable Paper.js `CompoundPath` geometry.
3. Flattened contours are tessellated with libtess using OpenType's non-zero winding rule, preserving holes, overlaps, and self-intersections.
4. Triangle vertices carry glyph centers, randomized crumple transforms, word timing, and barycentric coordinates.
5. A raw WebGPU vertex shader resolves each word from its crumpled pose when its word timing becomes active.

Each newline in the editor creates one caption block. Blocks own TAUs and words reference their constituent TAU IDs; the first prototype uses a one-token/one-TAU mapping. Words and TAUs receive synthetic timings based on token length. The playhead exposes block and active-word state, while the model retains active-TAU state so the structure can become more Descript-like without replacing the playback contract.

## Run

```sh
pnpm install
pnpm dev
```

Use **Save frame** to download the current WebGPU canvas as a PNG.

While the dev server and page are open, a requested playhead frame can also be captured directly:

```sh
curl 'http://127.0.0.1:4173/__canvas-capture?time=0.5' --output frame.png
```

The request waits while the live page seeks, renders the WebGPU canvas, and returns its PNG bytes. The bridge only exists in Vite development mode.

For multiple open tabs, give a page a client key such as `?captureClient=my-test`, then route the request with `&client=my-test`.
