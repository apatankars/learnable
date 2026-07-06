import type {
  AttemptResult, CountryProgress, PromptType, SrsCard, SrsGrade,
} from '../types';
import { expectedScore } from './adaptive';

// ── Cross-session spaced repetition ──────────────────────────────────────────
// A simplified FSRS-style memory model. Each (item, promptType) pair gets a
// card with `stability` (days until recall probability decays to ~90%) and
// `difficulty` (1..10). Elo seeds a card's starting point — it already knows
// how hard the item is for this user — after which the card evolves from
// review grades alone, so the scheduler stays pure and debuggable.
//
// Every constant in this file is a tuning knob; comments say what each one does.

const DAY_MS = 24 * 3600 * 1000;

// Stability multiplier per grade before difficulty/spacing adjustments.
// 'again' is handled separately (lapse path).
const GROWTH_BASE: Record<Exclude<SrsGrade, 'again'>, number> = {
  hard: 1.2,
  good: 2.2,
  easy: 3.0,
};

const MAX_STABILITY_DAYS = 365; // intervals never exceed a year
const MIN_STABILITY_DAYS = 0.3; // never schedule tighter than ~7 hours
const LAPSE_STABILITY_FACTOR = 0.3; // a miss collapses stability to 30%

// Grade thresholds derived from the attempt itself (there are no explicit
// again/hard/good/easy buttons). Response time is a retrieval-strength proxy:
// fast exact recall = strong trace.
const EASY_TIME_MS = 4_000;
const HARD_TIME_MS = 10_000;
const EXACT_FUZZY_EPSILON = 0.05; // Fuse score above this = the answer had typos

export const srsKey = (itemId: string, promptType: PromptType): string =>
  `${itemId}:${promptType}`;

export function gradeFromAttempt(result: AttemptResult): SrsGrade {
  if (!result.correct) return 'again';
  const fuzzy = result.fuzzyScore > EXACT_FUZZY_EPSILON;
  if (fuzzy || result.hintUsed || result.timeTaken > HARD_TIME_MS) return 'hard';
  if (result.timeTaken <= EASY_TIME_MS) return 'easy';
  return 'good';
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));

// ±10% jitter on intervals so items reviewed together don't stay locked in
// lockstep forever.
function fuzz(days: number): number {
  return days * (0.9 + Math.random() * 0.2);
}

// Seed stability/difficulty from the Elo expectation: an item the user is
// ~certain to get right (p→1) starts at ~8.5 days and low difficulty; a coin
// flip (p=0.5) starts at ~2.5 days; a near-certain miss starts at half a day.
function seedFromElo(itemRating: number, ability: number): { stability: number; difficulty: number } {
  const p = expectedScore(ability, itemRating);
  return {
    stability: clamp(0.5 + 8 * p * p, 0.5, 10),
    difficulty: clamp(8 - 6 * p, 1, 10),
  };
}

export function createCard(
  itemId: string,
  promptType: PromptType,
  itemRating: number,
  ability: number,
  now = Date.now(),
): SrsCard {
  const { stability, difficulty } = seedFromElo(itemRating, ability);
  return {
    itemId, promptType, stability, difficulty,
    dueAt: now + fuzz(stability) * DAY_MS,
    reps: 0, lapses: 0, lastReviewAt: now,
  };
}

// Backfill for users with attempt history from before SRS existed. Consecutive
// correct answers extend the seeded stability (capped at 4×); the item counts
// as last reviewed when it was last seen. Items never attempted get no card —
// they are "new" material, introduced through Learn, not Review.
export function seedCardFromHistory(
  progress: CountryProgress,
  promptType: PromptType,
  ability: number,
  now = Date.now(),
): SrsCard | null {
  const attempts = promptType === 'country' ? progress.countryAttempts : progress.capitalAttempts;
  if (attempts === 0) return null;
  const rating = promptType === 'country' ? progress.countryRating : progress.capitalRating;
  const consecutive = promptType === 'country'
    ? progress.countryConsecutiveCorrect : progress.capitalConsecutiveCorrect;
  const lastSeen = (promptType === 'country' ? progress.countryLastSeen : progress.capitalLastSeen) || now;
  const seeded = seedFromElo(rating, ability);
  const stability = clamp(seeded.stability * Math.min(1 + 0.4 * consecutive, 4), MIN_STABILITY_DAYS, MAX_STABILITY_DAYS);
  return {
    itemId: progress.countryId, promptType,
    stability,
    difficulty: seeded.difficulty,
    dueAt: lastSeen + stability * DAY_MS,
    reps: attempts,
    lapses: 0,
    lastReviewAt: lastSeen,
  };
}

export function reviewCard(card: SrsCard, grade: SrsGrade, now = Date.now()): SrsCard {
  if (grade === 'again') {
    return {
      ...card,
      stability: Math.max(MIN_STABILITY_DAYS, card.stability * LAPSE_STABILITY_FACTOR),
      difficulty: clamp(card.difficulty + 1, 1, 10),
      dueAt: now, // still due — resurfaces immediately in the next review session
      reps: card.reps + 1,
      lapses: card.lapses + 1,
      lastReviewAt: now,
    };
  }

  // Reviewing at/after the due date grows stability more than cramming early —
  // the spacing effect, bounded so a very late review isn't over-rewarded.
  const elapsedDays = Math.max(0, now - card.lastReviewAt) / DAY_MS;
  const spacingBonus = clamp(elapsedDays / Math.max(card.stability, 0.1), 0.5, 1.5);
  // Harder items grow slower: difficulty 1 → ×1.24, difficulty 10 → ×0.7.
  const difficultyFactor = 1.3 - 0.06 * card.difficulty;
  const growth = GROWTH_BASE[grade] * difficultyFactor * spacingBonus;

  const stability = clamp(card.stability * Math.max(growth, 1.05), MIN_STABILITY_DAYS, MAX_STABILITY_DAYS);
  const difficultyDrift = { hard: 0.4, good: -0.1, easy: -0.4 }[grade];
  return {
    ...card,
    stability,
    difficulty: clamp(card.difficulty + difficultyDrift, 1, 10),
    dueAt: now + fuzz(stability) * DAY_MS,
    reps: card.reps + 1,
    lastReviewAt: now,
  };
}

// End of the local calendar day — "due today" matches the daysPlayed convention
// of local dates, so a card due at 9pm shows up in the morning's count.
export function endOfToday(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function isDue(card: SrsCard, now = Date.now()): boolean {
  return card.dueAt <= endOfToday(now);
}

export function dueCounts(cards: SrsCard[], now = Date.now()): { today: number; week: number } {
  const today = endOfToday(now);
  const week = today + 6 * DAY_MS;
  let dueToday = 0;
  let dueWeek = 0;
  for (const c of cards) {
    if (c.dueAt <= today) dueToday++;
    if (c.dueAt <= week) dueWeek++;
  }
  return { today: dueToday, week: dueWeek };
}
