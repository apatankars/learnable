import { useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { 
  GameSettings, 
  VersusLobbyState, 
  VersusPlayerState, 
  RealtimeMessage, 
  GamePrompt 
} from '../types';
import type { VersusActiveEffect, VersusEffectLogEntry, VersusPowerup } from '../types';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

interface PresenceMeta {
  isHost?: boolean;
  username?: string;
  emoji?: string;
}

function getDefaultPlayerState(userId: string, username: string, emoji: string): VersusPlayerState {
  return {
    userId,
    username,
    emoji,
    score: 0,
    timeRemaining: 0,
    phase: 'idle',
    streak: 0,
    currentPromptIndex: 0,
    heldPowerups: [],
    activeEffect: null,
    powerupCooldownUntil: 0,
    currentCorrectStreakRewardState: 'none',
  };
}

function mergePlayerState(previous: VersusPlayerState | undefined, next: Partial<VersusPlayerState> & Pick<VersusPlayerState, 'userId' | 'username' | 'emoji'>): VersusPlayerState {
  const base = previous ?? getDefaultPlayerState(next.userId, next.username, next.emoji);
  return {
    ...base,
    ...next,
    heldPowerups: next.heldPowerups ?? base.heldPowerups,
    activeEffect: next.activeEffect ?? base.activeEffect,
    powerupCooldownUntil: next.powerupCooldownUntil ?? base.powerupCooldownUntil,
    currentCorrectStreakRewardState: next.currentCorrectStreakRewardState ?? base.currentCorrectStreakRewardState,
  };
}

function appendEffectLog(effectLog: VersusEffectLogEntry[] | undefined, entry: VersusEffectLogEntry): VersusEffectLogEntry[] {
  return [...(effectLog ?? []), entry].slice(-8);
}

function sortPlayers(players: VersusPlayerState[], hostId: string) {
  return [...players].sort((a, b) => {
    if (a.userId === hostId) return -1;
    if (b.userId === hostId) return 1;
    return a.username.localeCompare(b.username);
  });
}

export function useVersusMultiplayer(user: User | null) {
  const [lobbyState, setLobbyState] = useState<VersusLobbyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  
  const channelRef = useRef<RealtimeChannel | null>(null);
  const isHostRef = useRef<boolean>(false);

  const leaveLobby = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setLobbyState(null);
    setError(null);
    setIsHost(false);
    isHostRef.current = false;
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      leaveLobby();
    };
  }, [leaveLobby]);

  const initChannel = useCallback((roomCode: string, isHost: boolean, emoji: string, settings?: GameSettings) => {
    if (!user) {
      setError('You must be signed in to play versus mode.');
      return;
    }

    leaveLobby();
    setError(null);
    setIsHost(isHost);
    isHostRef.current = isHost;

    const channel = supabase.channel(`versus_${roomCode}`, {
      config: {
        presence: { key: user.id },
      },
    });

    channelRef.current = channel;

    // Presence Sync
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      setLobbyState(prev => {
        let hostId = prev?.hostId || (isHost ? user.id : '');
        const previousPlayers = new Map((prev?.players ?? []).map(player => [player.userId, player]));
        const players: VersusPlayerState[] = [];

        for (const [key, presenceData] of Object.entries(state)) {
          if (!Array.isArray(presenceData) || presenceData.length === 0) {
            continue;
          }

          const data = presenceData[0] as PresenceMeta;
          if (data.isHost) {
            hostId = key;
          }

          const previous = previousPlayers.get(key);
          players.push(mergePlayerState(previous, {
            userId: key,
            username: data.username || previous?.username || 'Player',
            emoji: data.emoji || previous?.emoji || '🌍',
          }));
        }

        const sortedPlayers = sortPlayers(players, hostId);
        if (prev) {
          return { ...prev, players: sortedPlayers, hostId };
        }

        return {
          roomCode,
          hostId,
          players: sortedPlayers,
          status: 'waiting',
          settings: isHost ? settings : undefined,
          effectLog: [],
        };
      });
    });

    // Handle Opponent Disconnect / Leave
    channel.on('presence', { event: 'leave' }, ({ key }) => {
      // If the host leaves, end the game immediately
      setLobbyState(prev => {
        if (!prev) return prev;
        if (key === prev.hostId) {
          setError('Host disconnected. Game over.');
          return { ...prev, status: 'finished' };
        }
        return prev;
      });
    });

    // Broadcast messages
    channel.on('broadcast', { event: 'message' }, ({ payload }) => {
      const msg = payload as RealtimeMessage;
      
      if (msg.type === 'START_GAME') {
        setLobbyState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            status: 'playing',
            settings: msg.payload.settings,
            queue: msg.payload.queue,
          };
        });
      } else if (msg.type === 'UPDATE_STATE') {
        setLobbyState(prev => {
          if (!prev) return prev;

          const playersById = new Map(prev.players.map(player => [player.userId, player]));
          const incoming = msg.payload.state;
          playersById.set(msg.payload.userId, mergePlayerState(playersById.get(msg.payload.userId), incoming));

          return {
            ...prev,
            players: sortPlayers([...playersById.values()], prev.hostId),
          };
        });
      } else if (msg.type === 'USE_POWERUP') {
        setLobbyState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            effectLog: appendEffectLog(prev.effectLog, {
              id: `${msg.payload.userId}:${Date.now()}:${msg.payload.powerup}`,
              message: msg.payload.message,
              createdAt: Date.now(),
              targetUserId: msg.payload.targetUserId,
            }),
          };
        });
      } else if (msg.type === 'APPLY_EFFECT') {
        setLobbyState(prev => {
          if (!prev) return prev;
          const playersById = new Map(prev.players.map(player => [player.userId, player]));
          const existing = playersById.get(msg.payload.userId);
          if (existing) {
            playersById.set(msg.payload.userId, {
              ...existing,
              activeEffect: msg.payload.effect,
            });
          }
          return {
            ...prev,
            players: sortPlayers([...playersById.values()], prev.hostId),
            effectLog: appendEffectLog(prev.effectLog, {
              id: `${msg.payload.userId}:${msg.payload.effect.type}:${msg.payload.effect.startedAt}`,
              message: msg.payload.message,
              createdAt: Date.now(),
              targetUserId: msg.payload.userId,
            }),
          };
        });
      } else if (msg.type === 'EXPIRE_EFFECT') {
        setLobbyState(prev => {
          if (!prev) return prev;
          const playersById = new Map(prev.players.map(player => [player.userId, player]));
          const existing = playersById.get(msg.payload.userId);
          if (existing?.activeEffect?.type === msg.payload.effectType) {
            playersById.set(msg.payload.userId, {
              ...existing,
              activeEffect: null,
            });
          }
          return {
            ...prev,
            players: sortPlayers([...playersById.values()], prev.hostId),
          };
        });
      } else if (msg.type === 'SYNC_POWERUP_STATE') {
        setLobbyState(prev => {
          if (!prev) return prev;
          const playersById = new Map(prev.players.map(player => [player.userId, player]));
          const existing = playersById.get(msg.payload.userId);
          if (!existing) return prev;
          playersById.set(msg.payload.userId, {
            ...existing,
            ...msg.payload.patch,
          });
          return {
            ...prev,
            players: sortPlayers([...playersById.values()], prev.hostId),
          };
        });
      } else if (msg.type === 'GAME_OVER') {
        // Handled naturally by UPDATE_STATE phase = 'gameover'
      }
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          username: user.email?.split('@')[0] || 'Player',
          emoji,
          isHost,
        });
      } else if (status === 'CHANNEL_ERROR') {
        setError('Failed to connect to lobby.');
      }
    });
  }, [leaveLobby, user]);

  const hostLobby = useCallback((settings: GameSettings, emoji: string) => {
    const code = generateRoomCode();
    initChannel(code, true, emoji, settings);
  }, [initChannel]);

  const joinLobby = useCallback((code: string, emoji: string) => {
    initChannel(code.toUpperCase(), false, emoji);
  }, [initChannel]);

  const startGame = useCallback((queue: GamePrompt[], settings: GameSettings) => {
    if (!channelRef.current || !isHostRef.current) return;
    
    const msg: RealtimeMessage = {
      type: 'START_GAME',
      payload: { queue, settings },
    };
    
    channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });

    setLobbyState(prev => prev ? { ...prev, status: 'playing', queue, settings } : null);
  }, []);

  const broadcastState = useCallback((state: VersusPlayerState) => {
    if (!channelRef.current || !user) return;

    const msg: RealtimeMessage = {
      type: 'UPDATE_STATE',
      payload: { userId: user.id, state },
    };

    channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });
  }, [user]);

  const syncPowerupState = useCallback((userId: string, patch: Partial<VersusPlayerState>) => {
    setLobbyState(prev => {
      if (!prev) return prev;
      const playersById = new Map(prev.players.map(player => [player.userId, player]));
      const existing = playersById.get(userId);
      if (!existing) return prev;
      playersById.set(userId, {
        ...existing,
        ...patch,
      });
      return {
        ...prev,
        players: sortPlayers([...playersById.values()], prev.hostId),
      };
    });

    if (!channelRef.current || !user) return;
    const msg: RealtimeMessage = {
      type: 'SYNC_POWERUP_STATE',
      payload: { userId, patch },
    };
    channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });
  }, [user]);

  const usePowerup = useCallback((powerup: VersusPowerup, username: string, targetUserId?: string) => {
    if (!channelRef.current || !user) return;
    const msg: RealtimeMessage = {
      type: 'USE_POWERUP',
      payload: {
        userId: user.id,
        username,
        powerup,
        targetUserId,
        message: `${username} used ${powerup.replace('-', ' ')}`,
      },
    };
    channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });
  }, [user]);

  const applyEffect = useCallback((userId: string, effect: VersusActiveEffect, message: string) => {
    setLobbyState(prev => {
      if (!prev) return prev;
      const playersById = new Map(prev.players.map(player => [player.userId, player]));
      const existing = playersById.get(userId);
      if (existing) {
        playersById.set(userId, {
          ...existing,
          activeEffect: effect,
        });
      }
      return {
        ...prev,
        players: sortPlayers([...playersById.values()], prev.hostId),
        effectLog: appendEffectLog(prev.effectLog, {
          id: `${userId}:${effect.type}:${effect.startedAt}`,
          message,
          createdAt: Date.now(),
          targetUserId: userId,
        }),
      };
    });

    if (!channelRef.current || !user) return;
    const msg: RealtimeMessage = {
      type: 'APPLY_EFFECT',
      payload: { userId, effect, message },
    };
    channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });
  }, [user]);

  const expireEffect = useCallback((userId: string, effectType: VersusActiveEffect['type']) => {
    setLobbyState(prev => {
      if (!prev) return prev;
      const playersById = new Map(prev.players.map(player => [player.userId, player]));
      const existing = playersById.get(userId);
      if (existing?.activeEffect?.type === effectType) {
        playersById.set(userId, {
          ...existing,
          activeEffect: null,
        });
      }
      return {
        ...prev,
        players: sortPlayers([...playersById.values()], prev.hostId),
      };
    });

    if (!channelRef.current || !user) return;
    const msg: RealtimeMessage = {
      type: 'EXPIRE_EFFECT',
      payload: { userId, effectType },
    };
    channelRef.current.send({
      type: 'broadcast',
      event: 'message',
      payload: msg,
    });
  }, [user]);

  return {
    lobbyState,
    error,
    isHost,
    hostLobby,
    joinLobby,
    leaveLobby,
    startGame,
    broadcastState,
    syncPowerupState,
    usePowerup,
    applyEffect,
    expireEffect,
  };
}
