import { useReducer, useCallback, useRef } from 'react';
import type {
  GameSession, GameSettings, GamePrompt, AttemptResult, PromptType, CountryEntry,
  CountryProgress, GlobalStats, ConfusionEdge,
} from '../types';
import { matchCountry, matchCapital, attributeConfusion } from '../lib/fuzzy';
import { calculatePoints } from '../lib/scoring';
import { itemPriority, confusionWeightFor } from '../lib/adaptive';
import { weightedPick } from '../lib/weightedRandom';
import { getDataset, normalizeTopic } from '../lib/dataset';

// ── Learn-mode tuning ────────────────────────────────────────────────────────
// Working-set model (Leitner / "7±2"): keep a small set of items in active
// rotation, graduate each out once it's been answered correctly enough times,
// and only introduce new material when the current set is healthy. This balances
// learning new items against drilling the hard/confused ones.
const MAX_ACTIVE = 7;            // cap on items in rotation at once
const MIN_REVIEWS_BETWEEN_NEW = 2; // min tests before another item is introduced
const WARMUP_SET_SIZE = 3;       // ramp the set up quickly at the start

// How hard an item is for this user (0 easy … 1 hard), combining Elo difficulty
// and how often it's confused with something else.
function hardnessOf(
  p: CountryProgress | undefined, promptType: PromptType, ability: number, confusionWeight: number,
): number {
  const rating = p ? (promptType === 'country' ? p.countryRating : p.capitalRating) : ability;
  const elo = 1 / (1 + Math.pow(10, (ability - rating) / 400)); // high when item rating > ability
  const conf = Math.min(confusionWeight, 10) / 10;
  return Math.max(elo, conf);
}

// Consecutive-correct answers needed before an item graduates out of the set.
// Easy items leave after 3; hard/confused/previously-lapsed items take up to 5,
// so they get hammered until they truly stick.
function graduationTarget(hardness: number, lapses: number): number {
  return Math.min(5, 3 + Math.round(2 * hardness) + Math.min(lapses, 1));
}

// An item the user has already demonstrably learned: a run of consecutive
// correct answers on a strong overall record. Learn never re-introduces these —
// long-term retention is the SRS reviewer's job (see srs.ts) — except as a
// last-resort fallback when everything in the current filter is known.
function isAlreadyKnown(p: CountryProgress | undefined, promptType: PromptType): boolean {
  if (!p) return false;
  const attempts = promptType === 'country' ? p.countryAttempts : p.capitalAttempts;
  if (attempts < 2) return false;
  const correct = promptType === 'country' ? p.countryCorrect : p.capitalCorrect;
  const consecutive = promptType === 'country'
    ? p.countryConsecutiveCorrect : p.capitalConsecutiveCorrect;
  return consecutive >= 2 && correct / attempts >= 0.75;
}

// In-session re-test weight decays as an item's streak grows; harder items decay
// slower (base closer to 1) so they keep coming back within the working set.
function testDecayBase(hardness: number): number {
  return 0.4 + 0.35 * hardness; // 0.40 (easy) … 0.75 (hard/confused)
}

interface ActiveItem {
  prompt: GamePrompt;
  streak: number;   // consecutive correct since last lapse
  lapses: number;   // times missed this session
  target: number;   // consecutive-correct needed to graduate
}

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

export function useLearnEngine(
  progressData: Record<string, CountryProgress>,
  confusions: ConfusionEdge[],
  stats: Pick<GlobalStats, 'countryAbility' | 'capitalAbility'>,
  onAttempt: (result: AttemptResult) => void,
  onFinish: (score: number, streak: number) => void
) {
  const abilityFor = (pt: PromptType) =>
    pt === 'country' ? stats.countryAbility : stats.capitalAbility;
  const [session, dispatch] = useReducer(gameReducer, undefined, initialSession);

  // Per-session mutable state
  const activeQueue = useRef<ActiveItem[]>([]); // Items currently in rotation
  const graduatedKeys = useRef<Set<string>>(new Set()); // Items mastered this session — never re-taught
  // Whether this session may teach already-known items. Decided once, on the
  // first selection: only when the chosen filter has nothing new left to learn.
  const allowKnownRef = useRef<boolean | null>(null);
  const settingsRef = useRef<GameSettings | null>(null);
  const promptStartRef = useRef<number>(0);
  const questionsSinceTeachRef = useRef<number>(0);
  const lastPhaseRef = useRef<'playing' | 'teaching'>('playing');
  const lastPromptRef = useRef<GamePrompt | null>(null);
  const previousPhaseRef = useRef<'playing' | 'teaching'>('playing');
  const lastCorrectRef = useRef<boolean>(true); // was the previous answer correct? gates new items

  const currentTopic = () => normalizeTopic(settingsRef.current?.topic);

  const getFilteredCountries = useCallback((): CountryEntry[] => {
    if (!settingsRef.current) return [];
    return getDataset(settingsRef.current.topic).entries.filter(c => {
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

    // Never re-introduce an item that's in rotation or that already graduated
    // this session — once it's been drilled to its target, it's done for the day.
    const excluded = new Set(activeQueue.current.map(p => `${p.prompt.countryId}:${p.prompt.promptType}`));
    for (const key of graduatedKeys.current) excluded.add(key);

    const fresh: { country: CountryEntry; promptType: PromptType }[] = [];
    const known: { country: CountryEntry; promptType: PromptType }[] = [];

    for (const country of filtered) {
      for (const pt of promptTypes) {
        if (excluded.has(`${country.id}:${pt}`)) continue;
        (isAlreadyKnown(progressData[country.id], pt) ? known : fresh)
          .push({ country, promptType: pt });
      }
    }

    // Teach material that still needs learning. Already-known items are only
    // eligible when the session *started* with nothing new to learn (so the
    // mode stays usable, drilling weakest-first); if there was fresh material,
    // the session ends once it's all been learned instead of circling back.
    if (allowKnownRef.current === null) allowKnownRef.current = fresh.length === 0;
    const items = fresh.length > 0 ? fresh : (allowKnownRef.current ? known : []);
    if (items.length === 0) return null; // Everything learned — session complete

    const weights = items.map(({ country, promptType: pt }) => itemPriority({
      progress: progressData[country.id],
      promptType: pt,
      ability: abilityFor(pt),
      confusionWeight: confusionWeightFor(confusions, country.id, pt),
    }));

    const picked = weightedPick(items, weights);
    
    return {
      countryId: picked.country.id,
      promptType: picked.promptType,
      displayText: picked.promptType === 'country'
        ? 'Name the highlighted country'
        : `What is the capital of ${picked.country.name}?`,
    };
  }, [getFilteredCountries, getPromptTypes, progressData, confusions, stats]); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceGame = useCallback((): GamePrompt | null => {
    // Graduate any item that has been answered correctly enough times — it leaves
    // the working set (and is barred from re-introduction this session) so focus
    // shifts to items not yet learned.
    activeQueue.current = activeQueue.current.filter(it => {
      if (it.streak < it.target) return true;
      graduatedKeys.current.add(`${it.prompt.countryId}:${it.prompt.promptType}`);
      return false;
    });

    const set = activeQueue.current;
    const avgStreak = set.length ? set.reduce((s, it) => s + it.streak, 0) / set.length : 0;
    const room = set.length < MAX_ACTIVE;
    const warmingUp = set.length < WARMUP_SET_SIZE;
    const spacingOk = questionsSinceTeachRef.current >= MIN_REVIEWS_BETWEEN_NEW;
    // After teaching an item we must test it first (immediate retrieval practice),
    // so never introduce another new item straight out of the teaching phase.
    const justTaught = lastPhaseRef.current === 'teaching';
    // Otherwise introduce a new item when the set is empty, still warming up, or
    // the user is doing well (last answer correct AND set is being learned). Never
    // pile on new material right after a miss or while the set is full.
    const readyForNew =
      set.length === 0 ||
      (!justTaught && room && (warmingUp || (lastCorrectRef.current && avgStreak >= 1 && spacingOk)));

    if (readyForNew) {
      const toTeach = selectNextToTeach();
      if (toTeach) {
        questionsSinceTeachRef.current = 0;
        const pt = toTeach.promptType;
        const hardness = hardnessOf(
          progressData[toTeach.countryId], pt, abilityFor(pt),
          confusionWeightFor(confusions, toTeach.countryId, pt),
        );
        activeQueue.current.push({
          prompt: toTeach, streak: 0, lapses: 0, target: graduationTarget(hardness, 0),
        });
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
        // Weighted selection: weight decays as an item's streak grows, but the
        // decay base is per-item — hard/confused items decay slower so they stay
        // in rotation and get hammered until they truly stick.
        const weights = activeQueue.current.map(p => {
          const hardness = hardnessOf(
            progressData[p.prompt.countryId], p.prompt.promptType,
            abilityFor(p.prompt.promptType),
            confusionWeightFor(confusions, p.prompt.countryId, p.prompt.promptType),
          );
          return Math.pow(testDecayBase(hardness), p.streak);
        });

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
  }, [selectNextToTeach, onFinish, session.score, session.maxStreak, progressData, confusions, stats]); // eslint-disable-line react-hooks/exhaustive-deps

  const startGame = useCallback((settings: GameSettings) => {
    settingsRef.current = settings;
    activeQueue.current = [];
    graduatedKeys.current = new Set();
    allowKnownRef.current = null;
    questionsSinceTeachRef.current = 0;
    lastPhaseRef.current = 'playing';
    lastPromptRef.current = null;
    lastCorrectRef.current = true;
    dispatch({ type: 'START', settings });
  }, []);

  const getFirstPrompt = useCallback((): GamePrompt | null => {
    return advanceGame();
  }, [advanceGame]);

  const acknowledgeTeaching = useCallback((): GamePrompt | null => {
    // User clicked "Got it" -> move to test phase
    return advanceGame();
  }, [advanceGame]);

  const submitAnswer = useCallback((input: string, currentPrompt: GamePrompt, currentStreak: number, hintUsed = false) => {
    const topic = currentTopic();
    const country = getDataset(topic).byId.get(currentPrompt.countryId);
    if (!country) return null;
    const timeTaken = Date.now() - promptStartRef.current;

    const matchResult = currentPrompt.promptType === 'country'
      ? matchCountry(input, currentPrompt.countryId, topic)
      : matchCapital(input, currentPrompt.countryId, topic);

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
        confusedWithId: attributeConfusion(input, currentPrompt.promptType, currentPrompt.countryId, topic),
        hintUsed,
      };
      onAttempt(result);
      dispatch({ type: 'WRONG', result });
      lastCorrectRef.current = false;

      // Lapse: reset streak, raise the bar to graduate so it gets drilled more.
      const entry = activeQueue.current.find(p => p.prompt.countryId === currentPrompt.countryId && p.prompt.promptType === currentPrompt.promptType);
      if (entry) {
        entry.streak = 0;
        entry.lapses++;
        const pt = currentPrompt.promptType;
        const hardness = hardnessOf(
          progressData[currentPrompt.countryId], pt, abilityFor(pt),
          confusionWeightFor(confusions, currentPrompt.countryId, pt),
        );
        entry.target = graduationTarget(hardness, entry.lapses);
      }

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
      hintUsed,
    };
    onAttempt(result);
    dispatch({ type: 'CORRECT', result });
    lastCorrectRef.current = true;

    // Increment streak toward graduation (handled in advanceGame).
    const entryIndex = activeQueue.current.findIndex(p => p.prompt.countryId === currentPrompt.countryId && p.prompt.promptType === currentPrompt.promptType);
    if (entryIndex !== -1) {
      activeQueue.current[entryIndex].streak++;
    }

    const nextPrompt = advanceGame();
    return { tier: isFuzzy ? ('fuzzy' as const) : ('correct' as const), matchedName: matchResult.matchedName, points, nextPrompt };
  }, [onAttempt, advanceGame, progressData, confusions, stats]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitSkip = useCallback((currentPrompt: GamePrompt) => {
    const country = getDataset(currentTopic()).byId.get(currentPrompt.countryId);
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
    lastCorrectRef.current = false;

    // A skip counts as a lapse — keep it in rotation and raise its bar.
    const entry = activeQueue.current.find(p => p.prompt.countryId === currentPrompt.countryId && p.prompt.promptType === currentPrompt.promptType);
    if (entry) {
      entry.streak = 0;
      entry.lapses++;
      const pt = currentPrompt.promptType;
      const hardness = hardnessOf(
        progressData[currentPrompt.countryId], pt, abilityFor(pt),
        confusionWeightFor(confusions, currentPrompt.countryId, pt),
      );
      entry.target = graduationTarget(hardness, entry.lapses);
    }

    const nextPrompt = advanceGame();
    return {
      correctAnswer: currentPrompt.promptType === 'country' ? country.name : country.capital,
      nextPrompt,
    };
  }, [advanceGame, onAttempt, progressData, confusions, stats]); // eslint-disable-line react-hooks/exhaustive-deps

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
    graduatedKeys.current = new Set();
    allowKnownRef.current = null;
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
