import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import type { CountryProgress, AttemptResult, GlobalStats, ConfusionEdge, ComissPair, GameMode, ModeStat, SrsCard } from '../types';
import {
  loadProgress, saveProgress, loadGlobalStats, saveGlobalStats,
  defaultProgress, getMastery,
} from '../lib/progressStorage';
import { updateRatings, DEFAULT_ABILITY } from '../lib/adaptive';
import {
  srsKey, gradeFromAttempt, createCard, reviewCard, seedCardFromHistory, dueCounts,
} from '../lib/srs';
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
      countryRating: row.country_rating ?? 1500,
      capitalRating: row.capital_rating ?? 1500,
    };
  }
  return result;
}

async function fetchConfusions(userId: string): Promise<ConfusionEdge[]> {
  const { data, error } = await supabase
    .from('user_confusions')
    .select('*')
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.map(row => ({
    shownId: row.shown_id,
    answeredId: row.answered_id,
    promptType: row.prompt_type,
    count: row.count,
    lastSeen: row.last_seen,
  }));
}

async function fetchComiss(userId: string): Promise<ComissPair[]> {
  const { data, error } = await supabase
    .from('user_comiss')
    .select('*')
    .eq('user_id', userId);
  if (error || !data) return [];
  return data.map(row => ({ aId: row.item_a, bId: row.item_b, count: row.count }));
}

// Returns {} when the user simply has no rows yet (triggers backfill) and
// null on a fetch error (so a transient failure doesn't cause a re-seed).
async function fetchSrs(userId: string): Promise<Record<string, SrsCard> | null> {
  const { data, error } = await supabase
    .from('user_srs')
    .select('*')
    .eq('user_id', userId);
  if (error || !data) return null;
  const result: Record<string, SrsCard> = {};
  for (const row of data) {
    result[srsKey(row.item_id, row.prompt_type)] = {
      itemId: row.item_id,
      promptType: row.prompt_type,
      stability: row.stability,
      difficulty: row.difficulty,
      dueAt: row.due_at,
      reps: row.reps,
      lapses: row.lapses,
      lastReviewAt: row.last_review_at,
    };
  }
  return result;
}

function srsRow(userId: string, c: SrsCard) {
  return {
    user_id: userId,
    item_id: c.itemId,
    prompt_type: c.promptType,
    stability: c.stability,
    difficulty: c.difficulty,
    due_at: c.dueAt,
    reps: c.reps,
    lapses: c.lapses,
    last_review_at: c.lastReviewAt,
    updated_at: new Date().toISOString(),
  };
}

async function upsertSrs(userId: string, card: SrsCard) {
  await supabase.from('user_srs')
    .upsert(srsRow(userId, card), { onConflict: 'user_id,item_id,prompt_type' });
}

async function bulkUpsertSrs(userId: string, cards: SrsCard[]) {
  for (let i = 0; i < cards.length; i += 200) {
    await supabase.from('user_srs').upsert(
      cards.slice(i, i + 200).map(c => srsRow(userId, c)),
      { onConflict: 'user_id,item_id,prompt_type' },
    );
  }
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
    modeStats: data.mode_stats ?? {},
    countryAbility: data.country_ability ?? 1500,
    capitalAbility: data.capital_ability ?? 1500,
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
    country_rating: p.countryRating,
    capital_rating: p.capitalRating,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,country_id' });
}

async function incrementConfusion(userId: string, e: ConfusionEdge) {
  await supabase.rpc('increment_confusion', {
    p_user: userId,
    p_shown: e.shownId,
    p_answered: e.answeredId,
    p_prompt_type: e.promptType,
    p_now: e.lastSeen,
  });
}

async function incrementComiss(userId: string, aId: string, bId: string) {
  const [a, b] = aId < bId ? [aId, bId] : [bId, aId];
  await supabase.rpc('increment_comiss', { p_user: userId, p_a: a, p_b: b });
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
    mode_stats: stats.modeStats,
    country_ability: stats.countryAbility,
    capital_ability: stats.capitalAbility,
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
  const [confusions, setConfusions] = useState<ConfusionEdge[]>([]);
  const [comiss, setComiss] = useState<ComissPair[]>([]);
  const [srs, setSrs] = useState<Record<string, SrsCard>>({});
  const userRef = useRef<User | null>(user);
  userRef.current = user;
  // Mirrors of state so the (stable) callbacks can read the latest values
  // without re-creating — Elo updates need both the item rating and the ability.
  const statsRef = useRef<GlobalStats>(globalStats);
  statsRef.current = globalStats;
  const progressRef = useRef<Record<string, CountryProgress>>(progress);
  progressRef.current = progress;
  const srsRef = useRef<Record<string, SrsCard>>(srs);
  srsRef.current = srs;

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
      setConfusions(await fetchConfusions(user.id));
      setComiss(await fetchComiss(user.id));

      // SRS schedules. If the user has attempt history but no cards yet
      // (account predates SRS), seed cards from Elo + history once. `null`
      // means the fetch errored — skip so a transient failure can't re-seed.
      const serverSrs = await fetchSrs(user.id);
      if (serverSrs === null) return;
      if (Object.keys(serverSrs).length === 0 && serverProgress) {
        const now = Date.now();
        const seeded: Record<string, SrsCard> = {};
        for (const p of Object.values(serverProgress)) {
          for (const pt of ['country', 'capital'] as const) {
            const ability = pt === 'country'
              ? serverStats?.countryAbility ?? DEFAULT_ABILITY
              : serverStats?.capitalAbility ?? DEFAULT_ABILITY;
            const card = seedCardFromHistory(p, pt, ability, now);
            if (card) seeded[srsKey(card.itemId, pt)] = card;
          }
        }
        setSrs(seeded);
        bulkUpsertSrs(user.id, Object.values(seeded));
      } else {
        setSrs(serverSrs);
      }
    })();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const recordAttempt = useCallback((result: AttemptResult) => {
    const now = Date.now();
    const isCountry = result.promptType === 'country';
    const abilityKey = isCountry ? 'countryAbility' : 'capitalAbility';

    // ── Per-user Elo: compute once from pre-update values so the item rating and
    //    the matching ability move by the same (opposite-signed) delta. ──
    const prevEntry = progressRef.current[result.countryId] ?? defaultProgress(result.countryId);
    const ability = statsRef.current[abilityKey];
    const itemRating = isCountry ? prevEntry.countryRating : prevEntry.capitalRating;
    const attemptsBefore = isCountry ? prevEntry.countryAttempts : prevEntry.capitalAttempts;
    const { ability: newAbility, itemRating: newItemRating } =
      updateRatings(ability, itemRating, result.correct, attemptsBefore);

    setProgress(prev => {
      const existing = prev[result.countryId] ?? defaultProgress(result.countryId);
      const updated = { ...existing };

      if (isCountry) {
        updated.countryAttempts++;
        updated.countryLastSeen = now;
        updated.countryRating = newItemRating;
        if (result.correct) { updated.countryCorrect++; updated.countryConsecutiveCorrect++; }
        else updated.countryConsecutiveCorrect = 0;
      } else {
        updated.capitalAttempts++;
        updated.capitalLastSeen = now;
        updated.capitalRating = newItemRating;
        if (result.correct) { updated.capitalCorrect++; updated.capitalConsecutiveCorrect++; }
        else updated.capitalConsecutiveCorrect = 0;
      }

      const next = { ...prev, [result.countryId]: updated };
      saveProgress(next);
      const uid = userRef.current?.id;
      if (uid) upsertProgress(uid, updated);
      return next;
    });

    setGlobalStats(prev => {
      const nextStats: GlobalStats = { ...prev, [abilityKey]: newAbility };
      saveGlobalStats(nextStats);
      const uid = userRef.current?.id;
      if (uid) upsertStats(uid, nextStats);
      return nextStats;
    });

    // ── SRS: every graded attempt (any mode) advances the review schedule.
    //    Uses the pre-update rating/ability, matching what the user just faced. ──
    const key = srsKey(result.countryId, result.promptType);
    const existingCard = srsRef.current[key];
    const card = existingCard
      ? reviewCard(existingCard, gradeFromAttempt(result), now)
      : createCard(result.countryId, result.promptType, itemRating, ability, now);
    setSrs(prev => ({ ...prev, [key]: card }));
    {
      const uid = userRef.current?.id;
      if (uid) upsertSrs(uid, card);
    }

    // ── Confusion graph: record which country the wrong answer was mistaken for ──
    if (result.confusedWithId) {
      const edge: ConfusionEdge = {
        shownId: result.countryId,
        answeredId: result.confusedWithId,
        promptType: result.promptType,
        count: 1,
        lastSeen: now,
      };
      setConfusions(prev => {
        const idx = prev.findIndex(e =>
          e.shownId === edge.shownId && e.answeredId === edge.answeredId && e.promptType === edge.promptType);
        if (idx === -1) return [...prev, edge];
        const next = [...prev];
        next[idx] = { ...next[idx], count: next[idx].count + 1, lastSeen: now };
        return next;
      });
      const uid = userRef.current?.id;
      if (uid) incrementConfusion(uid, edge);
    }
  }, []);

  // Record items missed together in one session ("correlated mistakes").
  // Caps the work at the top ~150 unordered pairs to bound the table.
  const recordSessionMisses = useCallback((missedIds: string[]) => {
    const unique = [...new Set(missedIds)];
    if (unique.length < 2) return;
    const pairs: [string, string][] = [];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const [a, b] = unique[i] < unique[j] ? [unique[i], unique[j]] : [unique[j], unique[i]];
        pairs.push([a, b]);
      }
    }
    const capped = pairs.slice(0, 150);

    setComiss(prev => {
      const map = new Map(prev.map(p => [`${p.aId}|${p.bId}`, { ...p }]));
      for (const [a, b] of capped) {
        const key = `${a}|${b}`;
        const ex = map.get(key);
        if (ex) ex.count++;
        else map.set(key, { aId: a, bId: b, count: 1 });
      }
      return [...map.values()];
    });

    const uid = userRef.current?.id;
    if (uid) capped.forEach(([a, b]) => incrementComiss(uid, a, b));
  }, []);

  const finishSession = useCallback((score: number, streak: number, mode: GameMode) => {
    setGlobalStats(prev => {
      const today = new Date().toISOString().slice(0, 10);
      const days = prev.daysPlayed.includes(today)
        ? prev.daysPlayed
        : [...prev.daysPlayed, today];
      const prevMode: ModeStat = prev.modeStats[mode] ?? { sessions: 0, bestScore: 0, totalScore: 0 };
      const next: GlobalStats = {
        ...prev,
        totalSessions: prev.totalSessions + 1,
        totalScore: prev.totalScore + score,
        bestScore: Math.max(prev.bestScore, score),
        bestStreak: Math.max(prev.bestStreak, streak),
        daysPlayed: days,
        lastPlayed: Date.now(),
        modeStats: {
          ...prev.modeStats,
          [mode]: {
            sessions: prevMode.sessions + 1,
            bestScore: Math.max(prevMode.bestScore, score),
            totalScore: prevMode.totalScore + score,
          },
        },
      };
      saveGlobalStats(next);
      const uid = userRef.current?.id;
      if (uid) upsertStats(uid, next);
      return next;
    });
  }, []);

  const recordVersusResult = useCallback((win: boolean) => {
    setGlobalStats(prev => {
      const prevMode: ModeStat = prev.modeStats.versus ?? { sessions: 0, bestScore: 0, totalScore: 0 };
      const next: GlobalStats = {
        ...prev,
        versusWins: prev.versusWins + (win ? 1 : 0),
        versusLosses: prev.versusLosses + (win ? 0 : 1),
        modeStats: {
          ...prev.modeStats,
          versus: { ...prevMode, sessions: prevMode.sessions + 1 },
        },
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

  const srsDueCounts = useMemo(() => dueCounts(Object.values(srs)), [srs]);

  return {
    progress, globalStats, confusions, comiss, srs, srsDueCounts,
    recordAttempt, finishSession, resetProgress, getWeakCountries,
    recordVersusResult, recordSessionMisses,
  };
}
