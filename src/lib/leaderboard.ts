import { supabase } from './supabase';
import type { GameMode } from '../types';

export type TimeMode = 'blitz' | 'standard' | 'infinite';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: number;
  updatedAt: string;
}

export function getTimeMode(timeLimitSeconds: number, noTimeLimit: boolean): TimeMode {
  if (noTimeLimit) return 'infinite';
  if (timeLimitSeconds <= 60) return 'blitz';
  return 'standard';
}

export function getTimeModeLabel(timeMode: TimeMode): string {
  if (timeMode === 'blitz') return '⚡ Blitz';
  if (timeMode === 'standard') return '⏱ 5 Min';
  return '∞ Infinite';
}

export async function submitScore(
  userId: string,
  username: string,
  score: number,
  mode: GameMode,
  timeMode: TimeMode,
): Promise<void> {
  if (score <= 0) return;
  await supabase.from('leaderboard_scores').upsert(
    { user_id: userId, username, score, mode, time_mode: timeMode, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,mode,time_mode' },
  );
}

export async function fetchLeaderboard(mode: GameMode, timeMode: TimeMode): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('leaderboard_scores')
    .select('user_id, username, score, updated_at')
    .eq('mode', mode)
    .eq('time_mode', timeMode)
    .order('score', { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((row, idx) => ({
    rank: idx + 1,
    userId: row.user_id,
    username: row.username,
    score: row.score,
    updatedAt: row.updated_at,
  }));
}

export async function fetchPersonalBests(userId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('leaderboard_scores')
    .select('mode, time_mode, score')
    .eq('user_id', userId);
  if (error || !data) return {};
  const result: Record<string, number> = {};
  for (const row of data) {
    result[`${row.mode}_${row.time_mode}`] = row.score;
  }
  return result;
}
