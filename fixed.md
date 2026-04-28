# Globe Rendering Fixes

## Issues

### 1. Globe turns entirely green for certain orientations
When the globe was rotated to face Africa, East Africa, or Southeast Asia, the entire sphere filled with solid green, covering the ocean completely. Country border lines were still visible on the green surface. The bug was orientation-dependent — facing the Americas showed the correct blue ocean.

### 2. Black starry background not filling the right panel
On the home screen, the right panel (where the globe sits) had a translucent cream/beige gradient background instead of a dark space background. The black starry canvas was clipped to just the globe circle, leaving the surrounding area light-colored.

---

## Root Causes

### Green globe
The rendering pipeline used D3's `geoPath` to draw country polygons onto an HTML5 canvas. D3's orthographic projection with `clipAngle(90)` clips geometries to the visible hemisphere. When a country polygon crosses the 90° boundary (e.g. Indonesia when facing East Africa — its centroid sits exactly at 90° from the view center), D3 inserts a **closing arc** along the clip circle to close the clipped polygon. This closing arc can subtend up to ~350° of the sphere boundary. With the canvas nonzero winding fill rule, this enormous arc causes the fill to cover the entire visible hemisphere rather than just the country — painting the ocean green.

Several intermediate fixes were attempted and failed:
- **Canvas `clip()` + `fill('evenodd')`** — `evenodd` made it worse: a 350° arc inverts the fill, covering the sphere center instead of the country edge.
- **`frontFacing()` ring filter using `projection(v) !== null`** — D3's projection function does **not** return `null` for back-hemisphere points when called directly; clipping only happens inside the `geoPath` stream pipeline. The filter was a no-op.
- **`frontFacing()` with manual dot-product** — correctly identified back-hemisphere vertices, but D3's `geoPath` still generated closing arcs for vertices right at the boundary (dot ≈ 0), continuing to trigger the bug.

### Right panel background
The HomeScreen right panel had `background: 'radial-gradient(ellipse at 55% 48%, rgba(210,200,180,0.35) 0%, transparent 65%)'` — essentially transparent, showing the page's cream color. The "DRAG TO EXPLORE" label used `color: 'var(--t3)'` (dark), invisible on a dark background.

---

## Fixes Applied

### Green globe — `src/components/game/OrbisGlobe.tsx`

**Completely bypassed D3's `geoPath` for all country fills and replaced it with manual canvas drawing.**

A `drawFeature(f)` function iterates every vertex of every polygon ring directly. For each vertex, it computes a dot-product visibility test:

```
dot = sin(lat) · sin(viewLat) + cos(lat) · cos(viewLat) · cos(lng − viewLng)
```

If `dot <= 0` the vertex is on the back hemisphere and is skipped inline. Visible vertices are drawn with `moveTo`/`lineTo` in a single pass. One `closePath()` is called at the end of each ring.

Because the canvas path is built vertex-by-vertex with no involvement from D3's path generator, **D3 never gets the chance to insert a closing arc**. The green-fill bug is structurally impossible with this approach.

A centroid dot-product cull (`dot > -0.1`) provides a fast early exit for features that are clearly on the back hemisphere, avoiding the per-vertex loop for roughly half the feature set each frame. A canvas `clip()` to the sphere circle is kept as a safety net.

The `drawRing` inner function uses a **single-pass** approach (one `moveTo`, sequential `lineTo` for all visible vertices, one `closePath`) rather than the earlier "multiple runs" approach. The multiple-runs approach created separate subpaths for each contiguous visible segment, with each subpath closed by its own chord — causing visible spike artifacts near complex coastlines (e.g. Korea/Japan).

### Right panel background — `src/components/menus/HomeScreen.tsx`

- Changed right panel `background` from the cream radial gradient to `'#05080d'` (matching the dark background used in GameView).
- Changed "DRAG TO EXPLORE" label `color` from `'var(--t3)'` to `'rgba(255,255,255,0.30)'` so it remains legible on the dark background.
