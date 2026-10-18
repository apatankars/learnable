import type { CountryEntry } from '../types';
import statsData from '../data/countryStats.json';
import africa from '../data/facts/africa.json';
import americas from '../data/facts/americas.json';
import asia from '../data/facts/asia.json';
import europe from '../data/facts/europe.json';
import oceania from '../data/facts/oceania.json';

// Key stats come from scripts/build-country-stats.py (World Bank population,
// mledoze/countries, hand-curated government types); fun facts are hand-written
// per region and phrased so they never name the country itself, which lets them
// double as "which country is this?" questions.
export interface CountryStats {
  population: number;
  government: string;
  area: number; // km²
  languages: string[];
  currency: string | null;
  demonym: string | null;
  landlocked: boolean;
  subregion: string;
}

const stats = statsData as Record<string, CountryStats>;
const funFacts: Record<string, string[]> = { ...africa, ...americas, ...asia, ...europe, ...oceania };

// Terracotta accent shared by the Facts mode and the sprinkled "Did you know?" cards.
export const FACTS_ACCENT = {
  line: '#1f1a2e',
  text: '#1f1a2e',
  tint: '#d6f0fd',
  glow: 'rgba(31,26,46,0.2)',
};

export function getStats(id: string): CountryStats | undefined {
  return stats[id];
}

export function getFunFacts(id: string): string[] {
  return funFacts[id] ?? [];
}

export function hasFacts(id: string): boolean {
  return id in stats && (funFacts[id]?.length ?? 0) > 0;
}

// A stable-but-varied fun fact: the same (id, salt) always picks the same fact,
// so a fact doesn't flicker on re-render, while different salts rotate through.
export function pickFunFact(id: string, salt = 0): string | undefined {
  const list = funFacts[id];
  if (!list?.length) return undefined;
  let h = salt;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return list[Math.abs(h) % list.length];
}

export function formatPopulation(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(/\.?0+$/, '')} billion`;
  if (n >= 1e7) return `${Math.round(n / 1e6)} million`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')} million`;
  if (n >= 1e4) return `${Math.round(n / 1e3)},000`;
  return n.toLocaleString('en-US');
}

export function formatArea(n: number): string {
  return `${n.toLocaleString('en-US')} km²`;
}

// Hide the country's own name, demonym and capital in a fact shown as a
// "which country?" clue (e.g. "Lake Chad" → "Lake ▢▢▢").
export function redactFact(text: string, country: CountryEntry): string {
  const words = [country.name, ...country.altNames, stats[country.id]?.demonym ?? '', country.capital]
    .filter(w => w && w.length >= 4)
    .sort((a, b) => b.length - a.length);
  let out = text;
  for (const w of words) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, '▢▢▢');
  }
  return out;
}
