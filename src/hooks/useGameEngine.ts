import { useReducer, useCallback } from 'react';
import type {
  GameSession, GameSettings, GamePrompt, AttemptResult, PromptType
} from '../types';
import type { CountryEntry } from '../types';
import { matchCountry, matchCapital } from '../lib/fuzzy';
import { calculatePoints } from '../lib/scoring';
import countriesData from '../data/countries.json';

const allCountries = countriesData as CountryEntry[];
const countryById = new Map(allCountries.map(c => [c.id, c]));

function getPromptTypes(settings: GameSettings): PromptType[] {
  if (settings.mode === 'country') return ['country'];
  if (settings.mode === 'capital') return ['capital'];
  if (settings.mode === 'practice' || settings.mode === 'learn') {
    if (settings.practicePrompts === 'country') return ['country'];
    if (settings.practicePrompts === 'capital') return ['capital'];
    return ['country', 'capital'];
  }
  if (settings.mode === 'versus') {
    if (settings.versusPrompts === 'country') return ['country'];
    if (settings.versusPrompts === 'capital') return ['capital'];
    return ['country', 'capital'];
  }
  return ['country', 'capital'];
}

export function buildQueue(settings: GameSettings): GamePrompt[] {
  const filtered = allCountries.filter(c => {
    if (!settings.includeDependent && !c.independent) return false;
    if (settings.regionFilter.length > 0 && !settings.regionFilter.includes(c.region)) return false;
    return true;
  });

  const promptTypes = getPromptTypes(settings);

  const prompts: GamePrompt[] = [];
  for (const c of filtered) {
    for (const pt of promptTypes) {
      prompts.push({
        countryId: c.id,
        promptType: pt,
        displayText: pt === 'country'
          ? 'Name the highlighted country'
          : `What is the capital of ${c.name}?`,
      });
    }
  }

  for (let i = prompts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [prompts[i], prompts[j]] = [prompts[j], prompts[i]];
  }
  return prompts;
}

type GameAction =
  | { type: 'START'; settings: GameSettings }
  | { type: 'CORRECT'; result: AttemptResult; nextPrompt: GamePrompt | null }
  | { type: 'WRONG'; result: AttemptResult; nextPrompt: GamePrompt | null }
  | { type: 'SKIP'; result: AttemptResult; nextPrompt: GamePrompt | null }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'END' }
  | { type: 'RESET' };

function initialSession(): GameSession {
  return {
    mode: 'both',
    timeLimitSeconds: 300,
    noTimeLimit: false,
    blindMode: false,
    score: 0,
    streak: 0,
    maxStreak: 0,
    answered: new Set(),
    skipped: new Set(),
    wrong: new Set(),
    attempts: [],
    phase: 'idle',
    currentPrompt: null,
    timeRemaining: 300,
    failsOnCurrentPrompt: 0,
    totalQuestions: 0,
  };
}

function gameReducer(state: GameSession, action: GameAction): GameSession {
  switch (action.type) {
    case 'START':
      return {
        ...initialSession(),
        mode: action.settings.mode,
        timeLimitSeconds: action.settings.timeLimitSeconds,
        noTimeLimit: action.settings.noTimeLimit,
        blindMode: action.settings.blindMode,
        timeRemaining: action.settings.timeLimitSeconds,
        phase: 'playing',
      };
    case 'CORRECT': {
      const newAnswered = new Set(state.answered);
      newAnswered.add(`${action.result.countryId}:${action.result.promptType}`);
      const newStreak = state.streak + 1;
      return {
        ...state,
        score: state.score + action.result.pointsAwarded,
        streak: newStreak,
        maxStreak: Math.max(state.maxStreak, newStreak),
        answered: newAnswered,
        attempts: [...state.attempts, action.result],
        currentPrompt: action.nextPrompt,
        failsOnCurrentPrompt: 0,
        totalQuestions: state.totalQuestions + 1,
      };
    }
    case 'WRONG': {
      const newWrong = new Set(state.wrong);
      newWrong.add(`${action.result.countryId}:${action.result.promptType}`);
      return {
        ...state,
        streak: 0,
        attempts: [...state.attempts, action.result],
        wrong: newWrong,
        currentPrompt: action.nextPrompt,
        failsOnCurrentPrompt: 0,
        totalQuestions: state.totalQuestions + 1,
      };
    }
    case 'SKIP': {
      const newSkipped = new Set(state.skipped);
      newSkipped.add(`${action.result.countryId}:${action.result.promptType}`);
      return {
        ...state,
        streak: 0,
        attempts: [...state.attempts, action.result],
        skipped: newSkipped,
        currentPrompt: action.nextPrompt,
        failsOnCurrentPrompt: 0,
        totalQuestions: state.totalQuestions + 1,
      };
    }
    case 'PAUSE':
      return { ...state, phase: 'paused' };
    case 'RESUME':
      return { ...state, phase: 'playing' };
    case 'END':
      return { ...state, phase: 'gameover' };
    case 'RESET':
      return initialSession();
    default:
      return state;
  }
}

// Per-call refs stored outside the hook so they survive renders
let _queue: GamePrompt[] = [];
let _queueIdx = 0;
let _promptStart = Date.now();

export function useGameEngine(
  onAttempt: (result: AttemptResult) => void,
  onFinish: (score: number, streak: number) => void
) {
  const [session, dispatch] = useReducer(gameReducer, undefined, initialSession);

  // Capture session values needed inside callbacks via a ref-like pattern

  function nextFromQueue(): GamePrompt | null {
    if (_queueIdx >= _queue.length) return null;
    return _queue[_queueIdx++];
  }

  const startGame = useCallback((settings: GameSettings, prebuiltQueue?: GamePrompt[]) => {
    _queue = prebuiltQueue || buildQueue(settings);
    _queueIdx = 0;
    _promptStart = Date.now();
    dispatch({ type: 'START', settings });
  }, []);

  const getFirstPrompt = useCallback((): GamePrompt | null => {
    return nextFromQueue();
  }, []);

  const submitAnswer = useCallback((input: string, currentPrompt: GamePrompt, currentStreak: number, hintUsed = false) => {
    const country = countryById.get(currentPrompt.countryId);
    if (!country) return null;
    const timeTaken = Date.now() - _promptStart;

    const matchResult = currentPrompt.promptType === 'country'
      ? matchCountry(input, currentPrompt.countryId)
      : matchCapital(input, currentPrompt.countryId);

    const correctAnswer = currentPrompt.promptType === 'country' ? country.name : country.capital;

    if (!matchResult || matchResult.tier === 'wrong') {
      const result: AttemptResult = {
        countryId: currentPrompt.countryId,
        promptType: currentPrompt.promptType,
        userInput: input,
        correct: false,
        fuzzyScore: matchResult?.score ?? 1,
        timeTaken,
        pointsAwarded: 0,
      };
      onAttempt(result);
      const nextPrompt = nextFromQueue();
      _promptStart = Date.now();
      dispatch({ type: 'WRONG', result, nextPrompt });
      return { tier: 'wrong' as const, correctAnswer, nextPrompt };
    }

    // Both 'correct' and 'fuzzy' are accepted — fuzzy just loses the exact bonus
    const isFuzzy = matchResult.tier === 'fuzzy';
    const points = calculatePoints(country, currentStreak, timeTaken, isFuzzy ? 0.2 : matchResult.score, hintUsed);
    const result: AttemptResult = {
      countryId: currentPrompt.countryId,
      promptType: currentPrompt.promptType,
      userInput: input,
      correct: true,
      fuzzyScore: matchResult.score,
      timeTaken,
      pointsAwarded: points,
    };
    onAttempt(result);
    const nextPrompt = nextFromQueue();
    _promptStart = Date.now();
    dispatch({ type: 'CORRECT', result, nextPrompt });
    return { tier: isFuzzy ? ('fuzzy' as const) : ('correct' as const), matchedName: matchResult.matchedName, points, nextPrompt };
  }, [onAttempt]);

  const submitSkip = useCallback((currentPrompt: GamePrompt) => {
    const country = countryById.get(currentPrompt.countryId);
    if (!country) return null;

    const timeTaken = Date.now() - _promptStart;
    const result: AttemptResult = {
      countryId: currentPrompt.countryId,
      promptType: currentPrompt.promptType,
      userInput: '',
      correct: false,
      fuzzyScore: 1,
      timeTaken,
      pointsAwarded: 0,
    };

    onAttempt(result);
    const nextPrompt = nextFromQueue();
    _promptStart = Date.now();
    dispatch({ type: 'SKIP', result, nextPrompt });

    return {
      correctAnswer: currentPrompt.promptType === 'country' ? country.name : country.capital,
      nextPrompt,
    };
  }, [onAttempt]);

  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), []);

  const endGame = useCallback((score: number, maxStreak: number) => {
    dispatch({ type: 'END' });
    onFinish(score, maxStreak);
  }, [onFinish]);

  const reset = useCallback(() => {
    _queue = [];
    _queueIdx = 0;
    dispatch({ type: 'RESET' });
  }, []);

  return {
    session,
    startGame,
    getFirstPrompt,
    submitAnswer,
    submitSkip,
    pause,
    resume,
    endGame,
    reset,
  };
}
