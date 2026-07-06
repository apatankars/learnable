import type {
  CountryProgress, PromptType, ConfusionEdge, ConfusionPair, ComissPair,
} from '../types';
import { getMastery } from './progressStorage';

// ── Elo ratings ────────────────────────────────────────────────────────────────
// Each answer is treated as a match between the user's ability and the item's
// difficulty. A correct answer raises the user's ability and lowers (makes
// "easier") the item's rating for that user; a wrong answer does the reverse.
// This is the same math Khan Academy / chess use, and gives a per-user estimate
// of which items are genuinely hard *for this person* — distinct from raw
// correct/attempt mastery.

export const DEFAULT_ABILITY = 1500;

// Seed an item's rating from its static difficulty (1=easy … 3=hard).
export function seedRating(difficulty: number): number {
  return { 1: 1300, 2: 1500, 3: 1700 }[difficulty] ?? 1500;
}

export function expectedScore(ability: number, itemRating: number): number {
  return 1 / (1 + Math.pow(10, (itemRating - ability) / 400));
}

// K is larger while an item is "provisional" (few attempts) so it converges fast.
function kFactor(attempts: number): number {
  return attempts < 5 ? 48 : 24;
}

export interface RatingUpdate {
  ability: number;
  itemRating: number;
}

export function updateRatings(
  ability: number,
  itemRating: number,
  correct: boolean,
  itemAttempts: number,
): RatingUpdate {
  const expected = expectedScore(ability, itemRating);
  const k = kFactor(itemAttempts);
  const delta = k * ((correct ? 1 : 0) - expected);
  return {
    ability: ability + delta,
    itemRating: itemRating - delta,
  };
}

// ── Selection priority ──────────────────────────────────────────────────────────
// The single weight used by both Practice and Learn to decide what to serve next.
// Replaces the duplicated `computeWeight` that used to live in the two engines.

const WEEK_MS = 7 * 24 * 3600 * 1000;

function ratingFor(p: CountryProgress, promptType: PromptType): number {
  return promptType === 'country' ? p.countryRating : p.capitalRating;
}

// Bell-shaped reward peaking when the item sits just above current ability
// (expected ≈ 0.6–0.75 correct) — the "zone of proximal development" that
// adaptive testing systems target. Too-easy and too-hard items are damped.
function desirableDifficulty(ability: number, itemRating: number): number {
  const expected = expectedScore(ability, itemRating);
  const TARGET = 0.7;
  const SPREAD = 0.22;
  return Math.exp(-((expected - TARGET) ** 2) / (2 * SPREAD ** 2));
}

export interface PriorityInputs {
  progress?: CountryProgress;
  promptType: PromptType;
  ability: number;
  confusionWeight: number; // total confusion-edge count touching this item
  now?: number;
}

export function itemPriority({
  progress, promptType, ability, confusionWeight, now = Date.now(),
}: PriorityInputs): number {
  // Unseen items get a strong flat priority so they enter rotation.
  if (!progress) return 3.0;
  const attempts = promptType === 'country' ? progress.countryAttempts : progress.capitalAttempts;
  if (attempts === 0) return 3.0;

  const mastery = getMastery(progress, promptType);
  const consecutive = promptType === 'country'
    ? progress.countryConsecutiveCorrect : progress.capitalConsecutiveCorrect;
  const lastSeen = promptType === 'country'
    ? progress.countryLastSeen : progress.capitalLastSeen;

  const weakness = (1 - mastery) * 5;
  const recencyBoost = Math.max(0, 1 - (now - lastSeen) / WEEK_MS) * 0.5;
  const difficultyBoost = desirableDifficulty(ability, ratingFor(progress, promptType)) * 2.5;
  const consecutivePenalty = Math.min(consecutive * 0.3, 2.0);
  const confusionBoost = Math.min(confusionWeight, 10) * 0.4;

  return Math.max(
    0.1,
    weakness + difficultyBoost + recencyBoost + confusionBoost - consecutivePenalty,
  );
}

// ── Confusion graph ──────────────────────────────────────────────────────────────

// Total confusion-edge count touching an item (as shown OR as the wrong answer),
// optionally scoped to a prompt type. Used as `confusionWeight` above.
export function confusionWeightFor(
  edges: ConfusionEdge[],
  itemId: string,
  promptType?: PromptType,
): number {
  let total = 0;
  for (const e of edges) {
    if (promptType && e.promptType !== promptType) continue;
    if (e.shownId === itemId || e.answeredId === itemId) total += e.count;
  }
  return total;
}

// Items most often confused *with* `itemId`, strongest first — used to interleave
// a confusable partner right after the item so the user must discriminate them.
export function confusionPartners(
  edges: ConfusionEdge[],
  itemId: string,
  promptType?: PromptType,
): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of edges) {
    if (promptType && e.promptType !== promptType) continue;
    let other: string | null = null;
    if (e.shownId === itemId) other = e.answeredId;
    else if (e.answeredId === itemId) other = e.shownId;
    if (other) counts.set(other, (counts.get(other) ?? 0) + e.count);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count);
}

// Collapse directed edges into symmetric pairs for display, sorted by total count.
export function topConfusionPairs(edges: ConfusionEdge[], limit = 10): ConfusionPair[] {
  const merged = new Map<string, ConfusionPair>();
  for (const e of edges) {
    const [aId, bId] = e.shownId < e.answeredId
      ? [e.shownId, e.answeredId] : [e.answeredId, e.shownId];
    const key = `${aId}|${bId}|${e.promptType}`;
    const existing = merged.get(key);
    if (existing) existing.count += e.count;
    else merged.set(key, { aId, bId, promptType: e.promptType, count: e.count });
  }
  return [...merged.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function topComissPairs(pairs: ComissPair[], limit = 10): ComissPair[] {
  return [...pairs].sort((a, b) => b.count - a.count).slice(0, limit);
}
