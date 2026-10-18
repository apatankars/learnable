import type { CountryEntry } from '../types';
import { formatPopulation, getFunFacts, getStats, redactFact } from './facts';

export type FactQuestionKind = 'population' | 'government' | 'currency' | 'language' | 'which-country' | 'more-people' | 'landlocked';

export interface FactQuestion {
  kind: FactQuestionKind;
  countryId: string;
  prompt: string;
  clue?: string;     // a quoted fact shown under the prompt
  options: string[];
  answer: string;
  explain: string;   // shown after answering
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Up to `n` distinct distractor values, preferring the same region (harder,
// more useful contrasts) and topping up from the whole world.
function distractors(
  country: CountryEntry,
  pool: CountryEntry[],
  n: number,
  valueOf: (c: CountryEntry) => string | null | undefined,
  exclude: Set<string>,
): string[] {
  const seen = new Set(exclude);
  const out: string[] = [];
  const sameRegion = shuffle(pool.filter(c => c.region === country.region && c.id !== country.id));
  const rest = shuffle(pool.filter(c => c.region !== country.region));
  for (const c of [...sameRegion, ...rest]) {
    const v = valueOf(c);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length === n) break;
  }
  return out;
}

function mc(kind: FactQuestionKind, country: CountryEntry, prompt: string, answer: string, wrong: string[], explain: string, clue?: string): FactQuestion | null {
  if (wrong.length < 2) return null;
  return { kind, countryId: country.id, prompt, clue, answer, options: shuffle([answer, ...wrong]), explain };
}

export function buildQuestion(kind: FactQuestionKind, country: CountryEntry, pool: CountryEntry[], factIndex = 0): FactQuestion | null {
  const s = getStats(country.id);
  if (!s) return null;
  const name = country.name;

  switch (kind) {
    case 'population': {
      // Distractors must be clearly different (≥ ~40% apart) so the question
      // tests order of magnitude, not memorised digits.
      const others = shuffle(pool.filter(c => c.id !== country.id))
        .map(c => getStats(c.id)?.population ?? 0)
        .filter(p => p > 0);
      const picked: number[] = [];
      for (const p of others) {
        if ([s.population, ...picked].every(q => Math.max(p, q) / Math.min(p, q) > 1.4)) picked.push(p);
        if (picked.length === 3) break;
      }
      const answer = formatPopulation(s.population);
      return mc('population', country, `Roughly how many people live in ${name}?`, answer,
        picked.map(formatPopulation), `${name} has about ${answer} people.`);
    }
    case 'government': {
      const wrong = distractors(country, pool, 3, c => getStats(c.id)?.government, new Set([s.government]));
      return mc('government', country, `What type of government does ${name} have?`, s.government, wrong,
        `${name}'s government: ${s.government}.`);
    }
    case 'currency': {
      if (!s.currency) return null;
      const wrong = distractors(country, pool, 3, c => getStats(c.id)?.currency, new Set([s.currency]));
      return mc('currency', country, `Which currency is used in ${name}?`, s.currency, wrong,
        `${name} uses the ${s.currency}.`);
    }
    case 'language': {
      if (!s.languages.length) return null;
      const answer = s.languages[0];
      const own = new Set(s.languages);
      const wrong = distractors(country, pool, 3, c => getStats(c.id)?.languages.find(l => !own.has(l)), own);
      return mc('language', country, `Which is an official language of ${name}?`, answer, wrong,
        `Official language${s.languages.length > 1 ? 's' : ''} of ${name}: ${s.languages.slice(0, 4).join(', ')}${s.languages.length > 4 ? '…' : ''}.`);
    }
    case 'which-country': {
      const facts = getFunFacts(country.id);
      if (!facts.length) return null;
      const fact = facts[factIndex % facts.length];
      const wrong = shuffle(pool.filter(c => c.region === country.region && c.id !== country.id)).slice(0, 3).map(c => c.name);
      return mc('which-country', country, 'Which country is this about?', name, wrong,
        `That's ${name}.`, `“${redactFact(fact, country)}”`);
    }
    case 'more-people': {
      const rival = shuffle(pool.filter(c => c.id !== country.id && c.region === country.region))
        .find(c => {
          const p = getStats(c.id)?.population ?? 0;
          return p > 0 && Math.max(p, s.population) / Math.min(p, s.population) > 1.15;
        });
      if (!rival) return null;
      const rp = getStats(rival.id)!.population;
      const answer = s.population > rp ? name : rival.name;
      return {
        kind, countryId: country.id, prompt: 'Which has more people?', answer,
        options: shuffle([name, rival.name]),
        explain: `${name}: ${formatPopulation(s.population)} · ${rival.name}: ${formatPopulation(rp)}.`,
      };
    }
    case 'landlocked': {
      const answer = s.landlocked ? 'Landlocked' : 'Has a coastline';
      return {
        kind, countryId: country.id, prompt: `Is ${name} landlocked?`, answer,
        options: ['Landlocked', 'Has a coastline'],
        explain: s.landlocked ? `${name} has no coastline.` : `${name} touches the sea.`,
      };
    }
  }
}

// Two quick checks right after a fact card: always one key stat (population or
// government — the headline facts) plus one other angle.
export function questionsForCountry(country: CountryEntry, pool: CountryEntry[]): FactQuestion[] {
  const headline: FactQuestionKind[] = shuffle(['population', 'government']);
  const extra: FactQuestionKind[] = shuffle(['currency', 'language', 'which-country', 'more-people', 'landlocked']);
  const out: FactQuestion[] = [];
  for (const k of headline) {
    const q = buildQuestion(k, country, pool);
    if (q) { out.push(q); break; }
  }
  for (const k of extra) {
    const q = buildQuestion(k, country, pool, Math.floor(Math.random() * 3));
    if (q) { out.push(q); break; }
  }
  return out;
}
