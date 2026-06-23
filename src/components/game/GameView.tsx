import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GlobeMap as OrbisGlobe } from './GlobeMap';
import { UsStatesMap } from './UsStatesMap';
import { ResultFlash } from './ResultFlash';
import { GameOverModal } from './GameOverModal';
import { TeachingPanel } from './TeachingPanel';
import { BotanicalCorner } from '../ui/BotanicalCorner';
import { SpaceBackdrop } from '../ui/SpaceBackdrop';
import type { GamePrompt, GameSettings, GlobalStats } from '../../types';
import { useGameEngine } from '../../hooks/useGameEngine';
import { useLearnEngine } from '../../hooks/useLearnEngine';
import { useTimer } from '../../hooks/useTimer';
import { useProgress } from '../../hooks/useProgress';
import { getTimeMode } from '../../lib/leaderboard';
import type { User } from '@supabase/supabase-js';
import { getDataset, normalizeTopic } from '../../lib/dataset';

interface GameViewProps {
  settings: GameSettings;
  globalStats: GlobalStats;
  personalBests: Record<string, number>;
  onBackToMenu: () => void;
  onViewProgress: () => void;
  onViewLeaderboard: () => void;
  onPractice: () => void;
  progress: ReturnType<typeof useProgress>;
  user: User | null;
  onSubmitScore: (score: number) => void;
}

type InputState = 'idle' | 'correct' | 'fuzzy' | 'wrong';
type FlashTrigger = { points?: number; type: 'correct' | 'wrong' | 'fuzzy' | 'skip'; label?: string } | null;

const MODE_LABELS: Record<string, string> = {
  country: 'Countries', capital: 'Capitals', both: 'Both',
  practice: 'Practice', learn: 'Learn',
};

const FEEDBACK_DELAY_MS = 90;
const SKIP_DELAY_MS = 420;
const WRONG_DELAY_MS = 650;

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function GameView({ settings, globalStats, personalBests, onBackToMenu, onViewProgress, onViewLeaderboard, onPractice, progress, user, onSubmitScore }: GameViewProps) {
  const [currentPrompt, setCurrentPrompt] = useState<GamePrompt | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<GamePrompt | null>(null);
  const [inputState, setInputState]         = useState<InputState>('idle');
  const [flash, setFlash]                   = useState<FlashTrigger>(null);
  const [queueTotal, setQueueTotal]         = useState(0);
  const [isNewBest, setIsNewBest]           = useState(false);
  const [wrongAnswer, setWrongAnswer]       = useState('');
  const [showWrongFeedback, setShowWrongFeedback] = useState(false);
  const [promptIndex, setPromptIndex]       = useState(0);
  const [focusToken, setFocusToken]         = useState(0);
  const [globeBooted, setGlobeBooted]       = useState(false);
  const [isPromptRendering, setIsPromptRendering] = useState(true);
  const [recenterToken, setRecenterToken]   = useState(0);
  const [hintUsed, setHintUsed]             = useState(false);
  const [hintMsg, setHintMsg]               = useState('');
  const [lastPoints, setLastPoints]         = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerStartedRef = useRef(false);
  const pendingPromptRef = useRef<GamePrompt | null>(null);
  const focusTokenRef = useRef(0);

  const { recordAttempt, finishSession } = progress;

  const topic = normalizeTopic(settings.topic);
  const isUsStates = topic === 'us-states';
  const dataset = getDataset(topic);
  const countryMap = dataset.byId;
  const countries = dataset.entries;
  const placeNoun = isUsStates ? 'state' : 'country';

  const timeMode = getTimeMode(settings.timeLimitSeconds, settings.noTimeLimit);
  const modeKey  = `${settings.mode}_${timeMode}`;

  const handleFinish = useCallback((score: number, streak: number) => {
    finishSession(score, streak);
    onSubmitScore(score);
    setIsNewBest(score > (personalBests[modeKey] ?? globalStats.bestScore));
  }, [finishSession, onSubmitScore, personalBests, modeKey, globalStats.bestScore]);

  const isLearnMode     = settings.mode === 'learn';
  const standardEngine = useGameEngine(recordAttempt, handleFinish);
  const learnEngine     = useLearnEngine(progress.progress, recordAttempt, handleFinish);
  const engine          = isLearnMode ? learnEngine : standardEngine;
  const { session, getFirstPrompt, submitAnswer, submitSkip, pause, resume, endGame, reset } = engine;
  const acknowledgeTeaching = isLearnMode ? learnEngine.acknowledgeTeaching : () => null;

  const queuePromptForRender = useCallback((nextPrompt: GamePrompt | null) => {
    pendingPromptRef.current = nextPrompt;
    setPendingPrompt(nextPrompt);
    setCurrentPrompt(nextPrompt);
    setIsPromptRendering(Boolean(nextPrompt));

    if (inputRef.current) {
      inputRef.current.blur();
      inputRef.current.value = '';
    }

    setHintUsed(false);
    setHintMsg('');
    setLastPoints(null);

    if (!nextPrompt) {
      return;
    }

    focusTokenRef.current += 1;
    setFocusToken(focusTokenRef.current);
  }, []);

  const colorMap = useMemo(() => {
    const map: Record<string, import('../../types').CountryColorState> = {};
    for (const key of session.skipped) { const [id] = key.split(':'); map[id] = 'skipped'; }
    for (const key of session.wrong)   { const [id] = key.split(':'); map[id] = 'wrong'; }
    for (const key of session.answered){ const [id] = key.split(':'); map[id] = 'correct'; }
    const activePrompt = pendingPrompt ?? currentPrompt;
    if (activePrompt?.countryId) {
      map[activePrompt.countryId] = session.phase === 'teaching' ? 'teaching' : 'current';
    }
    return map;
  }, [currentPrompt, pendingPrompt, session.answered, session.phase, session.skipped, session.wrong]);

  const handleTimerExpire = useCallback(() => {
    endGame(session.score, session.maxStreak);
  }, [endGame, session.score, session.maxStreak]);

  const { timeRemaining, start: startTimer, pause: pauseTimer, resume: resumeTimer, reset: resetTimer } =
    useTimer(settings.timeLimitSeconds, settings.noTimeLimit, handleTimerExpire);

  const commitRenderedPrompt = useCallback((token: number) => {
    if (token !== focusTokenRef.current) {
      return;
    }

    const nextPrompt = pendingPromptRef.current;
    setPendingPrompt(null);
    pendingPromptRef.current = null;
    setCurrentPrompt(nextPrompt);
    setIsPromptRendering(false);

    if (!settings.noTimeLimit && !timerStartedRef.current && nextPrompt && session.phase === 'playing') {
      timerStartedRef.current = true;
      startTimer();
    }
  }, [session.phase, settings.noTimeLimit, startTimer]);

  const handleGlobeReady = useCallback(() => {
    setGlobeBooted(true);
  }, []);

  useEffect(() => { engine.startGame(settings); }, []); // eslint-disable-line

  useEffect(() => {
    if (session.phase === 'playing' && !currentPrompt && !pendingPromptRef.current) {
      queuePromptForRender(getFirstPrompt());
    }
  }, [currentPrompt, getFirstPrompt, queuePromptForRender, session.phase]);

  useEffect(() => {
    if (session.phase !== 'playing') return;
    if (currentPrompt || pendingPromptRef.current || isPromptRendering) return;

    timerStartedRef.current = false;
    endGame(session.score, session.maxStreak);
  }, [currentPrompt, endGame, isPromptRendering, session.maxStreak, session.phase, session.score]);

  // Compute total queue size
  useEffect(() => {
    const filteredCountryCount = countries.filter(c => {
      if (!settings.includeDependent && !c.independent) return false;
      if (settings.regionFilter.length > 0 && !settings.regionFilter.includes(c.region)) return false;
      return true;
    }).length;

    if (settings.mode === 'learn') {
      setQueueTotal(filteredCountryCount);
      return;
    }

    const promptCount =
      settings.mode === 'both'
        ? 2
        : settings.mode === 'practice'
          ? (settings.practicePrompts === 'both' ? 2 : 1)
          : 1;

    setQueueTotal(filteredCountryCount * promptCount);
  }, [settings]);


  // Focus input when prompt changes
  useEffect(() => {
    if (inputState === 'idle' && session.phase === 'playing' && currentPrompt && !isPromptRendering) {
      setTimeout(() => inputRef.current?.focus(), 24);
    }
  }, [currentPrompt, inputState, isPromptRendering, session.phase]);

  function triggerFlash(f: FlashTrigger) {
    setFlash(null);
    requestAnimationFrame(() => setFlash(f));
  }

  function handleAcknowledge() {
    const next = acknowledgeTeaching();
    if (next) {
      queuePromptForRender(next);
      setPromptIndex(i => i + 1);
    }
  }

  const handleSubmit = useCallback(() => {
    if (!currentPrompt || session.phase !== 'playing') return;
    const trimmed = inputRef.current?.value.trim() ?? '';
    if (!trimmed) return;

    const result = submitAnswer(trimmed, currentPrompt, session.streak, hintUsed);
    if (!result) return;

    if (result.tier === 'wrong') {
      setInputState('wrong');
      setWrongAnswer(result.correctAnswer);
      setShowWrongFeedback(true);
      triggerFlash({ type: 'wrong' });
      setTimeout(() => {
        setShowWrongFeedback(false);
        setInputState('idle');
        queuePromptForRender(result.nextPrompt ?? null);
        setPromptIndex(i => i + 1);
      }, WRONG_DELAY_MS);
    } else if (result.tier === 'fuzzy') {
      setInputState('fuzzy');
      setLastPoints(result.points ?? null);
      triggerFlash({ type: 'fuzzy', points: result.points });
      setTimeout(() => {
        setInputState('idle');
        queuePromptForRender(result.nextPrompt ?? null);
        setPromptIndex(i => i + 1);
      }, FEEDBACK_DELAY_MS);
    } else {
      setInputState('correct');
      setLastPoints(result.points ?? null);
      triggerFlash({ type: 'correct', points: result.points });
      setTimeout(() => {
        setInputState('idle');
        queuePromptForRender(result.nextPrompt ?? null);
        setPromptIndex(i => i + 1);
      }, FEEDBACK_DELAY_MS);
    }
  }, [currentPrompt, session.phase, session.streak, submitAnswer, hintUsed, queuePromptForRender]);

  function handleHint() {
    if (hintUsed || !currentPrompt || session.phase !== 'playing') return;
    const currentCountry = countryMap.get(currentPrompt.countryId);
    if (!currentCountry) return;
    const ans = currentPrompt.promptType === 'country' ? currentCountry.name : currentCountry.capital;
    setHintUsed(true);
    setHintMsg(`Starts with "${ans[0].toUpperCase()}" · −50% points`);
  }

  function handleSkip() {
    if (!currentPrompt || session.phase !== 'playing') return;
    const result = submitSkip(currentPrompt);
    if (result) {
      setWrongAnswer(result.correctAnswer);
      setShowWrongFeedback(true);
      triggerFlash({ type: 'skip' });
      setTimeout(() => {
        setShowWrongFeedback(false);
        queuePromptForRender(result.nextPrompt ?? null);
        setPromptIndex(i => i + 1);
      }, SKIP_DELAY_MS);
    }
  }

  function handlePause()  { pause(); pauseTimer(); }
  function handleResume() { resume(); resumeTimer(); }
  function handleReset()  {
    timerStartedRef.current = false;
    pendingPromptRef.current = null;
    reset(); resetTimer();
    setPendingPrompt(null);
    setCurrentPrompt(null);
    setIsPromptRendering(true);
    setInputState('idle');
    onBackToMenu();
  }
  function handleEnd() {
    timerStartedRef.current = false;
    endGame(session.score, session.maxStreak);
  }

  const currentCountry   = currentPrompt ? countryMap.get(currentPrompt.countryId) : null;
  const learnedCountries = useMemo(() => {
    if (!isLearnMode) return 0;
    return new Set(Array.from(session.answered, key => key.split(':')[0])).size;
  }, [isLearnMode, session.answered]);

  const completed        = isLearnMode ? learnedCountries : session.totalQuestions;
  const isPlaying        = session.phase === 'playing';
  const isPaused         = session.phase === 'paused';
  const isTeaching       = session.phase === 'teaching';
  const showFeedbackOk   = (inputState === 'correct' || inputState === 'fuzzy') && !!currentCountry;
  const showFeedbackMiss = inputState === 'wrong' && !!wrongAnswer;
  const promptLocked     = isPromptRendering || !currentPrompt;
  const streak           = session.streak;
  const progressPercent = queueTotal > 0 ? Math.min((completed / queueTotal) * 100, 100) : 0;

  const vineBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='72' viewBox='0 0 22 72'%3E%3Cpath d='M11,0 C10,18 12,36 11,54 C10,62 11,72 11,72' stroke='rgba(74,110,36,0.28)' stroke-width='0.9' fill='none'/%3E%3Cpath d='M11,18 C8,11 13,4 20,3 C13,7 9,13 11,18Z' fill='rgba(74,110,36,0.20)'/%3E%3Cpath d='M11,49 C14,42 9,35 2,34 C9,37 13,44 11,49Z' fill='rgba(74,110,36,0.18)'/%3E%3Ccircle cx='11' cy='17' r='1.6' fill='rgba(74,110,36,0.22)'/%3E%3C/svg%3E")`;

  return (
    <div className="responsive-split-shell gameplay-shell">

      {/* ── LEFT PANEL ── */}
      <div className="responsive-side-panel" style={{
        flex: '0 0 38%', minWidth: 320, maxWidth: 480,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        background: 'var(--s1)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Vine border */}
        <div style={{
          position: 'absolute', top: '12%', bottom: '12%',
          right: -11, width: 22, zIndex: 10, pointerEvents: 'none',
          backgroundRepeat: 'repeat-y', backgroundPosition: 'center top',
          backgroundImage: vineBg,
        }} />

        <BotanicalCorner />

        {/* Top bar */}
        <div className="game-top-bar" style={{
          alignItems: 'center', gap: 12,
          padding: '15px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg)',
          flexShrink: 0,
        }}>
          <button
            onClick={onBackToMenu}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, color: 'var(--t3)', letterSpacing: '0.05em',
              padding: '4px 8px', borderRadius: 3, border: 'none', background: 'none',
              cursor: 'pointer', transition: 'color 0.14s', fontFamily: 'var(--ff-u)',
            }}
          >
            <svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M11,4 L6,9 L11,14"/>
            </svg>
            Back
          </button>

          <div style={{
            flex: 1, textAlign: 'center',
            fontFamily: 'var(--ff-d)', fontSize: 15, fontWeight: 400,
            letterSpacing: '0.09em', color: 'var(--t2)',
            minWidth: 120,
          }}>
            {MODE_LABELS[settings.mode] ?? settings.mode}
          </div>

          {/* Timer */}
          {!settings.noTimeLimit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <TimerRing timeRemaining={timeRemaining} totalSeconds={settings.timeLimitSeconds} />
            </div>
          )}
          {settings.noTimeLimit && (
            <span style={{ fontSize: 14, color: 'var(--t3)', flexShrink: 0 }}>∞</span>
          )}

          {/* Pause/Resume */}
          <button
            onClick={isPaused ? handleResume : handlePause}
            title={isPaused ? 'Resume' : 'Pause'}
            style={{
              fontSize: 14, color: 'var(--t3)', cursor: 'pointer',
              border: 'none', background: 'none', padding: 4, flexShrink: 0,
            }}
          >
            {isPaused ? '▶' : '⏸'}
          </button>
          <button
            onClick={handleEnd}
            title="End game"
            style={{
              fontSize: 11, color: 'var(--t3)', cursor: 'pointer',
              border: '1px solid var(--border)', borderRadius: 3,
              background: 'none', padding: '3px 7px', flexShrink: 0,
              fontFamily: 'var(--ff-u)', letterSpacing: '0.04em',
            }}
          >
            End
          </button>
        </div>

        {/* Progress pips */}
        {session.phase !== 'gameover' && (
          <div className="game-progress-strip" style={{
            alignItems: 'center', gap: 14,
            padding: '11px 20px', borderBottom: '1px solid var(--border)',
            background: 'var(--s1)', flexShrink: 0,
          }}>
            <div style={{
              position: 'relative',
              flex: 1,
              height: 6,
              borderRadius: 999,
              overflow: 'hidden',
              background: 'rgba(86,116,40,0.14)',
            }}>
              <div style={{
                width: `${progressPercent}%`,
                height: '100%',
                borderRadius: 999,
                background: 'repeating-linear-gradient(90deg, var(--olive) 0 16px, rgba(86,116,40,0.45) 16px 22px)',
                transition: 'width 0.25s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              {completed}&thinsp;/&thinsp;{queueTotal || '…'}
            </div>
          </div>
        )}

        {/* Body (scrollable) */}
        <div className="responsive-panel-body" style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '28px 28px 20px',
          display: 'flex', flexDirection: 'column',
        }}>
          {session.phase === 'gameover' ? null
          : session.phase === 'idle' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em', marginTop: 36 }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
              <span>Loading…</span>
            </div>
          ) : !currentPrompt && isPromptRendering ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em', marginTop: 36 }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
              <span>{globeBooted ? 'Rendering target…' : isUsStates ? 'Rendering map…' : 'Rendering globe…'}</span>
            </div>
          ) : isTeaching && currentCountry && currentPrompt && !showFeedbackOk && !showFeedbackMiss && !showWrongFeedback ? (
            <TeachingPanel
              country={currentCountry}
              promptType={currentPrompt.promptType}
              score={session.score}
              streak={session.streak}
              onAcknowledge={handleAcknowledge}
            />
          ) : currentPrompt ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, animation: 'fade-up 0.18s ease forwards' }}>
              {/* Eyebrow */}
              <div style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--t3)', marginBottom: 10, fontWeight: 500,
                fontFamily: 'var(--ff-u)',
              }}>
                {currentPrompt.promptType === 'country' ? `Identify the highlighted ${placeNoun}` : 'Name the capital'}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 15 }}>
                <div style={{
                  flex: 1,
                  minWidth: 0,
                  fontFamily: 'var(--ff-d)', fontSize: 27, fontWeight: 400,
                  color: 'var(--t1)', lineHeight: 1.2,
                  overflowWrap: 'anywhere',
                }}>
                  {currentPrompt.promptType === 'country'
                    ? `Name this ${placeNoun}`
                    : currentCountry ? `Capital of ${currentCountry.name}?` : '…'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0, minWidth: 96, paddingTop: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)', letterSpacing: '0.06em', lineHeight: 1 }}>
                    {streak >= 5 ? '🔥 ' : '✦ '}x{Math.max(streak, 1)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4, lineHeight: 1 }}>
                    <span style={{
                      fontFamily: 'var(--ff-d)', fontSize: 26, fontWeight: 300,
                      color: 'var(--gold-hi)', lineHeight: 1,
                    }}>{session.score}</span>
                    <span style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.06em', lineHeight: 1 }}>pts</span>
                  </div>
                </div>
              </div>

              {/* Region tag */}
              {currentCountry && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase',
                  color: 'var(--olive)', background: 'rgba(86,116,40,0.08)',
                  border: '1px solid rgba(86,116,40,0.22)', borderRadius: 3,
                  padding: '3px 9px', marginBottom: 22, alignSelf: 'flex-start',
                  fontFamily: 'var(--ff-u)',
                }}>
                  {currentCountry.region}
                </div>
              )}

              {/* Input */}
              {!showFeedbackOk && !showFeedbackMiss && (
                <div style={{
                  display: 'flex', alignItems: 'center',
                  border: showWrongFeedback
                    ? '1px solid var(--miss)'
                    : '1px solid var(--border-hi)',
                  borderRadius: 3, overflow: 'hidden',
                  background: showWrongFeedback ? 'rgba(132,40,32,0.06)' : 'var(--bg)',
                  transition: 'border-color 0.18s, box-shadow 0.18s',
                  boxShadow: showWrongFeedback ? 'none' : undefined,
                  marginBottom: 13,
                  animation: showWrongFeedback ? 'shake 0.5s ease-in-out' : undefined,
                }}>
                  <input
                    ref={inputRef}
                    type="text"
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    disabled={!isPlaying || showWrongFeedback || promptLocked}
                    placeholder="Type your answer…"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{
                      flex: 1, padding: '13px 16px',
                      fontFamily: 'var(--ff-u)', fontSize: 15, fontWeight: 400,
                      color: 'var(--t1)', background: 'transparent',
                      border: 'none', outline: 'none',
                      opacity: (!isPlaying || showWrongFeedback || promptLocked) ? 0.6 : 1,
                    }}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={!isPlaying || showWrongFeedback || promptLocked}
                    style={{
                      padding: '0 16px', height: 46,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--olive)', borderLeft: '1px solid var(--border)',
                      cursor: (!isPlaying || promptLocked) ? 'default' : 'pointer',
                      background: 'none', opacity: (!isPlaying || promptLocked) ? 0.35 : 1,
                      transition: 'color 0.14s',
                    }}
                  >
                    <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4,9 L14,9 M10,5 L14,9 L10,13"/>
                    </svg>
                  </button>
                </div>
              )}

              {isPromptRendering && currentPrompt && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  fontSize: 11, color: 'var(--t3)', letterSpacing: '0.06em',
                  marginBottom: 12, fontFamily: 'var(--ff-u)',
                }}>
                  <div className="animate-spin" style={{ width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
                  <span>{globeBooted ? 'Locating next target…' : isUsStates ? 'Rendering map…' : 'Rendering globe…'}</span>
                </div>
              )}

              {/* Correct feedback */}
              {showFeedbackOk && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 13, padding: '9px 13px', borderRadius: 3,
                  marginBottom: 14,
                  color: 'var(--ok-hi)', background: 'rgba(58,92,28,0.10)',
                  border: '1px solid rgba(58,92,28,0.22)', fontWeight: 500,
                }}>
                  <svg viewBox="0 0 18 18" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3,9 L7,13 L15,5" strokeLinecap="round"/>
                  </svg>
                  {inputState === 'fuzzy' ? 'Close enough!' : 'Correct'}
                  {lastPoints != null && lastPoints > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      fontFamily: 'var(--ff-d)', fontSize: 18, fontWeight: 600,
                      color: 'var(--gold-hi)', letterSpacing: '0.02em',
                    }}>
                      +{lastPoints}
                    </span>
                  )}
                  {streak >= 2 && (
                    <span style={{ fontWeight: 600, color: 'var(--gold-hi)', fontSize: 12 }}>
                      ×{streak}
                    </span>
                  )}
                </div>
              )}

              {/* Wrong feedback (shows correct answer) */}
              {showFeedbackMiss && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 13px', borderRadius: 3, marginBottom: 14,
                  color: 'var(--miss-hi)', background: 'rgba(132,40,32,0.10)',
                  border: '1px solid rgba(132,40,32,0.20)',
                  fontFamily: 'var(--ff-d)', fontSize: 16, fontWeight: 400,
                }}>
                  {wrongAnswer}
                </div>
              )}

              {/* Hint message */}
              {hintMsg && !showFeedbackOk && !showFeedbackMiss && (
                <div style={{
                  fontSize: 12, color: 'var(--t2)', letterSpacing: '0.03em',
                  padding: '8px 0', borderTop: '1px solid var(--border)',
                  marginBottom: 14, fontStyle: 'italic',
                  fontFamily: 'var(--ff-u)',
                }}>
                  {hintMsg}
                </div>
              )}

              {/* Hint + Skip buttons */}
              {isPlaying && !showFeedbackOk && !showFeedbackMiss && !showWrongFeedback && !promptLocked && (
                <div className="game-action-row" style={{ gap: 8, marginTop: 'auto', paddingTop: 22 }}>
                  <button
                    onClick={handleHint}
                    disabled={hintUsed}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 3,
                      fontSize: 12, letterSpacing: '0.05em', fontWeight: 500,
                      border: '1px solid var(--border-hi)', color: 'var(--t2)',
                      background: 'var(--bg)', cursor: hintUsed ? 'default' : 'pointer',
                      opacity: hintUsed ? 0.4 : 1, fontFamily: 'var(--ff-u)',
                      transition: 'background 0.14s, border-color 0.14s',
                    }}
                  >
                    {hintUsed ? 'Hint used' : 'Hint (−50%)'}
                  </button>
                  <button
                    onClick={handleSkip}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 3,
                      fontSize: 12, letterSpacing: '0.05em', fontWeight: 500,
                      border: '1px solid var(--border)', color: 'var(--t3)',
                      background: 'transparent', cursor: 'pointer',
                      fontFamily: 'var(--ff-u)',
                      transition: 'color 0.14s, border-color 0.14s',
                    }}
                  >
                    Skip
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em',
              marginTop: 36,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--gold)', animation: 'blink 1s ease-in-out infinite',
              }} />
              <span>Locating…</span>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL — Globe ── */}
      <div className="responsive-globe-panel" style={{
        flex: 1, position: 'relative', overflow: 'hidden',
        background: '#05080d',
      }}>
        <SpaceBackdrop />
        {!isUsStates && (
        <button
          onClick={() => setRecenterToken((value) => value + 1)}
          title="Recenter globe"
          style={{
            position: 'absolute', top: 18, right: 18, zIndex: 12,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(7,10,15,0.68)', color: 'rgba(244,231,205,0.92)',
            backdropFilter: 'blur(10px)', cursor: 'pointer',
            fontFamily: 'var(--ff-u)', fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          <svg viewBox="0 0 18 18" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="9" cy="9" r="5.2" />
            <path d="M9 1.8v2.2M9 14v2.2M1.8 9H4M14 9h2.2" />
          </svg>
          Recenter
        </button>
        )}
        {/* Map fills the full panel — no fixed size so zoom/pan use all the space */}
        <div style={{ position: 'absolute', inset: 0 }}>
          {isUsStates ? (
            <UsStatesMap
              colorMap={colorMap}
              currentId={pendingPrompt?.countryId ?? currentPrompt?.countryId ?? null}
              focusToken={focusToken}
              recenterToken={recenterToken}
              onReady={handleGlobeReady}
              onTargetReady={commitRenderedPrompt}
              promptIndex={promptIndex}
            />
          ) : (
            <OrbisGlobe
              colorMap={colorMap}
              currentId={pendingPrompt?.countryId ?? currentPrompt?.countryId ?? null}
              focusToken={focusToken}
              recenterToken={recenterToken}
              onReady={handleGlobeReady}
              onTargetReady={commitRenderedPrompt}
              promptIndex={promptIndex}
            />
          )}
        </div>

        <ResultFlash trigger={flash} />

        {/* Pause overlay */}
        {isPaused && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 30,
          }}>
            <div style={{
              background: 'var(--s1)', borderRadius: 4, padding: '32px min(40px, 7vw)',
              textAlign: 'center', border: '1px solid var(--border)',
              boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
              width: 'min(92vw, 360px)',
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>⏸</div>
              <h2 style={{
                fontFamily: 'var(--ff-d)', fontSize: 24, fontWeight: 400,
                color: 'var(--t1)', marginBottom: 20,
              }}>Paused</h2>
              <button
                onClick={handleResume}
                style={{
                  background: 'rgba(135,100,24,0.12)', border: '1px solid rgba(135,100,24,0.32)',
                  color: 'var(--gold-hi)', fontSize: 13, fontWeight: 500,
                  letterSpacing: '0.06em', padding: '10px 24px', borderRadius: 3,
                  cursor: 'pointer', fontFamily: 'var(--ff-u)',
                }}
              >
                ▶ Resume
              </button>
            </div>
          </div>
        )}

        <div style={{
          position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.25)', pointerEvents: 'none',
          fontFamily: 'var(--ff-u)',
        }}>
          {isUsStates ? 'Identify the highlighted state' : 'Drag to rotate · Scroll to zoom'}
        </div>
      </div>

      {session.phase === 'gameover' && (
        <GameOverModal
          session={session}
          isNewBest={isNewBest}
          onPlayAgain={handleReset}
          onPractice={onPractice}
          onViewProgress={onViewProgress}
          onViewLeaderboard={onViewLeaderboard}
          onReturnToMenu={onBackToMenu}
          user={user}
        />
      )}
    </div>
  );
}

function TimerRing({ timeRemaining, totalSeconds }: { timeRemaining: number; totalSeconds: number }) {
  const pct      = totalSeconds > 0 ? timeRemaining / totalSeconds : 0;
  const radius   = 14;
  const circ     = 2 * Math.PI * radius;
  const dash     = circ * pct;
  const isLow    = timeRemaining <= 30;
  const isCrit   = timeRemaining <= 10;
  const color    = isCrit ? '#a83428' : isLow ? '#876418' : 'var(--olive)';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="18" cy="18" r={radius} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle
          cx="18" cy="18" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s linear, stroke 0.5s' }}
        />
      </svg>
      <span style={{
        fontFamily: 'var(--ff-d)', fontWeight: 300, fontSize: 15,
        color: isCrit ? 'var(--miss)' : isLow ? 'var(--gold)' : 'var(--t2)',
        letterSpacing: '0.02em', minWidth: '2.8rem',
      }}>
        {formatTime(timeRemaining)}
      </span>
    </div>
  );
}
