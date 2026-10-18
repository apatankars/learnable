import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { fetchLeaderboard, getTimeModeLabel } from '../../lib/leaderboard';
import type { LeaderboardEntry, TimeMode } from '../../lib/leaderboard';
import type { GameMode } from '../../types';

const MODES: { value: GameMode; label: string; icon: string }[] = [
  { value: 'country', label: 'Country', icon: '🗺️' },
  { value: 'capital', label: 'Capital', icon: '🏛️' },
  { value: 'both', label: 'Both', icon: '🌍' },
];

const TIME_MODES: TimeMode[] = ['blitz', 'standard', 'infinite'];

interface LeaderboardViewProps {
  user: User | null;
  onBack: () => void;
}

export function LeaderboardView({ user, onBack }: LeaderboardViewProps) {
  const [mode, setMode] = useState<GameMode>('both');
  const [timeMode, setTimeMode] = useState<TimeMode>('standard');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard(mode, timeMode).then(data => {
      setEntries(data);
      setLoading(false);
    });
  }, [mode, timeMode]);

  const currentUserId = user?.id;
  return (
    <div style={{
      minHeight: 'var(--app-height)', background: 'var(--s1)', backgroundImage: 'radial-gradient(rgba(31,26,46,0.12) 2px, transparent 2.4px)', backgroundSize: '26px 26px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', padding: '52px clamp(16px, 4vw, 24px)', position: 'relative', overflow: 'hidden'
    }}>

      <div style={{ width: '100%', maxWidth: 540, position: 'relative', zIndex: 10 }}>
        {/* Header */}
        <div className="leaderboard-header-row" style={{ alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <button
            onClick={onBack}
            style={{
              color: 'var(--ink)', fontFamily: 'var(--ff-u)', fontSize: 13, fontWeight: 800,
              background: 'var(--bg)', border: '2px solid var(--ink)', borderRadius: 999, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, width: 'auto'
            }}
          >
            ← Back
          </button>
          <div style={{ flex: 1, textAlign: 'center' }}>
            <h1 style={{ fontFamily: 'var(--ff-d)', fontWeight: 700, fontSize: 'clamp(2rem, 8vw, 2.25rem)', letterSpacing: '-0.02em', color: 'var(--ink)', textShadow: '3px 3px 0 var(--coral)' }}>Leaderboard</h1>
          </div>
          <div style={{ width: 70 }} />
        </div>

        {/* Mode tabs */}
        <div className="leaderboard-filter-row" style={{ gap: 8, marginBottom: 12, fontFamily: 'var(--ff-u)' }}>
          {MODES.map(m => (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, fontWeight: 700,
                border: '2px solid var(--ink)',
                background: mode === m.value ? 'var(--sun)' : 'var(--bg)',
                color: 'var(--ink)',
                cursor: 'pointer', transition: 'all 0.14s'
              }}
            >
              <span style={{ marginRight: 6 }}>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>

        {/* Time mode tabs */}
        <div className="leaderboard-filter-row" style={{ gap: 8, marginBottom: 24, fontFamily: 'var(--ff-u)' }}>
          {TIME_MODES.map(tm => (
            <button
              key={tm}
              onClick={() => setTimeMode(tm)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 700,
                border: '2px solid var(--ink)',
                background: timeMode === tm ? 'var(--sun)' : 'var(--bg)',
                color: 'var(--ink)',
                cursor: 'pointer', transition: 'all 0.14s', letterSpacing: '0.04em'
              }}
            >
              {getTimeModeLabel(tm)}
            </button>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: 'var(--bg)', borderRadius: 18, border: '3px solid var(--ink)', boxShadow: 'var(--pop-shadow-lg)', overflowX: 'auto', overflowY: 'hidden' }}>
          {loading ? (
            <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--t3)', fontFamily: 'var(--ff-u)', fontSize: 13 }}>Loading…</div>
          ) : entries.length === 0 ? (
            <div style={{ padding: '64px 0', textAlign: 'center', color: 'var(--t3)', fontFamily: 'var(--ff-u)', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
              No scores yet — be the first!
            </div>
          ) : (
            <table style={{ width: '100%', minWidth: 320, borderCollapse: 'collapse', fontFamily: 'var(--ff-u)' }}>
              <thead>
                <tr style={{ background: 'var(--sky-soft)', borderBottom: '3px solid var(--ink)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.08em', width: 40 }}>#</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Player</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Score</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isMe = entry.userId === currentUserId;
                  const isTop3 = entry.rank <= 3;
                  const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
                  return (
                    <tr
                      key={entry.userId}
                      style={{
                        borderBottom: '2px dashed rgba(31,26,46,0.25)',
                        background: isMe ? 'rgba(255,90,95,0.06)' : 'transparent',
                        transition: 'background 0.14s'
                      }}
                    >
                      <td style={{ padding: '14px 16px' }}>
                        {medal ? (
                          <span style={{ fontSize: 18, lineHeight: 1 }}>{medal}</span>
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--t3)' }}>{entry.rank}</span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <span style={{
                          fontSize: 13,
                          fontWeight: isMe ? 600 : isTop3 ? 500 : 400,
                          color: isMe ? 'var(--gold-hi)' : isTop3 ? 'var(--t1)' : 'var(--t2)'
                        }}>
                          {entry.username}
                          {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--gold)', fontWeight: 400 }}>(you)</span>}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{
                          fontFamily: 'var(--ff-d)', fontWeight: isTop3 || isMe ? 600 : 400,
                          fontSize: entry.rank === 1 ? 18 : isTop3 || isMe ? 16 : 15,
                          color: entry.rank === 1 ? 'var(--gold-hi)' : isTop3 || isMe ? 'var(--t1)' : 'var(--t2)'
                        }}>
                          {entry.score.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {!user && (
          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--t3)', fontFamily: 'var(--ff-u)', marginTop: 16 }}>
            Sign in to appear on the leaderboard
          </p>
        )}
      </div>
    </div>
  );
}
