/**
 * useGameApi - Hook for making game API calls with loading and error state management.
 * Provides methods for all game actions: voting, team selection, action execution, and game start.
 */

import { useState, useCallback } from 'react';
import type { LeaderVote, MissionVote, ActionId, VoteResult, ActionResult, Game, Player } from '~/types/game';

// =============================================================================
// Types
// =============================================================================

export type VoteType = 'leader' | 'mission';
export type Vote = LeaderVote | MissionVote;

export interface CreateGameResponse {
  game: Game;
  player: Player;
  gameKey: string;
}

export interface JoinGameResponse {
  player: Player;
}

export interface StartGameResponse {
  game: Game;
}

export interface TeamSelectionResponse {
  game: Game;
}

export interface UseGameApiReturn {
  /** Whether an API call is in progress */
  isLoading: boolean;
  /** Error message from the last failed API call */
  error: string | null;
  /** Clear the current error */
  clearError: () => void;
  /** Submit a leader or mission vote */
  submitVote: (gameId: string, voteType: VoteType, vote: Vote) => Promise<VoteResult | null>;
  /** Select team members for a mission (leader only) */
  selectTeam: (gameId: string, teamIds: string[]) => Promise<TeamSelectionResponse | null>;
  /** Execute a character action */
  executeAction: (gameId: string, actionId: ActionId, targetIds: string[]) => Promise<ActionResult | null>;
  /** Start the game (host only) */
  startGame: (gameId: string) => Promise<StartGameResponse | null>;
  /** Create a new game */
  createGame: (displayName: string) => Promise<CreateGameResponse | null>;
  /** Join an existing game */
  joinGame: (gameId: string, displayName: string) => Promise<JoinGameResponse | null>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Make a POST request to an API endpoint with JSON body.
 */
async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    credentials: 'include', // Include auth cookies
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}

// =============================================================================
// Hook
// =============================================================================

export function useGameApi(): UseGameApiReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Wrap an async operation with loading and error state management.
   */
  const withLoadingState = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await operation();
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  /**
   * Submit a vote (leader approval or mission pass/fail).
   */
  const submitVote = useCallback(
    async (gameId: string, voteType: VoteType, vote: Vote): Promise<VoteResult | null> => {
      return withLoadingState(async () => {
        return postJson<VoteResult>(`/api/games/${gameId}/vote`, {
          voteType,
          vote,
        });
      });
    },
    [withLoadingState]
  );

  /**
   * Select team members for a mission.
   */
  const selectTeam = useCallback(
    async (gameId: string, teamIds: string[]): Promise<TeamSelectionResponse | null> => {
      return withLoadingState(async () => {
        return postJson<TeamSelectionResponse>(`/api/games/${gameId}/team`, {
          teamIds,
        });
      });
    },
    [withLoadingState]
  );

  /**
   * Execute a character action.
   */
  const executeAction = useCallback(
    async (gameId: string, actionId: ActionId, targetIds: string[]): Promise<ActionResult | null> => {
      return withLoadingState(async () => {
        return postJson<ActionResult>(`/api/games/${gameId}/action`, {
          actionId,
          targetIds,
        });
      });
    },
    [withLoadingState]
  );

  /**
   * Start the game (host only).
   */
  const startGame = useCallback(
    async (gameId: string): Promise<StartGameResponse | null> => {
      return withLoadingState(async () => {
        return postJson<StartGameResponse>(`/api/games/${gameId}/start`, {});
      });
    },
    [withLoadingState]
  );

  /**
   * Create a new game.
   */
  const createGame = useCallback(
    async (displayName: string): Promise<CreateGameResponse | null> => {
      return withLoadingState(async () => {
        return postJson<CreateGameResponse>('/api/games/create', {
          displayName,
        });
      });
    },
    [withLoadingState]
  );

  /**
   * Join an existing game.
   */
  const joinGame = useCallback(
    async (gameId: string, displayName: string): Promise<JoinGameResponse | null> => {
      return withLoadingState(async () => {
        return postJson<JoinGameResponse>(`/api/games/${gameId}/join`, {
          displayName,
        });
      });
    },
    [withLoadingState]
  );

  return {
    isLoading,
    error,
    clearError,
    submitVote,
    selectTeam,
    executeAction,
    startGame,
    createGame,
    joinGame,
  };
}
