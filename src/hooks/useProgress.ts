import { useState, useCallback, useEffect, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import type { CountryProgress, AttemptResult, GlobalStats } from '../types';
import {
  loadProgress, saveProgress, loadGlobalStats, saveGlobalStats,
  defaultProgress, getMastery,
} from '../lib/progressStorage';
import { supabase } from '../lib/supabase';

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchServerProgress(userId: string): Promise<Record<string, CountryProgress> | null> {
  const { data, error } = await supabase
    .from('user_progress')
    .select('*')
    .eq('user_id', userId);
  if (error || !data) return null;
  if (data.length === 0) return null;

  const result: Record<string, CountryProgress> = {};
  for (const row of data) {
    result[row.country_id] = {
      countryId: row.country_id,
      countryAttempts: row.country_attempts,
      countryCorrect: row.country_correct,
      countryLastSeen: row.country_last_seen,
      countryConsecutiveCorrect: row.country_consecutive_correct,
      capitalAttempts: row.capital_attempts,
      capitalCorrect: row.capital_correct,
      capitalLastSeen: row.capital_last_seen,
      capitalConsecutiveCorrect: row.capital_consecutive_correct,
    };
  }
  return result;
}

async function fetchServerStats(userId: string): Promise<GlobalStats | null> {
  const { data, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return {
    totalSessions: data.total_sessions,
    totalScore: data.total_score,
    bestScore: data.best_score,
    bestStreak: data.best_streak,
    daysPlayed: data.days_played ?? [],
    lastPlayed: data.last_played,
    versusWins: data.versus_wins ?? 0,
    versusLosses: data.versus_losses ?? 0,
  };
}

async function upsertProgress(userId: string, p: CountryProgress) {
  await supabase.from('user_progress').upsert({
    user_id: userId,
    country_id: p.countryId,
    country_attempts: p.countryAttempts,
    country_correct: p.countryCorrect,
    country_last_seen: p.countryLastSeen,
    country_consecutive_correct: p.countryConsecutiveCorrect,
    capital_attempts: p.capitalAttempts,
    capital_correct: p.capitalCorrect,
    capital_last_seen: p.capitalLastSeen,
    capital_consecutive_correct: p.capitalConsecutiveCorrect,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,country_id' });
}

async function upsertStats(userId: string, stats: GlobalStats) {
  await supabase.from('user_stats').upsert({
    user_id: userId,
    total_sessions: stats.totalSessions,
    total_score: stats.totalScore,
    best_score: stats.bestScore,
    best_streak: stats.bestStreak,
    days_played: stats.daysPlayed,
    last_played: stats.lastPlayed,
    versus_wins: stats.versusWins,
    versus_losses: stats.versusLosses,
  }, { onConflict: 'user_id' });
}

async function migrateLocalToServer(userId: string, local: Record<string, CountryProgress>, localStats: GlobalStats) {
  for (const p of Object.values(local)) {
    await upsertProgress(userId, p);
  }
  await upsertStats(userId, localStats);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useProgress(user: User | null = null) {
  const [progress, setProgress] = useState<Record<string, CountryProgress>>(() => loadProgress());
  const [globalStats, setGlobalStats] = useState<GlobalStats>(() => loadGlobalStats());
  const userRef = useRef<User | null>(user);
  userRef.current = user;

  // Load server data when user logs in
  useEffect(() => {
    if (!user) return;
    (async () => {
      const serverProgress = await fetchServerProgress(user.id);
      const serverStats = await fetchServerStats(user.id);

      if (!serverProgress) {
        // First login — migrate local data to server
        const local = loadProgress();
        const localStats = loadGlobalStats();
        await migrateLocalToServer(user.id, local, localStats);
      } else {
        setProgress(serverProgress);
        if (serverStats) setGlobalStats(serverStats);
      }
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const recordAttempt = useCallback((result: AttemptResult) => {
    setProgress(prev => {
      const existing = prev[result.countryId] ?? defaultProgress(result.countryId);
      const updated = { ...existing };
      const now = Date.now();

      if (result.promptType === 'country') {
        updated.countryAttempts++;
        updated.countryLastSeen = now;
        if (result.correct) {
          updated.countryCorrect++;
          updated.countryConsecutiveCorrect++;
        } else {
          updated.countryConsecutiveCorrect = 0;
        }
      } else {
        updated.capitalAttempts++;
        updated.capitalLastSeen = now;
        if (result.correct) {
          updated.capitalCorrect++;
          updated.capitalConsecutiveCorrect++;
        } else {
          updated.capitalConsecutiveCorrect = 0;
        }
      }

      const next = { ...prev, [result.countryId]: updated };
      saveProgress(next);
      const uid = userRef.current?.id;
      if (uid) upsertProgress(uid, updated);
      return next;
    });
  }, []);

  const finishSession = useCallback((score: number, streak: number) => {
    setGlobalStats(prev => {
      const today = new Date().toISOString().slice(0, 10);
      const days = prev.daysPlayed.includes(today)
        ? prev.daysPlayed
        : [...prev.daysPlayed, today];
      const next: GlobalStats = {
        totalSessions: prev.totalSessions + 1,
        totalScore: prev.totalScore + score,
        bestScore: Math.max(prev.bestScore, score),
        bestStreak: Math.max(prev.bestStreak, streak),
        daysPlayed: days,
        lastPlayed: Date.now(),
        versusWins: prev.versusWins,
        versusLosses: prev.versusLosses,
      };
      saveGlobalStats(next);
      const uid = userRef.current?.id;
      if (uid) upsertStats(uid, next);
      return next;
    });
  }, []);

  const recordVersusResult = useCallback((win: boolean) => {
    setGlobalStats(prev => {
      const next: GlobalStats = {
        ...prev,
        versusWins: prev.versusWins + (win ? 1 : 0),
        versusLosses: prev.versusLosses + (win ? 0 : 1),
      };
      saveGlobalStats(next);
      const uid = userRef.current?.id;
      if (uid) upsertStats(uid, next);
      return next;
    });
  }, []);

  const resetProgress = useCallback(() => {
    saveProgress({});
    setProgress({});
  }, []);

  const getWeakCountries = useCallback(() => {
    return Object.values(progress)
      .filter(p => p.countryAttempts + p.capitalAttempts > 0)
      .sort((a, b) => {
        const ma = (getMastery(a, 'country') + getMastery(a, 'capital')) / 2;
        const mb = (getMastery(b, 'country') + getMastery(b, 'capital')) / 2;
        return ma - mb;
      });
  }, [progress]);

  return { progress, globalStats, recordAttempt, finishSession, resetProgress, getWeakCountries, recordVersusResult };
}
