import type { CountryEntry } from '../types';

const DIFFICULTY_MULT: Record<number, number> = { 1: 1.0, 2: 1.5, 3: 2.0 };

export function calculatePoints(
  country: CountryEntry,
  streak: number,
  timeTakenMs: number,
  fuzzyScore: number,
  hintUsed = false,
): number {
  const base = 100;
  const diff = DIFFICULTY_MULT[country.difficulty] ?? 1;
  const streakBonus = streak >= 10 ? 1.5 : streak >= 5 ? 1.2 : 1.0;
  const speedBonus = timeTakenMs < 3000 ? 20 : 0;
  const exactBonus = fuzzyScore === 0 ? 10 : 0;
  const pts = Math.floor(base * diff * streakBonus) + speedBonus + exactBonus;
  return hintUsed ? Math.floor(pts * 0.5) : pts;
}
