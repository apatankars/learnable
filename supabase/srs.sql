-- Spaced-repetition schedule, one row per (user, item, prompt type).
-- Run this in the Supabase SQL editor (same workflow as adaptive.sql).

CREATE TABLE IF NOT EXISTS user_srs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  prompt_type text NOT NULL,          -- 'country' | 'capital'
  stability real NOT NULL DEFAULT 1,  -- days until recall decays to ~90%
  difficulty real NOT NULL DEFAULT 5, -- 1 (easy) .. 10 (hard)
  due_at bigint NOT NULL DEFAULT 0,   -- epoch ms, matches last_seen convention
  reps integer NOT NULL DEFAULT 0,
  lapses integer NOT NULL DEFAULT 0,
  last_review_at bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, item_id, prompt_type)
);

CREATE INDEX IF NOT EXISTS user_srs_due_idx ON user_srs (user_id, due_at);

ALTER TABLE user_srs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own srs"
  ON user_srs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own srs"
  ON user_srs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own srs"
  ON user_srs FOR UPDATE USING (auth.uid() = user_id);
