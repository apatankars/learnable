import type { CountryEntry, Topic } from '../types';
import countriesData from '../data/countries.json';
import statesData from '../data/states.json';
import bordersData from '../data/borders.json';

// Land-border adjacency, keyed by alpha3 id (world topic only — US states have
// no border data). Used in Learn mode to show a country in the context of its
// neighbours.
const borders = bordersData as Record<string, string[]>;

// Bordering country ids for `id`, most useful for the 'world' topic. Returns an
// empty array for island nations, unknown ids, or the us-states topic.
export function getBorders(topic: Topic | undefined, id: string): string[] {
  return normalizeTopic(topic) === 'world' ? borders[id] ?? [] : [];
}

const countries = countriesData as CountryEntry[];
const states = statesData as CountryEntry[];

export interface Dataset {
  entries: CountryEntry[];
  byId: Map<string, CountryEntry>;
  regions: string[];
}

const WORLD_REGIONS = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'];
const US_REGIONS = ['Northeast', 'Midwest', 'South', 'West'];

const DATASETS: Record<Topic, Dataset> = {
  world: {
    entries: countries,
    byId: new Map(countries.map(c => [c.id, c])),
    regions: WORLD_REGIONS,
  },
  'us-states': {
    entries: states,
    byId: new Map(states.map(s => [s.id, s])),
    regions: US_REGIONS,
  },
};

export function normalizeTopic(topic: Topic | undefined): Topic {
  return topic === 'us-states' ? 'us-states' : 'world';
}

export function getDataset(topic: Topic | undefined): Dataset {
  return DATASETS[normalizeTopic(topic)];
}

export function getRegions(topic: Topic | undefined): string[] {
  return getDataset(topic).regions;
}
