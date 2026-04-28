import { useCallback } from 'react';
import type { CountryProgress, GameMode, GamePrompt, PromptType } from '../types';
import type { CountryEntry } from '../types';
import { getMastery } from '../lib/progressStorage';
import { weightedPick } from '../lib/weightedRandom';
import countriesData from '../data/countries.json';

const allCountries = countriesData as CountryEntry[];

function computeWeight(p: CountryProgress | undefined, promptType: PromptType): number {
  if (!p) return 3.0;
  const attempts = promptType === 'country' ? p.countryAttempts : p.capitalAttempts;
  if (attempts === 0) return 3.0;
  const mastery = getMastery(p, promptType);
  const consecutive = promptType === 'country' ? p.countryConsecutiveCorrect : p.capitalConsecutiveCorrect;
  const lastSeen = promptType === 'country' ? p.countryLastSeen : p.capitalLastSeen;
  const recencyBoost = Math.max(0, 1 - (Date.now() - lastSeen) / (7 * 24 * 3600 * 1000));
  const weaknessWeight = (1 - mastery) * 5;
  const consecutivePenalty = Math.min(consecutive * 0.3, 2.0);
  return Math.max(0.1, weaknessWeight - consecutivePenalty + recencyBoost * 0.5);
}

export function useWeightedQueue(
  progress: Record<string, CountryProgress>,
  mode: GameMode,
  regionFilter: string[],
  includeDependent: boolean
) {
  const getFiltered = useCallback(() => {
    return allCountries.filter(c => {
      if (!includeDependent && !c.independent) return false;
      if (regionFilter.length > 0 && !regionFilter.includes(c.region)) return false;
      return true;
    });
  }, [regionFilter, includeDependent]);

  const nextPrompt = useCallback((): GamePrompt => {
    const filtered = getFiltered();
    const promptTypes: PromptType[] = mode === 'country' ? ['country'] : mode === 'capital' ? ['capital'] : ['country', 'capital'];

    // Build item+weight pairs
    const items: { country: CountryEntry; promptType: PromptType }[] = [];
    const weights: number[] = [];

    for (const country of filtered) {
      for (const pt of promptTypes) {
        items.push({ country, promptType: pt });
        weights.push(computeWeight(progress[country.id], pt));
      }
    }

    const picked = weightedPick(items, weights);
    const { country, promptType } = picked;

    const displayText = promptType === 'country'
      ? 'Name the highlighted country'
      : `What is the capital of ${country.name}?`;

    return { countryId: country.id, promptType, displayText };
  }, [getFiltered, mode, progress]);

  return { nextPrompt };
}
