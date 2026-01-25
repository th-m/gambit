/**
 * GameFlowContext - Client-side state management for game flow.
 * Provides real-time subscriptions, game state, and API methods for game interactions.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

interface GameFlowContextValue {
  /** Current game state */
  game: Game | null;
  /** All players in the game */
  players: Player[];
  /** Game context for action/effect evaluation */
  ctx: GameCtx | null;
  /** Whether initial data is being loaded */
  isLoading: boolean;
  /** Error message if any operation failed */
  error: string | null;
  /** Current authenticated user's player in this game */
  currentPlayer: Player | null;

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
}: GameFlowProviderProps) {
  // State
  const [game, setGame] = useState<Game | null>(initialGame ?? null);
  const [players, setPlayers] = useState<Player[]>(initialPlayers ?? []);
  const [actions, setActions] = useState<GameAction[]>([]);
  const [modifiers, setModifiers] = useState<GameModifier[]>([]);
  const [statuses, setStatuses] = useState<PlayerStatus[]>([]);
  const [isLoading, setIsLoading] = useState(!initialGame);
  const [error, setError] = useState<string | null>(null);

  // Refs for subscriptions
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const channelsRef = useRef<RealtimeChannel[]>([]);

  // Computed values
  const currentPlayer = players.find((p) => p.user_id === userId) ?? null;

  const ctx: GameCtx | null = game
    ? {
        game,
        players,
        currentPlayer,
        modifiers: modifiers.filter((m) => m.round === game.current_round),
        statuses,
      }
    : null;

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

      // Fetch players
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

      // Fetch game actions for current round
      const { data: actionsData } = await supabase
        .from('game_actions')
        .select('*')
        .eq('game_id', gameId)
        .eq('round', gameData.current_round);

      setActions((actionsData as GameAction[]) ?? []);

      // Fetch active modifiers
      const { data: modifiersData } = await supabase
        .from('game_modifiers')
        .select('*')
        .eq('game_id', gameId);

      setModifiers((modifiersData as GameModifier[]) ?? []);

      // Fetch active player statuses
      const { data: statusesData } = await supabase
        .from('player_statuses')
        .select('*')
        .eq('game_id', gameId);

      setStatuses((statusesData as PlayerStatus[]) ?? []);

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
      .channel(`game-flow-${gameId}`)
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
          }
        }
      )
      .subscribe();

    // Subscribe to player changes
    const playersChannel = supabase
      .channel(`game-flow-players-${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          // Refetch all players to maintain correct order
          const { data } = await supabase
            .from('players')
            .select('*')
            .eq('game_id', gameId)
            .order('seat_order', { ascending: true, nullsFirst: false });

          if (data) {
            setPlayers(data as Player[]);
          }
        }
      )
      .subscribe();

    // Subscribe to game action changes (for current round tracking)
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
          const newAction = payload.new as GameAction;
          setActions((prev) => [...prev, newAction]);
        }
      )
      .subscribe();

    // Subscribe to player status changes
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

          if (data) {
            setStatuses(data as PlayerStatus[]);
          }
        }
      )
      .subscribe();

    // Store channels for cleanup
    channelsRef.current = [gameChannel, playersChannel, actionsChannel, statusesChannel];

    // Cleanup on unmount
    return () => {
      channelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
    };
  }, [gameId, initialGame, fetchGameData]);

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
    game,
    players,
    ctx,
    isLoading,
    error,
    currentPlayer,
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
