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
  width: '100%', padding: '11px 0 9px', borderRadius: 14, fontSize: 15,
  fontWeight: 800, cursor: 'pointer',
  fontFamily: 'var(--ff-u)',
  border: '2px solid var(--ink)', borderBottomWidth: 5,
  ...(variant === 'gold' ? {
    background: 'var(--coral)', color: '#fff',
  } : {
    background: 'var(--bg)', color: 'var(--ink)',
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
      background: 'rgba(31,26,46,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, padding: 16,
    }}>
      <div style={{
        background: 'var(--s1)', borderRadius: 22,
        border: '3px solid var(--ink)',
        boxShadow: '7px 7px 0 var(--ink)',
        width: '100%', maxWidth: 420,
        animation: 'slide-up 0.3s ease-out',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '28px clamp(18px, 5vw, 32px) 24px',
          borderBottom: '3px solid var(--ink)',
          textAlign: 'center',
          background: 'var(--sun)',
        }}>
          <div style={{
            fontFamily: 'var(--ff-d)', fontSize: 'clamp(3rem, 14vw, 4.5rem)', fontWeight: 700,
            lineHeight: 1, color: 'var(--ink)', letterSpacing: '-0.02em',
            marginBottom: 4,
          }}>
            {displayScore.toLocaleString()}
          </div>
          <div style={{
            fontSize: 11, letterSpacing: '0.13em', textTransform: 'uppercase',
            color: 'var(--ink)', fontWeight: 800, marginBottom: 10, fontFamily: 'var(--ff-u)',
          }}>points</div>
          <div style={{
            fontFamily: 'var(--ff-d)', fontSize: 22, fontWeight: 700,
            color: 'var(--t1)', marginBottom: 4,
          }}>{grade}</div>
          {isNewBest && (
            <div style={{
              fontSize: 13, color: '#fff', fontFamily: 'var(--ff-u)', fontWeight: 800,
              background: 'var(--coral)', border: '2px solid var(--ink)', borderRadius: 999,
              padding: '2px 12px', display: 'inline-block',
            }}>
              ★ New personal best!
            </div>
          )}
        </div>

        <div style={{ padding: '20px clamp(16px, 5vw, 28px) 24px' }}>
          {/* Stats row */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))',
            gap: 8, marginBottom: 20,
          }}>
            {[
              { label: 'Answered', value: String(session.answered.size) },
              { label: 'Accuracy',  value: `${accuracy}%` },
              { label: 'Best streak', value: `×${session.maxStreak}` },
            ].map(s => (
              <div key={s.label} style={{
                textAlign: 'center', padding: '10px 6px',
                background: 'var(--bg)', border: '2px solid var(--ink)',
                borderRadius: 14, boxShadow: '2px 2px 0 var(--ink)',
              }}>
                <div style={{
                  fontFamily: 'var(--ff-d)', fontSize: 22, fontWeight: 700,
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
