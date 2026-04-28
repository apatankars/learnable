import Fuse from 'fuse.js';
import type { CountryEntry, MatchResult, MatchTier } from '../types';
import countriesData from '../data/countries.json';

const countries = countriesData as CountryEntry[];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');
}

const searchDocs = countries.map(c => ({
  ...c,
  _name: normalize(c.name),
  _altNames: c.altNames.map(normalize),
  _capital: normalize(c.capital),
  _altCapitals: c.altCapitals.map(normalize),
}));

const searchDocById = new Map(searchDocs.map(d => [d.id, d]));

const FUSE_OPTS_BASE = {
  threshold: 0.4,
  distance: 150,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

// Pre-build one Fuse instance per country for capital matching (avoids reconstruction on every submission)
const capitalFuseMap = new Map(
  searchDocs.map(d => [
    d.id,
    new Fuse([d], { ...FUSE_OPTS_BASE, keys: ['_capital', '_altCapitals'] }),
  ])
);

const countryFuse = new Fuse(searchDocs, {
  ...FUSE_OPTS_BASE,
  keys: [
    { name: '_name', weight: 0.7 },
    { name: '_altNames', weight: 0.3 },
  ],
});


// Tiers: exact (0–0.05) = 'correct' with perfect bonus
//        fuzzy (0.05–0.4) = 'fuzzy' (accepted, no perfect bonus)
//        wrong (>0.4)     = 'wrong'
function scoreTier(fuseScore: number): MatchTier {
  if (fuseScore <= 0.05) return 'correct';
  if (fuseScore <= 0.4) return 'fuzzy';
  return 'wrong';
}

export function matchCountry(input: string, targetId?: string): MatchResult | null {
  const norm = normalize(input);
  if (!norm) return null;

  const results = countryFuse.search(norm);
  if (!results.length) return null;

  const best = results[0];
  const score = best.score ?? 1;

  // Wrong country identified
  if (targetId && best.item.id !== targetId) {
    return { tier: 'wrong', matchedName: best.item.name, countryId: best.item.id, score };
  }

  return { tier: scoreTier(score), matchedName: best.item.name, countryId: best.item.id, score };
}

export function matchCapital(input: string, targetId: string): MatchResult | null {
  const norm = normalize(input);
  if (!norm) return null;

  const target = searchDocById.get(targetId);
  if (!target) return null;

  const directFuse = capitalFuseMap.get(targetId);
  if (!directFuse) return { tier: 'wrong', matchedName: target.capital, countryId: targetId, score: 1 };

  const directMatch = directFuse.search(norm);

  if (directMatch.length) {
    const directScore = directMatch[0].score ?? 1;
    return {
      tier: scoreTier(directScore),
      matchedName: target.capital,
      countryId: targetId,
      score: directScore,
    };
  }

  return { tier: 'wrong', matchedName: target.capital, countryId: targetId, score: 1 };
}

export function matchFreeCountry(input: string): MatchResult | null {
  const norm = normalize(input);
  if (!norm) return null;
  const results = countryFuse.search(norm);
  if (!results.length) return null;
  const best = results[0];
  const score = best.score ?? 1;
  return { tier: scoreTier(score), matchedName: best.item.name, countryId: best.item.id, score };
}
