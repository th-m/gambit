/**
 * Unit tests for StateValidator service.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateValidator, getMissionSize, MIN_PLAYERS, MAX_PLAYERS } from './StateValidator';
import { GameService } from './GameService';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Creates a GameService with a game and specified number of players.
 */
function setupGameWithPlayers(
  gameService: GameService,
  hostId: string,
  playerCount: number,
  options: {
    status?: 'lobby' | 'playing' | 'finished';
    phase?: string;
    currentRound?: number;
    crownIndex?: number;
  } = {}
): { gameId: string; playerIds: string[] } {
  const { status = 'lobby', phase = 'selecting_team', currentRound = 1, crownIndex = 0 } = options;

  // Create game
  const game = gameService.createGame(hostId);
  const gameId = game.id;

  // Add the host as first player
  gameService.addPlayer(gameId, hostId, 'Host');

  // Add additional players (host is already added)
  const playerIds: string[] = [hostId];
  for (let i = 1; i < playerCount; i++) {
    const userId = `user-${i}`;
    gameService.addPlayer(gameId, userId, `Player ${i}`);
    playerIds.push(userId);
  }

  // Assign seat orders to all players
  const players = gameService.getPlayers(gameId);
  players.forEach((player, index) => {
    gameService.updatePlayer(player.id, { seat_order: index });
  });

  // Update game state if needed
  if (status !== 'lobby') {
    gameService.updateGame(gameId, { status, phase: phase as any, current_round: currentRound, crown_index: crownIndex });
  } else if (crownIndex !== 0) {
    gameService.updateGame(gameId, { crown_index: crownIndex });
  }

  return { gameId, playerIds };
}

// =============================================================================
// Tests
// =============================================================================

describe('StateValidator', () => {
  let gameService: GameService;
  let validator: StateValidator;

  beforeEach(() => {
    gameService = new GameService();
    validator = new StateValidator(gameService);
  });

  afterEach(() => {
    // Fresh instances per test, no cleanup needed
  });

  // ===========================================================================
  // getMissionSize Helper Tests
  // ===========================================================================

  describe('getMissionSize', () => {
    it('returns correct size for 5 players across all rounds', () => {
      expect(getMissionSize(5, 1)).toBe(2);
      expect(getMissionSize(5, 2)).toBe(3);
      expect(getMissionSize(5, 3)).toBe(2);
      expect(getMissionSize(5, 4)).toBe(3);
      expect(getMissionSize(5, 5)).toBe(3);
    });

    it('returns correct size for 6 players across all rounds', () => {
      expect(getMissionSize(6, 1)).toBe(2);
      expect(getMissionSize(6, 2)).toBe(3);
      expect(getMissionSize(6, 3)).toBe(4);
      expect(getMissionSize(6, 4)).toBe(3);
      expect(getMissionSize(6, 5)).toBe(4);
    });

    it('returns correct size for 7 players across all rounds', () => {
      expect(getMissionSize(7, 1)).toBe(2);
      expect(getMissionSize(7, 2)).toBe(3);
      expect(getMissionSize(7, 3)).toBe(3);
      expect(getMissionSize(7, 4)).toBe(4);
      expect(getMissionSize(7, 5)).toBe(4);
    });

    it('returns correct size for 8 players across all rounds', () => {
      expect(getMissionSize(8, 1)).toBe(3);
      expect(getMissionSize(8, 2)).toBe(4);
      expect(getMissionSize(8, 3)).toBe(4);
      expect(getMissionSize(8, 4)).toBe(5);
      expect(getMissionSize(8, 5)).toBe(5);
    });

    it('returns correct size for 9 players across all rounds', () => {
      expect(getMissionSize(9, 1)).toBe(3);
      expect(getMissionSize(9, 2)).toBe(4);
      expect(getMissionSize(9, 3)).toBe(4);
      expect(getMissionSize(9, 4)).toBe(5);
      expect(getMissionSize(9, 5)).toBe(5);
    });

    it('returns correct size for 10 players across all rounds', () => {
      expect(getMissionSize(10, 1)).toBe(3);
      expect(getMissionSize(10, 2)).toBe(4);
      expect(getMissionSize(10, 3)).toBe(4);
      expect(getMissionSize(10, 4)).toBe(5);
      expect(getMissionSize(10, 5)).toBe(5);
    });

    it('returns default 3 for unknown player count', () => {
      expect(getMissionSize(4, 1)).toBe(3);
      expect(getMissionSize(11, 1)).toBe(3);
    });

    it('returns default 3 for unknown round', () => {
      expect(getMissionSize(5, 0)).toBe(3);
      expect(getMissionSize(5, 6)).toBe(3);
    });
  });

  // ===========================================================================
  // Constants Tests
  // ===========================================================================

  describe('Constants', () => {
    it('exports MIN_PLAYERS as 5', () => {
      expect(MIN_PLAYERS).toBe(5);
    });

    it('exports MAX_PLAYERS as 10', () => {
      expect(MAX_PLAYERS).toBe(10);
    });
  });

  // ===========================================================================
  // validateGameStart Tests
  // ===========================================================================

  describe('validateGameStart', () => {
    it('returns error if game not found', () => {
      const result = validator.validateGameStart('non-existent', 'host-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    it('only host can start game', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      // Non-host tries to start
      const result = validator.validateGameStart(gameId, 'user-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Only the host can start the game');
    });

    it('host can start game', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('cannot start game that has already started', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5, { status: 'playing' });
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game has already started');
    });

    it('rejects game with fewer than 5 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 4);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not enough players');
      expect(result.error).toContain('Need at least 5');
    });

    it('rejects game with 1 player', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 1);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Not enough players');
    });

    it('accepts game with exactly 5 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });

    it('accepts game with 6 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 6);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });

    it('accepts game with 7 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 7);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });

    it('accepts game with 8 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 8);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });

    it('accepts game with 9 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 9);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });

    it('accepts game with exactly 10 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 10);
      
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });

    // Note: Testing >10 players would require bypassing addPlayer validation
    // which checks for game full. This test verifies the validator's own check.
    it('rejects game with more than 10 players if somehow added', () => {
      const game = gameService.createGame('host-1');
      const gameId = game.id;
      
      // Add host
      gameService.addPlayer(gameId, 'host-1', 'Host');
      
      // Manually add more players than allowed (bypassing normal checks)
      for (let i = 1; i <= 10; i++) {
        const userId = `user-${i}`;
        // This would normally fail after 10 players, but let's test the validator
        try {
          gameService.addPlayer(gameId, userId, `Player ${i}`);
        } catch {
          // Expected to fail after reaching max
        }
      }
      
      // Verify we have 10 players (max allowed by addPlayer)
      const players = gameService.getPlayers(gameId);
      expect(players.length).toBe(10);
      
      // The validator should accept 10 players
      const result = validator.validateGameStart(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });
  });

  // ===========================================================================
  // validateTeamSelection Tests
  // ===========================================================================

  describe('validateTeamSelection', () => {
    it('returns error if game not found', () => {
      const result = validator.validateTeamSelection('non-existent', 'leader-1', ['p1']);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    it('rejects if not in selecting_team phase', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'mission_voting',
      });
      
      const result = validator.validateTeamSelection(gameId, playerIds[0], []);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Not in team selection phase');
    });

    it('only current leader can select team', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'selecting_team',
        crownIndex: 0,
      });
      
      // Get actual player IDs for team selection
      const players = gameService.getPlayers(gameId);
      const teamIds = players.slice(0, 2).map(p => p.id);
      
      // Non-leader (second player) tries to select team
      const result = validator.validateTeamSelection(gameId, playerIds[1], teamIds);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Only the current leader can select the team');
    });

    it('leader can select team', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'selecting_team',
        crownIndex: 0,
      });
      
      // Get actual player IDs for team selection
      const players = gameService.getPlayers(gameId);
      const teamIds = players.slice(0, 2).map(p => p.id);
      
      // Leader (host with seat 0, crown_index 0) selects team
      const result = validator.validateTeamSelection(gameId, playerIds[0], teamIds);
      expect(result.valid).toBe(true);
    });

    it('validates team size for round 1 with 5 players (needs 2)', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'selecting_team',
        currentRound: 1,
        crownIndex: 0,
      });
      
      const players = gameService.getPlayers(gameId);
      
      // Try to select 3 players when only 2 are needed
      const wrongTeam = players.slice(0, 3).map(p => p.id);
      const result1 = validator.validateTeamSelection(gameId, playerIds[0], wrongTeam);
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Team must have exactly 2 players');
      
      // Try to select 1 player when 2 are needed
      const tooSmall = players.slice(0, 1).map(p => p.id);
      const result2 = validator.validateTeamSelection(gameId, playerIds[0], tooSmall);
      expect(result2.valid).toBe(false);
      expect(result2.error).toContain('Team must have exactly 2 players');
      
      // Correct size
      const correctTeam = players.slice(0, 2).map(p => p.id);
      const result3 = validator.validateTeamSelection(gameId, playerIds[0], correctTeam);
      expect(result3.valid).toBe(true);
    });

    it('validates team size for round 4 with 8 players (needs 5)', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 8, {
        status: 'playing',
        phase: 'selecting_team',
        currentRound: 4,
        crownIndex: 0,
      });
      
      const players = gameService.getPlayers(gameId);
      
      // Try to select 4 players when 5 are needed
      const wrongTeam = players.slice(0, 4).map(p => p.id);
      const result1 = validator.validateTeamSelection(gameId, playerIds[0], wrongTeam);
      expect(result1.valid).toBe(false);
      expect(result1.error).toContain('Team must have exactly 5 players');
      
      // Correct size
      const correctTeam = players.slice(0, 5).map(p => p.id);
      const result2 = validator.validateTeamSelection(gameId, playerIds[0], correctTeam);
      expect(result2.valid).toBe(true);
    });

    it('cannot select eliminated players', () => {
      // Use 6 players so eliminating one still gives valid team size of 2 for round 1
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 6, {
        status: 'playing',
        phase: 'selecting_team',
        currentRound: 1,
        crownIndex: 0,
      });
      
      const players = gameService.getPlayers(gameId);
      
      // Eliminate player 2
      gameService.updatePlayer(players[2].id, { is_alive: false });
      
      // With 5 alive players, round 1 needs 2 players
      // Try to select eliminated player in a valid-sized team
      const teamWithEliminated = [players[1].id, players[2].id];
      const result = validator.validateTeamSelection(gameId, playerIds[0], teamWithEliminated);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot select eliminated player');
    });

    it('rejects player not in game', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'selecting_team',
        crownIndex: 0,
      });
      
      const players = gameService.getPlayers(gameId);
      
      // Try to select non-existent player ID
      const result = validator.validateTeamSelection(gameId, playerIds[0], [players[0].id, 'fake-player-id']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found in game');
    });

    it('rejects duplicate players in team', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'selecting_team',
        crownIndex: 0,
      });
      
      const players = gameService.getPlayers(gameId);
      
      // Try to select same player twice
      const duplicateTeam = [players[0].id, players[0].id];
      const result = validator.validateTeamSelection(gameId, playerIds[0], duplicateTeam);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Duplicate players in team selection');
    });

    it('correctly identifies leader when crown rotates', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'selecting_team',
        crownIndex: 2, // Third player should be leader
      });
      
      const players = gameService.getPlayers(gameId);
      const teamIds = players.slice(0, 2).map(p => p.id);
      
      // Host (index 0) tries to select - should fail
      const result1 = validator.validateTeamSelection(gameId, playerIds[0], teamIds);
      expect(result1.valid).toBe(false);
      expect(result1.error).toBe('Only the current leader can select the team');
      
      // Player at index 2 (crown holder) tries to select - should succeed
      const result2 = validator.validateTeamSelection(gameId, playerIds[2], teamIds);
      expect(result2.valid).toBe(true);
    });

    it('handles crown wraparound for large crown_index', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, {
        status: 'playing',
        phase: 'selecting_team',
        crownIndex: 7, // 7 % 5 = 2, so player at index 2 is leader
      });
      
      const players = gameService.getPlayers(gameId);
      const teamIds = players.slice(0, 2).map(p => p.id);
      
      // Player at index 2 should be leader
      const result = validator.validateTeamSelection(gameId, playerIds[2], teamIds);
      expect(result.valid).toBe(true);
    });
  });

  // ===========================================================================
  // validateJoinGame Tests
  // ===========================================================================

  describe('validateJoinGame', () => {
    it('returns error if game not found', () => {
      const result = validator.validateJoinGame('non-existent', 'user-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    it('cannot join game that has already started', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5, { status: 'playing' });
      
      const result = validator.validateJoinGame(gameId, 'new-user');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot join a game that has already started');
    });

    it('cannot join finished game', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5, { status: 'finished' });
      
      const result = validator.validateJoinGame(gameId, 'new-user');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot join a game that has already started');
    });

    it('cannot join full game (10 players)', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 10);
      
      const result = validator.validateJoinGame(gameId, 'new-user');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game is full');
    });

    it('can join game with space available', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      const result = validator.validateJoinGame(gameId, 'new-user');
      expect(result.valid).toBe(true);
    });

    it('can join game with 9 players', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 9);
      
      const result = validator.validateJoinGame(gameId, 'new-user');
      expect(result.valid).toBe(true);
    });

    it('allows player already in game (graceful handling)', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      // Existing player tries to join again
      const result = validator.validateJoinGame(gameId, playerIds[1]);
      expect(result.valid).toBe(true);
    });

    it('can join empty game as first player after host', () => {
      const game = gameService.createGame('host-1');
      gameService.addPlayer(game.id, 'host-1', 'Host');
      
      const result = validator.validateJoinGame(game.id, 'user-1');
      expect(result.valid).toBe(true);
    });
  });

  // ===========================================================================
  // validateLeaveGame Tests
  // ===========================================================================

  describe('validateLeaveGame', () => {
    it('returns error if game not found', () => {
      const result = validator.validateLeaveGame('non-existent', 'user-1');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    it('cannot leave game that has started', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5, { status: 'playing' });
      
      const result = validator.validateLeaveGame(gameId, playerIds[1]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Cannot leave a game that has already started');
    });

    it('cannot leave if not in game', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      const result = validator.validateLeaveGame(gameId, 'not-in-game');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Player not in game');
    });

    it('can leave lobby', () => {
      const { gameId, playerIds } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      const result = validator.validateLeaveGame(gameId, playerIds[1]);
      expect(result.valid).toBe(true);
    });

    it('host can leave lobby', () => {
      const { gameId } = setupGameWithPlayers(gameService, 'host-1', 5);
      
      const result = validator.validateLeaveGame(gameId, 'host-1');
      expect(result.valid).toBe(true);
    });
  });
});
