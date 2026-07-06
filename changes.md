# Changes

## Cross-session spaced repetition + Daily Review

- Added `src/lib/srs.ts`: a simplified FSRS-style scheduler (per-card stability + difficulty). Cards are seeded from the user's Elo expectation (`expectedScore` now exported from `src/lib/adaptive.ts`) and evolve from attempt-derived grades — wrong/skip → again; fuzzy, hint, or >10s → hard; exact ≤4s → easy; else good. Lapses collapse stability to 30% and stay due; intervals cap at 365 days with ±10% fuzz.
- New `supabase/srs.sql` creates the `user_srs` table (row per user/item/promptType, RLS matching `user_confusions`). **Run it manually in the Supabase SQL editor**, same as the other migrations.
- `src/hooks/useProgress.ts` fetches/upserts schedules, backfills cards from existing Elo + attempt history on first load (idempotent, zero-attempt items excluded), updates the card on **every** graded attempt in any mode, and exposes `srs` + `srsDueCounts`.
- New `review` game mode ("Daily Review"): `buildReviewQueue` in `src/hooks/useGameEngine.ts` drains cards due today (most-overdue × adaptive priority, capped at 40, confusion partners interleaved; topic-filtered). Home screen card shows a due-count badge; empty state in GameView when nothing is due. Review sessions are untimed and excluded from the leaderboard.
- `AccountLanding` gained a "Review forecast" insight card (due today / this week / total scheduled).
- `AttemptResult` now carries `hintUsed` (both engines set it).

## Locate-on-map answer format

- New `answerFormat` dimension on prompts: `typed` (default), `locate` ("Find Slovenia" — click the country/state), and `flag`. Settings gained an "Answer By" toggle (`answerFormats`: typed/locate/flag/mixed) honored by all queue builders; capitals stay typed; versus and learn are excluded.
- `GlobeMap`: new `onLocateClick` (click → country via d3-geo `geoContains` over the loaded features, smallest-area-wins for enclaves, near-miss snap to synthetic microstate circles — `resolveCountryAt` in `src/lib/globeGeometry.ts`) and `freezeFocus` (locate prompts must not fly the camera to the answer; the focusToken → onTargetReady settle contract still holds).
- `UsStatesMap`: per-path click + hover highlight.
- `submitLocate` in the game engine: correct = exact-tier points; a wrong click records the clicked country as `confusedWithId` — the cleanest confusion-graph signal in the app. GameView flashes the clicked polygon red and the real target green.

## Flags

- `src/data/countries.json` entries now carry `alpha2`; 196 circle-flag SVGs vendored into `public/flags/` (~784 KB, lazy-loaded).
- The Learn teaching panel shows the country's flag.
- `flag` answer format: "Whose flag is this?" with the flag image, typed answer through the existing matcher; the map stays neutral so it can't give the answer away. World topic only.

## Verification (this batch)

- `npm run build` and `npm run lint` pass (only pre-existing warnings).
- SRS math verified by simulation: seeding differentiates easy/hard, good-streak intervals expand 5→11→25→54→127→284→365 days, lapse/grade/due-window behavior all correct.
- Dev server boots; all modified modules transform; `/flags/*.svg` served.
- Still needs a signed-in manual pass: `user_srs` rows after a session, backfill on an account with history, review drain/empty state, locate clicks on globe + states, flag prompts.

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
