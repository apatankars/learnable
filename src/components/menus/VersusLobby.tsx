import { useState } from 'react';
import type { VersusLobbyState } from '../../types';

interface VersusLobbyProps {
  lobbyState: VersusLobbyState;
  isHost: boolean;
  onStartGame: () => void;
  onLeave: () => void;
  error?: string | null;
}

export function VersusLobby({ lobbyState, isHost, onStartGame, onLeave, error }: VersusLobbyProps) {
  const host = lobbyState.players.find(p => p.userId === lobbyState.hostId);
  const guests = lobbyState.players.filter(p => p.userId !== lobbyState.hostId);
  const canStart = guests.length > 0;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100vh',
      background: 'var(--bg)', color: 'var(--t1)',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--ff-u)',
    }}>
      <div style={{
        background: 'var(--s1)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '40px',
        width: 460,
        maxWidth: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.05)',
      }}>
        <h1 style={{
          fontFamily: 'var(--ff-d)',
          fontSize: 32,
          fontWeight: 400,
          textAlign: 'center',
          marginBottom: 8,
          color: 'var(--t1)',
        }}>
          Versus Lobby
        </h1>
        <p style={{
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--t3)',
          marginBottom: 32,
        }}>
          Share this code so other players can join
        </p>

        <div style={{
          background: 'var(--bg)',
          border: '1px dashed var(--border-hi)',
          borderRadius: 3,
          padding: '16px',
          textAlign: 'center',
          fontSize: 36,
          letterSpacing: '0.2em',
          fontFamily: 'monospace',
          color: 'var(--gold)',
          marginBottom: 32,
        }}>
          {lobbyState.roomCode}
        </div>

        {error && (
          <div style={{
            background: 'rgba(200, 50, 50, 0.1)',
            border: '1px solid rgba(200, 50, 50, 0.3)',
            color: '#d44',
            padding: '12px',
            borderRadius: 3,
            fontSize: 13,
            marginBottom: 24,
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 3,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 20 }}>👑</span>
              <span style={{ fontSize: 14, color: 'var(--t2)' }}>
                {host ? host.username : 'Host joining...'}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--olive)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Ready
            </span>
          </div>

          {guests.length === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              opacity: 0.6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>⚔️</span>
                <span style={{ fontSize: 14, color: 'var(--t2)' }}>
                  Waiting for players...
                </span>
              </div>
            </div>
          ) : (
            guests.map((player, index) => (
              <div
                key={player.userId}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 20 }}>{index === 0 ? '⚔️' : '🌍'}</span>
                  <span style={{ fontSize: 14, color: 'var(--t2)' }}>
                    {player.username}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--olive)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Ready
                </span>
              </div>
            ))
          )}
        </div>

        <div style={{
          fontSize: 12,
          color: 'var(--t3)',
          marginBottom: 24,
          textAlign: 'center',
        }}>
          {lobbyState.players.length} player{lobbyState.players.length === 1 ? '' : 's'} in lobby
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onLeave}
            style={{
              flex: 1, padding: '12px 0',
              background: 'transparent', border: '1px solid var(--border-hi)',
              color: 'var(--t2)', borderRadius: 3, cursor: 'pointer',
              fontSize: 13, transition: 'background 0.14s',
            }}
          >
            Leave
          </button>
          {isHost && (
            <button
              onClick={onStartGame}
              disabled={!canStart}
              style={{
                flex: 2, padding: '12px 0',
                background: canStart ? 'rgba(135,100,24,0.12)' : 'var(--bg)',
                border: canStart ? '1px solid rgba(135,100,24,0.32)' : '1px solid var(--border)',
                color: canStart ? 'var(--gold-hi)' : 'var(--t3)',
                borderRadius: 3, cursor: canStart ? 'pointer' : 'not-allowed',
                fontSize: 13, fontWeight: 500, transition: 'all 0.14s',
              }}
            >
              Start Match
            </button>
          )}
          {!isHost && (
            <div style={{
              flex: 2, padding: '12px 0',
              background: 'var(--bg)', border: '1px solid var(--border)',
              color: 'var(--t3)', borderRadius: 3,
              fontSize: 13, textAlign: 'center',
            }}>
              Waiting for Host
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function JoinVersusModal({ onClose, onJoin }: { onClose: () => void, onJoin: (code: string) => void }) {
  const [code, setCode] = useState('');

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '32px',
        width: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        fontFamily: 'var(--ff-u)',
      }}>
        <h2 style={{ fontSize: 18, color: 'var(--t1)', marginBottom: 16, textAlign: 'center' }}>Join Versus Game</h2>
        <input
          autoFocus
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER ROOM CODE"
          maxLength={6}
          style={{
            width: '100%', padding: '12px', boxSizing: 'border-box',
            background: 'var(--s1)', border: '1px solid var(--border)',
            color: 'var(--t1)', borderRadius: 3, marginBottom: 20,
            fontSize: 16, textAlign: 'center', letterSpacing: '0.1em',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0',
              background: 'transparent', border: '1px solid var(--border-hi)',
              color: 'var(--t2)', borderRadius: 3, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onJoin(code)}
            disabled={code.length < 6}
            style={{
              flex: 1, padding: '10px 0',
              background: code.length === 6 ? 'var(--t1)' : 'var(--s1)',
              border: 'none',
              color: code.length === 6 ? 'var(--bg)' : 'var(--t3)',
              borderRadius: 3, cursor: code.length === 6 ? 'pointer' : 'not-allowed',
            }}
          >
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
