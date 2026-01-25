/**
 * useGameSubscription - Real-time subscription hook for game state.
 * Provides game, players, and actions with automatic real-time updates.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '~/lib/supabase/client';
import type { Game, Player, GameAction } from '~/types/game';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

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
}

// =============================================================================
// Hook
// =============================================================================

export function useGameSubscription(
  gameId: string,
  options: UseGameSubscriptionOptions = {}
): UseGameSubscriptionResult {
  const { initialGame, initialPlayers, initialActions } = options;

  // State
  const [game, setGame] = useState<Game | null>(initialGame ?? null);
  const [players, setPlayers] = useState<Player[]>(initialPlayers ?? []);
  const [actions, setActions] = useState<GameAction[]>(initialActions ?? []);
  const [isLoading, setIsLoading] = useState(!initialGame);
  const [error, setError] = useState<string | null>(null);

  // Refs for subscriptions
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const fetchGameData = useCallback(async () => {
    if (!supabaseRef.current) return;
    const supabase = supabaseRef.current;

    try {
      // Fetch game
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single();

      if (gameError) {
        setError(`Failed to load game: ${gameError.message}`);
        return;
      }

      setGame(gameData as Game);

      // Fetch players (sorted by seat_order)
      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId)
        .order('seat_order', { ascending: true, nullsFirst: false });

      if (playersError) {
        setError(`Failed to load players: ${playersError.message}`);
        return;
      }

      setPlayers((playersData as Player[]) ?? []);

      // Fetch game actions
      const { data: actionsData, error: actionsError } = await supabase
        .from('game_actions')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at', { ascending: true });

      if (actionsError) {
        setError(`Failed to load actions: ${actionsError.message}`);
        return;
      }

      setActions((actionsData as GameAction[]) ?? []);

      setError(null);
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [gameId]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchGameData();
    setIsLoading(false);
  }, [fetchGameData]);

  // =============================================================================
  // Subscriptions
  // =============================================================================

  useEffect(() => {
    // Initialize Supabase client
    const supabase = createClient();
    supabaseRef.current = supabase;

    // Initial data fetch if no initial data provided
    if (!initialGame) {
      setIsLoading(true);
      fetchGameData().finally(() => setIsLoading(false));
    }

    // Subscribe to game changes
    const gameChannel = supabase
      .channel(`game-sub-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setGame(payload.new as Game);
          } else if (payload.eventType === 'DELETE') {
            setGame(null);
          }
        }
      )
      .subscribe();

    // Subscribe to player changes
    const playersChannel = supabase
      .channel(`game-sub-players-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            // Refetch to maintain correct sort order
            const { data } = await supabase
              .from('players')
              .select('*')
              .eq('game_id', gameId)
              .order('seat_order', { ascending: true, nullsFirst: false });
            if (data) setPlayers(data as Player[]);
          } else if (payload.eventType === 'UPDATE') {
            setPlayers((prev) =>
              prev.map((p) => (p.id === (payload.new as Player).id ? (payload.new as Player) : p))
            );
          } else if (payload.eventType === 'DELETE') {
            setPlayers((prev) => prev.filter((p) => p.id !== (payload.old as Player).id));
          }
        }
      )
      .subscribe();

    // Subscribe to game action changes
    const actionsChannel = supabase
      .channel(`game-sub-actions-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_actions',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setActions((prev) => [...prev, payload.new as GameAction]);
          } else if (payload.eventType === 'UPDATE') {
            setActions((prev) =>
              prev.map((a) =>
                a.id === (payload.new as GameAction).id ? (payload.new as GameAction) : a
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setActions((prev) => prev.filter((a) => a.id !== (payload.old as GameAction).id));
          }
        }
      )
      .subscribe();

    // Store channels for cleanup
    channelsRef.current = [gameChannel, playersChannel, actionsChannel];

    // Cleanup on unmount
    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [gameId, initialGame, fetchGameData]);

  return {
    game,
    players,
    actions,
    isLoading,
    error,
    refresh,
  };
}
