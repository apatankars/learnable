import type { CountryProgress, GameSettings, PromptType } from '../types';
import { getDataset } from './dataset';

// An item the user has already demonstrably learned: a run of consecutive
// correct answers on a strong overall record. Learn's default 'resume' scope
// never re-introduces these — long-term retention is the SRS reviewer's job
// (see srs.ts) — except as a last-resort fallback when everything in the
// current filter is known.
export function isAlreadyKnown(p: CountryProgress | undefined, promptType: PromptType): boolean {
  if (!p) return false;
  const attempts = promptType === 'country' ? p.countryAttempts : p.capitalAttempts;
  if (attempts < 2) return false;
  const correct = promptType === 'country' ? p.countryCorrect : p.capitalCorrect;
  const consecutive = promptType === 'country'
    ? p.countryConsecutiveCorrect : p.capitalConsecutiveCorrect;
  return consecutive >= 2 && correct / attempts >= 0.75;
}

export function learnPromptTypes(settings: GameSettings): PromptType[] {
  const p = settings.practicePrompts || 'both';
  return p === 'country' ? ['country']
    : p === 'capital' ? ['capital']
    : ['country', 'capital'];
}

// Country-level counts for a Learn session under the current filters.
// `total` = countries in the filter; `remaining` = countries with at least one
// selected prompt type not yet learned. Drives the scope-chooser preview on the
// home screen and the in-game progress bar denominator.
export function learnPoolCounts(
  settings: GameSettings,
  progressData: Record<string, CountryProgress>,
): { total: number; remaining: number } {
  const entries = getDataset(settings.topic).entries.filter(c => {
    if (!settings.includeDependent && !c.independent) return false;
    if (settings.regionFilter.length > 0 && !settings.regionFilter.includes(c.region)) return false;
    return true;
  });
  const promptTypes = learnPromptTypes(settings);
  let remaining = 0;
  for (const c of entries) {
    if (promptTypes.some(pt => !isAlreadyKnown(progressData[c.id], pt))) remaining++;
  }
  return { total: entries.length, remaining };
}
