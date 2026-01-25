/**
 * StateValidator - Validates game state transitions.
 * Ensures game operations meet all requirements before execution.
 */

import type { Game, Player, ValidationResult } from '~/types/game';
import { GameService, gameService as defaultGameService } from './GameService';

// =============================================================================
// Constants
// =============================================================================

/**
 * Mission sizes for each player count and round.
 * Format: MISSION_SIZES[playerCount][roundNumber] = teamSize
 */
const MISSION_SIZES: Record<number, Record<number, number>> = {
  5: { 1: 2, 2: 3, 3: 2, 4: 3, 5: 3 },
  6: { 1: 2, 2: 3, 3: 4, 4: 3, 5: 4 },
  7: { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 },
  8: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
  9: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
  10: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
};

/**
 * Minimum number of players required to start a game.
 */
export const MIN_PLAYERS = 5;

/**
 * Maximum number of players allowed in a game.
 */
export const MAX_PLAYERS = 10;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get mission team size for given player count and round.
 * @param playerCount - Number of players in the game
 * @param round - Current round number (1-5)
 * @returns Required team size for the mission
 */
export function getMissionSize(playerCount: number, round: number): number {
  return MISSION_SIZES[playerCount]?.[round] ?? 3;
}

// =============================================================================
// StateValidator Class
// =============================================================================

export class StateValidator {
  private gameService: GameService;

  constructor(gameService: GameService = defaultGameService) {
    this.gameService = gameService;
  }

  /**
   * Validate if a game can be started.
   * @param gameId - The game UUID
   * @param hostId - The user ID attempting to start the game
   * @returns ValidationResult indicating if the game can start
   */
  validateGameStart(gameId: string, hostId: string): ValidationResult {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return { valid: false, error: 'Game not found' };
    }

    // Only host can start the game
    if (game.host_id !== hostId) {
      return { valid: false, error: 'Only the host can start the game' };
    }

    // Game must be in lobby status
    if (game.status !== 'lobby') {
      return { valid: false, error: 'Game has already started' };
    }

    // Validate player count
    const players = this.gameService.getPlayers(gameId);
    const playerCount = players.length;

    if (playerCount < MIN_PLAYERS) {
      return { 
        valid: false, 
        error: `Not enough players. Need at least ${MIN_PLAYERS}, have ${playerCount}` 
      };
    }

    if (playerCount > MAX_PLAYERS) {
      return { 
        valid: false, 
        error: `Too many players. Maximum is ${MAX_PLAYERS}, have ${playerCount}` 
      };
    }

    return { valid: true };
  }

  /**
   * Validate team selection for a mission.
   * @param gameId - The game UUID
   * @param leaderId - The user ID of the player selecting the team
   * @param teamIds - Array of player IDs selected for the mission
   * @returns ValidationResult indicating if the team selection is valid
   */
  validateTeamSelection(gameId: string, leaderId: string, teamIds: string[]): ValidationResult {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return { valid: false, error: 'Game not found' };
    }

    // Must be in selecting_team phase
    if (game.phase !== 'selecting_team') {
      return { valid: false, error: 'Not in team selection phase' };
    }

    // Get all players and find the leader
    const players = this.gameService.getPlayers(gameId);
    const alivePlayers = players.filter(p => p.is_alive);
    
    // Find the current leader by crown_index
    const sortedAlivePlayers = alivePlayers.sort((a, b) => {
      if (a.seat_order === null) return 1;
      if (b.seat_order === null) return -1;
      return a.seat_order - b.seat_order;
    });
    
    const currentLeader = sortedAlivePlayers[game.crown_index % sortedAlivePlayers.length];
    
    if (!currentLeader) {
      return { valid: false, error: 'Could not determine current leader' };
    }

    // Validate the requesting user is the current leader
    if (currentLeader.user_id !== leaderId) {
      return { valid: false, error: 'Only the current leader can select the team' };
    }

    // Validate team size
    const requiredSize = getMissionSize(alivePlayers.length, game.current_round);
    if (teamIds.length !== requiredSize) {
      return { 
        valid: false, 
        error: `Team must have exactly ${requiredSize} players, got ${teamIds.length}` 
      };
    }

    // Validate all selected players exist and are alive
    for (const playerId of teamIds) {
      const player = players.find(p => p.id === playerId);
      if (!player) {
        return { valid: false, error: `Player ${playerId} not found in game` };
      }
      if (!player.is_alive) {
        return { valid: false, error: `Cannot select eliminated player: ${player.display_name}` };
      }
    }

    // Check for duplicates
    const uniqueIds = new Set(teamIds);
    if (uniqueIds.size !== teamIds.length) {
      return { valid: false, error: 'Duplicate players in team selection' };
    }

    return { valid: true };
  }

  /**
   * Validate if a user can join a game.
   * @param gameId - The game UUID
   * @param userId - The user ID attempting to join
   * @returns ValidationResult indicating if the user can join
   */
  validateJoinGame(gameId: string, userId: string): ValidationResult {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return { valid: false, error: 'Game not found' };
    }

    // Game must be in lobby status
    if (game.status !== 'lobby') {
      return { valid: false, error: 'Cannot join a game that has already started' };
    }

    // Check if game is full
    const players = this.gameService.getPlayers(gameId);
    if (players.length >= MAX_PLAYERS) {
      return { valid: false, error: 'Game is full' };
    }

    // Check if user is already in the game (this is allowed - graceful handling)
    const existingPlayer = players.find(p => p.user_id === userId);
    if (existingPlayer) {
      // User is already in the game, which is fine (will return existing player)
      return { valid: true };
    }

    return { valid: true };
  }

  /**
   * Validate if a user can leave a game.
   * @param gameId - The game UUID
   * @param userId - The user ID attempting to leave
   * @returns ValidationResult indicating if the user can leave
   */
  validateLeaveGame(gameId: string, userId: string): ValidationResult {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return { valid: false, error: 'Game not found' };
    }

    // Can only leave during lobby
    if (game.status !== 'lobby') {
      return { valid: false, error: 'Cannot leave a game that has already started' };
    }

    // Check if user is in the game
    const player = this.gameService.getPlayer(gameId, userId);
    if (!player) {
      return { valid: false, error: 'Player not in game' };
    }

    return { valid: true };
  }
}

// Export singleton instance for production use
export const stateValidator = new StateValidator();
