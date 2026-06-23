-- Run this in the Supabase SQL editor to set up the adaptive-learning tables.
-- Adds per-user Elo ratings, a directed confusion graph, and co-miss pairs.

-- ── Per-user Elo difficulty on existing per-country progress ────────────────────
ALTER TABLE user_progress
  ADD COLUMN IF NOT EXISTS country_rating real NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS capital_rating real NOT NULL DEFAULT 1500;

-- ── Per-user Elo ability on existing global stats ──────────────────────────────
ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS country_ability real NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS capital_ability real NOT NULL DEFAULT 1500;

-- ── Confusion graph: directed edges (shown X, the user answered Y) ──────────────
CREATE TABLE IF NOT EXISTS user_confusions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shown_id text NOT NULL,
  answered_id text NOT NULL,
  prompt_type text NOT NULL,          -- 'country' | 'capital'
  count integer NOT NULL DEFAULT 0,
  last_seen bigint NOT NULL DEFAULT 0,
  UNIQUE(user_id, shown_id, answered_id, prompt_type)
);

ALTER TABLE user_confusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own confusions"
  ON user_confusions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own confusions"
  ON user_confusions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own confusions"
  ON user_confusions FOR UPDATE USING (auth.uid() = user_id);

-- ── Co-miss: items missed together in a session (correlated mistakes) ──────────
-- Stored with item_a < item_b so each unordered pair has one row.
CREATE TABLE IF NOT EXISTS user_comiss (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_a text NOT NULL,
  item_b text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, item_a, item_b)
);

ALTER TABLE user_comiss ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own comiss"
  ON user_comiss FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own comiss"
  ON user_comiss FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own comiss"
  ON user_comiss FOR UPDATE USING (auth.uid() = user_id);

-- Atomic increment for a confusion edge (avoids read-modify-write races).
CREATE OR REPLACE FUNCTION increment_confusion(
  p_user uuid, p_shown text, p_answered text, p_prompt_type text, p_now bigint
) RETURNS void AS $$
  INSERT INTO user_confusions (user_id, shown_id, answered_id, prompt_type, count, last_seen)
  VALUES (p_user, p_shown, p_answered, p_prompt_type, 1, p_now)
  ON CONFLICT (user_id, shown_id, answered_id, prompt_type)
  DO UPDATE SET count = user_confusions.count + 1, last_seen = p_now;
$$ LANGUAGE sql SECURITY DEFINER;

-- Atomic increment for a co-miss pair (caller passes a<b).
CREATE OR REPLACE FUNCTION increment_comiss(
  p_user uuid, p_a text, p_b text
) RETURNS void AS $$
  INSERT INTO user_comiss (user_id, item_a, item_b, count)
  VALUES (p_user, p_a, p_b, 1)
  ON CONFLICT (user_id, item_a, item_b)
  DO UPDATE SET count = user_comiss.count + 1;
$$ LANGUAGE sql SECURITY DEFINER;
