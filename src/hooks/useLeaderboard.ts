import { useState, useEffect, useCallback, useRef } from 'react';
import type { User } from '@supabase/supabase-js';
import { submitScore, fetchPersonalBests, getTimeMode } from '../lib/leaderboard';
import type { GameSettings } from '../types';

export function useLeaderboard(user: User | null) {
  const [personalBests, setPersonalBests] = useState<Record<string, number>>({});
  const userRef = useRef<User | null>(user);
  userRef.current = user;

  useEffect(() => {
    if (!user) { setPersonalBests({}); return; }
    fetchPersonalBests(user.id).then(setPersonalBests);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSessionScore = useCallback(async (score: number, settings: GameSettings) => {
    const u = userRef.current;
    if (!u || score <= 0) return;
    if (settings.mode === 'practice' || settings.mode === 'learn' || settings.mode === 'review') return;
    const timeMode = getTimeMode(settings.timeLimitSeconds, settings.noTimeLimit);
    const key = `${settings.mode}_${timeMode}`;
    setPersonalBests(prev => {
      if ((prev[key] ?? 0) >= score) return prev;
      const username = u.email?.split('@')[0] ?? 'player';
      submitScore(u.id, username, score, settings.mode, timeMode);
      return { ...prev, [key]: score };
    });
  }, []);

  return { personalBests, submitSessionScore };
}
