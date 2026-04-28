import { useReducer, useCallback, useRef } from 'react';
import type {
  GameSession, GameSettings, GamePrompt, AttemptResult, PromptType, CountryEntry, CountryProgress
} from '../types';
import { matchCountry, matchCapital } from '../lib/fuzzy';
import { calculatePoints } from '../lib/scoring';
import { getMastery } from '../lib/progressStorage';
import { weightedPick } from '../lib/weightedRandom';
import countriesData from '../data/countries.json';

const allCountries = countriesData as CountryEntry[];

type GameAction =
  | { type: 'START'; settings: GameSettings }
  | { type: 'TEACH'; nextPrompt: GamePrompt }
  | { type: 'TEST'; nextPrompt: GamePrompt }
  | { type: 'CORRECT'; result: AttemptResult }
  | { type: 'WRONG'; result: AttemptResult }
  | { type: 'SKIP'; result: AttemptResult }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'END' }
  | { type: 'RESET' };

function initialSession(): GameSession {
  return {
    mode: 'learn',
    timeLimitSeconds: 300,
    noTimeLimit: true,
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
        phase: 'playing', // Starts playing, will immediately teach
      };
    case 'TEACH':
      return {
        ...state,
        phase: 'teaching',
        currentPrompt: action.nextPrompt,
      };
    case 'TEST':
      return {
        ...state,
        phase: 'playing',
        currentPrompt: action.nextPrompt,
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
        failsOnCurrentPrompt: 0,
        totalQuestions: state.totalQuestions + 1,
      };
    }
    case 'PAUSE':
      return { ...state, phase: 'paused' };
    case 'RESUME':
      // If we resumed and there's a prompt, we should be back in the phase we were in
      // Since we only pause from 'playing' or 'teaching', we just look at currentPrompt.
      // Wait, we need to know if we were teaching or playing.
      // For simplicity, let's say if we paused, we are 'paused'. We need to store previous phase.
      // Actually, standard GameEngine just sets phase to 'playing'.
      // We might need to store `previousPhase` or just rely on state.
      // But gameReducer doesn't know. Let's add a previousPhase to the state or just hack it.
      // We will fix this below by passing the phase to RESUME.
      return { ...state, phase: 'playing' }; 
    case 'END':
      return { ...state, phase: 'gameover' };
    case 'RESET':
      return initialSession();
    default:
      return state;
  }
}

function computeWeight(p: CountryProgress | undefined, promptType: PromptType): number {
  if (!p) return 3.0; // Unseen
  const attempts = promptType === 'country' ? p.countryAttempts : p.capitalAttempts;
  if (attempts === 0) return 3.0; // Unseen
  const mastery = getMastery(p, promptType);
  const consecutive = promptType === 'country' ? p.countryConsecutiveCorrect : p.capitalConsecutiveCorrect;
  const lastSeen = promptType === 'country' ? p.countryLastSeen : p.capitalLastSeen;
  const recencyBoost = Math.max(0, 1 - (Date.now() - lastSeen) / (7 * 24 * 3600 * 1000));
  const weaknessWeight = (1 - mastery) * 5;
  const consecutivePenalty = Math.min(consecutive * 0.3, 2.0);
  return Math.max(0.1, weaknessWeight - consecutivePenalty + recencyBoost * 0.5);
}

export function useLearnEngine(
  progressData: Record<string, CountryProgress>,
  onAttempt: (result: AttemptResult) => void,
  onFinish: (score: number, streak: number) => void
) {
  const [session, dispatch] = useReducer(gameReducer, undefined, initialSession);

  // Per-session mutable state
  const activeQueue = useRef<{ prompt: GamePrompt; streak: number }[]>([]); // Items we are currently testing
  const settingsRef = useRef<GameSettings | null>(null);
  const promptStartRef = useRef<number>(0);
  const questionsSinceTeachRef = useRef<number>(0);
  const lastPhaseRef = useRef<'playing' | 'teaching'>('playing');
  const lastPromptRef = useRef<GamePrompt | null>(null);
  const previousPhaseRef = useRef<'playing' | 'teaching'>('playing');

  const getFilteredCountries = useCallback(() => {
    if (!settingsRef.current) return [];
    return allCountries.filter(c => {
      if (!settingsRef.current!.includeDependent && !c.independent) return false;
      if (settingsRef.current!.regionFilter.length > 0 && !settingsRef.current!.regionFilter.includes(c.region)) return false;
      return true;
    });
  }, []);

  const getPromptTypes = useCallback((): PromptType[] => {
    if (!settingsRef.current) return ['country'];
    const p = settingsRef.current.practicePrompts || 'both';
    return p === 'country' ? ['country']
      : p === 'capital' ? ['capital']
      : ['country', 'capital'];
  }, []);

  const selectNextToTeach = useCallback((): GamePrompt | null => {
    const filtered = getFilteredCountries();
    const promptTypes = getPromptTypes();
    
    // Avoid picking items already in the active queue
    const activeKeys = new Set(activeQueue.current.map(p => `${p.prompt.countryId}:${p.prompt.promptType}`));
    
    const items: { country: CountryEntry; promptType: PromptType }[] = [];
    const weights: number[] = [];

    for (const country of filtered) {
      for (const pt of promptTypes) {
        if (activeKeys.has(`${country.id}:${pt}`)) continue;
        items.push({ country, promptType: pt });
        weights.push(computeWeight(progressData[country.id], pt));
      }
    }

    if (items.length === 0) return null; // Queue exhausted

    const picked = weightedPick(items, weights);
    
    return {
      countryId: picked.country.id,
      promptType: picked.promptType,
      displayText: picked.promptType === 'country'
        ? 'Name the highlighted country'
        : `What is the capital of ${picked.country.name}?`,
    };
  }, [getFilteredCountries, getPromptTypes, progressData]);

  const advanceGame = useCallback((): GamePrompt | null => {
    // Logic: Teach 1, then Test 1-3 times from the active queue.
    if (activeQueue.current.length === 0 || questionsSinceTeachRef.current >= Math.min(3, activeQueue.current.length)) {
      // Time to teach a new item
      const toTeach = selectNextToTeach();
      if (toTeach) {
        questionsSinceTeachRef.current = 0;
        activeQueue.current.push({ prompt: toTeach, streak: 0 });
        promptStartRef.current = Date.now();
        lastPhaseRef.current = 'teaching';
        lastPromptRef.current = toTeach;
        dispatch({ type: 'TEACH', nextPrompt: toTeach });
        return toTeach;
      }
    }

    // Time to test an item from the active queue
    if (activeQueue.current.length > 0) {
      questionsSinceTeachRef.current++;
      
      let index = -1;
      // Force test the one we just taught if we are coming straight from the teaching phase
      if (lastPhaseRef.current === 'teaching' && lastPromptRef.current) {
        index = activeQueue.current.findIndex(p => p.prompt.countryId === lastPromptRef.current!.countryId && p.prompt.promptType === lastPromptRef.current!.promptType);
      }
      
      if (index === -1) {
        // Weighted selection: exponentially decay weight based on streak
        // streak 0 = 1.0, streak 1 = 0.5, streak 2 = 0.25, streak 3 = 0.125
        const weights = activeQueue.current.map(p => Math.pow(0.5, p.streak));

        // Avoid asking the exact same question twice in a row during testing if there are other options
        if (activeQueue.current.length > 1 && lastPhaseRef.current === 'playing' && lastPromptRef.current) {
          const lp = lastPromptRef.current;
          const duplicateIndex = activeQueue.current.findIndex(p => p.prompt.countryId === lp.countryId && p.prompt.promptType === lp.promptType);
          if (duplicateIndex !== -1) {
            weights[duplicateIndex] = 0; // Zero out weight so it cannot be picked
          }
        }

        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        let r = Math.random() * totalWeight;

        for (let i = 0; i < activeQueue.current.length; i++) {
          r -= weights[i];
          if (r <= 0 && weights[i] > 0) {
            index = i;
            break;
          }
        }

        // Fallback in case of floating point precision issues
        if (index === -1) {
          index = activeQueue.current.findIndex((_, i) => weights[i] > 0);
          if (index === -1) index = 0; // Should never happen
        }
      }

      const toTest = activeQueue.current[index].prompt;
      promptStartRef.current = Date.now();
      lastPhaseRef.current = 'playing';
      lastPromptRef.current = toTest;
      dispatch({ type: 'TEST', nextPrompt: toTest });
      return toTest;
    } else {
      // Nothing to teach or test -> End
      dispatch({ type: 'END' });
      onFinish(session.score, session.maxStreak);
      return null;
    }
  }, [selectNextToTeach, onFinish, session.score, session.maxStreak]);

  const startGame = useCallback((settings: GameSettings) => {
    settingsRef.current = settings;
    activeQueue.current = [];
    questionsSinceTeachRef.current = 0;
    lastPhaseRef.current = 'playing';
    lastPromptRef.current = null;
    dispatch({ type: 'START', settings });
  }, []);

  const getFirstPrompt = useCallback((): GamePrompt | null => {
    return advanceGame();
  }, [advanceGame]);

  const acknowledgeTeaching = useCallback((): GamePrompt | null => {
    // User clicked "Got it" -> move to test phase
    return advanceGame();
  }, [advanceGame]);

  const submitAnswer = useCallback((input: string, currentPrompt: GamePrompt, currentStreak: number) => {
    const country = allCountries.find(c => c.id === currentPrompt.countryId);
    if (!country) return null;
    const timeTaken = Date.now() - promptStartRef.current;

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
      dispatch({ type: 'WRONG', result });
      
      // Keep it in active queue, reset streak
      const entry = activeQueue.current.find(p => p.prompt.countryId === currentPrompt.countryId && p.prompt.promptType === currentPrompt.promptType);
      if (entry) entry.streak = 0;
      
      const nextPrompt = advanceGame();
      return { tier: 'wrong' as const, correctAnswer, nextPrompt };
    }

    const isFuzzy = matchResult.tier === 'fuzzy';
    const points = calculatePoints(country, currentStreak, timeTaken, isFuzzy ? 0.2 : matchResult.score);
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
    dispatch({ type: 'CORRECT', result });
    
    // Increment streak, keep in queue indefinitely for spaced repetition
    const entryIndex = activeQueue.current.findIndex(p => p.prompt.countryId === currentPrompt.countryId && p.prompt.promptType === currentPrompt.promptType);
    if (entryIndex !== -1) {
      activeQueue.current[entryIndex].streak++;
    }

    const nextPrompt = advanceGame();
    return { tier: isFuzzy ? ('fuzzy' as const) : ('correct' as const), matchedName: matchResult.matchedName, points, nextPrompt };
  }, [onAttempt, advanceGame]);

  const submitSkip = useCallback((currentPrompt: GamePrompt) => {
    const country = allCountries.find(c => c.id === currentPrompt.countryId);
    if (!country) return null;

    const timeTaken = Date.now() - promptStartRef.current;
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
    dispatch({ type: 'SKIP', result });

    const entry = activeQueue.current.find(p => p.prompt.countryId === currentPrompt.countryId && p.prompt.promptType === currentPrompt.promptType);
    if (entry) entry.streak = 0;

    const nextPrompt = advanceGame();
    return {
      correctAnswer: currentPrompt.promptType === 'country' ? country.name : country.capital,
      nextPrompt,
    };
  }, [advanceGame, onAttempt]);

  const pause = useCallback(() => {
    previousPhaseRef.current = session.phase as 'playing' | 'teaching';
    dispatch({ type: 'PAUSE' });
  }, [session.phase]);
  
  const resume = useCallback(() => {
    dispatch({ type: previousPhaseRef.current === 'teaching' ? 'TEACH' : 'RESUME' } as GameAction);
  }, []);

  const endGame = useCallback((score: number, maxStreak: number) => {
    dispatch({ type: 'END' });
    onFinish(score, maxStreak);
  }, [onFinish]);

  const reset = useCallback(() => {
    activeQueue.current = [];
    dispatch({ type: 'RESET' });
  }, []);

  return {
    session,
    startGame,
    getFirstPrompt,
    submitAnswer,
    submitSkip,
    acknowledgeTeaching,
    pause,
    resume,
    endGame,
    reset,
  };
}
