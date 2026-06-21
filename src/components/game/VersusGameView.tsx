import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { GlobeMap as OrbisGlobe } from './GlobeMap';
import { ResultFlash } from './ResultFlash';
import { BotanicalCorner } from '../ui/BotanicalCorner';
import type {
  CountryEntry,
  GamePrompt,
  GameSettings,
  VersusActiveEffect,
  VersusPlayerState,
  VersusPowerup,
  VersusStreakRewardState,
} from '../../types';
import { useGameEngine, buildQueue } from '../../hooks/useGameEngine';
import { useTimer } from '../../hooks/useTimer';
import type { useVersusMultiplayer } from '../../hooks/useVersusMultiplayer';
import type { useProgress } from '../../hooks/useProgress';
import type { User } from '@supabase/supabase-js';
import countriesData from '../../data/countries.json';
import {
  drawRandomPowerup,
  FOG_CAPITAL_DURATION_MS,
  FOG_DURATION_MS,
  LOCK_DURATION_MS,
  MAX_HELD_POWERUPS,
  POWERUP_COOLDOWN_MS,
  TIME_BANK_SECONDS,
  VERSUS_POWERUP_DESCRIPTIONS,
  VERSUS_POWERUP_LABELS,
} from '../../lib/versusPowerups';

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

const FEEDBACK_DELAY_MS = 90;
const SKIP_DELAY_MS = 420;
const WRONG_DELAY_MS = 650;

function getAnswerText(prompt: GamePrompt | null): string {
  if (!prompt) return '';
  const country = countryMap.get(prompt.countryId);
  if (!country) return '';
  return prompt.promptType === 'country' ? country.name : country.capital;
}

function getHintLetter(prompt: GamePrompt | null): string | null {
  const answer = getAnswerText(prompt).trim();
  return answer ? answer.charAt(0).toUpperCase() : null;
}

function effectEquals(a: VersusActiveEffect | null, b: VersusActiveEffect | null): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.type === b.type
    && a.startedAt === b.startedAt
    && a.sourceUserId === b.sourceUserId
    && a.targetUserId === b.targetUserId
    && a.expiresAt === b.expiresAt
    && a.promptIndex === b.promptIndex
    && a.promptsRemaining === b.promptsRemaining
    && a.applyToNextPrompt === b.applyToNextPrompt;
}

function createPlayerState(
  user: User,
  emoji: string,
  score: number,
  timeRemaining: number,
  phase: VersusPlayerState['phase'],
  streak: number,
  currentPromptIndex: number,
  heldPowerups: VersusPowerup[],
  activeEffect: VersusActiveEffect | null,
  powerupCooldownUntil: number,
  currentCorrectStreakRewardState: VersusStreakRewardState,
): VersusPlayerState {
  return {
    userId: user.id,
    username: user.email?.split('@')[0] || 'Player',
    emoji,
    score,
    timeRemaining,
    phase,
    streak,
    currentPromptIndex,
    heldPowerups,
    activeEffect,
    powerupCooldownUntil,
    currentCorrectStreakRewardState,
  };
}

export function VersusGameView({ settings, user, onBackToMenu, versusHook, progress }: VersusGameViewProps) {
  const [currentPrompt, setCurrentPrompt] = useState<GamePrompt | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<GamePrompt | null>(null);
  const [inputState, setInputState] = useState<InputState>('idle');
  const [flash, setFlash] = useState<FlashTrigger>(null);
  const [wrongAnswer, setWrongAnswer] = useState('');
  const [showWrongFeedback, setShowWrongFeedback] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const [focusToken, setFocusToken] = useState(0);
  const [globeBooted, setGlobeBooted] = useState(false);
  const [isPromptRendering, setIsPromptRendering] = useState(true);
  const [recenterToken, setRecenterToken] = useState(0);
  const [heldPowerups, setHeldPowerups] = useState<VersusPowerup[]>([]);
  const [activeEffect, setActiveEffect] = useState<VersusActiveEffect | null>(null);
  const [powerupCooldownUntil, setPowerupCooldownUntil] = useState(0);
  const [cooldownNow, setCooldownNow] = useState(0);
  const [rewardState, setRewardState] = useState<VersusStreakRewardState>('none');
  const [effectBanner, setEffectBanner] = useState<string | null>(null);
  const [showStandings, setShowStandings] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const recordedResultRef = useRef(false);
  const timerStartedRef = useRef(false);
  const pendingPromptRef = useRef<GamePrompt | null>(null);
  const focusTokenRef = useRef(0);
  const effectBannerTimeoutRef = useRef<number | null>(null);

  const { recordAttempt, recordVersusResult } = progress;
  const currentLobbyPlayer = versusHook.lobbyState?.players.find(player => player.userId === user.id);
  const currentPlayerEmoji = currentLobbyPlayer?.emoji ?? '🌍';
  const effectLog = useMemo(() => versusHook.lobbyState?.effectLog ?? [], [versusHook.lobbyState?.effectLog]);
  const otherPlayers = useMemo(() => {
    const players = versusHook.lobbyState?.players ?? [];
    return players.filter(player => player.userId !== user.id);
  }, [user.id, versusHook.lobbyState?.players]);
  const opponent = otherPlayers[0] ?? null;

  const handleFinish = useCallback(() => {
    // Finish handled internally.
  }, []);

  const engine = useGameEngine(recordAttempt, handleFinish);
  const { session, getFirstPrompt, submitAnswer, submitSkip, endGame } = engine;

  const showBanner = useCallback((message: string) => {
    setEffectBanner(message);
    if (effectBannerTimeoutRef.current) {
      window.clearTimeout(effectBannerTimeoutRef.current);
    }
    effectBannerTimeoutRef.current = window.setTimeout(() => {
      setEffectBanner(null);
    }, 2200);
  }, []);

  const syncSelfPowerupState = useCallback((patch: Partial<VersusPlayerState>) => {
    versusHook.syncPowerupState(user.id, patch);
  }, [user.id, versusHook]);

  const setActiveEffectState = useCallback((next: VersusActiveEffect | null) => {
    setActiveEffect(next);
    syncSelfPowerupState({ activeEffect: next });
  }, [syncSelfPowerupState]);

  const expireCurrentEffect = useCallback((expectedType?: VersusPowerup) => {
    setActiveEffect(prev => {
      if (!prev) return prev;
      if (expectedType && prev.type !== expectedType) return prev;
      versusHook.expireEffect(user.id, prev.type);
      return null;
    });
    syncSelfPowerupState({ activeEffect: null });
  }, [syncSelfPowerupState, user.id, versusHook]);

  const queuePromptForRender = useCallback((nextPrompt: GamePrompt | null) => {
    pendingPromptRef.current = nextPrompt;
    setPendingPrompt(nextPrompt);
    setCurrentPrompt(nextPrompt);
    setIsPromptRendering(Boolean(nextPrompt));

    if (inputRef.current) {
      inputRef.current.blur();
      inputRef.current.value = '';
    }

    if (!nextPrompt) return;

    focusTokenRef.current += 1;
    setFocusToken(focusTokenRef.current);
  }, []);

  const handleTimerExpire = useCallback(() => {
    endGame(session.score, session.maxStreak);
  }, [endGame, session.maxStreak, session.score]);

  const { timeRemaining, start: startTimer, addSeconds } =
    useTimer(settings.timeLimitSeconds, settings.noTimeLimit, handleTimerExpire);

  const commitRenderedPrompt = useCallback((token: number) => {
    if (token !== focusTokenRef.current) return;

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

  useEffect(() => {
    return () => {
      if (effectBannerTimeoutRef.current) {
        window.clearTimeout(effectBannerTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!currentLobbyPlayer) return;
    if (currentLobbyPlayer.heldPowerups.length > 0 && heldPowerups.length === 0) {
      setHeldPowerups(currentLobbyPlayer.heldPowerups);
    }
    if (currentLobbyPlayer.powerupCooldownUntil > powerupCooldownUntil) {
      setPowerupCooldownUntil(currentLobbyPlayer.powerupCooldownUntil);
    }
    if (rewardState === 'none' && currentLobbyPlayer.currentCorrectStreakRewardState !== 'none') {
      setRewardState(currentLobbyPlayer.currentCorrectStreakRewardState);
    }
    if (!effectEquals(activeEffect, currentLobbyPlayer.activeEffect)) {
      setActiveEffect(currentLobbyPlayer.activeEffect);
    }
  }, [activeEffect, currentLobbyPlayer, heldPowerups.length, powerupCooldownUntil, rewardState]);

  useEffect(() => {
    if (effectLog.length === 0) return;
    const last = effectLog[effectLog.length - 1];
    if (!last) return;
    const isRelevant = !last.targetUserId || last.targetUserId === user.id || last.message.includes('(You)');
    if (isRelevant) {
      showBanner(last.message);
    }
  }, [effectLog, showBanner, user.id]);

  useEffect(() => {
    if (session.phase !== 'idle') return;

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

  useEffect(() => {
    if (!user) return;
    const playerState = createPlayerState(
      user,
      currentPlayerEmoji,
      session.score,
      timeRemaining,
      session.phase,
      session.streak,
      promptIndex,
      heldPowerups,
      activeEffect,
      powerupCooldownUntil,
      rewardState,
    );
    versusHook.broadcastState(playerState);
  }, [
    activeEffect,
    currentPlayerEmoji,
    heldPowerups,
    powerupCooldownUntil,
    promptIndex,
    rewardState,
    session.phase,
    session.score,
    session.streak,
    timeRemaining,
    user,
    versusHook,
  ]);

  useEffect(() => {
    if (inputState === 'idle' && session.phase === 'playing' && currentPrompt && !isPromptRendering) {
      window.setTimeout(() => inputRef.current?.focus(), 24);
    }
  }, [currentPrompt, inputState, isPromptRendering, session.phase]);

  useEffect(() => {
    if (!powerupCooldownUntil) {
      setCooldownNow(0);
      return;
    }

    const updateCooldownNow = () => setCooldownNow(Date.now());
    updateCooldownNow();

    const interval = window.setInterval(updateCooldownNow, 250);
    return () => window.clearInterval(interval);
  }, [powerupCooldownUntil]);

  useEffect(() => {
    if (!activeEffect?.expiresAt) return;
    const delay = Math.max(0, activeEffect.expiresAt - Date.now());
    const timeout = window.setTimeout(() => {
      expireCurrentEffect(activeEffect.type);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [activeEffect, expireCurrentEffect]);

  useEffect(() => {
    if (!activeEffect) return;
    if (activeEffect.type === 'scout' && promptIndex > (activeEffect.promptIndex ?? -1) + 1) {
      expireCurrentEffect('scout');
    }
    if (activeEffect.type === 'streak-shield' && promptIndex - (activeEffect.promptIndex ?? 0) >= 3) {
      expireCurrentEffect('streak-shield');
    }
  }, [activeEffect, expireCurrentEffect, promptIndex]);

  const currentCountry = currentPrompt ? countryMap.get(currentPrompt.countryId) : null;
  const scoutAppliesToCurrentPrompt = activeEffect?.type === 'scout'
    && activeEffect.applyToNextPrompt
    && promptIndex > (activeEffect.promptIndex ?? -1);
  const hintLetter = scoutAppliesToCurrentPrompt ? getHintLetter(currentPrompt) : null;
  const streakShieldReady = activeEffect?.type === 'streak-shield';
  const freezeActive = activeEffect?.type === 'lock';
  const fogActive = activeEffect?.type === 'fog';
  const isCapitalPrompt = currentPrompt?.promptType === 'capital';
  const isPlaying = session.phase === 'playing';
  const showFeedbackOk = (inputState === 'correct' || inputState === 'fuzzy') && !!currentCountry;
  const showFeedbackMiss = inputState === 'wrong' && !!wrongAnswer;
  const promptLocked = isPromptRendering || !currentPrompt;

  const grantEarnedPowerup = useCallback((nextRewardState: VersusStreakRewardState) => {
    setRewardState(nextRewardState);
    syncSelfPowerupState({ currentCorrectStreakRewardState: nextRewardState });

    setHeldPowerups(prev => {
      if (prev.length >= MAX_HELD_POWERUPS) return prev;
      const next = [...prev, drawRandomPowerup(settings)];
      syncSelfPowerupState({ heldPowerups: next });
      return next;
    });
  }, [settings, syncSelfPowerupState]);

  const consumeActiveEffectIfNeeded = useCallback((effectType: VersusPowerup | null) => {
    if (!effectType) return;
    if (activeEffect?.type === effectType) {
      expireCurrentEffect(effectType);
    }
  }, [activeEffect, expireCurrentEffect]);

  function triggerFlash(f: FlashTrigger) {
    setFlash(null);
    requestAnimationFrame(() => setFlash(f));
  }

  const moveToNextPrompt = useCallback((nextPrompt: GamePrompt | null) => {
    queuePromptForRender(nextPrompt ?? null);
    setPromptIndex(i => i + 1);
  }, [queuePromptForRender]);

  const handleSubmit = useCallback(() => {
    if (!currentPrompt || session.phase !== 'playing' || freezeActive) return;
    const trimmed = inputRef.current?.value.trim() ?? '';
    if (!trimmed) return;

    const preserveStreakOnWrong = streakShieldReady;
    const result = submitAnswer(trimmed, currentPrompt, session.streak, false, preserveStreakOnWrong);
    if (!result) return;

    if (result.tier === 'wrong') {
      if (!preserveStreakOnWrong) {
        setRewardState('none');
        syncSelfPowerupState({ currentCorrectStreakRewardState: 'none' });
      } else {
        consumeActiveEffectIfNeeded('streak-shield');
      }
      if (scoutAppliesToCurrentPrompt) {
        consumeActiveEffectIfNeeded('scout');
      }

      setInputState('wrong');
      setWrongAnswer(result.correctAnswer);
      setShowWrongFeedback(true);
      triggerFlash({ type: 'wrong' });
      window.setTimeout(() => {
        setShowWrongFeedback(false);
        setInputState('idle');
        moveToNextPrompt(result.nextPrompt ?? null);
      }, WRONG_DELAY_MS);
      return;
    }

    const newStreak = session.streak + 1;
    if (rewardState === 'none' && newStreak === 3) {
      grantEarnedPowerup('earned3');
    } else if (rewardState === 'earned3' && newStreak === 5) {
      grantEarnedPowerup('earned5');
    }

    if (scoutAppliesToCurrentPrompt) {
      consumeActiveEffectIfNeeded('scout');
    }

    setInputState(result.tier === 'fuzzy' ? 'fuzzy' : 'correct');
    triggerFlash({ type: result.tier === 'fuzzy' ? 'fuzzy' : 'correct', points: result.points });
    window.setTimeout(() => {
      setInputState('idle');
      moveToNextPrompt(result.nextPrompt ?? null);
    }, FEEDBACK_DELAY_MS);
  }, [
    consumeActiveEffectIfNeeded,
    currentPrompt,
    grantEarnedPowerup,
    moveToNextPrompt,
    rewardState,
    scoutAppliesToCurrentPrompt,
    session.phase,
    session.streak,
    streakShieldReady,
    submitAnswer,
    syncSelfPowerupState,
    freezeActive,
  ]);

  const handleSkip = useCallback(() => {
    if (!currentPrompt || session.phase !== 'playing') return;
    const preserveStreak = streakShieldReady;
    const result = submitSkip(currentPrompt, preserveStreak);
    if (!result) return;

    if (!preserveStreak) {
      setRewardState('none');
      syncSelfPowerupState({ currentCorrectStreakRewardState: 'none' });
    } else {
      consumeActiveEffectIfNeeded('streak-shield');
    }
    if (scoutAppliesToCurrentPrompt) {
      consumeActiveEffectIfNeeded('scout');
    }

    setWrongAnswer(result.correctAnswer);
    setShowWrongFeedback(true);
    triggerFlash({ type: 'skip' });
    window.setTimeout(() => {
      setShowWrongFeedback(false);
      moveToNextPrompt(result.nextPrompt ?? null);
    }, SKIP_DELAY_MS);
  }, [
    consumeActiveEffectIfNeeded,
    currentPrompt,
    moveToNextPrompt,
    scoutAppliesToCurrentPrompt,
    session.phase,
    streakShieldReady,
    submitSkip,
    syncSelfPowerupState,
  ]);

  const activatePowerup = useCallback((powerup: VersusPowerup) => {
    const now = Date.now();
    if (!isPlaying) return;
    if (powerup === 'time-bank' && settings.noTimeLimit) return;
    if (powerupCooldownUntil > now) return;
    if (activeEffect) return;
    if (!heldPowerups.includes(powerup)) return;

    const username = user.email?.split('@')[0] || 'Player';
    const nextHeldPowerups = heldPowerups.filter((_, index) => {
      const removeIndex = heldPowerups.indexOf(powerup);
      return index !== removeIndex;
    });

    setHeldPowerups(nextHeldPowerups);
    setPowerupCooldownUntil(now + POWERUP_COOLDOWN_MS);
    syncSelfPowerupState({
      heldPowerups: nextHeldPowerups,
      powerupCooldownUntil: now + POWERUP_COOLDOWN_MS,
    });
    versusHook.usePowerup(powerup, username, opponent?.userId);
    showBanner(`You used ${VERSUS_POWERUP_LABELS[powerup]}`);

    if (powerup === 'scout') {
      const effect: VersusActiveEffect = {
        type: 'scout',
        sourceUserId: user.id,
        sourceUsername: username,
        targetUserId: user.id,
        startedAt: now,
        promptIndex,
        promptsRemaining: 2,
        applyToNextPrompt: true,
      };
      setActiveEffectState(effect);
      return;
    }

    if (powerup === 'streak-shield') {
      const effect: VersusActiveEffect = {
        type: 'streak-shield',
        sourceUserId: user.id,
        sourceUsername: username,
        targetUserId: user.id,
        startedAt: now,
        promptIndex,
        promptsRemaining: 3,
      };
      setActiveEffectState(effect);
      return;
    }

    if (powerup === 'time-bank') {
      addSeconds(TIME_BANK_SECONDS);
      const effect: VersusActiveEffect = {
        type: 'time-bank',
        sourceUserId: user.id,
        sourceUsername: username,
        targetUserId: user.id,
        startedAt: now,
        expiresAt: now + 1200,
      };
      setActiveEffectState(effect);
      return;
    }

    if (!opponent) return;

    if (powerup === 'fog') {
      const duration = currentPrompt?.promptType === 'capital' ? FOG_CAPITAL_DURATION_MS : FOG_DURATION_MS;
      const effect: VersusActiveEffect = {
        type: 'fog',
        sourceUserId: user.id,
        sourceUsername: username,
        targetUserId: opponent.userId,
        startedAt: now,
        expiresAt: now + duration,
        promptIndex: opponent.currentPromptIndex,
      };
      versusHook.applyEffect(opponent.userId, effect, `${username} used ${VERSUS_POWERUP_LABELS.fog} on ${opponent.username}`);
      return;
    }

    const effect: VersusActiveEffect = {
      type: 'lock',
      sourceUserId: user.id,
      sourceUsername: username,
      targetUserId: opponent.userId,
      startedAt: now,
      expiresAt: now + LOCK_DURATION_MS,
    };
    versusHook.applyEffect(opponent.userId, effect, `${username} used ${VERSUS_POWERUP_LABELS.lock} on ${opponent.username}`);
  }, [
    activeEffect,
    addSeconds,
    currentPrompt?.promptType,
    heldPowerups,
    isPlaying,
    opponent,
    powerupCooldownUntil,
    promptIndex,
    settings.noTimeLimit,
    showBanner,
    syncSelfPowerupState,
    user.email,
    user.id,
    versusHook,
    setActiveEffectState,
  ]);

  const colorMap = useMemo(() => {
    const map: Record<string, import('../../types').CountryColorState> = {};
    for (const key of session.skipped) {
      const [id] = key.split(':');
      map[id] = 'skipped';
    }
    for (const key of session.wrong) {
      const [id] = key.split(':');
      map[id] = 'wrong';
    }
    for (const key of session.answered) {
      const [id] = key.split(':');
      map[id] = 'correct';
    }
    const activePrompt = pendingPrompt ?? currentPrompt;
    if (activePrompt?.countryId) {
      map[activePrompt.countryId] = 'current';
    }
    return map;
  }, [currentPrompt, pendingPrompt, session.answered, session.skipped, session.wrong]);

  const leaderboardPlayers = useMemo(() => {
    const selfState = createPlayerState(
      user,
      currentPlayerEmoji,
      session.score,
      timeRemaining,
      session.phase,
      session.streak,
      promptIndex,
      heldPowerups,
      activeEffect,
      powerupCooldownUntil,
      rewardState,
    );

    const players = [...otherPlayers, selfState];
    return players.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.currentPromptIndex !== a.currentPromptIndex) return b.currentPromptIndex - a.currentPromptIndex;
      return a.username.localeCompare(b.username);
    });
  }, [
    activeEffect,
    currentPlayerEmoji,
    heldPowerups,
    otherPlayers,
    powerupCooldownUntil,
    promptIndex,
    rewardState,
    session.phase,
    session.score,
    session.streak,
    timeRemaining,
    user,
  ]);

  const topScore = leaderboardPlayers[0]?.score ?? 0;
  const leaders = leaderboardPlayers.filter(player => player.score === topScore);
  const isTopTie = leaders.length > 1;
  const didUserWin = topScore > 0 && leaders.length === 1 && leaders[0]?.userId === user.id;
  const didUserDraw = leaders.some(player => player.userId === user.id) && isTopTie;
  const hostDisconnected = versusHook.lobbyState?.status === 'finished';
  const allPlayersFinished = leaderboardPlayers.length > 0 && leaderboardPlayers.every(player => player.phase === 'gameover');
  const isLocalGameOver = session.phase === 'gameover';
  const isMatchFinished = hostDisconnected || allPlayersFinished;
  const isWaitingForOpponent = isLocalGameOver && !isMatchFinished;
  const cooldownMsRemaining = cooldownNow ? Math.max(0, powerupCooldownUntil - cooldownNow) : 0;
  const cooldownSecondsRemaining = Math.ceil(cooldownMsRemaining / 1000);

  useEffect(() => {
    if (isMatchFinished && otherPlayers.length > 0 && !recordedResultRef.current) {
      recordedResultRef.current = true;
      if (recordVersusResult) recordVersusResult(didUserWin);
    }
  }, [didUserWin, isMatchFinished, otherPlayers.length, recordVersusResult]);

  const vineBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='72' viewBox='0 0 22 72'%3E%3Cpath d='M11,0 C10,18 12,36 11,54 C10,62 11,72 11,72' stroke='rgba(74,110,36,0.28)' stroke-width='0.9' fill='none'/%3E%3Cpath d='M11,18 C8,11 13,4 20,3 C13,7 9,13 11,18Z' fill='rgba(74,110,36,0.20)'/%3E%3Cpath d='M11,49 C14,42 9,35 2,34 C9,37 13,44 11,49Z' fill='rgba(74,110,36,0.18)'/%3E%3Ccircle cx='11' cy='17' r='1.6' fill='rgba(74,110,36,0.22)'/%3E%3C/svg%3E")`;

  return (
    <div className="responsive-split-shell gameplay-shell">
      <div className="responsive-side-panel" style={{
        flex: '0 0 38%', minWidth: 320, maxWidth: 480,
        display: 'flex', flexDirection: 'column',
        borderRight: '1px solid var(--border)',
        background: 'var(--s1)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '12%', bottom: '12%',
          right: -11, width: 22, zIndex: 10, pointerEvents: 'none',
          backgroundRepeat: 'repeat-y', backgroundPosition: 'center top',
          backgroundImage: vineBg,
        }} />
        <BotanicalCorner />

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
            <button
              onClick={() => setShowStandings(value => !value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                border: 'none', background: 'none', padding: 0,
                cursor: 'pointer', color: 'inherit',
              }}
            >
              <span style={{ fontSize: 16 }}>⚔️</span>
              <span style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--ff-u)' }}>
                Live standings
              </span>
              <span style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.08em' }}>
                {showStandings ? 'Hide' : 'Show'}
              </span>
            </button>
            <span style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {leaderboardPlayers.length} players
            </span>
          </div>

          {showStandings && (
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
                    <span style={{ fontSize: 18 }}>{player.emoji}</span>
                    <span style={{ fontSize: 13, color: 'var(--t2)', fontFamily: 'var(--ff-u)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {player.username}{isSelf ? ' (You)' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0, minWidth: 88 }}>
                    <div style={{ fontSize: 11, color: player.streak > 0 ? 'var(--gold)' : 'var(--t3)', letterSpacing: '0.04em', lineHeight: 1 }}>
                      x{player.streak}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4, lineHeight: 1 }}>
                      <span style={{
                        fontFamily: 'var(--ff-d)', fontSize: 18, fontWeight: 300,
                        color: isLeader ? 'var(--gold-hi)' : 'var(--t2)',
                        lineHeight: 1,
                      }}>{player.score}</span>
                      <span style={{ fontSize: 10, color: 'var(--t3)', letterSpacing: '0.06em', lineHeight: 1 }}>pts</span>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}
        </div>

        <div className="responsive-panel-body" style={{
          flex: 1, overflowY: 'auto', overflowX: 'hidden',
          padding: '28px 28px 20px',
          display: 'flex', flexDirection: 'column',
        }}>
          {effectBanner && (
            <div style={{
              padding: '10px 12px',
              marginBottom: 14,
              borderRadius: 3,
              border: '1px solid rgba(135,100,24,0.24)',
              background: 'rgba(135,100,24,0.08)',
              color: 'var(--t2)',
              fontSize: 12,
              fontFamily: 'var(--ff-u)',
            }}>
              {effectBanner}
            </div>
          )}

          {isMatchFinished ? null
          : session.phase === 'idle' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em', marginTop: 36 }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
              <span>Waiting…</span>
            </div>
          ) : isWaitingForOpponent ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em', marginTop: 36 }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
              <span>Waiting for opponent to finish…</span>
            </div>
          ) : !currentPrompt && isPromptRendering ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)', fontSize: 12, letterSpacing: '0.08em', marginTop: 36 }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)' }} />
              <span>{globeBooted ? 'Rendering target…' : 'Rendering globe…'}</span>
            </div>
          ) : currentPrompt ? (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, animation: 'fade-up 0.18s ease forwards' }}>
              <div style={{
                fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                color: 'var(--t3)', marginBottom: 10, fontWeight: 500,
                fontFamily: 'var(--ff-u)',
              }}>
                {currentPrompt.promptType === 'country' ? 'Identify the highlighted country' : 'Name the capital'}
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
                    ? 'Name this country'
                    : currentCountry ? `Capital of ${currentCountry.name}?` : '…'}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0, minWidth: 96, paddingTop: 4 }}>
                  <div style={{ fontSize: 12, color: 'var(--t3)', letterSpacing: '0.06em', lineHeight: 1 }}>
                    {session.streak >= 5 ? '🔥 ' : '✦ '}x{session.streak}
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

              {currentCountry && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 11, letterSpacing: '0.10em', textTransform: 'uppercase',
                  color: 'var(--olive)', background: 'rgba(86,116,40,0.08)',
                  border: '1px solid rgba(86,116,40,0.22)', borderRadius: 3,
                  padding: '3px 9px', marginBottom: 12, alignSelf: 'flex-start',
                  fontFamily: 'var(--ff-u)',
                }}>
                  {currentCountry.region}
                </div>
              )}

              {hintLetter && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  marginBottom: 14,
                  borderRadius: 3,
                  border: '1px solid rgba(86,116,40,0.22)',
                  background: 'rgba(86,116,40,0.08)',
                  color: 'var(--olive)',
                  fontSize: 12,
                  fontFamily: 'var(--ff-u)',
                }}>
                  Scout hint: starts with {hintLetter}
                </div>
              )}

              {activeEffect?.type === 'streak-shield' && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '7px 10px',
                  marginBottom: 14,
                  borderRadius: 3,
                  border: '1px solid rgba(135,100,24,0.22)',
                  background: 'rgba(135,100,24,0.08)',
                  color: 'var(--gold-hi)',
                  fontSize: 12,
                  fontFamily: 'var(--ff-u)',
                }}>
                  Streak Shield armed
                </div>
              )}

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
                  position: 'relative',
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
                      filter: fogActive && isCapitalPrompt ? 'blur(0.9px)' : 'none',
                    }}
                  />
                  {fogActive && isCapitalPrompt && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      pointerEvents: 'none',
                      background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.02) 0 6px, rgba(0,0,0,0.04) 6px 12px)',
                      opacity: 0.55,
                    }} />
                  )}
                  <button
                    onClick={handleSubmit}
                    disabled={!isPlaying || showWrongFeedback || promptLocked || freezeActive}
                    style={{
                      padding: '0 16px', height: 46,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--olive)', borderLeft: '1px solid var(--border)',
                      cursor: (!isPlaying || promptLocked || freezeActive) ? 'default' : 'pointer',
                      background: freezeActive ? 'rgba(132,40,32,0.08)' : 'none',
                      opacity: (!isPlaying || promptLocked || freezeActive) ? 0.35 : 1,
                      position: 'relative',
                      zIndex: 1,
                    }}
                  >
                    {freezeActive ? 'Frozen' : (
                      <svg viewBox="0 0 18 18" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M4,9 L14,9 M10,5 L14,9 L10,13"/>
                      </svg>
                    )}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--t3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Powerups
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>
                    {cooldownSecondsRemaining > 0 ? `Cooldown ${cooldownSecondsRemaining}s` : 'Ready'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[0, 1].map(slot => {
                    const powerup = heldPowerups[slot];
                    const disabled = !powerup || cooldownMsRemaining > 0 || !!activeEffect || !isPlaying;
                    return (
                      <button
                        key={slot}
                        onClick={() => powerup && activatePowerup(powerup)}
                        disabled={disabled}
                        title={powerup ? VERSUS_POWERUP_DESCRIPTIONS[powerup] : 'Empty slot'}
                        style={{
                          minHeight: 72,
                          padding: '10px 12px',
                          borderRadius: 3,
                          border: powerup ? '1px solid rgba(135,100,24,0.22)' : '1px dashed var(--border)',
                          background: powerup ? 'rgba(135,100,24,0.06)' : 'var(--bg)',
                          textAlign: 'left',
                          opacity: disabled ? 0.6 : 1,
                          cursor: disabled ? 'default' : 'pointer',
                        }}
                      >
                        {powerup ? (
                          <>
                            <div style={{ fontSize: 12, color: 'var(--gold-hi)', fontFamily: 'var(--ff-u)', marginBottom: 4 }}>
                              {VERSUS_POWERUP_LABELS[powerup]}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--t3)', lineHeight: 1.35 }}>
                              {VERSUS_POWERUP_DESCRIPTIONS[powerup]}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--t3)', fontFamily: 'var(--ff-u)' }}>
                            Empty slot
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {isPlaying && !showFeedbackOk && !showFeedbackMiss && !showWrongFeedback && !promptLocked && (
                <div className="game-action-row" style={{ gap: 8, marginTop: 'auto', paddingTop: 22 }}>
                  <button
                    onClick={handleSkip}
                    style={{
                      flex: 1, padding: '10px 14px', borderRadius: 3,
                      fontSize: 12, letterSpacing: '0.05em', fontWeight: 500,
                      border: '1px solid var(--border)', color: 'var(--t2)',
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

      <div className="responsive-globe-panel" style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', position: 'relative', background: '#05080d',
        filter: fogActive && !isCapitalPrompt ? 'blur(4px)' : 'none',
        transition: 'filter 0.18s ease',
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

      {isMatchFinished && (
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
                      #{index + 1} {player.emoji} {player.username}{isSelf ? ' (You)' : ''}
                    </span>
                    <span style={{ color: isLeader ? 'var(--gold-hi)' : 'var(--t2)' }}>
                      {player.score} · x{player.streak}
                    </span>
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
