import type { GameSettings, VersusPowerup } from '../types';

export const VERSUS_POWERUP_LABELS: Record<VersusPowerup, string> = {
  scout: 'Scout',
  'time-bank': 'Time Bank',
  'streak-shield': 'Streak Shield',
  fog: 'Fog',
  lock: 'Freeze',
};

export const VERSUS_POWERUP_DESCRIPTIONS: Record<VersusPowerup, string> = {
  scout: 'Reveal the first letter of the next answer.',
  'time-bank': 'Add 5 seconds to your clock.',
  'streak-shield': 'Protect your streak from one miss or skip.',
  fog: 'Blur the opponent map or add input noise.',
  lock: 'Freeze the opponent submit action for 3 seconds.',
};

export const POWERUP_COOLDOWN_MS = 6000;
export const FOG_DURATION_MS = 4000;
export const FOG_CAPITAL_DURATION_MS = 3000;
export const LOCK_DURATION_MS = 3000;
export const TIME_BANK_SECONDS = 5;
export const MAX_HELD_POWERUPS = 2;

export function getEligiblePowerups(settings: GameSettings): VersusPowerup[] {
  const base: VersusPowerup[] = ['scout', 'streak-shield', 'fog', 'lock'];
  if (!settings.noTimeLimit) {
    base.splice(1, 0, 'time-bank');
  }
  return base;
}

export function drawRandomPowerup(settings: GameSettings): VersusPowerup {
  const pool = getEligiblePowerups(settings);
  return pool[Math.floor(Math.random() * pool.length)];
}
