-- Run this in the Supabase SQL editor to set up the leaderboard table.
-- One row per user per (mode, time_mode) — always the user's personal best.

CREATE TABLE IF NOT EXISTS leaderboard_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  mode text NOT NULL,         -- 'country' | 'capital' | 'both'
  time_mode text NOT NULL,    -- 'blitz' | 'standard' | 'infinite'
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, mode, time_mode)
);

ALTER TABLE leaderboard_scores ENABLE ROW LEVEL SECURITY;

-- Anyone can read the leaderboard
CREATE POLICY "Leaderboard readable by all"
  ON leaderboard_scores FOR SELECT USING (true);

-- Authenticated users can insert/update only their own rows
CREATE POLICY "Users can insert own scores"
  ON leaderboard_scores FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own scores"
  ON leaderboard_scores FOR UPDATE
  USING (auth.uid() = user_id);
