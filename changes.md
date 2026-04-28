# Changes

## Globe implementation

- Replaced the scrapped globe pipeline with a new `react-globe.gl` implementation in `src/components/game/GlobeMap.tsx`.
- The globe now renders the earth texture for ocean and land, overlays country surfaces, highlights active countries with elevated polygon fills, and adds point/ring glow effects.
- Rotation and zoom remain interactive through globe controls, while decorative mode still supports idle auto-rotation.

## Globe data source

- Removed the old gameplay TopoJSON path and worker cache.
- Added `src/lib/globeGeometry.ts` to load runtime GeoJSON geometry from:
  - `public/country-surfaces.geojson`
  - `public/capital-anchors.geojson`
- Country IDs are normalized there, capital anchors are selected for centroids/focus points, and small synthetic fallback surfaces are generated for countries missing from the base country-surface dataset.

## Game flow gating

- Updated `src/components/game/GameView.tsx` so the game no longer reveals a prompt or starts the timer until the globe has rendered and settled on the target country.
- Prompt transitions are now queued behind a render gate: answer feedback completes, the globe focuses the next country, then the next prompt becomes active.
- Inputs, hint, and skip actions stay locked while the next target is still rendering.

## Versus mode

- Applied the same render-gated prompt flow to `src/components/game/VersusGameView.tsx`.
- Versus prompts now wait for the globe to finish focusing before input becomes active and before the timer begins.

## Cleanup

- Removed dangling globe modules from the previous implementation:
  - `src/lib/globeData.ts`
  - `src/lib/globeTypes.ts`
  - `src/workers/topoWorker.ts`
- Copied the new GeoJSON gameplay assets into `public/`:
  - `public/country-surfaces.geojson`
  - `public/capital-anchors.geojson`

## Verification

- `npm run build` passes with the current globe changes.
- The separate progress map was not rewritten in this pass and still uses its own TopoJSON source.
