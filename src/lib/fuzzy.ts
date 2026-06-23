import Fuse from 'fuse.js';
import type { CountryEntry, MatchResult, MatchTier, Topic } from '../types';
import { getDataset, normalizeTopic } from './dataset';

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, ' ');
}

interface SearchDoc extends CountryEntry {
  _name: string;
  _altNames: string[];
  _capital: string;
  _altCapitals: string[];
}

const MIN_FUZZY_LENGTH = 3;

const FUSE_OPTS_BASE = {
  threshold: 0.4,
  distance: 150,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

interface TopicIndex {
  searchDocs: SearchDoc[];
  searchDocById: Map<string, SearchDoc>;
  capitalFuseMap: Map<string, Fuse<SearchDoc>>;
  nameFuse: Fuse<SearchDoc>;
}

function buildIndex(topic: Topic): TopicIndex {
  const entries = getDataset(topic).entries;
  const searchDocs: SearchDoc[] = entries.map(c => ({
    ...c,
    _name: normalize(c.name),
    _altNames: c.altNames.map(normalize),
    _capital: normalize(c.capital),
    _altCapitals: c.altCapitals.map(normalize),
  }));

  const searchDocById = new Map(searchDocs.map(d => [d.id, d]));

  const capitalFuseMap = new Map(
    searchDocs.map(d => [
      d.id,
      new Fuse([d], { ...FUSE_OPTS_BASE, keys: ['_capital', '_altCapitals'] }),
    ]),
  );

  const nameFuse = new Fuse(searchDocs, {
    ...FUSE_OPTS_BASE,
    keys: [
      { name: '_name', weight: 0.7 },
      { name: '_altNames', weight: 0.3 },
    ],
  });

  return { searchDocs, searchDocById, capitalFuseMap, nameFuse };
}

const indexCache = new Map<Topic, TopicIndex>();

function getIndex(topic: Topic | undefined): TopicIndex {
  const t = normalizeTopic(topic);
  let index = indexCache.get(t);
  if (!index) {
    index = buildIndex(t);
    indexCache.set(t, index);
  }
  return index;
}

// Tiers: exact (0–0.05) = 'correct' with perfect bonus
//        fuzzy (0.05–0.4) = 'fuzzy' (accepted, no perfect bonus)
//        wrong (>0.4)     = 'wrong'
function scoreTier(fuseScore: number): MatchTier {
  if (fuseScore <= 0.05) return 'correct';
  if (fuseScore <= 0.4) return 'fuzzy';
  return 'wrong';
}

function exactNameMatch(index: TopicIndex, norm: string) {
  for (const doc of index.searchDocs) {
    if (doc._name === norm || doc._altNames.includes(norm)) {
      return doc;
    }
  }
  return null;
}

function exactCapitalMatch(index: TopicIndex, norm: string, targetId: string) {
  const target = index.searchDocById.get(targetId);
  if (!target) return null;
  if (target._capital === norm || target._altCapitals.includes(norm)) {
    return target;
  }
  return null;
}

export function matchCountry(input: string, targetId?: string, topic?: Topic): MatchResult | null {
  const index = getIndex(topic);
  const norm = normalize(input);
  if (!norm) return null;

  const exact = exactNameMatch(index, norm);
  if (exact) {
    const result: MatchResult = {
      tier: 'correct',
      matchedName: exact.name,
      countryId: exact.id,
      score: 0,
    };
    if (targetId && exact.id !== targetId) {
      return { ...result, tier: 'wrong' };
    }
    return result;
  }

  if (norm.length < MIN_FUZZY_LENGTH) return null;

  const results = index.nameFuse.search(norm);
  if (!results.length) return null;

  const best = results[0];
  const score = best.score ?? 1;

  // Wrong target identified
  if (targetId && best.item.id !== targetId) {
    return { tier: 'wrong', matchedName: best.item.name, countryId: best.item.id, score };
  }

  return { tier: scoreTier(score), matchedName: best.item.name, countryId: best.item.id, score };
}

export function matchCapital(input: string, targetId: string, topic?: Topic): MatchResult | null {
  const index = getIndex(topic);
  const norm = normalize(input);
  if (!norm) return null;

  const target = index.searchDocById.get(targetId);
  if (!target) return null;

  const exact = exactCapitalMatch(index, norm, targetId);
  if (exact) {
    return {
      tier: 'correct',
      matchedName: target.capital,
      countryId: targetId,
      score: 0,
    };
  }

  if (norm.length < MIN_FUZZY_LENGTH) return null;

  const directFuse = index.capitalFuseMap.get(targetId);
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

export function matchFreeCountry(input: string, topic?: Topic): MatchResult | null {
  const index = getIndex(topic);
  const norm = normalize(input);
  if (!norm) return null;
  const exact = exactNameMatch(index, norm);
  if (exact) {
    return { tier: 'correct', matchedName: exact.name, countryId: exact.id, score: 0 };
  }
  if (norm.length < MIN_FUZZY_LENGTH) return null;
  const results = index.nameFuse.search(norm);
  if (!results.length) return null;
  const best = results[0];
  const score = best.score ?? 1;
  return { tier: scoreTier(score), matchedName: best.item.name, countryId: best.item.id, score };
}
