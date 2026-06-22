export type GameMode = 'country' | 'capital' | 'both' | 'practice' | 'learn' | 'versus';
export type PromptType = 'country' | 'capital';
export type GamePhase = 'idle' | 'playing' | 'paused' | 'gameover' | 'teaching';
export type CountryColorState = 'default' | 'current' | 'correct' | 'skipped' | 'wrong' | 'teaching';
export type MatchTier = 'correct' | 'fuzzy' | 'wrong';

export interface CountryEntry {
  id: string;
  name: string;
  altNames: string[];
  capital: string;
  altCapitals: string[];
  region: string;
  difficulty: 1 | 2 | 3;
  independent: boolean;
}

export interface GamePrompt {
  countryId: string;
  promptType: PromptType;
  displayText: string;
}

export interface AttemptResult {
  countryId: string;
  promptType: PromptType;
  userInput: string;
  correct: boolean;
  fuzzyScore: number;
  timeTaken: number;
  pointsAwarded: number;
}

export interface GameSession {
  mode: GameMode;
  timeLimitSeconds: number;
  noTimeLimit: boolean;
  blindMode: boolean;
  score: number;
  streak: number;
  maxStreak: number;
  answered: Set<string>;
  skipped: Set<string>;
  wrong: Set<string>;
  attempts: AttemptResult[];
  phase: GamePhase;
  currentPrompt: GamePrompt | null;
  timeRemaining: number;
  failsOnCurrentPrompt: number;
  totalQuestions: number;
}

export interface GameSettings {
  mode: GameMode;
  timeLimitSeconds: number;
  noTimeLimit: boolean;
  blindMode: boolean;
  regionFilter: string[];
  includeDependent: boolean;
  practicePrompts?: 'country' | 'capital' | 'both';
  versusPrompts?: 'country' | 'capital' | 'both';
}

export interface MatchResult {
  tier: MatchTier;
  matchedName: string;
  countryId: string;
  score: number;
}

export interface CountryProgress {
  countryId: string;
  countryAttempts: number;
  countryCorrect: number;
  countryLastSeen: number;
  countryConsecutiveCorrect: number;
  capitalAttempts: number;
  capitalCorrect: number;
  capitalLastSeen: number;
  capitalConsecutiveCorrect: number;
}

export interface ModeStat {
  sessions: number;
  bestScore: number;
  totalScore: number;
}

export interface GlobalStats {
  totalSessions: number;
  totalScore: number;
  bestScore: number;
  bestStreak: number;
  daysPlayed: string[];
  lastPlayed: number;
  versusWins: number;
  versusLosses: number;
  modeStats: Record<string, ModeStat>;
}

export interface UserSettings {
  mode: GameMode;
  timeLimitSeconds: number;
  noTimeLimit: boolean;
  blindMode: boolean;
  regionFilter: string[];
  includeDependent: boolean;
  practicePrompts?: 'country' | 'capital' | 'both';
  versusPrompts?: 'country' | 'capital' | 'both';
}

export type TimeMode = 'blitz' | 'standard' | 'infinite';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  score: number;
  updatedAt: string;
}

export type VersusPowerup = 'scout' | 'time-bank' | 'streak-shield' | 'fog' | 'lock';
export type VersusEffectType = VersusPowerup;
export type VersusStreakRewardState = 'none' | 'earned3' | 'earned5';

export interface VersusActiveEffect {
  type: VersusEffectType;
  sourceUserId: string;
  sourceUsername: string;
  targetUserId: string;
  startedAt: number;
  expiresAt?: number;
  promptIndex?: number;
  promptsRemaining?: number;
  applyToNextPrompt?: boolean;
}

export interface VersusEffectLogEntry {
  id: string;
  message: string;
  createdAt: number;
  targetUserId?: string;
}

export interface VersusPlayerState {
  userId: string;
  username: string;
  emoji: string;
  score: number;
  timeRemaining: number;
  phase: GamePhase;
  streak: number;
  currentPromptIndex: number;
  heldPowerups: VersusPowerup[];
  activeEffect: VersusActiveEffect | null;
  powerupCooldownUntil: number;
  currentCorrectStreakRewardState: VersusStreakRewardState;
}

export interface VersusLobbyState {
  roomCode: string;
  hostId: string;
  players: VersusPlayerState[];
  status: 'waiting' | 'starting' | 'playing' | 'finished';
  settings?: GameSettings;
  queue?: GamePrompt[];
  effectLog?: VersusEffectLogEntry[];
}

export type RealtimeMessageType = 
  | 'START_GAME'
  | 'UPDATE_STATE'
  | 'GAME_OVER'
  | 'USE_POWERUP'
  | 'APPLY_EFFECT'
  | 'EXPIRE_EFFECT'
  | 'SYNC_POWERUP_STATE';

export type RealtimeMessage =
  | {
    type: 'START_GAME';
    payload: { queue: GamePrompt[]; settings: GameSettings };
  }
  | {
    type: 'UPDATE_STATE';
    payload: { userId: string; state: VersusPlayerState };
  }
  | {
    type: 'USE_POWERUP';
    payload: { userId: string; username: string; powerup: VersusPowerup; targetUserId?: string; message: string };
  }
  | {
    type: 'APPLY_EFFECT';
    payload: { userId: string; effect: VersusActiveEffect; message: string };
  }
  | {
    type: 'EXPIRE_EFFECT';
    payload: { userId: string; effectType: VersusEffectType };
  }
  | {
    type: 'SYNC_POWERUP_STATE';
    payload: { userId: string; patch: Partial<VersusPlayerState> };
  }
  | {
    type: 'GAME_OVER';
    payload: null;
  };
