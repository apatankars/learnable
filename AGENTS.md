# Learnable — Agent Reference Document

## Overview

**Learnable** (working title: *GlobeSpot*) is an interactive geography learning web application. Users practice identifying world countries and their capitals through a gamified quiz interface built around a 3D rotating globe. The app combines multiple game modes, fuzzy-matched answer input, adaptive learning, persistent progress tracking, and a competitive leaderboard — all backed by a Supabase (PostgreSQL) cloud backend.

**Core loop:** A question prompt appears (e.g., "Name this country" or "What is the capital of France?"), the user types an answer, fuzzy matching scores correctness, points are awarded, and the globe updates to reflect the result.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 6 |
| Build | Vite 8 (Oxc transpiler via `@vitejs/plugin-react`) |
| Styling | Tailwind CSS 4 (JIT, custom theme) |
| 3D Globe | react-globe.gl 2 + three.js |
| 2D Map | MapLibre GL 5 + react-map-gl 8 |
| Geography Data | TopoJSON (countries-50m.json) + D3-Geo |
| Fuzzy Matching | Fuse.js 7 |
| Backend / Auth / DB | Supabase (PostgreSQL, Supabase JS SDK 2) |
| State | React hooks + useReducer (no Redux/Zustand) |
| Fonts | Playfair Display (headings), DM Sans (body) |

**Environment variables** (`.env.local`):
```
VITE_SUPABASE_URL=https://gseqqjubtajzxpssofrc.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

**Dev server:** `npm run dev` → Vite HMR on localhost:5173  
**Build:** `npm run build` → `tsc -b && vite build` → output in `dist/`

---

## Directory Structure

```
learnable/
├── public/
│   ├── countries-50m.json     # TopoJSON world geography (50m resolution)
│   └── earth-day.jpg          # Globe texture
├── src/
│   ├── App.tsx                # Root: view routing + shared state orchestration
│   ├── main.tsx               # React entry point
│   ├── index.css              # Tailwind directives, custom animations, theme
│   ├── components/
│   │   ├── ui/                # Reusable primitives (Button, LeafDivider)
│   │   ├── auth/              # AuthModal, UserMenu
│   │   ├── game/              # All in-game UI (see below)
│   │   ├── menus/             # HomeScreen, SettingsPanel, ModeCard
│   │   ├── leaderboard/       # LeaderboardView
│   │   └── progress/          # ProgressDashboard, ProgressMap, ProgressCountryShape
│   ├── hooks/
│   │   ├── useGameEngine.ts   # Standard game reducer + session logic
│   │   ├── useLearnEngine.ts  # Adaptive learn mode reducer
│   │   ├── useAuth.ts         # Supabase session management
│   │   ├── useProgress.ts     # Progress sync (local state ↔ Supabase)
│   │   ├── useLeaderboard.ts  # Leaderboard fetch + score submission
│   │   └── useTimer.ts        # Countdown timer
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client singleton
│   │   ├── fuzzy.ts           # Fuse.js answer matching
│   │   ├── scoring.ts         # Point calculation formula
│   │   ├── leaderboard.ts     # Leaderboard Supabase queries
│   │   ├── progressStorage.ts # Progress read/write (Supabase)
│   │   ├── weightedRandom.ts  # Weighted selection for learn mode
│   │   └── geoIds.ts          # ISO ↔ TopoJSON country ID mappings
│   ├── types/
│   │   └── index.ts           # All shared TypeScript interfaces and enums
│   └── data/
│       └── countries.json     # Master country list (195+ entries)
├── supabase/                  # Supabase config / migrations
├── package.json
├── vite.config.ts
├── tsconfig.app.json          # App TS config (ES2023, React JSX, strict)
└── index.html
```

---

## Views & Navigation

`App.tsx` manages a `view` string (`'home' | 'game' | 'progress' | 'leaderboard'`) as the sole routing mechanism — no React Router. It also holds the shared hooks (`useAuth`, `useProgress`, `useLeaderboard`) and passes their results as props.

| View | Component | Description |
|---|---|---|
| `home` | `HomeScreen` | Mode selection, settings panel, auth entry point |
| `game` | `GameView` | Active gameplay (all modes) |
| `progress` | `ProgressDashboard` | Per-country mastery stats + world map heatmap |
| `leaderboard` | `LeaderboardView` | Ranked scores, filterable by mode + time |

---

## Game Modes

Five modes are selectable from the home screen:

| Mode | Key | Auth Required | Leaderboard |
|---|---|---|---|
| Country | `country` | No | Yes |
| Capital | `capital` | No | Yes |
| Both | `both` | No | Yes |
| Practice | `practice` | Yes | No |
| Learn | `learn` | Yes | No |

**Time modes** (apply to Country / Capital / Both):
- `blitz` — 60 seconds
- `standard` — 300 seconds
- `infinite` — no limit

**Country mode:** Globe highlights a country; user types its name.  
**Capital mode:** User is given a country name and types its capital.  
**Both:** Randomly mixes country and capital prompts.  
**Practice:** Standard gameplay without leaderboard submission.  
**Learn:** Adaptive teaching loop (see below).

---

## Answer Matching (`src/lib/fuzzy.ts`)

Powered by **Fuse.js** with pre-normalization:

1. **Normalize:** lowercase → strip diacritics (é→e) → strip non-alphanumeric
2. **Fuse search** over `name`, `altNames`, `capital`, `altCapitals` fields
3. Score thresholds:
   - `≤ 0.05` → **exact match** (+10 exact bonus)
   - `0.05 – 0.40` → **fuzzy match** (accepted, no bonus)
   - `> 0.40` → **wrong**

This lets "Sao Tome", "São Tomé e Príncipe", "Czechia" / "Czech Republic", "Beijing" / "Peking" all match correctly.

---

## Scoring (`src/lib/scoring.ts`)

```
points = floor(100 × difficulty_mult × streak_mult) + speed_bonus + exact_bonus

difficulty_mult : 1 (easy) | 1.5 (medium) | 2.0 (hard)
streak_mult     : 1.0 (<5 streak) | 1.2 (≥5) | 1.5 (≥10)
speed_bonus     : +20 if answered within 3 seconds of prompt
exact_bonus     : +10 if Fuse score ≤ 0.05
```

Country difficulty (1–3) is stored per entry in `countries.json`. Level 1 = major countries (France, China), Level 3 = obscure nations (Benin, Belize, Bahrain).

---

## Game Engine (`src/hooks/useGameEngine.ts`)

Uses **`useReducer`** with actions: `START | CORRECT | WRONG | PAUSE | RESUME | END | RESET`.

**Session state** includes: `score`, `streak`, `maxStreak`, `answered` (Set), `wrong` (Set), `skipped` (Set), `attempts[]`, `currentPrompt`, `timeRemaining`, `phase` (`idle | playing | paused | finished`).

**Prompt queue:** Built once at game start from `countries.json`, filtered by region/difficulty settings, shuffled, stored in a mutable ref (`_queue`) to avoid closure stale-state issues in timer callbacks.

**Mutable refs** (`_queue`, `_queueIdx`, `_promptStart`) are used alongside reducer state — an intentional pattern to decouple queue traversal from React renders.

On answer submission: fuzzy match → dispatch `CORRECT`/`WRONG` → `recordAttempt()` (progress hook) → continue to next prompt.

---

## Learn Engine (`src/hooks/useLearnEngine.ts`)

Adaptive learning mode with **teach → test** cycles:

1. **Teach phase:** Show the country on the globe with its name + capital; user reads, then confirms.
2. **Test phase:** Standard prompt; user must answer from memory (1–3 tests before teaching another country).
3. **Weighted selection:** Chooses which country to teach/test next based on:

```
weight = (1 - mastery) × 5 - (consecutiveCorrect × 0.3) + (recencyBoost × 0.5)
```

Where `mastery = (correct / attempts) × min(1, attempts / 5)`. Countries never seen get a large boost. Consecutive correct answers reduce weight (the learner knows them). This approximates spaced repetition without a full SRS scheduler.

---

## Progress System (`src/hooks/useProgress.ts`, `src/lib/progressStorage.ts`)

**Data shape** (per country, per prompt type):

```ts
interface CountryProgress {
  attempts: number;
  correct: number;
  lastAttempt: number;    // Unix timestamp
  consecutiveCorrect: number;
}
```

**Storage:**
- Authenticated users → Supabase `user_progress` table (user_id + country_id composite key)
- Unauthenticated → in-memory only (lost on page reload)

**On login:** Server data is fetched and merged; any local progress accumulated before login is migrated to server.

**Global stats** (`user_stats` table): total sessions, total score, best score, best streak, days played.

**Mastery formula:** `(correct / attempts) × min(1, attempts / 5)` — rewards both accuracy and repetition.

---

## Leaderboard (`src/hooks/useLeaderboard.ts`, `src/lib/leaderboard.ts`)

**Supabase table:** `leaderboard_scores` — keyed on `(user_id, mode, time_mode)`. Only the personal best score per combination is stored (upsert on improvement).

**Retrieval:** Top 20 per `(mode, time_mode)` combination, ordered by score descending.

**Submission:** Called at game end if mode is `country | capital | both` (not `practice` or `learn`) and user is authenticated.

**UI filters:** Mode tabs (country / capital / both) × time mode tabs (blitz / standard / infinite).

---

## Authentication (`src/hooks/useAuth.ts`)

- Provider: **Supabase** email + password (no OAuth or magic links currently)
- On mount, restores session from Supabase's built-in localStorage JWT
- Listens for `onAuthStateChange` events
- Exposed interface: `{ user, session, loading, signIn, signUp, signOut }`
- `user` is `null` for unauthenticated visitors; many features degrade gracefully

---

## Data: `countries.json`

Each entry:
```ts
{
  id: string,           // ISO 3166-1 alpha-3 (e.g. "FRA")
  name: string,         // Primary English name
  altNames: string[],   // Alternate accepted names
  capital: string,      // Primary capital name
  altCapitals: string[],// Alternate accepted capital spellings
  region: string,       // "Europe" | "Asia" | "Africa" | "Americas" | "Oceania"
  difficulty: 1 | 2 | 3,
  topoId: number        // Numeric ID matching countries-50m.json features
}
```

`geoIds.ts` provides the mapping between ISO strings and TopoJSON numeric IDs for globe coloring.

---

## Globe / Map Visualization

**`GlobeMap.tsx`** (react-globe.gl):
- Renders `countries-50m.json` as filled polygon layers on a 3D globe
- Color-codes countries by game state: neutral (dark green) / current (bright yellow) / correct (light green) / wrong (red) / teaching (blue)
- Earth texture: `public/earth-day.jpg`
- Auto-rotates when idle; rotates to focus on current country during gameplay
- Memoized with `React.memo` to prevent re-renders on unrelated state changes

**2D Map alternative** (MapLibre GL): Available for users who prefer a flat map; uses the same state-color logic.

---

## Component Hierarchy (abridged)

```
App
├── HomeScreen
│   ├── UserMenu | SignIn button
│   ├── ModeCard × 5
│   └── SettingsPanel (time limit, region filter, blind mode, include dependents)
├── GameView
│   ├── GlobeMap
│   ├── InputBar
│   ├── Timer
│   ├── ScoreBoard
│   ├── GameControls (pause / settings / back)
│   ├── ResultFlash (correct/wrong overlay)
│   ├── TeachingPanel (learn mode only)
│   └── GameOverModal
├── ProgressDashboard
│   ├── ProgressMap (world heatmap by mastery)
│   └── Country list with mastery bars
├── LeaderboardView
└── AuthModal (SignIn / SignUp forms)
```

---

## Supabase Schema (inferred)

| Table | Key Columns | Purpose |
|---|---|---|
| `user_progress` | user_id, country_id, mode | Per-country attempt/correct/streak counts |
| `user_stats` | user_id | Global session stats (best score, streak, etc.) |
| `leaderboard_scores` | user_id, mode, time_mode | Best score per mode combo |

Row-level security is handled by Supabase's built-in auth policies (user_id = auth.uid()).

---

## Styling Conventions

Tailwind custom color palettes defined in `index.css`:
- `leaf-*` — primary greens (brand color)
- `bark-*` — warm browns (text, borders)
- `moss-*`, `petal-*`, `soil-*` — accent palettes

Custom keyframe animations: `float-up` (score popups), `slide-up` (toasts), `shake` (wrong answer), `bounce-subtle` (idle elements), `spin-slow` (loaders).

Typography: Playfair Display for headings (serif, brand identity), DM Sans for all body/UI text.

---

## Key Patterns & Conventions

- **No router library** — `App.tsx` `view` string is the entire navigation system
- **useReducer for game state** — `useGameEngine` and `useLearnEngine` both use reducer+action patterns; never mutate state directly
- **Mutable refs alongside reducers** — `_queue` / `_queueIdx` / `_promptStart` in `useGameEngine` are refs, not state, to avoid stale closures in timer callbacks; this is intentional
- **Hooks own their domain** — each hook is self-contained; `App.tsx` only wires them together
- **TypeScript strict mode** — `noUnusedLocals`, `noUnusedParameters`, no `any` unless unavoidable
- **No test files** — no Jest/Vitest test suite exists in the repository as of this writing
- **No analytics / telemetry** — no tracking libraries installed

---

## What Is Not In This Repo

- No server-side rendering (pure SPA)
- No native mobile build (web only)
- No CI/CD pipeline config
- No test suite
- No multiplayer / real-time features (Supabase realtime is available but unused)
- No audio / pronunciation features
