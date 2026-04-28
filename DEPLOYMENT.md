# Learnable Deployment Walkthrough

## 1. Prerequisites

You need:

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project
- A static hosting target such as Vercel, Netlify, or Cloudflare Pages

## 2. Install the project

1. Open the project folder: `/Users/armaanpatankar/Desktop/BrownUniversity/CS/learnable`
2. Install dependencies:

```bash
npm install
```

## 3. Configure Supabase

1. Create a Supabase project if you do not already have one.
2. In Supabase, open `Project Settings -> API`.
3. Copy:
   - Project URL
   - Publishable anon key
4. Create a local env file from the example:

```bash
cp .env.example .env.local
```

5. Set:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-anon-key
```

## 4. Apply the database SQL

Run the SQL in both files inside the Supabase SQL editor:

- [supabase/leaderboard.sql](/Users/armaanpatankar/Desktop/BrownUniversity/CS/learnable/supabase/leaderboard.sql)
- [supabase/versus.sql](/Users/armaanpatankar/Desktop/BrownUniversity/CS/learnable/supabase/versus.sql)

This sets up:

- leaderboard storage
- versus lobby/realtime support
- the required auth-backed policies

If your app also depends on additional progress tables not yet created in Supabase, create those before launch as well. The source expects `user_progress` and `user_stats` to exist.

## 5. Run locally

Start the dev server:

```bash
npm run dev
```

Open the local URL Vite prints, usually `http://localhost:5173`.

## 6. Verify the app before deployment

Run the production checks:

```bash
npm run lint
npm run build
```

Then confirm these flows in the browser:

1. Home screen loads with the decorative globe.
2. Country mode starts and renders highlighted countries correctly.
3. Capital mode accepts answers and scoring updates.
4. Practice and learn modes still render and advance prompts.
5. Progress dashboard loads its map without broken geometry.
6. Leaderboard view loads.
7. Versus mode works with two signed-in users:
   - Host creates a lobby
   - Second user joins with the room code
   - Host starts the match
   - Both players receive prompts and score updates

## 7. Deploy to a static host

Use these build settings:

- Build command: `npm run build`
- Output directory: `dist`

Add the same environment variables from `.env.local` to your hosting platform:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 8. Platform notes

### Vercel

- Framework preset: `Vite`
- Build command: `npm run build`
- Output directory: `dist`

### Netlify

- Build command: `npm run build`
- Publish directory: `dist`

### Cloudflare Pages

- Build command: `npm run build`
- Build output directory: `dist`

## 9. Post-deploy checks

After deployment, verify:

1. Auth works from the deployed domain.
2. Supabase allowed redirect URLs include the deployed site URL if required by your auth settings.
3. Leaderboard reads and writes work.
4. Versus mode connects from two separate browsers or devices.
5. Globe textures and GeoJSON files load from `/public` assets without 404s.

## 10. Current deployment notes for this repo

- Production builds are passing.
- ESLint is passing.
- Heavy libraries are chunked in Vite so globe and map code are split more cleanly for deployment.
- The app now fails fast with a clear error if Supabase environment variables are missing.
