import { GlobeMap } from './GlobeMap';
import type { CountryColorState } from '../../types';

interface GameMapProps {
  answeredKeys: Set<string>;
  skippedKeys: Set<string>;
  wrongKeys: Set<string>;
  currentId: string | null;
  promptType: 'country' | 'capital' | null;
  isTeaching?: boolean;
  promptIndex?: number;
}

export function GameMap({ answeredKeys, skippedKeys, wrongKeys, currentId, promptType, isTeaching, promptIndex = 0 }: GameMapProps) {
  const colorMap: Record<string, CountryColorState> = {};

  for (const key of skippedKeys) {
    const [id] = key.split(':');
    colorMap[id] = 'skipped';
  }

  for (const key of wrongKeys) {
    const [id] = key.split(':');
    colorMap[id] = 'wrong';
  }

  for (const key of answeredKeys) {
    const [id] = key.split(':');
    colorMap[id] = 'correct';
  }

  if (currentId) {
    colorMap[currentId] = isTeaching || promptType === null ? 'teaching' : 'current';
  }

  return <GlobeMap colorMap={colorMap} currentId={currentId} promptIndex={promptIndex} />;
}
