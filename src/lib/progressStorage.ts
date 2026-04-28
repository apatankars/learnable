import type { CountryProgress, GlobalStats, UserSettings } from '../types';

const SETTINGS_KEY = 'learnable_settings';

export function getMastery(p: CountryProgress, type: 'country' | 'capital'): number {
  const attempts = type === 'country' ? p.countryAttempts : p.capitalAttempts;
  const correct = type === 'country' ? p.countryCorrect : p.capitalCorrect;
  if (attempts === 0) return 0;
  return (correct / attempts) * Math.min(1, attempts / 5);
}

export function loadProgress(): Record<string, CountryProgress> {
  return {};
}

export function saveProgress(progress: Record<string, CountryProgress>): void {
  // No-op for unauthenticated users, auth users save to server via useProgress
  void progress;
}

export function loadGlobalStats(): GlobalStats {
  return defaultGlobalStats();
}

export function saveGlobalStats(stats: GlobalStats): void {
  // No-op for unauthenticated users
  void stats;
}

export function loadSettings(): UserSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSettings(settings: UserSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function defaultGlobalStats(): GlobalStats {
  return {
    totalSessions: 0,
    totalScore: 0,
    bestScore: 0,
    bestStreak: 0,
    daysPlayed: [],
    lastPlayed: 0,
    versusWins: 0,
    versusLosses: 0,
  };
}

export function defaultProgress(countryId: string): CountryProgress {
  return {
    countryId,
    countryAttempts: 0, countryCorrect: 0, countryLastSeen: 0, countryConsecutiveCorrect: 0,
    capitalAttempts: 0, capitalCorrect: 0, capitalLastSeen: 0, capitalConsecutiveCorrect: 0,
  };
}
