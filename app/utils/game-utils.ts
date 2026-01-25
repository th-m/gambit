/**
 * Game Utility Functions
 * Centralized utility functions for game logic.
 */

import type { Game, Team, EndReason } from '~/types/game';

// =============================================================================
// Constants
// =============================================================================

/**
 * Characters to use for game key generation.
 * Excludes ambiguous characters: I, O, 0, 1
 */
const GAME_KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Mission sizes for each player count and round.
 * Format: MISSION_SIZES[playerCount][roundNumber] = teamSize
 */
export const MISSION_SIZES: Record<number, Record<number, number>> = {
  5: { 1: 2, 2: 3, 3: 2, 4: 3, 5: 3 },
  6: { 1: 2, 2: 3, 3: 4, 4: 3, 5: 4 },
  7: { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 },
  8: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
  9: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
  10: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
};

/**
 * Default base URL for join links.
 * In production, this would be set from environment variables.
 */
const DEFAULT_BASE_URL = 'http://localhost:5173';

// =============================================================================
// Game Key Functions
// =============================================================================

/**
 * Generate a unique game key (6-8 alphanumeric characters).
 * Uses uppercase letters and numbers, excluding ambiguous characters (I, O, 0, 1).
 * @returns A random game key string
 */
export function generateGameKey(): string {
  const length = 6 + Math.floor(Math.random() * 3); // 6, 7, or 8 chars
  let key = '';
  for (let i = 0; i < length; i++) {
    key += GAME_KEY_CHARS.charAt(Math.floor(Math.random() * GAME_KEY_CHARS.length));
  }
  return key;
}

/**
 * Format a shareable join link for a game.
 * @param gameKey - The game's shareable code
 * @param baseUrl - Optional base URL (defaults to localhost for dev)
 * @returns The full shareable URL
 */
export function formatJoinLink(gameKey: string, baseUrl?: string): string {
  const base = baseUrl || (typeof window !== 'undefined' ? window.location.origin : DEFAULT_BASE_URL);
  return `${base}/join/${gameKey}`;
}

// =============================================================================
// Mission Size Functions
// =============================================================================

/**
 * Get mission team size for given player count and round.
 * @param playerCount - Number of players in the game (5-10)
 * @param round - Current round number (1-5)
 * @returns Required team size for the mission
 */
export function getMissionSize(playerCount: number, round: number): number {
  return MISSION_SIZES[playerCount]?.[round] ?? 3;
}

/**
 * Get required fail votes for a mission to fail.
 * Round 4 with 7+ players requires 2 fail votes; all others require 1.
 * @param playerCount - Number of players in the game
 * @param round - Current round number
 * @returns Number of fail votes required
 */
export function getRequiredFailVotes(playerCount: number, round: number): number {
  if (round === 4 && playerCount >= 7) {
    return 2;
  }
  return 1;
}

// =============================================================================
// Win Condition Types
// =============================================================================

/**
 * Result of a win condition check.
 */
export interface WinConditionResult {
  /** Whether a win condition has been met */
  hasWinner: boolean;
  /** The winning team (if game should end) */
  winner: Team | null;
  /** The reason for the game ending */
  endReason: EndReason | null;
  /** Whether assassination phase should be triggered instead of ending */
  triggerAssassination?: boolean;
}

// =============================================================================
// Win Condition Functions
// =============================================================================

/**
 * Check if any win condition has been met for the game.
 * 
 * Win conditions:
 * 1. Good wins: 3 successful missions (may trigger assassination first)
 * 2. Evil wins: 3 failed missions
 * 3. Evil wins: 3 consecutive leader rejections (handled separately in VoteProcessor)
 * 
 * Note: Assassination-related wins (Seer killed or wrong target) are handled
 * separately in the assassinate action.
 * 
 * @param game - The current game state
 * @param assassinAlive - Whether an Assassin is still alive (for good victory check)
 * @returns WinConditionResult indicating if game should end or trigger assassination
 */
export function checkWinCondition(game: Game, assassinAlive: boolean = true): WinConditionResult {
  const noWinner: WinConditionResult = {
    hasWinner: false,
    winner: null,
    endReason: null,
  };

  // Game already finished
  if (game.status === 'finished') {
    return {
      hasWinner: true,
      winner: game.winner,
      endReason: game.end_reason,
    };
  }

  // Evil wins with 3 failed missions
  if (game.evil_victories >= 3) {
    return {
      hasWinner: true,
      winner: 'evil',
      endReason: 'Evil sabotaged 3 missions',
    };
  }

  // Good wins with 3 successful missions
  if (game.good_victories >= 3) {
    // If Assassin is alive, trigger assassination phase instead
    if (assassinAlive) {
      return {
        hasWinner: false,
        winner: null,
        endReason: null,
        triggerAssassination: true,
      };
    }
    
    // No Assassin - good wins immediately
    return {
      hasWinner: true,
      winner: 'good',
      endReason: 'Good completed 3 successful missions',
    };
  }

  return noWinner;
}

/**
 * Check if good team wins after assassination fails (wrong target).
 * @param game - The current game state
 * @returns WinConditionResult for good victory
 */
export function checkAssassinationFailed(game: Game): WinConditionResult {
  if (game.phase === 'assassination' && game.good_victories >= 3) {
    return {
      hasWinner: true,
      winner: 'good',
      endReason: 'Assassin failed to identify the Seer',
    };
  }
  return {
    hasWinner: false,
    winner: null,
    endReason: null,
  };
}

/**
 * Check if evil team wins via assassination (Seer killed).
 * @param game - The current game state  
 * @returns WinConditionResult for evil victory via assassination
 */
export function checkAssassinationSucceeded(game: Game): WinConditionResult {
  if (game.phase === 'assassination' && game.good_victories >= 3) {
    return {
      hasWinner: true,
      winner: 'evil',
      endReason: 'Seer assassinated',
    };
  }
  return {
    hasWinner: false,
    winner: null,
    endReason: null,
  };
}

/**
 * Check if evil wins via 3 consecutive leader rejections.
 * @param game - The current game state
 * @returns WinConditionResult for evil victory via rejections
 */
export function checkRejectionWin(game: Game): WinConditionResult {
  if (game.rejection_count >= 3) {
    const newEvilVictories = game.evil_victories + 1;
    if (newEvilVictories >= 3) {
      return {
        hasWinner: true,
        winner: 'evil',
        endReason: '3 consecutive leader rejections',
      };
    }
  }
  return {
    hasWinner: false,
    winner: null,
    endReason: null,
  };
}
