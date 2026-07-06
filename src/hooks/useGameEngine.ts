import { useReducer, useCallback } from 'react';
import type {
  GameSession, GameSettings, GamePrompt, AttemptResult, PromptType, Topic,
  CountryProgress, GlobalStats, ConfusionEdge, SrsCard, AnswerFormat,
} from '../types';
import { matchCountry, matchCapital, attributeConfusion } from '../lib/fuzzy';
import { calculatePoints } from '../lib/scoring';
import { itemPriority, confusionWeightFor, confusionPartners } from '../lib/adaptive';
import { isDue } from '../lib/srs';
import { getDataset, normalizeTopic } from '../lib/dataset';

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

// Apply the answer-format preference to a built queue. Only country-type
// prompts can be locate ("find X on the map") or flag ("whose flag is this?");
// capitals stay typed. Versus is excluded — its view has no locate/flag UI and
// both players must see the same game. Flags are world-only (no state flags).
function applyAnswerFormats(prompts: GamePrompt[], settings: GameSettings): GamePrompt[] {
  const pref = settings.answerFormats ?? 'typed';
  if (pref === 'typed' || settings.mode === 'versus') return prompts;
  const allowFlag = normalizeTopic(settings.topic) === 'world';
  return prompts.map(p => {
    if (p.promptType !== 'country') return p;
    let format: AnswerFormat;
    if (pref === 'mixed') {
      const options: AnswerFormat[] = allowFlag ? ['typed', 'locate', 'flag'] : ['typed', 'locate'];
      format = options[Math.floor(Math.random() * options.length)];
    } else if (pref === 'flag') {
      format = allowFlag ? 'flag' : 'typed';
    } else {
      format = 'locate';
    }
    return format === 'typed' ? p : { ...p, answerFormat: format };
  });
}

export function buildQueue(settings: GameSettings): GamePrompt[] {
  const filtered = getDataset(settings.topic).entries.filter(c => {
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
  return applyAnswerFormats(prompts, settings);
}

// Adaptive Practice queue: orders the same full set of prompts so weak / hard /
// recently-confused items surface earlier (priority-biased sampling without
// replacement), then interleaves each item's strongest confusion partner right
// after it so the user is forced to discriminate the two back-to-back.
export function buildAdaptiveQueue(
  settings: GameSettings,
  progress: Record<string, CountryProgress>,
  confusions: ConfusionEdge[],
  stats: Pick<GlobalStats, 'countryAbility' | 'capitalAbility'>,
): GamePrompt[] {
  const filtered = getDataset(settings.topic).entries.filter(c => {
    if (!settings.includeDependent && !c.independent) return false;
    if (settings.regionFilter.length > 0 && !settings.regionFilter.includes(c.region)) return false;
    return true;
  });
  const promptTypes = getPromptTypes(settings);

  type Cand = { prompt: GamePrompt; weight: number };
  const cands: Cand[] = [];
  for (const c of filtered) {
    for (const pt of promptTypes) {
      const ability = pt === 'country' ? stats.countryAbility : stats.capitalAbility;
      const weight = itemPriority({
        progress: progress[c.id],
        promptType: pt,
        ability,
        confusionWeight: confusionWeightFor(confusions, c.id, pt),
      });
      cands.push({
        prompt: {
          countryId: c.id,
          promptType: pt,
          displayText: pt === 'country'
            ? 'Name the highlighted country'
            : `What is the capital of ${c.name}?`,
        },
        weight,
      });
    }
  }

  // Priority-biased order: weighted sampling without replacement.
  const pool = [...cands];
  const ordered: GamePrompt[] = [];
  while (pool.length) {
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    let idx = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      r -= pool[i].weight;
      if (r <= 0) { idx = i; break; }
    }
    ordered.push(pool[idx].prompt);
    pool.splice(idx, 1);
  }

  return applyAnswerFormats(interleaveConfusionPartners(ordered, confusions), settings);
}

// Interleave: pull each item's strongest still-pending confusion partner of the
// same prompt type to the slot immediately after it, so the user is forced to
// discriminate the two back-to-back. Mutates and returns `ordered`.
function interleaveConfusionPartners(
  ordered: GamePrompt[],
  confusions: ConfusionEdge[],
): GamePrompt[] {
  const placed = new Set<string>();
  const keyOf = (p: GamePrompt) => `${p.countryId}:${p.promptType}`;
  for (let i = 0; i < ordered.length; i++) {
    placed.add(keyOf(ordered[i]));
    const partners = confusionPartners(confusions, ordered[i].countryId, ordered[i].promptType);
    for (const { id } of partners) {
      const partnerKey = `${id}:${ordered[i].promptType}`;
      if (placed.has(partnerKey)) continue;
      const j = ordered.findIndex((p, k) => k > i + 1 && keyOf(p) === partnerKey);
      if (j !== -1) {
        const [partner] = ordered.splice(j, 1);
        ordered.splice(i + 1, 0, partner);
        placed.add(partnerKey);
        break; // one partner per item is enough to force discrimination
      }
    }
  }
  return ordered;
}

// Daily Review queue: all cards due today for the active topic, most overdue /
// weakest first, capped so a backlog doesn't produce a punishing session.
const REVIEW_QUEUE_CAP = 40;

export function buildReviewQueue(
  settings: GameSettings,
  srsCards: Record<string, SrsCard>,
  progress: Record<string, CountryProgress>,
  confusions: ConfusionEdge[],
  stats: Pick<GlobalStats, 'countryAbility' | 'capitalAbility'>,
  now = Date.now(),
): GamePrompt[] {
  const byId = getDataset(settings.topic).byId;

  type Cand = { prompt: GamePrompt; weight: number };
  const cands: Cand[] = [];
  for (const card of Object.values(srsCards)) {
    if (!isDue(card, now)) continue;
    const country = byId.get(card.itemId); // SRS rows span topics; keep only the active one
    if (!country) continue;
    const ability = card.promptType === 'country' ? stats.countryAbility : stats.capitalAbility;
    // Overdueness (in days, floored at 1 so today's cards still rank) scaled by
    // the same priority the other adaptive modes use.
    const overdueDays = Math.max(1, (now - card.dueAt) / (24 * 3600 * 1000));
    const weight = overdueDays * itemPriority({
      progress: progress[card.itemId],
      promptType: card.promptType,
      ability,
      confusionWeight: confusionWeightFor(confusions, card.itemId, card.promptType),
      now,
    });
    cands.push({
      prompt: {
        countryId: card.itemId,
        promptType: card.promptType,
        displayText: card.promptType === 'country'
          ? 'Name the highlighted country'
          : `What is the capital of ${country.name}?`,
      },
      weight,
    });
  }

  const ordered = cands
    .sort((a, b) => b.weight - a.weight)
    .slice(0, REVIEW_QUEUE_CAP)
    .map(c => c.prompt);
  return applyAnswerFormats(interleaveConfusionPartners(ordered, confusions), settings);
}

type GameAction =
  | { type: 'START'; settings: GameSettings }
  | { type: 'CORRECT'; result: AttemptResult; nextPrompt: GamePrompt | null }
  | { type: 'WRONG'; result: AttemptResult; nextPrompt: GamePrompt | null; preserveStreak?: boolean }
  | { type: 'SKIP'; result: AttemptResult; nextPrompt: GamePrompt | null; preserveStreak?: boolean }
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
        streak: action.preserveStreak ? state.streak : 0,
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
        streak: action.preserveStreak ? state.streak : 0,
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
let _topic: Topic = 'world';

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
    _topic = normalizeTopic(settings.topic);
    dispatch({ type: 'START', settings });
  }, []);

  const getFirstPrompt = useCallback((): GamePrompt | null => {
    return nextFromQueue();
  }, []);

  const submitAnswer = useCallback((input: string, currentPrompt: GamePrompt, currentStreak: number, hintUsed = false, preserveStreakOnWrong = false) => {
    const country = getDataset(_topic).byId.get(currentPrompt.countryId);
    if (!country) return null;
    const timeTaken = Date.now() - _promptStart;

    const matchResult = currentPrompt.promptType === 'country'
      ? matchCountry(input, currentPrompt.countryId, _topic)
      : matchCapital(input, currentPrompt.countryId, _topic);

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
        confusedWithId: attributeConfusion(input, currentPrompt.promptType, currentPrompt.countryId, _topic),
        hintUsed,
      };
      onAttempt(result);
      const nextPrompt = nextFromQueue();
      _promptStart = Date.now();
      dispatch({ type: 'WRONG', result, nextPrompt, preserveStreak: preserveStreakOnWrong });
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
      hintUsed,
    };
    onAttempt(result);
    const nextPrompt = nextFromQueue();
    _promptStart = Date.now();
    dispatch({ type: 'CORRECT', result, nextPrompt });
    return { tier: isFuzzy ? ('fuzzy' as const) : ('correct' as const), matchedName: matchResult.matchedName, points, nextPrompt };
  }, [onAttempt]);

  // Locate prompts: the "answer" is a click on the map. Correct iff the clicked
  // country is the target; a wrong click IS the confusion (no fuzzy tier).
  const submitLocate = useCallback((clickedId: string, currentPrompt: GamePrompt, currentStreak: number, hintUsed = false, preserveStreakOnWrong = false) => {
    const dataset = getDataset(_topic).byId;
    const country = dataset.get(currentPrompt.countryId);
    if (!country) return null;
    const timeTaken = Date.now() - _promptStart;
    const clickedName = dataset.get(clickedId)?.name ?? clickedId;

    if (clickedId !== currentPrompt.countryId) {
      const result: AttemptResult = {
        countryId: currentPrompt.countryId,
        promptType: currentPrompt.promptType,
        userInput: clickedName,
        correct: false,
        fuzzyScore: 1,
        timeTaken,
        pointsAwarded: 0,
        confusedWithId: dataset.has(clickedId) ? clickedId : undefined,
        hintUsed,
        answerFormat: 'locate',
      };
      onAttempt(result);
      const nextPrompt = nextFromQueue();
      _promptStart = Date.now();
      dispatch({ type: 'WRONG', result, nextPrompt, preserveStreak: preserveStreakOnWrong });
      return { tier: 'wrong' as const, correctAnswer: country.name, clickedName, nextPrompt };
    }

    const points = calculatePoints(country, currentStreak, timeTaken, 0, hintUsed);
    const result: AttemptResult = {
      countryId: currentPrompt.countryId,
      promptType: currentPrompt.promptType,
      userInput: clickedName,
      correct: true,
      fuzzyScore: 0,
      timeTaken,
      pointsAwarded: points,
      hintUsed,
      answerFormat: 'locate',
    };
    onAttempt(result);
    const nextPrompt = nextFromQueue();
    _promptStart = Date.now();
    dispatch({ type: 'CORRECT', result, nextPrompt });
    return { tier: 'correct' as const, matchedName: country.name, points, nextPrompt };
  }, [onAttempt]);

  const submitSkip = useCallback((currentPrompt: GamePrompt, preserveStreak = false) => {
    const country = getDataset(_topic).byId.get(currentPrompt.countryId);
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
    dispatch({ type: 'SKIP', result, nextPrompt, preserveStreak });

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
    submitLocate,
    submitSkip,
    pause,
    resume,
    endGame,
    reset,
  };
}
