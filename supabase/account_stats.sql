-- Run this in your Supabase SQL editor to add per-game-mode tracking to user_stats.
-- mode_stats is keyed by GameMode (country | capital | both | practice | learn | versus),
-- each value: { "sessions": int, "bestScore": int, "totalScore": int }.

ALTER TABLE public.user_stats
ADD COLUMN IF NOT EXISTS mode_stats jsonb NOT NULL DEFAULT '{}'::jsonb;
