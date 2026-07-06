export type GameMode = 'country' | 'capital' | 'both' | 'practice' | 'learn' | 'review' | 'versus';
export type PromptType = 'country' | 'capital';
export type Topic = 'world' | 'us-states';
export type GamePhase = 'idle' | 'playing' | 'paused' | 'gameover' | 'teaching';
export type CountryColorState = 'default' | 'current' | 'correct' | 'skipped' | 'wrong' | 'teaching';
export type MatchTier = 'correct' | 'fuzzy' | 'wrong';

export interface CountryEntry {
  id: string;
  alpha2?: string; // ISO 3166-1 alpha-2, lowercase — keys public/flags/{alpha2}.svg
  name: string;
  altNames: string[];
  capital: string;
  altCapitals: string[];
  region: string;
  difficulty: 1 | 2 | 3;
  independent: boolean;
}

// How the user answers: typing the name, clicking the place on the map, or
// naming the country whose flag is shown (typed, but prompted by the flag).
export type AnswerFormat = 'typed' | 'locate' | 'flag';

export interface GamePrompt {
  countryId: string;
  promptType: PromptType;
  displayText: string;
  answerFormat?: AnswerFormat; // absent = typed
}

export interface AttemptResult {
  countryId: string;
  promptType: PromptType;
  userInput: string;
  correct: boolean;
  fuzzyScore: number;
  timeTaken: number;
  pointsAwarded: number;
  confusedWithId?: string; // the country whose name/capital the wrong answer matched
  hintUsed?: boolean;
  answerFormat?: AnswerFormat;
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
  topic?: Topic;
  timeLimitSeconds: number;
  noTimeLimit: boolean;
  blindMode: boolean;
  regionFilter: string[];
  includeDependent: boolean;
  practicePrompts?: 'country' | 'capital' | 'both';
  versusPrompts?: 'country' | 'capital' | 'both';
  answerFormats?: AnswerFormat | 'mixed'; // default 'typed'; 'mixed' ≈ 50/50 on country prompts
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
  countryRating: number; // per-user Elo difficulty, seeded from static difficulty
  capitalRating: number;
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
  countryAbility: number; // per-user Elo ability, default 1500
  capitalAbility: number;
}

// Spaced-repetition grade derived from an attempt (no explicit rating buttons).
export type SrsGrade = 'again' | 'hard' | 'good' | 'easy';

// Cross-session review schedule for one (item, promptType) pair.
export interface SrsCard {
  itemId: string;
  promptType: PromptType;
  stability: number; // days until recall probability decays to ~90%
  difficulty: number; // 1 (easy) .. 10 (hard)
  dueAt: number; // epoch ms
  reps: number;
  lapses: number;
  lastReviewAt: number; // epoch ms
}

// A directed confusion edge: shown `shownId`, the user answered with `answeredId`.
export interface ConfusionEdge {
  shownId: string;
  answeredId: string;
  promptType: PromptType;
  count: number;
  lastSeen: number;
}

// A symmetric confusion pair for display ("Slovenia ↔ Slovakia · 7 times").
export interface ConfusionPair {
  aId: string;
  bId: string;
  promptType: PromptType;
  count: number;
}

// Two items frequently missed in the same session ("correlated mistakes").
export interface ComissPair {
  aId: string;
  bId: string;
  count: number;
}

export interface UserSettings {
  mode: GameMode;
  topic?: Topic;
  timeLimitSeconds: number;
  noTimeLimit: boolean;
  blindMode: boolean;
  regionFilter: string[];
  includeDependent: boolean;
  practicePrompts?: 'country' | 'capital' | 'both';
  versusPrompts?: 'country' | 'capital' | 'both';
  answerFormats?: AnswerFormat | 'mixed';
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
