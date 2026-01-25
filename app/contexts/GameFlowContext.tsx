/**
 * GameFlowContext - Client-side state management for game flow.
 * Provides real-time subscriptions, game state, and API methods for game interactions.
 *
 * Performance optimizations:
 * - Batched state updates via reducer pattern (single re-render per event)
 * - Reconnection handling for dropped connections
 * - Abort controller for cleanup of pending fetches
 * - Stable callback refs to prevent stale closures
 * - Parallel data fetching for initial load
 */

import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef, useMemo } from 'react';
import { createClient } from '~/lib/supabase/client';
import type {
  Game,
  Player,
  GameAction,
  GameModifier,
  PlayerStatus,
  GameContext as GameCtx,
  ActionId,
  ActionResult,
  VoteResult,
  LeaderVote,
  MissionVote,
} from '~/types/game';
import type { RealtimeChannel, SupabaseClient, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

/** Connection status for real-time subscriptions */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

interface GameFlowContextValue {
  /** Current game state */
  game: Game | null;
  /** All players in the game */
  players: Player[];
  /** Game actions for current round (for tracking used actions) */
  actions: GameAction[];
  /** Game context for action/effect evaluation */
  ctx: GameCtx | null;
  /** Whether initial data is being loaded */
  isLoading: boolean;
  /** Error message if any operation failed */
  error: string | null;
  /** Current authenticated user's player in this game */
  currentPlayer: Player | null;
  /** Connection status for monitoring */
  connectionStatus: ConnectionStatus;

  // API Methods
  /** Submit a leader approval vote */
  submitLeaderVote: (approve: boolean) => Promise<VoteResult>;
  /** Select team members for mission (leader only) */
  selectTeam: (playerIds: string[]) => Promise<{ success: boolean; error?: string }>;
  /** Submit a mission vote (team members only) */
  submitMissionVote: (vote: 'pass' | 'fail') => Promise<VoteResult>;
  /** Execute a character special action */
  executeAction: (actionId: ActionId, targetIds: string[]) => Promise<ActionResult>;
  /** Refresh game state from server */
  refresh: () => Promise<void>;
}

interface GameFlowProviderProps {
  gameId: string;
  userId: string;
  children: React.ReactNode;
  /** Optional initial game data from server-side loader */
  initialGame?: Game;
  /** Optional initial players data from server-side loader */
  initialPlayers?: Player[];
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
}

// =============================================================================
// State Management (Reducer for batched updates)
// =============================================================================

interface GameFlowState {
  game: Game | null;
  players: Player[];
  actions: GameAction[];
  modifiers: GameModifier[];
  statuses: PlayerStatus[];
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
}

type GameFlowAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTION_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_GAME'; payload: Game | null }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'UPDATE_PLAYER'; payload: Player }
  | { type: 'REMOVE_PLAYER'; payload: string }
  | { type: 'SET_ACTIONS'; payload: GameAction[] }
  | { type: 'ADD_ACTION'; payload: GameAction }
  | { type: 'SET_MODIFIERS'; payload: GameModifier[] }
  | { type: 'SET_STATUSES'; payload: PlayerStatus[] }
  | { type: 'BATCH_UPDATE'; payload: Partial<GameFlowState> };

function gameFlowReducer(state: GameFlowState, action: GameFlowAction): GameFlowState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };
    case 'SET_GAME':
      return { ...state, game: action.payload };
    case 'SET_PLAYERS':
      return { ...state, players: action.payload };
    case 'UPDATE_PLAYER':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.payload.id ? action.payload : p
        ),
      };
    case 'REMOVE_PLAYER':
      return {
        ...state,
        players: state.players.filter((p) => p.id !== action.payload),
      };
    case 'SET_ACTIONS':
      return { ...state, actions: action.payload };
    case 'ADD_ACTION':
      return { ...state, actions: [...state.actions, action.payload] };
    case 'SET_MODIFIERS':
      return { ...state, modifiers: action.payload };
    case 'SET_STATUSES':
      return { ...state, statuses: action.payload };
    case 'BATCH_UPDATE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// =============================================================================
// Context
// =============================================================================

const GameFlowContext = createContext<GameFlowContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

export function GameFlowProvider({
  gameId,
  userId,
  children,
  initialGame,
  initialPlayers,
  reconnectDelay = 1000,
  maxReconnectAttempts = 5,
}: GameFlowProviderProps) {
  // Batched state via reducer
  const [state, dispatch] = useReducer(gameFlowReducer, {
    game: initialGame ?? null,
    players: initialPlayers ?? [],
    actions: [],
    modifiers: [],
    statuses: [],
    isLoading: !initialGame,
    error: null,
    connectionStatus: 'connecting',
  });

  // Refs for subscriptions and lifecycle
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const channelsRef = useRef<RealtimeChannel[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Computed values (memoized)
  const currentPlayer = useMemo(
    () => state.players.find((p) => p.user_id === userId) ?? null,
    [state.players, userId]
  );

  const ctx: GameCtx | null = useMemo(() => {
    if (!state.game) return null;
    return {
      game: state.game,
      players: state.players,
      currentPlayer,
      modifiers: state.modifiers.filter((m) => m.round === state.game?.current_round),
      statuses: state.statuses,
    };
  }, [state.game, state.players, currentPlayer, state.modifiers, state.statuses]);

  // =============================================================================
  // Safe dispatch (only if mounted)
  // =============================================================================

  const safeDispatch = useCallback((action: GameFlowAction) => {
    if (isMountedRef.current) {
      dispatch(action);
    }
  }, []);

  // =============================================================================
  // Data Fetching with abort support
  // =============================================================================

  const fetchGameData = useCallback(async (signal?: AbortSignal) => {
    if (!supabaseRef.current) return;
    const supabase = supabaseRef.current;

    try {
      // Fetch all data in parallel for efficiency
      const [gameResult, playersResult, actionsResult, modifiersResult, statusesResult] = await Promise.all([
        supabase.from('games').select('*').eq('id', gameId).single(),
        supabase
          .from('players')
          .select('*')
          .eq('game_id', gameId)
          .order('seat_order', { ascending: true, nullsFirst: false }),
        supabase.from('game_actions').select('*').eq('game_id', gameId),
        supabase.from('game_modifiers').select('*').eq('game_id', gameId),
        supabase.from('player_statuses').select('*').eq('game_id', gameId),
      ]);

      // Check if aborted
      if (signal?.aborted) return;

      // Check for errors in order of importance
      if (gameResult.error) {
        safeDispatch({ type: 'SET_ERROR', payload: `Failed to load game: ${gameResult.error.message}` });
        return;
      }

      if (playersResult.error) {
        safeDispatch({ type: 'SET_ERROR', payload: `Failed to load players: ${playersResult.error.message}` });
        return;
      }

      if (actionsResult.error) {
        safeDispatch({ type: 'SET_ERROR', payload: `Failed to load actions: ${actionsResult.error.message}` });
        return;
      }

      // modifiers and statuses are less critical, log but don't fail
      if (modifiersResult.error) {
        console.warn('Failed to load modifiers:', modifiersResult.error.message);
      }

      if (statusesResult.error) {
        console.warn('Failed to load statuses:', statusesResult.error.message);
      }

      // Batch all state updates into single dispatch for single re-render
      safeDispatch({
        type: 'BATCH_UPDATE',
        payload: {
          game: gameResult.data as Game,
          players: (playersResult.data as Player[]) ?? [],
          actions: (actionsResult.data as GameAction[]) ?? [],
          modifiers: (modifiersResult.data as GameModifier[]) ?? [],
          statuses: (statusesResult.data as PlayerStatus[]) ?? [],
          error: null,
          isLoading: false,
        },
      });
    } catch (err) {
      if (signal?.aborted) return;
      safeDispatch({
        type: 'SET_ERROR',
        payload: `Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    }
  }, [gameId, safeDispatch]);

  const refresh = useCallback(async () => {
    safeDispatch({ type: 'SET_LOADING', payload: true });
    await fetchGameData();
    safeDispatch({ type: 'SET_LOADING', payload: false });
  }, [fetchGameData, safeDispatch]);

  // =============================================================================
  // Reconnection Logic
  // =============================================================================

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      safeDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'error' });
      safeDispatch({ type: 'SET_ERROR', payload: 'Failed to reconnect after multiple attempts' });
      return;
    }

    safeDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'reconnecting' });
    reconnectAttemptsRef.current += 1;

    // Exponential backoff
    const delay = reconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);

    reconnectTimeoutRef.current = setTimeout(async () => {
      if (!isMountedRef.current) return;

      // Refresh data to catch up on missed events
      await fetchGameData();

      // Resubscribe channels
      channelsRef.current.forEach((channel) => {
        channel.subscribe((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
          if (status === 'SUBSCRIBED') {
            reconnectAttemptsRef.current = 0;
            safeDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connected' });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            attemptReconnect();
          }
        });
      });
    }, delay);
  }, [reconnectDelay, maxReconnectAttempts, fetchGameData, safeDispatch]);

  // =============================================================================
  // Channel Status Handler
  // =============================================================================

  const handleChannelStatus = useCallback((status: `${REALTIME_SUBSCRIBE_STATES}`) => {
    switch (status) {
      case 'SUBSCRIBED':
        reconnectAttemptsRef.current = 0;
        safeDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'connected' });
        break;
      case 'CHANNEL_ERROR':
      case 'TIMED_OUT':
        safeDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'disconnected' });
        attemptReconnect();
        break;
      case 'CLOSED':
        safeDispatch({ type: 'SET_CONNECTION_STATUS', payload: 'disconnected' });
        break;
    }
  }, [safeDispatch, attemptReconnect]);

  // =============================================================================
  // Subscriptions
  // =============================================================================

  useEffect(() => {
    isMountedRef.current = true;

    // Initialize abort controller for fetch cleanup
    abortControllerRef.current = new AbortController();
    const { signal } = abortControllerRef.current;

    // Initialize Supabase client
    const supabase = createClient();
    supabaseRef.current = supabase;

    // Initial data fetch if no initial data provided
    if (!initialGame) {
      safeDispatch({ type: 'SET_LOADING', payload: true });
      fetchGameData(signal).finally(() => {
        safeDispatch({ type: 'SET_LOADING', payload: false });
      });
    }

    // Subscribe to game changes (UPDATE only - games don't get INSERTed during subscription)
    const gameChannel = supabase
      .channel(`game-flow-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'SET_GAME', payload: payload.new as Game });
        }
      )
      .subscribe(handleChannelStatus);

    // Subscribe to player changes with specific event handlers
    const playersChannel = supabase
      .channel(`game-flow-players-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          // Refetch all players to maintain correct order
          const { data } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId)
            .order('seat_order', { ascending: true, nullsFirst: false });

          if (data && isMountedRef.current) {
            safeDispatch({ type: 'SET_PLAYERS', payload: data as Player[] });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'UPDATE_PLAYER', payload: payload.new as Player });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'REMOVE_PLAYER', payload: (payload.old as Player).id });
        }
      )
      .subscribe(handleChannelStatus);

    // Subscribe to game action changes (INSERT only - actions are append-only)
    const actionsChannel = supabase
      .channel(`game-flow-actions-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_actions',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'ADD_ACTION', payload: payload.new as GameAction });
        }
      )
      .subscribe(handleChannelStatus);

    // Subscribe to player status changes (refetch on any change)
    const statusesChannel = supabase
      .channel(`game-flow-statuses-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_statuses',
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          // Refetch all statuses
          const { data } = await supabase
            .from('player_statuses')
            .select('*')
            .eq('game_id', gameId);

          if (data && isMountedRef.current) {
            safeDispatch({ type: 'SET_STATUSES', payload: data as PlayerStatus[] });
          }
        }
      )
      .subscribe(handleChannelStatus);

    // Store channels for cleanup
    channelsRef.current = [gameChannel, playersChannel, actionsChannel, statusesChannel];

    // Cleanup on unmount
    return () => {
      isMountedRef.current = false;

      // Abort any pending fetches
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;

      // Clear reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      // Remove all channels
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [gameId, initialGame, fetchGameData, safeDispatch, handleChannelStatus]);

  // =============================================================================
  // API Methods
  // =============================================================================

  const submitLeaderVote = useCallback(
    async (approve: boolean): Promise<VoteResult> => {
      try {
        const vote: LeaderVote = approve ? 'yes' : 'no';
        const response = await fetch(`/api/games/${gameId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voteType: 'leader', vote }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            allVotesIn: false,
            error: data.error || 'Failed to submit vote',
          };
        }

        return data as VoteResult;
      } catch (err) {
        return {
          success: false,
          allVotesIn: false,
          error: err instanceof Error ? err.message : 'Network error',
        };
      }
    },
    [gameId]
  );

  const selectTeam = useCallback(
    async (playerIds: string[]): Promise<{ success: boolean; error?: string }> => {
      try {
        const response = await fetch(`/api/games/${gameId}/team`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamIds: playerIds }),
        });

        const data = await response.json();

        if (!response.ok) {
          return { success: false, error: data.error || 'Failed to select team' };
        }

        return { success: true };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Network error',
        };
      }
    },
    [gameId]
  );

  const submitMissionVote = useCallback(
    async (vote: 'pass' | 'fail'): Promise<VoteResult> => {
      try {
        const response = await fetch(`/api/games/${gameId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ voteType: 'mission', vote }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            allVotesIn: false,
            error: data.error || 'Failed to submit vote',
          };
        }

        return data as VoteResult;
      } catch (err) {
        return {
          success: false,
          allVotesIn: false,
          error: err instanceof Error ? err.message : 'Network error',
        };
      }
    },
    [gameId]
  );

  const executeAction = useCallback(
    async (actionId: ActionId, targetIds: string[]): Promise<ActionResult> => {
      try {
        const response = await fetch(`/api/games/${gameId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionId, targetIds }),
        });

        const data = await response.json();

        if (!response.ok) {
          return {
            success: false,
            message: data.error || 'Failed to execute action',
            error: data.error,
          };
        }

        return data as ActionResult;
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Network error',
          error: err instanceof Error ? err.message : 'Network error',
        };
      }
    },
    [gameId]
  );

  // =============================================================================
  // Render
  // =============================================================================

  const value: GameFlowContextValue = {
    game: state.game,
    players: state.players,
    actions: state.actions,
    ctx,
    isLoading: state.isLoading,
    error: state.error,
    currentPlayer,
    connectionStatus: state.connectionStatus,
    submitLeaderVote,
    selectTeam,
    submitMissionVote,
    executeAction,
    refresh,
  };

  return <GameFlowContext.Provider value={value}>{children}</GameFlowContext.Provider>;
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access the GameFlowContext.
 * Must be used within a GameFlowProvider.
 */
export function useGameFlow(): GameFlowContextValue {
  const context = useContext(GameFlowContext);

  if (!context) {
    throw new Error('useGameFlow must be used within a GameFlowProvider');
  }

  return context;
}

// Export context for testing
export { GameFlowContext };
