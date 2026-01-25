/**
 * useVoteSubscription - Real-time subscription hook for vote tracking.
 * Returns votes as a Record<playerId, vote> filtered by round and phase.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '~/lib/supabase/client';
import type { GameAction, GamePhase, LeaderVote, MissionVote } from '~/types/game';
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Types
// =============================================================================

/** Vote value for leader voting phase */
export type LeaderVoteValue = LeaderVote; // 'yes' | 'no'

/** Vote value for mission voting phase */
export type MissionVoteValue = MissionVote; // 'pass' | 'fail'

/** Combined vote type */
export type VoteValue = LeaderVoteValue | MissionVoteValue;

/** Map of player IDs to their votes */
export type VoteMap = Record<string, VoteValue>;

export interface UseVoteSubscriptionResult {
  /** Map of playerId to vote value */
  votes: VoteMap;
  /** Whether initial votes are being loaded */
  isLoading: boolean;
  /** Error message if any operation failed */
  error: string | null;
  /** Manually refresh votes from server */
  refresh: () => Promise<void>;
}

export interface UseVoteSubscriptionOptions {
  /** Optional initial votes data (for SSR hydration) */
  initialVotes?: VoteMap;
}

// =============================================================================
// Constants
// =============================================================================

/** Action types that represent leader votes */
const LEADER_VOTE_TYPES = ['vote_yes', 'vote_no'] as const;

/** Action types that represent mission votes */
const MISSION_VOTE_TYPES = ['vote_pass', 'vote_fail'] as const;

/** All vote action types */
const VOTE_ACTION_TYPES = [...LEADER_VOTE_TYPES, ...MISSION_VOTE_TYPES] as const;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Determines if a phase is a leader voting phase
 */
function isLeaderVotingPhase(phase: GamePhase | null): boolean {
  return phase === 'voting_for_leader';
}

/**
 * Determines if a phase is a mission voting phase
 */
function isMissionVotingPhase(phase: GamePhase | null): boolean {
  return phase === 'mission_voting';
}

/**
 * Extracts vote value from action type
 */
function extractVoteFromActionType(actionType: string): VoteValue | null {
  switch (actionType) {
    case 'vote_yes':
      return 'yes';
    case 'vote_no':
      return 'no';
    case 'vote_pass':
      return 'pass';
    case 'vote_fail':
      return 'fail';
    default:
      return null;
  }
}

/**
 * Checks if an action type is a vote action for the given phase
 */
function isVoteActionForPhase(actionType: string, phase: GamePhase | null): boolean {
  if (isLeaderVotingPhase(phase)) {
    return (LEADER_VOTE_TYPES as readonly string[]).includes(actionType);
  }
  if (isMissionVotingPhase(phase)) {
    return (MISSION_VOTE_TYPES as readonly string[]).includes(actionType);
  }
  return false;
}

/**
 * Filters and converts game actions to a vote map
 */
function actionsToVoteMap(
  actions: GameAction[],
  round: number,
  phase: GamePhase | null
): VoteMap {
  const voteMap: VoteMap = {};

  for (const action of actions) {
    // Filter by round
    if (action.round !== round) continue;

    // Filter by phase
    if (action.phase !== phase) continue;

    // Check if this is a vote action for the current phase
    if (!isVoteActionForPhase(action.action_type, phase)) continue;

    // Extract vote value
    const vote = extractVoteFromActionType(action.action_type);
    if (vote) {
      voteMap[action.player_id] = vote;
    }
  }

  return voteMap;
}

// =============================================================================
// Hook
// =============================================================================

export function useVoteSubscription(
  gameId: string,
  round: number,
  phase: GamePhase | null,
  options: UseVoteSubscriptionOptions = {}
): UseVoteSubscriptionResult {
  const { initialVotes } = options;

  // State
  const [votes, setVotes] = useState<VoteMap>(initialVotes ?? {});
  const [isLoading, setIsLoading] = useState(!initialVotes);
  const [error, setError] = useState<string | null>(null);

  // Refs for subscriptions
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // =============================================================================
  // Data Fetching
  // =============================================================================

  const fetchVotes = useCallback(async () => {
    if (!supabaseRef.current) return;
    const supabase = supabaseRef.current;

    try {
      // Fetch vote actions for the specific round and phase
      const { data: actionsData, error: actionsError } = await supabase
        .from('game_actions')
        .select('*')
        .eq('game_id', gameId)
        .eq('round', round)
        .eq('phase', phase)
        .in('action_type', VOTE_ACTION_TYPES as unknown as string[]);

      if (actionsError) {
        setError(`Failed to load votes: ${actionsError.message}`);
        return;
      }

      const voteMap = actionsToVoteMap(actionsData as GameAction[], round, phase);
      setVotes(voteMap);
      setError(null);
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }, [gameId, round, phase]);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    await fetchVotes();
    setIsLoading(false);
  }, [fetchVotes]);

  // =============================================================================
  // Subscriptions
  // =============================================================================

  useEffect(() => {
    // Skip if phase is not a voting phase
    if (!isLeaderVotingPhase(phase) && !isMissionVotingPhase(phase)) {
      setVotes({});
      setIsLoading(false);
      return;
    }

    // Initialize Supabase client
    const supabase = createClient();
    supabaseRef.current = supabase;

    // Initial data fetch if no initial data provided
    if (!initialVotes) {
      setIsLoading(true);
      fetchVotes().finally(() => setIsLoading(false));
    }

    // Subscribe to new vote actions
    const channel = supabase
      .channel(`vote-sub-${gameId}-${round}-${phase}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'game_actions',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const action = payload.new as GameAction;

          // Filter by round
          if (action.round !== round) return;

          // Filter by phase
          if (action.phase !== phase) return;

          // Check if this is a vote action for the current phase
          if (!isVoteActionForPhase(action.action_type, phase)) return;

          // Extract vote value and update map
          const vote = extractVoteFromActionType(action.action_type);
          if (vote) {
            setVotes((prev) => ({
              ...prev,
              [action.player_id]: vote,
            }));
          }
        }
      )
      .subscribe();

    // Store channel for cleanup
    channelRef.current = channel;

    // Cleanup on unmount or when dependencies change
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [gameId, round, phase, initialVotes, fetchVotes]);

  // Reset votes when round or phase changes
  useEffect(() => {
    if (!initialVotes) {
      setVotes({});
    }
  }, [round, phase, initialVotes]);

  return {
    votes,
    isLoading,
    error,
    refresh,
  };
}
