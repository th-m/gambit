/**
 * useGameSubscription - Real-time subscription hook for game state.
 * Provides game, players, and actions with automatic real-time updates.
 *
 * Performance optimizations:
 * - Batched state updates via reducer pattern (single re-render per event)
 * - Reconnection handling for dropped connections
 * - Abort controller for cleanup of pending fetches
 * - Stable callback refs to prevent stale closures
 */

import { useEffect, useReducer, useCallback, useRef } from 'react';
import { createClient } from '~/lib/supabase/client';
import type { Game, Player, GameAction } from '~/types/game';
import type { RealtimeChannel, SupabaseClient, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

export interface UseGameSubscriptionResult {
  /** Current game state */
  game: Game | null;
  /** All players in the game */
  players: Player[];
  /** Game actions (votes, special actions) */
  actions: GameAction[];
  /** Whether initial data is being loaded */
  isLoading: boolean;
  /** Error message if any operation failed */
  error: string | null;
  /** Connection status for monitoring */
  connectionStatus: ConnectionStatus;
  /** Manually refresh game data from server */
  refresh: () => Promise<void>;
}

export interface UseGameSubscriptionOptions {
  /** Optional initial game data (for SSR hydration) */
  initialGame?: Game;
  /** Optional initial players data (for SSR hydration) */
  initialPlayers?: Player[];
  /** Optional initial actions data (for SSR hydration) */
  initialActions?: GameAction[];
  /** Reconnection delay in ms (default: 1000) */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (default: 5) */
  maxReconnectAttempts?: number;
}

/** Connection status for real-time subscriptions */
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';

// =============================================================================
// State Management (Reducer for batched updates)
// =============================================================================

interface SubscriptionState {
  game: Game | null;
  players: Player[];
  actions: GameAction[];
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
}

type SubscriptionAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTION_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_GAME'; payload: Game | null }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'SET_ACTIONS'; payload: GameAction[] }
  | { type: 'UPDATE_PLAYER'; payload: Player }
  | { type: 'REMOVE_PLAYER'; payload: string }
  | { type: 'ADD_ACTION'; payload: GameAction }
  | { type: 'UPDATE_ACTION'; payload: GameAction }
  | { type: 'REMOVE_ACTION'; payload: string }
  | { type: 'BATCH_UPDATE'; payload: Partial<SubscriptionState> };

function subscriptionReducer(state: SubscriptionState, action: SubscriptionAction): SubscriptionState {
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
    case 'SET_ACTIONS':
      return { ...state, actions: action.payload };
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
    case 'ADD_ACTION':
      return { ...state, actions: [...state.actions, action.payload] };
    case 'UPDATE_ACTION':
      return {
        ...state,
        actions: state.actions.map((a) =>
          a.id === action.payload.id ? action.payload : a
        ),
      };
    case 'REMOVE_ACTION':
      return {
        ...state,
        actions: state.actions.filter((a) => a.id !== action.payload),
      };
    case 'BATCH_UPDATE':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// =============================================================================
// Hook
// =============================================================================

export function useGameSubscription(
  gameId: string,
  options: UseGameSubscriptionOptions = {}
): UseGameSubscriptionResult {
  const {
    initialGame,
    initialPlayers,
    initialActions,
    reconnectDelay = 1000,
    maxReconnectAttempts = 5,
  } = options;

  // Batched state via reducer
  const [state, dispatch] = useReducer(subscriptionReducer, {
    game: initialGame ?? null,
    players: initialPlayers ?? [],
    actions: initialActions ?? [],
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

  // =============================================================================
  // Safe dispatch (only if mounted)
  // =============================================================================

  const safeDispatch = useCallback((action: SubscriptionAction) => {
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
      const [gameResult, playersResult, actionsResult] = await Promise.all([
        supabase.from('gambit_games').select('*').eq('id', gameId).single(),
        supabase
          .from('gambit_game_players')
          .select('*')
          .eq('game_id', gameId)
          .order('seat_order', { ascending: true, nullsFirst: false }),
        supabase
          .from('gambit_game_actions')
          .select('*')
          .eq('game_id', gameId)
          .order('created_at', { ascending: true }),
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

      // Batch all state updates into single dispatch for single re-render
      safeDispatch({
        type: 'BATCH_UPDATE',
        payload: {
          game: gameResult.data as Game,
          players: (playersResult.data as Player[]) ?? [],
          actions: (actionsResult.data as GameAction[]) ?? [],
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
      .channel(`game-sub-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gambit_games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'SET_GAME', payload: payload.new as Game });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'gambit_games',
          filter: `id=eq.${gameId}`,
        },
        () => {
          safeDispatch({ type: 'SET_GAME', payload: null });
        }
      )
      .subscribe(handleChannelStatus);

    // Subscribe to player changes with specific event handlers
    const playersChannel = supabase
      .channel(`game-sub-players-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gambit_game_players',
          filter: `game_id=eq.${gameId}`,
        },
        async () => {
          // Refetch to maintain correct sort order
          const { data } = await supabase
            .from('gambit_game_players')
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
          table: 'gambit_game_players',
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
          table: 'gambit_game_players',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'REMOVE_PLAYER', payload: (payload.old as Player).id });
        }
      )
      .subscribe(handleChannelStatus);

    // Subscribe to game action changes with specific event handlers
    const actionsChannel = supabase
      .channel(`game-sub-actions-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gambit_game_actions',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'ADD_ACTION', payload: payload.new as GameAction });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gambit_game_actions',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'UPDATE_ACTION', payload: payload.new as GameAction });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'gambit_game_actions',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          safeDispatch({ type: 'REMOVE_ACTION', payload: (payload.old as GameAction).id });
        }
      )
      .subscribe(handleChannelStatus);

    // Store channels for cleanup
    channelsRef.current = [gameChannel, playersChannel, actionsChannel];

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

  return {
    game: state.game,
    players: state.players,
    actions: state.actions,
    isLoading: state.isLoading,
    error: state.error,
    connectionStatus: state.connectionStatus,
    refresh,
  };
}
