/**
 * useVoteCompletion - Hook to monitor vote completion and trigger server processing.
 * Monitors vote count vs expected voters and triggers server-side processing when complete.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Game, Player, GamePhase } from '~/types/game';
import type { VoteMap } from './useVoteSubscription';

// =============================================================================
// Types
// =============================================================================

export interface UseVoteCompletionOptions {
  /** Callback when vote completion is detected and processing should occur */
  onComplete?: (result: VoteCompletionResult) => void;
  /** Debounce delay in milliseconds (default: 300ms) */
  debounceMs?: number;
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
}

export interface VoteCompletionResult {
  /** The type of voting that completed */
  voteType: 'leader' | 'mission';
  /** Number of votes collected */
  voteCount: number;
  /** Number of expected voters */
  expectedCount: number;
  /** The votes map */
  votes: VoteMap;
}

export interface UseVoteCompletionReturn {
  /** Whether all votes are in */
  isComplete: boolean;
  /** Current vote count */
  voteCount: number;
  /** Expected voter count */
  expectedCount: number;
  /** Manually trigger completion check */
  checkCompletion: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get expected voter count based on game phase.
 * - Leader voting: all alive players vote
 * - Mission voting: only team members vote
 */
function getExpectedVoterCount(
  game: Game | null,
  players: Player[],
  phase: GamePhase | null
): number {
  if (!game || !phase) return 0;

  if (phase === 'voting_for_leader') {
    // All alive players vote on leader approval
    return players.filter((p) => p.is_alive).length;
  }

  if (phase === 'mission_voting') {
    // Only team members vote on missions
    return game.selected_team?.length ?? 0;
  }

  return 0;
}

/**
 * Check if the phase is a voting phase.
 */
function isVotingPhase(phase: GamePhase | null): phase is 'voting_for_leader' | 'mission_voting' {
  return phase === 'voting_for_leader' || phase === 'mission_voting';
}

/**
 * Get vote type from phase.
 */
function getVoteType(phase: GamePhase | null): 'leader' | 'mission' | null {
  if (phase === 'voting_for_leader') return 'leader';
  if (phase === 'mission_voting') return 'mission';
  return null;
}

// =============================================================================
// Hook
// =============================================================================

export function useVoteCompletion(
  game: Game | null,
  players: Player[],
  votes: VoteMap,
  options: UseVoteCompletionOptions = {}
): UseVoteCompletionReturn {
  const {
    onComplete,
    debounceMs = 300,
    enabled = true,
  } = options;

  // Refs for tracking state across renders
  const hasTriggeredRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPhaseRef = useRef<GamePhase | null>(null);
  const lastRoundRef = useRef<number | null>(null);

  // Calculate current state
  const phase = game?.phase ?? null;
  const currentRound = game?.current_round ?? null;
  const gameId = game?.id ?? null;
  const voteCount = Object.keys(votes).length;
  const expectedCount = getExpectedVoterCount(game, players, phase);
  const isComplete = voteCount > 0 && voteCount >= expectedCount && isVotingPhase(phase);

  // Reset trigger flag when phase or round changes
  useEffect(() => {
    if (phase !== lastPhaseRef.current || currentRound !== lastRoundRef.current) {
      hasTriggeredRef.current = false;
      lastPhaseRef.current = phase;
      lastRoundRef.current = currentRound;

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [phase, currentRound]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  // Debounced completion trigger
  const triggerCompletion = useCallback(() => {
    if (!enabled || hasTriggeredRef.current || !isVotingPhase(phase)) {
      return;
    }

    const voteType = getVoteType(phase);
    if (!voteType) return;

    hasTriggeredRef.current = true;

    const result: VoteCompletionResult = {
      voteType,
      voteCount,
      expectedCount,
      votes,
    };

    onComplete?.(result);
  }, [enabled, phase, voteCount, expectedCount, votes, onComplete, currentRound]);

  // Manual completion check
  const checkCompletion = useCallback(() => {
    if (isComplete && !hasTriggeredRef.current) {
      triggerCompletion();
    }
  }, [isComplete, triggerCompletion]);

  // Monitor for completion with debounce
  useEffect(() => {
    // Skip if disabled, not a voting phase, or already triggered
    if (!enabled || !isVotingPhase(phase) || hasTriggeredRef.current) {
      return;
    }

    // Skip if votes not complete
    if (!isComplete) {
      return;
    }

    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set debounced trigger
    timeoutRef.current = setTimeout(() => {
      triggerCompletion();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [enabled, phase, isComplete, debounceMs, triggerCompletion]);

  return {
    isComplete,
    voteCount,
    expectedCount,
    checkCompletion,
  };
}
