import { useState, useCallback } from 'react';
import { HomeScreen } from './components/menus/HomeScreen';
import { GameView } from './components/game/GameView';
import { ProgressDashboard } from './components/progress/ProgressDashboard';
import { LeaderboardView } from './components/leaderboard/LeaderboardView';
import { AuthModal } from './components/auth/AuthModal';
import { useProgress } from './hooks/useProgress';
import { useAuth } from './hooks/useAuth';
import { useLeaderboard } from './hooks/useLeaderboard';
import { loadSettings, saveSettings } from './lib/progressStorage';
import type { GameSettings } from './types';

type View = 'home' | 'game' | 'progress' | 'leaderboard' | 'versus-lobby';
import { VersusLobby, JoinVersusModal } from './components/menus/VersusLobby';
import { useVersusMultiplayer } from './hooks/useVersusMultiplayer';
import { VersusGameView } from './components/game/VersusGameView';
import { buildQueue } from './hooks/useGameEngine';

const DEFAULT_SETTINGS: GameSettings = {
  mode: 'both',
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
    return saved;
  }
  return DEFAULT_SETTINGS;
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

  const handleStart = useCallback((settings: GameSettings) => {
    if (settings.mode === 'versus') {
      if (!user) {
        setShowAuth(true);
        return;
      }
      versusHook.hostLobby(settings, versusEmoji);
      navigateTo('versus-lobby');
      return;
    }
    saveSettings(settings);
    setActiveSettings(settings);
    setGameKey(k => k + 1);
    setFadedIn(false);
    setTimeout(() => { setView('game'); setFadedIn(true); }, 320);
  }, [navigateTo, user, versusEmoji, versusHook]);

  const handlePractice = useCallback(() => {
    const practiceSettings: GameSettings = {
      ...activeSettings,
      mode: 'practice',
      noTimeLimit: true,
    };
    saveSettings(practiceSettings);
    setActiveSettings(practiceSettings);
    setGameKey(k => k + 1);
    setFadedIn(false);
    setTimeout(() => { setView('game'); setFadedIn(true); }, 320);
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
          onViewProgress={() => navigateTo('progress')}
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
        <GameView
          key={gameKey}
          settings={activeSettings}
          globalStats={progress.globalStats}
          personalBests={personalBests}
          onBackToMenu={() => navigateTo('home')}
          onViewProgress={() => navigateTo('progress')}
          onViewLeaderboard={() => navigateTo('leaderboard')}
          onPractice={handlePractice}
          progress={progress}
          user={user}
          onSubmitScore={(score) => submitSessionScore(score, activeSettings)}
        />
      )}

      {view === 'progress' && (
        <ProgressDashboard
          progress={progress.progress}
          globalStats={progress.globalStats}
          onBack={() => navigateTo('home')}
          onReset={progress.resetProgress}
        />
      )}

      {view === 'leaderboard' && (
        <LeaderboardView
          user={user}
          onBack={() => navigateTo('home')}
        />
      )}

      {view === 'versus-lobby' && (
        versusHook.lobbyState ? (
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
        )
      )}

      {showJoinModal && (
        <JoinVersusModal
          onClose={() => setShowJoinModal(false)}
          onJoin={(code) => {
            setShowJoinModal(false);
            versusHook.joinLobby(code, versusEmoji);
            navigateTo('versus-lobby');
          }}
          emoji={versusEmoji}
          onEmojiChange={setVersusEmoji}
        />
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
