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

  const initChannel = useCallback((roomCode: string, isHost: boolean, settings?: GameSettings) => {
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
          players.push({
            userId: key,
            username: data.username || previous?.username || 'Player',
            score: previous?.score ?? 0,
            timeRemaining: previous?.timeRemaining ?? 0,
            phase: previous?.phase ?? 'idle',
            streak: previous?.streak ?? 0,
            currentPromptIndex: previous?.currentPromptIndex ?? 0,
          });
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
          playersById.set(msg.payload.userId, msg.payload.state);

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
          isHost,
        });
      } else if (status === 'CHANNEL_ERROR') {
        setError('Failed to connect to lobby.');
      }
    });
  }, [leaveLobby, user]);

  const hostLobby = useCallback((settings: GameSettings) => {
    const code = generateRoomCode();
    initChannel(code, true, settings);
  }, [initChannel]);

  const joinLobby = useCallback((code: string) => {
    initChannel(code.toUpperCase(), false);
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

  return {
    lobbyState,
    error,
    isHost,
    hostLobby,
    joinLobby,
    leaveLobby,
    startGame,
    broadcastState,
  };
}
