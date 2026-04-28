# Learnable

Learnable is a React + TypeScript geography quiz app built around a 3D globe, adaptive learning modes, persistent progress, a leaderboard, and a Supabase-backed realtime versus mode.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project.
4. Apply the SQL in [supabase/leaderboard.sql](/Users/armaanpatankar/Desktop/BrownUniversity/CS/learnable/supabase/leaderboard.sql) and [supabase/versus.sql](/Users/armaanpatankar/Desktop/BrownUniversity/CS/learnable/supabase/versus.sql).
5. Start the app with `npm run dev`.

## Verification

- `npm run build`
- `npm run lint`

## Deployment guide

The full step-by-step deployment and setup walkthrough is in [DEPLOYMENT.md](/Users/armaanpatankar/Desktop/BrownUniversity/CS/learnable/DEPLOYMENT.md).
