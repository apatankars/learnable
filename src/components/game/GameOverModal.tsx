import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import type { GameSession } from '../../types';

interface GameOverModalProps {
  session: GameSession;
  isNewBest: boolean;
  onPlayAgain: () => void;
  onPractice: () => void;
  onViewProgress: () => void;
  onViewLeaderboard: () => void;
  onReturnToMenu: () => void;
  user: User | null;
}

const btn = (variant: 'gold' | 'ghost'): React.CSSProperties => ({
  width: '100%', padding: '11px 0', borderRadius: 3, fontSize: 13,
  fontWeight: 500, letterSpacing: '0.05em', cursor: 'pointer',
  fontFamily: 'var(--ff-u)', transition: 'background 0.14s, border-color 0.14s',
  ...(variant === 'gold' ? {
    background: 'rgba(135,100,24,0.12)', border: '1px solid rgba(135,100,24,0.32)',
    color: 'var(--gold-hi)',
  } : {
    background: 'transparent', border: '1px solid var(--border)',
    color: 'var(--t3)',
  }),
});

export function GameOverModal({
  session, isNewBest, onPlayAgain, onPractice, onViewProgress, onViewLeaderboard, onReturnToMenu, user
}: GameOverModalProps) {
  const [displayScore, setDisplayScore] = useState(0);

  useEffect(() => {
    const target = session.score;
    if (target === 0) { setDisplayScore(0); return; }
    let current = 0;
    const step = Math.max(1, Math.floor(target / 40));
    const id = setInterval(() => {
      current = Math.min(current + step, target);
      setDisplayScore(current);
      if (current >= target) clearInterval(id);
    }, 30);
    return () => clearInterval(id);
  }, [session.score]);

  const accuracy = session.attempts.length > 0
    ? Math.round((session.attempts.filter(a => a.correct).length / session.attempts.length) * 100)
    : 0;

  const grade =
    accuracy >= 90 ? 'Outstanding' :
    accuracy >= 75 ? 'Excellent' :
    accuracy >= 60 ? 'Good work' :
    accuracy >= 40 ? 'Keep going' :
    'Practice more';

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(10,8,4,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: 'var(--s1)', borderRadius: 4,
        border: '1px solid var(--border)',
        boxShadow: '0 16px 64px rgba(0,0,0,0.35)',
        width: '100%', maxWidth: 420,
        animation: 'slide-up 0.3s ease-out',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '28px 32px 24px',
          borderBottom: '1px solid var(--border)',
          textAlign: 'center',
          background: 'var(--bg)',
        }}>
          <div style={{
            fontFamily: 'var(--ff-d)', fontSize: 72, fontWeight: 300,
            lineHeight: 1, color: 'var(--gold-hi)', letterSpacing: '-0.01em',
            marginBottom: 4,
          }}>
            {displayScore.toLocaleString()}
          </div>
          <div style={{
            fontSize: 11, letterSpacing: '0.13em', textTransform: 'uppercase',
            color: 'var(--t3)', marginBottom: 10, fontFamily: 'var(--ff-u)',
          }}>points</div>
          <div style={{
            fontFamily: 'var(--ff-d)', fontSize: 22, fontWeight: 400,
            color: 'var(--t1)', marginBottom: 4,
          }}>{grade}</div>
          {isNewBest && (
            <div style={{
              fontSize: 12, color: 'var(--gold)', fontFamily: 'var(--ff-u)',
              letterSpacing: '0.04em',
            }}>
              ★ New personal best!
            </div>
          )}
        </div>

        <div style={{ padding: '20px 28px 24px' }}>
          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8, marginBottom: 20,
          }}>
            {[
              { label: 'Answered', value: String(session.answered.size) },
              { label: 'Accuracy',  value: `${accuracy}%` },
              { label: 'Best streak', value: `×${session.maxStreak}` },
            ].map(s => (
              <div key={s.label} style={{
                textAlign: 'center', padding: '10px 6px',
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 3,
              }}>
                <div style={{
                  fontFamily: 'var(--ff-d)', fontSize: 22, fontWeight: 400,
                  color: 'var(--t1)',
                }}>{s.value}</div>
                <div style={{
                  fontSize: 10, color: 'var(--t3)', letterSpacing: '0.08em',
                  textTransform: 'uppercase', marginTop: 2,
                  fontFamily: 'var(--ff-u)',
                }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <button style={btn('gold')} onClick={onPlayAgain}>Play Again</button>
            <button style={btn('ghost')} onClick={onViewLeaderboard}>Leaderboard</button>
            {user && (
              <>
                <button style={btn('ghost')} onClick={onPractice}>Practice Weak Spots</button>
                <button style={btn('ghost')} onClick={onViewProgress}>View Progress</button>
              </>
            )}
            <button style={btn('ghost')} onClick={onReturnToMenu}>Return to Menu</button>
          </div>
        </div>
      </div>
    </div>
  );
}
