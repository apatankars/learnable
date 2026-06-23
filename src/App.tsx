import { lazy, startTransition, Suspense, useCallback, useEffect, useState } from 'react';
import { HomeScreen } from './components/menus/HomeScreen';
import { AuthModal } from './components/auth/AuthModal';
import { useProgress } from './hooks/useProgress';
import { useAuth } from './hooks/useAuth';
import { useLeaderboard } from './hooks/useLeaderboard';
import { loadSettings, saveSettings } from './lib/progressStorage';
import {
  loadAccountModule,
  loadGameViewModule,
  loadLeaderboardViewModule,
  loadVersusGameViewModule,
  loadVersusLobbyModule,
  warmAppViews,
  warmGameplayAssets,
} from './lib/preload';
import type { GameSettings } from './types';

type View = 'home' | 'game' | 'account' | 'leaderboard' | 'versus-lobby';
import { useVersusMultiplayer } from './hooks/useVersusMultiplayer';
import { buildQueue } from './hooks/useGameEngine';

const GameView = lazy(() => loadGameViewModule().then((module) => ({ default: module.GameView })));
const AccountLanding = lazy(() => loadAccountModule().then((module) => ({ default: module.AccountLanding })));
const LeaderboardView = lazy(() => loadLeaderboardViewModule().then((module) => ({ default: module.LeaderboardView })));
const VersusGameView = lazy(() => loadVersusGameViewModule().then((module) => ({ default: module.VersusGameView })));
const VersusLobby = lazy(() => loadVersusLobbyModule().then((module) => ({ default: module.VersusLobby })));
const JoinVersusModal = lazy(() => loadVersusLobbyModule().then((module) => ({ default: module.JoinVersusModal })));

const DEFAULT_SETTINGS: GameSettings = {
  mode: 'both',
  topic: 'world',
  timeLimitSeconds: 300,
  noTimeLimit: false,
  blindMode: false,
  regionFilter: [],
  includeDependent: false,
  practicePrompts: 'both',
  versusPrompts: 'both',
};

function getInitialSettings(): GameSettings {
  const saved = loadSettings();
  // Normalize any legacy timeLimitSeconds to valid values (60 or 300)
  if (saved) {
    if (!saved.noTimeLimit && saved.timeLimitSeconds !== 60 && saved.timeLimitSeconds !== 300) {
      saved.timeLimitSeconds = 300;
    }
    saved.blindMode ??= false;
    saved.practicePrompts ??= 'both';
    saved.versusPrompts ??= 'both';
    saved.topic ??= 'world';
    return saved;
  }
  return DEFAULT_SETTINGS;
}

function scheduleIdleWork(task: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const idleApi = window as Window & typeof globalThis & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof idleApi.requestIdleCallback === 'function' && typeof idleApi.cancelIdleCallback === 'function') {
    const idleId = idleApi.requestIdleCallback(task, { timeout: 1500 });
    return () => idleApi.cancelIdleCallback?.(idleId);
  }

  const timeoutId = globalThis.setTimeout(task, 250);
  return () => globalThis.clearTimeout(timeoutId);
}

function FullscreenFallback({ label }: { label: string }) {
  return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--t3)', fontFamily: 'var(--ff-u)', fontSize: 13 }}>{label}</div>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>('home');
  const [gameKey, setGameKey] = useState(0);
  const [activeSettings, setActiveSettings] = useState<GameSettings>(getInitialSettings);
  const [showAuth, setShowAuth] = useState(false);
  const [fadedIn, setFadedIn] = useState(true);
  const [versusEmoji, setVersusEmoji] = useState('🌍');
  const [showJoinModal, setShowJoinModal] = useState(false);

  const navigateTo = useCallback((newView: View) => {
    setFadedIn(false);
    setTimeout(() => { setView(newView); setFadedIn(true); }, 320);
  }, []);

  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
  const progress = useProgress(user);
  const { personalBests, submitSessionScore } = useLeaderboard(user);
  const versusHook = useVersusMultiplayer(user);

  useEffect(() => {
    if (view !== 'home') {
      return;
    }

    return scheduleIdleWork(() => {
      void warmAppViews();
      void warmGameplayAssets();
    });
  }, [view]);

  const handleStart = useCallback((settings: GameSettings) => {
    if (settings.mode === 'versus') {
      if (!user) {
        setShowAuth(true);
        return;
      }
      // Versus is world-only for now (uses the globe map).
      settings = { ...settings, topic: 'world' };
      void loadVersusLobbyModule();
      void loadVersusGameViewModule();
      versusHook.hostLobby(settings, versusEmoji);
      navigateTo('versus-lobby');
      return;
    }
    void loadGameViewModule();
    void warmGameplayAssets();
    saveSettings(settings);
    startTransition(() => {
      setActiveSettings(settings);
      setGameKey(k => k + 1);
    });
    setFadedIn(false);
    setTimeout(() => {
      startTransition(() => setView('game'));
      setFadedIn(true);
    }, 320);
  }, [navigateTo, user, versusEmoji, versusHook]);

  const handlePractice = useCallback(() => {
    void loadGameViewModule();
    void warmGameplayAssets();
    const practiceSettings: GameSettings = {
      ...activeSettings,
      mode: 'practice',
      noTimeLimit: true,
    };
    saveSettings(practiceSettings);
    startTransition(() => {
      setActiveSettings(practiceSettings);
      setGameKey(k => k + 1);
    });
    setFadedIn(false);
    setTimeout(() => {
      startTransition(() => setView('game'));
      setFadedIn(true);
    }, 320);
  }, [activeSettings]);

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
        <div style={{ color: 'var(--t3)', fontFamily: 'var(--ff-u)', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ opacity: fadedIn ? 1 : 0, transition: 'opacity 0.32s ease' }}>
      {view === 'home' && (
        <HomeScreen
          defaultSettings={activeSettings}
          globalStats={progress.globalStats}
          personalBests={personalBests}
          user={user}
          onStart={handleStart}
          onViewProgress={() => navigateTo('account')}
          onViewLeaderboard={() => navigateTo('leaderboard')}
          onSignIn={() => setShowAuth(true)}
          onSignOut={signOut}
          onVersusMode={() => {
            if (!user) {
              setShowAuth(true);
              return;
            }
            setShowJoinModal(true);
          }}
          versusEmoji={versusEmoji}
          onVersusEmojiChange={setVersusEmoji}
        />
      )}

      {view === 'game' && (
        <Suspense fallback={<FullscreenFallback label="Loading game…" />}>
          <GameView
            key={gameKey}
            settings={activeSettings}
            globalStats={progress.globalStats}
            personalBests={personalBests}
            onBackToMenu={() => navigateTo('home')}
            onViewProgress={() => navigateTo('account')}
            onViewLeaderboard={() => navigateTo('leaderboard')}
            onPractice={handlePractice}
            progress={progress}
            user={user}
            onSubmitScore={(score) => submitSessionScore(score, activeSettings)}
          />
        </Suspense>
      )}

      {view === 'account' && (
        <Suspense fallback={<FullscreenFallback label="Loading account…" />}>
          <AccountLanding
            user={user}
            progress={progress.progress}
            globalStats={progress.globalStats}
            personalBests={personalBests}
            onBack={() => navigateTo('home')}
            onReset={progress.resetProgress}
            onSignIn={() => setShowAuth(true)}
            onSignOut={signOut}
          />
        </Suspense>
      )}

      {view === 'leaderboard' && (
        <Suspense fallback={<FullscreenFallback label="Loading leaderboard…" />}>
          <LeaderboardView
            user={user}
            onBack={() => navigateTo('home')}
          />
        </Suspense>
      )}

      {view === 'versus-lobby' && (
        <Suspense fallback={<FullscreenFallback label="Loading versus…" />}>
          {versusHook.lobbyState ? (
            versusHook.lobbyState.status === 'playing' ? (
              <VersusGameView
                settings={versusHook.lobbyState.settings || activeSettings}
                user={user!}
                onBackToMenu={() => { versusHook.leaveLobby(); navigateTo('home'); }}
                versusHook={versusHook}
                progress={progress}
              />
            ) : (
              <VersusLobby
                lobbyState={versusHook.lobbyState}
                isHost={versusHook.isHost}
                error={versusHook.error}
                onStartGame={() => {
                  const settings = versusHook.lobbyState!.settings!;
                  const queue = buildQueue(settings);
                  void loadVersusGameViewModule();
                  void warmGameplayAssets();
                  versusHook.startGame(queue, settings);
                }}
                onLeave={() => { versusHook.leaveLobby(); navigateTo('home'); }}
              />
            )
          ) : versusHook.error ? (
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--miss-hi)', fontFamily: 'var(--ff-u)' }}>
              <div style={{ marginBottom: 16, fontSize: 16 }}>{versusHook.error}</div>
              <button onClick={() => { versusHook.leaveLobby(); navigateTo('home'); }} style={{ padding: '8px 16px', borderRadius: 3, border: '1px solid var(--border)', background: 'var(--s1)', color: 'var(--t2)', cursor: 'pointer' }}>Back to Home</button>
            </div>
          ) : (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--t3)', fontFamily: 'var(--ff-u)' }}>
              <div className="animate-spin" style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px solid var(--border-hi)', borderTopColor: 'var(--olive)', marginRight: 10 }} />
              Connecting to lobby...
            </div>
          )}
        </Suspense>
      )}

      {showJoinModal && (
        <Suspense fallback={null}>
          <JoinVersusModal
            onClose={() => setShowJoinModal(false)}
            onJoin={(code) => {
              void loadVersusLobbyModule();
              void loadVersusGameViewModule();
              setShowJoinModal(false);
              versusHook.joinLobby(code, versusEmoji);
              navigateTo('versus-lobby');
            }}
            emoji={versusEmoji}
            onEmojiChange={setVersusEmoji}
          />
        </Suspense>
      )}

      {showAuth && (
        <AuthModal
          onClose={() => setShowAuth(false)}
          onSignIn={async (email, password) => {
            const err = await signIn(email, password);
            return err;
          }}
          onSignUp={async (email, password) => {
            const err = await signUp(email, password);
            return err;
          }}
        />
      )}
    </div>
  );
}
