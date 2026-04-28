import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GlobeMap as OrbisGlobe } from './GlobeMap';
import { ResultFlash } from './ResultFlash';
import { BotanicalCorner } from '../ui/BotanicalCorner';
import type { GamePrompt, GameSettings, VersusPlayerState } from '../../types';
import { useGameEngine, buildQueue } from '../../hooks/useGameEngine';
import { useTimer } from '../../hooks/useTimer';
import type { useVersusMultiplayer } from '../../hooks/useVersusMultiplayer';
import type { useProgress } from '../../hooks/useProgress';
import type { User } from '@supabase/supabase-js';
import countriesData from '../../data/countries.json';
import type { CountryEntry } from '../../types';

const countries = countriesData as CountryEntry[];
const countryMap = new Map(countries.map(c => [c.id, c]));

interface VersusGameViewProps {
  settings: GameSettings;
  user: User;
  onBackToMenu: () => void;
  versusHook: ReturnType<typeof useVersusMultiplayer>;
  progress: ReturnType<typeof useProgress>;
}

type InputState = 'idle' | 'correct' | 'fuzzy' | 'wrong';
type FlashTrigger = { points?: number; type: 'correct' | 'wrong' | 'fuzzy' | 'skip'; label?: string } | null;

const FEEDBACK_DELAY_MS = 180;
const SKIP_DELAY_MS = 900;
const WRONG_DELAY_MS = 1100;

export function VersusGameView({ settings, user, onBackToMenu, versusHook, progress }: VersusGameViewProps) {
  const [currentPrompt, setCurrentPrompt] = useState<GamePrompt | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<GamePrompt | null>(null);
  const [inputState, setInputState]         = useState<InputState>('idle');
  const [flash, setFlash]                   = useState<FlashTrigger>(null);
  const [wrongAnswer, setWrongAnswer]       = useState('');
  const [showWrongFeedback, setShowWrongFeedback] = useState(false);
  const [promptIndex, setPromptIndex]       = useState(0);
  const [focusToken, setFocusToken]         = useState(0);
  const [globeBooted, setGlobeBooted]       = useState(false);
  const [isPromptRendering, setIsPromptRendering] = useState(true);
  const [recenterToken, setRecenterToken]   = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordedResultRef = useRef(false);
  const timerStartedRef = useRef(false);
  const pendingPromptRef = useRef<GamePrompt | null>(null);
  const focusTokenRef = useRef(0);

  const { recordAttempt, recordVersusResult } = progress;

  const handleFinish = useCallback(() => {
    // Finish handled internally
  }, []);

  const engine = useGameEngine(recordAttempt, handleFinish);
  const { session, getFirstPrompt, submitAnswer, endGame } = engine;

  const queuePromptForRender = useCallback((nextPrompt: GamePrompt | null) => {
    pendingPromptRef.current = nextPrompt;
    setPendingPrompt(nextPrompt);
    setCurrentPrompt(nextPrompt);
    setIsPromptRendering(Boolean(nextPrompt));

    if (inputRef.current) {
      inputRef.current.blur();
      inputRef.current.value = '';
    }

    if (!nextPrompt) {
      return;
    }

    focusTokenRef.current += 1;
    setFocusToken(focusTokenRef.current);
  }, []);

  const handleTimerExpire = useCallback(() => {
    endGame(session.score, session.maxStreak);
  }, [endGame, session.score, session.maxStreak]);

  const { timeRemaining, start: startTimer } =
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

  // Initialize once a real versus queue is available.
  useEffect(() => {
    if (session.phase !== 'idle') {
      return;
    }

    const queue = versusHook.lobbyState?.queue;
    if (queue && queue.length > 0) {
      engine.startGame(settings, queue);
      return;
    }

    if (versusHook.isHost) {
      const generatedQueue = buildQueue(settings);
      versusHook.startGame(generatedQueue, settings);
      engine.startGame(settings, generatedQueue);
    }
  }, [engine, session.phase, settings, versusHook]);

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

  // Broadcast State
  useEffect(() => {
    if (!user) return;
    const playerState: VersusPlayerState = {
      userId: user.id,
      username: user.email?.split('@')[0] || 'Player',
      score: session.score,
      timeRemaining,
      phase: session.phase,
      streak: session.streak,
      currentPromptIndex: promptIndex,
    };
    versusHook.broadcastState(playerState);
  }, [promptIndex, session.phase, session.score, session.streak, timeRemaining, user, versusHook]);

  useEffect(() => {
    if (inputState === 'idle' && session.phase === 'playing' && currentPrompt && !isPromptRendering) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [currentPrompt, inputState, isPromptRendering, session.phase]);

  function triggerFlash(f: FlashTrigger) {
    setFlash(null);
    requestAnimationFrame(() => setFlash(f));
  }

  const handleSubmit = useCallback(() => {
    if (!currentPrompt || session.phase !== 'playing') return;
    const trimmed = inputRef.current?.value.trim() ?? '';
    if (!trimmed) return;

    const result = submitAnswer(trimmed, currentPrompt, session.streak, false);
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
      triggerFlash({ type: 'fuzzy', points: result.points });
      setTimeout(() => {
        setInputState('idle');
        queuePromptForRender(result.nextPrompt ?? null);
        setPromptIndex(i => i + 1);
      }, FEEDBACK_DELAY_MS);
    } else {
      setInputState('correct');
      triggerFlash({ type: 'correct', points: result.points });
      setTimeout(() => {
        setInputState('idle');
        queuePromptForRender(result.nextPrompt ?? null);
        setPromptIndex(i => i + 1);
      }, FEEDBACK_DELAY_MS);
    }
  }, [currentPrompt, session.phase, session.streak, submitAnswer, queuePromptForRender]);

  function handleSkip() {
    if (!currentPrompt || session.phase !== 'playing') return;
    const result = submitAnswer('', currentPrompt, session.streak, false);
    if (result?.tier === 'wrong') {
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

  const colorMap = useMemo(() => {
    const map: Record<string, import('../../types').CountryColorState> = {};
    for (const key of session.skipped) { const [id] = key.split(':'); map[id] = 'skipped'; }
    for (const key of session.wrong)   { const [id] = key.split(':'); map[id] = 'wrong'; }
    for (const key of session.answered){ const [id] = key.split(':'); map[id] = 'correct'; }
    const activePrompt = pendingPrompt ?? currentPrompt;
    if (activePrompt?.countryId) {
      map[activePrompt.countryId] = 'current';
    }
    return map;
  }, [currentPrompt, pendingPrompt, session.answered, session.skipped, session.wrong]);

  const currentCountry   = currentPrompt ? countryMap.get(currentPrompt.countryId) : null;
  const isPlaying        = session.phase === 'playing';
  const showFeedbackOk   = (inputState === 'correct' || inputState === 'fuzzy') && !!currentCountry;
  const showFeedbackMiss = inputState === 'wrong' && !!wrongAnswer;
  const promptLocked     = isPromptRendering || !currentPrompt;
  const otherPlayers = useMemo(() => {
    const players = versusHook.lobbyState?.players ?? [];
    return players.filter(player => player.userId !== user.id);
  }, [user.id, versusHook.lobbyState?.players]);
  const leaderboardPlayers = useMemo(() => {
    const selfState: VersusPlayerState = {
      userId: user.id,
      username: user.email?.split('@')[0] || 'Player',
      score: session.score,
      timeRemaining,
      phase: session.phase,
      streak: session.streak,
      currentPromptIndex: promptIndex,
    };

    const players = [...otherPlayers, selfState];
    return players.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.currentPromptIndex !== a.currentPromptIndex) return b.currentPromptIndex - a.currentPromptIndex;
      return a.username.localeCompare(b.username);
    });
  }, [otherPlayers, promptIndex, session.phase, session.score, session.streak, timeRemaining, user.email, user.id]);
  const topScore = leaderboardPlayers[0]?.score ?? 0;
  const leaders = leaderboardPlayers.filter(player => player.score === topScore);
  const isTopTie = leaders.length > 1;
  const didUserWin = topScore > 0 && leaders.length === 1 && leaders[0]?.userId === user.id;
  const didUserDraw = leaders.some(player => player.userId === user.id) && isTopTie;

  // Has the game ended?
  const isGameOver = session.phase === 'gameover' || versusHook.lobbyState?.status === 'finished';

  // Calculate winner on gameover
  useEffect(() => {
    if (isGameOver && otherPlayers.length > 0 && !recordedResultRef.current) {
      recordedResultRef.current = true;
      if (recordVersusResult) recordVersusResult(didUserWin);
    }
  }, [didUserWin, isGameOver, otherPlayers.length, recordVersusResult]);

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
            Leave
          </button>

          <div style={{
            flex: 1, textAlign: 'center',
            fontFamily: 'var(--ff-d)', fontSize: 15, fontWeight: 400,
            letterSpacing: '0.09em', color: 'var(--t2)',
            minWidth: 120,
          }}>
            VERSUS
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{
              fontFamily: 'var(--ff-d)', fontSize: 26, fontWeight: 300,
              color: 'var(--gold-hi)', lineHeight: 1,
            }}>{session.score}</span>
            <span style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.06em' }}>pts</span>
          </div>

          {/* Timer */}
          {!settings.noTimeLimit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 10 }}>
               <span style={{
                  fontFamily: 'var(--ff-d)', fontWeight: 300, fontSize: 15,
                  color: timeRemaining <= 10 ? 'var(--miss)' : 'var(--t2)',
                }}>
                  {Math.floor(timeRemaining / 60)}:{String(timeRemaining % 60).padStart(2, '0')}
                </span>
            </div>
          )}
        </div>

        {/* Standings Overlay */}
        <div className="game-progress-strip" style={{
          alignItems: 'stretch', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--border)',
          background: 'rgba(135,100,24,0.05)', flexShrink: 0,
          flexDirection: 'column', gap: 10,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>⚔️</span>
              <span style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--ff-u)' }}>
                Live standings
              </span>
            </div>
            <span style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {leaderboardPlayers.length} players
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {leaderboardPlayers.map((player, index) => {
              const isSelf = player.userId === user.id;
              const isLeader = player.score === topScore && topScore > 0;

              return (
                <div
                  key={player.userId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: 3,
                    border: isSelf ? '1px solid rgba(135,100,24,0.32)' : '1px solid var(--border)',
                    background: isSelf ? 'rgba(135,100,24,0.08)' : 'var(--bg)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: 'var(--t3)', width: 18 }}>
                      #{index + 1}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--ff-u)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {player.username}{isSelf ? ' (You)' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
                    <span style={{
                      fontFamily: 'var(--ff-d)', fontSize: 18, fontWeight: 300,
                      color: isLeader ? 'var(--gold-hi)' : 'var(--t2)',
                    }}>{player.score}</span>
                    <span style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.06em' }}>pts</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Body (scrollable) */}
        <div className="responsive-panel-body" style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '28px 28px 20px',
          display: 'flex', flexDirection: 'column',
        }}>
          {isGameOver ? null
          : session.phase === 'idle' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em', marginTop: 36 }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
              <span>Waiting…</span>
            </div>
          ) : !currentPrompt && isPromptRendering ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em', marginTop: 36 }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
              <span>{globeBooted ? 'Rendering target…' : 'Rendering globe…'}</span>
            </div>
          ) : currentPrompt ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, animation: 'fade-up 0.36s ease forwards' }}>
              <div style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--t3)', marginBottom: 10, fontWeight: 500,
                fontFamily: 'var(--ff-u)',
              }}>
                {currentPrompt.promptType === 'country' ? 'Identify the highlighted country' : 'Name the capital'}
              </div>

              <div style={{
                fontFamily: 'var(--ff-d)', fontSize: 27, fontWeight: 400,
                color: 'var(--t1)', lineHeight: 1.25, marginBottom: 15,
              }}>
                {currentPrompt.promptType === 'country'
                  ? 'Name this country'
                  : currentCountry ? `Capital of ${currentCountry.name}?` : '…'}
              </div>

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
                  <span>{globeBooted ? 'Locating next target…' : 'Rendering globe…'}</span>
                </div>
              )}

              {/* Feedback States */}
              {showFeedbackOk && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 13, padding: '9px 13px', borderRadius: 3,
                  marginBottom: 14,
                  color: 'var(--ok-hi)', background: 'rgba(58,92,28,0.10)',
                  border: '1px solid rgba(58,92,28,0.22)', fontWeight: 500,
                }}>
                  Correct
                </div>
              )}

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

              {isPlaying && !showFeedbackOk && !showFeedbackMiss && !showWrongFeedback && !promptLocked && (
                <div className="game-action-row" style={{ gap: 8, marginTop: 'auto', paddingTop: 22 }}>
                  <button
                    onClick={handleSkip}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 3,
                      fontSize: 12, letterSpacing: '0.05em', fontWeight: 500,
                      border: '1px solid var(--border)', color: 'var(--t3)',
                      background: 'transparent', cursor: 'pointer',
                      fontFamily: 'var(--ff-u)',
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
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', position: 'relative', background: '#05080d',
      }}>
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
        <OrbisGlobe
          colorMap={colorMap}
          currentId={pendingPrompt?.countryId ?? currentPrompt?.countryId ?? null}
          focusToken={focusToken}
          recenterToken={recenterToken}
          onReady={() => setGlobeBooted(true)}
          onTargetReady={commitRenderedPrompt}
          promptIndex={promptIndex}
        />
        <ResultFlash trigger={flash} />
      </div>

      {isGameOver && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg)', border: '1px solid var(--border)',
            borderRadius: 4, padding: '40px min(50px, 7vw)',
            width: 'min(420px, 92vw)', textAlign: 'center',
            boxShadow: '0 12px 48px rgba(0,0,0,0.25)',
          }}>
            <h2 style={{
              fontFamily: 'var(--ff-d)', fontSize: 36, color: 'var(--t1)', marginBottom: 8,
            }}>
              {versusHook.lobbyState?.status === 'finished' ? 'Host Disconnected' : 
                (didUserWin ? 'Victory!' : didUserDraw ? 'Draw!' : 'Defeat!')
              }
            </h2>
            <div style={{ marginBottom: 30, color: 'var(--t3)', fontSize: 14 }}>
              Final Scores
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 30 }}>
              {leaderboardPlayers.map((player, index) => {
                const isSelf = player.userId === user.id;
                const isLeader = player.score === topScore && topScore > 0;

                return (
                  <div
                    key={player.userId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px',
                      background: 'var(--s1)',
                      borderRadius: 4,
                      border: isSelf ? '1px solid rgba(135,100,24,0.32)' : '1px solid transparent',
                    }}
                  >
                    <span>
                      #{index + 1} {player.username}{isSelf ? ' (You)' : ''}
                    </span>
                    <span style={{ color: isLeader ? 'var(--gold-hi)' : 'var(--t2)' }}>{player.score}</span>
                  </div>
                );
              })}
            </div>

            <button
              onClick={onBackToMenu}
              style={{
                width: '100%', padding: '12px',
                background: 'rgba(135,100,24,0.12)', border: '1px solid rgba(135,100,24,0.32)',
                color: 'var(--gold-hi)', borderRadius: 3, cursor: 'pointer',
                fontFamily: 'var(--ff-u)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.1em',
              }}
            >
              Return to Menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
