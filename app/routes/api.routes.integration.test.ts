/**
 * Integration tests for all API routes.
 * Tests the full request → response flow including authentication and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GameService, gameService } from '~/services/GameService';
import { VoteProcessor, voteProcessor } from '~/services/VoteProcessor';
import { ActionProcessor, actionProcessor } from '~/services/ActionProcessor';
import { actionRegistry } from '~/registry/ActionRegistry';
import type { CharacterName, Team, Player } from '~/types/game';
import { gameCreationLimiter, voteSubmissionLimiter, actionExecutionLimiter } from '~/utils/rateLimiter';

// Import action registrations
import { registerAssassinateAction, registerAssassinateHandler } from '~/actions/assassinate';
import { registerRigVoteAction, registerRigVoteHandler } from '~/actions/rigVote';
import { registerPlantBeeperAction, registerPlantBeeperHandler } from '~/actions/plantBeeper';
import { registerProtectAction, registerProtectHandler } from '~/actions/protect';
import { registerSabotageAction, registerSabotageHandler } from '~/actions/sabotage';

// Import route action functions
import { action as createGameAction } from './api.games.create';
import { action as joinGameAction } from './api.games.$gameId.join';
import { action as startGameAction } from './api.games.$gameId.start';
import { action as voteAction } from './api.games.$gameId.vote';
import { action as teamAction } from './api.games.$gameId.team';
import { action as gameAction } from './api.games.$gameId.action';

// =============================================================================
// Mock Supabase Auth
// =============================================================================

// Mock user for authenticated requests
const mockUser = { id: 'test-user-id', email: 'test@example.com' };
const mockUser2 = { id: 'test-user-2-id', email: 'test2@example.com' };

// Mock the createClient function
vi.mock('~/lib/supabase/server', () => ({
  createClient: vi.fn((request: Request) => {
    // Check for authorization header to determine auth state
    const authHeader = request.headers.get('Authorization');
    const userId = request.headers.get('X-Test-User-Id');
    
    if (authHeader === 'Bearer valid-token') {
      return {
        supabase: {
          auth: {
            getUser: vi.fn().mockResolvedValue({
              data: { user: userId ? { id: userId, email: 'test@example.com' } : mockUser },
              error: null,
            }),
          },
        },
        headers: new Headers(),
      };
    }
    
    return {
      supabase: {
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Unauthorized' },
          }),
        },
      },
      headers: new Headers(),
    };
  }),
}));

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a Request object for testing.
 */
function createRequest(
  method: string,
  body?: object,
  options: { authenticated?: boolean; userId?: string } = {}
): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  
  if (options.authenticated !== false) {
    headers.set('Authorization', 'Bearer valid-token');
  }
  
  if (options.userId) {
    headers.set('X-Test-User-Id', options.userId);
  }
  
  return new Request('http://test.com/api/test', {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Create ActionFunctionArgs for testing routes.
 * React Router requires unstable_pattern property.
 */
function createActionArgs(
  request: Request, 
  params: Record<string, string> = {}
) {
  return {
    request,
    params,
    context: {},
    unstable_pattern: '/api/test',
  } as any; // Use 'as any' to avoid type issues with unstable_pattern
}

/**
 * Parse JSON response.
 */
async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Clear all services for clean test state.
 */
function clearServices() {
  // Clear the singleton game service's internal state
  (gameService as any).games.clear();
  (gameService as any).players.clear();
  (gameService as any).gameKeyIndex.clear();
  
  // Clear vote processor state
  (voteProcessor as any).actions.clear();
  (voteProcessor as any).modifiers.clear();
  (voteProcessor as any).statuses.clear();
  
  // Clear action processor state
  actionProcessor.clear();
  actionRegistry.clear();
  
  // Clear rate limiters
  gameCreationLimiter.clear();
  voteSubmissionLimiter.clear();
  actionExecutionLimiter.clear();
}

/**
 * Register all actions for testing.
 */
function registerAllActions() {
  registerAssassinateAction();
  registerRigVoteAction();
  registerPlantBeeperAction();
  registerProtectAction();
  registerSabotageAction();
  
  registerAssassinateHandler(actionProcessor);
  registerRigVoteHandler(actionProcessor);
  registerPlantBeeperHandler(actionProcessor);
  registerProtectHandler(actionProcessor);
  registerSabotageHandler(actionProcessor);
}

/**
 * Setup a game with multiple players for testing.
 */
function setupGameWithPlayers(
  hostUserId: string,
  playerConfigs: Array<{ userId: string; name: string; character?: CharacterName; team?: Team }>
): { gameId: string; players: Player[] } {
  const game = gameService.createGame(hostUserId);
  const players: Player[] = [];
  
  for (let i = 0; i < playerConfigs.length; i++) {
    const config = playerConfigs[i];
    const player = gameService.addPlayer(game.id, config.userId, config.name);
    if (player) {
      if (config.character && config.team) {
        const updated = gameService.updatePlayer(player.id, {
          character: config.character,
          team: config.team,
          seat_order: i,
        });
        if (updated) players.push(updated);
      } else {
        players.push({ ...player, seat_order: i });
        gameService.updatePlayer(player.id, { seat_order: i });
      }
    }
  }
  
  return { gameId: game.id, players };
}

// =============================================================================
// Create Game Tests
// =============================================================================

describe('POST /api/games/create', () => {
  beforeEach(() => {
    clearServices();
  });

  afterEach(() => {
    clearServices();
  });

  it('creates a new game for authenticated user', async () => {
    const request = createRequest('POST', { displayName: 'TestPlayer' });
    
    const response = await createGameAction(createActionArgs(request));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(201);
    expect(data.game).toBeDefined();
    expect(data.game.id).toBeDefined();
    expect(data.game.game_key).toMatch(/^[A-Z0-9]{6,8}$/);
    expect(data.game.host_id).toBe(mockUser.id);
    expect(data.game.status).toBe('lobby');
    expect(data.gameKey).toBe(data.game.game_key);
    expect(data.player.display_name).toBe('TestPlayer');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const request = createRequest('POST', { displayName: 'TestPlayer' }, { authenticated: false });
    
    const response = await createGameAction(createActionArgs(request));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('returns 400 for missing display name', async () => {
    const request = createRequest('POST', {});
    
    const response = await createGameAction(createActionArgs(request));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Display name');
  });

  it('returns 400 for empty display name', async () => {
    const request = createRequest('POST', { displayName: '   ' });
    
    const response = await createGameAction(createActionArgs(request));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Display name');
  });

  it('returns 405 for non-POST requests', async () => {
    const request = new Request('http://test.com/api/games/create', {
      method: 'GET',
      headers: { Authorization: 'Bearer valid-token' },
    });
    
    const response = await createGameAction(createActionArgs(request));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(405);
    expect(data.error).toContain('Method not allowed');
  });
});

// =============================================================================
// Join Game Tests
// =============================================================================

describe('POST /api/games/:gameId/join', () => {
  beforeEach(() => {
    clearServices();
  });

  afterEach(() => {
    clearServices();
  });

  it('joins an existing game', async () => {
    // Create a game first
    const game = gameService.createGame('host-user-id');
    
    const request = createRequest('POST', { displayName: 'JoiningPlayer' });
    
    const response = await joinGameAction(createActionArgs(request, { gameId: game.id }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.player).toBeDefined();
    expect(data.player.display_name).toBe('JoiningPlayer');
    expect(data.player.game_id).toBe(game.id);
  });

  it('returns 404 for non-existent game', async () => {
    const request = createRequest('POST', { displayName: 'JoiningPlayer' });
    
    const response = await joinGameAction(createActionArgs(request, { gameId: 'non-existent-id' }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(404);
    expect(data.error).toContain('not found');
  });

  it('returns 400 for game already started', async () => {
    const game = gameService.createGame('host-user-id');
    gameService.updateGame(game.id, { status: 'playing' });
    
    const request = createRequest('POST', { displayName: 'JoiningPlayer' });
    
    const response = await joinGameAction(createActionArgs(request, { gameId: game.id }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('started');
  });

  it('returns 400 for full game (10 players)', async () => {
    const game = gameService.createGame('host-user-id');
    
    // Add 10 players to fill the game
    for (let i = 0; i < 10; i++) {
      gameService.addPlayer(game.id, `user-${i}`, `Player${i}`);
    }
    
    const request = createRequest('POST', { displayName: 'ExtraPlayer' });
    
    const response = await joinGameAction(createActionArgs(request, { gameId: game.id }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('full');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const game = gameService.createGame('host-user-id');
    
    const request = createRequest('POST', { displayName: 'JoiningPlayer' }, { authenticated: false });
    
    const response = await joinGameAction(createActionArgs(request, { gameId: game.id }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });

  it('handles duplicate join gracefully', async () => {
    const game = gameService.createGame('host-user-id');
    gameService.addPlayer(game.id, mockUser.id, 'OriginalName');
    
    const request = createRequest('POST', { displayName: 'NewName' });
    
    const response = await joinGameAction(createActionArgs(request, { gameId: game.id }));
    const data = await parseResponse<any>(response);
    
    // Should succeed and return existing player
    expect(response.status).toBe(200);
    expect(data.player).toBeDefined();
    // Note: display name may or may not update depending on implementation
  });
});

// =============================================================================
// Start Game Tests
// =============================================================================

describe('POST /api/games/:gameId/start', () => {
  beforeEach(() => {
    clearServices();
  });

  afterEach(() => {
    clearServices();
  });

  it('starts a game with valid player count', async () => {
    const { gameId } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host' },
      { userId: 'user-2', name: 'Player2' },
      { userId: 'user-3', name: 'Player3' },
      { userId: 'user-4', name: 'Player4' },
      { userId: 'user-5', name: 'Player5' },
    ]);
    
    const request = createRequest('POST', {});
    
    const response = await startGameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.game.status).toBe('playing');
    expect(data.game.phase).toBe('voting_for_leader');
    expect(data.game.current_round).toBe(1);
    expect(typeof data.game.crown_index).toBe('number');
    expect(data.message).toContain('started');
  });

  it('returns 403 for non-host trying to start', async () => {
    const { gameId } = setupGameWithPlayers('other-user-id', [
      { userId: 'other-user-id', name: 'Host' },
      { userId: mockUser.id, name: 'Player2' },
      { userId: 'user-3', name: 'Player3' },
      { userId: 'user-4', name: 'Player4' },
      { userId: 'user-5', name: 'Player5' },
    ]);
    
    const request = createRequest('POST', {});
    
    const response = await startGameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(403);
    expect(data.error).toContain('host');
  });

  it('returns 400 for insufficient players', async () => {
    const { gameId } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host' },
      { userId: 'user-2', name: 'Player2' },
      { userId: 'user-3', name: 'Player3' },
    ]);
    
    const request = createRequest('POST', {});
    
    const response = await startGameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('players');
  });

  it('assigns characters to all players on start', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host' },
      { userId: 'user-2', name: 'Player2' },
      { userId: 'user-3', name: 'Player3' },
      { userId: 'user-4', name: 'Player4' },
      { userId: 'user-5', name: 'Player5' },
    ]);
    
    const request = createRequest('POST', {});
    await startGameAction(createActionArgs(request, { gameId }));
    
    // Verify all players have characters assigned
    const updatedPlayers = gameService.getPlayers(gameId);
    for (const player of updatedPlayers) {
      expect(player.character).toBeDefined();
      expect(player.team).toBeDefined();
    }
    
    // Verify Seer and Assassin are present
    const characters = updatedPlayers.map(p => p.character);
    expect(characters).toContain('Seer');
    expect(characters).toContain('Assassin');
  });

  it('returns 404 for non-existent game', async () => {
    const request = createRequest('POST', {});
    
    const response = await startGameAction(createActionArgs(request, { gameId: 'non-existent' }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(404);
    expect(data.error).toContain('not found');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { gameId } = setupGameWithPlayers('host-user-id', [
      { userId: 'host-user-id', name: 'Host' },
    ]);
    
    const request = createRequest('POST', {}, { authenticated: false });
    
    const response = await startGameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});

// =============================================================================
// Vote Tests
// =============================================================================

describe('POST /api/games/:gameId/vote', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
  });

  afterEach(() => {
    clearServices();
  });

  it('submits a leader vote successfully', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      crown_index: 0,
      rejection_count: 0,
    });
    
    const request = createRequest('POST', { voteType: 'leader', vote: 'yes' });
    
    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('prevents duplicate leader votes', async () => {
    const { gameId } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      crown_index: 0,
      rejection_count: 0,
    });
    
    // First vote
    const request1 = createRequest('POST', { voteType: 'leader', vote: 'yes' });
    await voteAction(createActionArgs(request1, { gameId }));
    
    // Second vote (same user)
    const request2 = createRequest('POST', { voteType: 'leader', vote: 'no' });
    const response = await voteAction(createActionArgs(request2, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toContain('already voted');
  });

  it('submits mission votes for team members', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Assassin', team: 'evil' },
      { userId: 'user-2', name: 'Player2', character: 'Seer', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Villager', team: 'good' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      crown_index: 0,
      selected_team: [players[0].id, players[1].id], // Host and Player2 on team
    });
    
    const request = createRequest('POST', { voteType: 'mission', vote: 'fail' });
    
    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('prevents good players from voting fail on missions', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      crown_index: 0,
      selected_team: [players[0].id, players[1].id],
    });
    
    const request = createRequest('POST', { voteType: 'mission', vote: 'fail' });
    
    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Good players');
  });

  it('returns 400 for invalid vote type', async () => {
    const { gameId } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
    });
    
    const request = createRequest('POST', { voteType: 'invalid', vote: 'yes' });
    
    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid vote type');
  });

  it('returns 400 for invalid vote value', async () => {
    const { gameId } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
    });
    
    const request = createRequest('POST', { voteType: 'leader', vote: 'maybe' });
    
    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid vote');
  });

  it('returns 403 for player not in game', async () => {
    const { gameId } = setupGameWithPlayers('other-user-id', [
      { userId: 'other-user-id', name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
    });
    
    const request = createRequest('POST', { voteType: 'leader', vote: 'yes' });
    
    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(403);
    expect(data.error).toContain('not in game');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { gameId } = setupGameWithPlayers('host-user-id', [
      { userId: 'host-user-id', name: 'Host', character: 'Seer', team: 'good' },
    ]);
    
    const request = createRequest('POST', { voteType: 'leader', vote: 'yes' }, { authenticated: false });
    
    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});

// =============================================================================
// Team Selection Tests
// =============================================================================

describe('POST /api/games/:gameId/team', () => {
  beforeEach(() => {
    clearServices();
  });

  afterEach(() => {
    clearServices();
  });

  it('allows leader to select team', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'selecting_team',
      current_round: 1,
      crown_index: 0,
    });
    
    const teamIds = [players[0].id, players[1].id];
    const request = createRequest('POST', { teamIds });
    
    const response = await teamAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.game.selected_team).toEqual(teamIds);
    expect(data.game.phase).toBe('mission_voting');
  });

  it('returns 403 for non-leader trying to select team', async () => {
    const { gameId, players } = setupGameWithPlayers('other-user-id', [
      { userId: 'other-user-id', name: 'Host', character: 'Seer', team: 'good' },
      { userId: mockUser.id, name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'selecting_team',
      current_round: 1,
      crown_index: 0, // Host (other-user-id) is leader
    });
    
    const request = createRequest('POST', { teamIds: [players[0].id, players[1].id] });
    
    const response = await teamAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(403);
    expect(data.error).toContain('leader');
  });

  it('returns 400 for wrong team size', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'selecting_team',
      current_round: 1,
      crown_index: 0,
    });
    
    // Round 1 with 5 players needs 2 team members
    const request = createRequest('POST', { teamIds: [players[0].id] }); // Only 1 member
    
    const response = await teamAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Team must have');
  });

  it('returns 400 for non-array teamIds', async () => {
    const { gameId } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'selecting_team',
      current_round: 1,
      crown_index: 0,
    });
    
    const request = createRequest('POST', { teamIds: 'not-an-array' });
    
    const response = await teamAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('array');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { gameId, players } = setupGameWithPlayers('host-user-id', [
      { userId: 'host-user-id', name: 'Host', character: 'Seer', team: 'good' },
    ]);
    
    const request = createRequest('POST', { teamIds: [players[0].id] }, { authenticated: false });
    
    const response = await teamAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});

// =============================================================================
// Action Execution Tests
// =============================================================================

describe('POST /api/games/:gameId/action', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
  });

  afterEach(() => {
    clearServices();
  });

  it('executes assassinate action successfully', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-2', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-4', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-5', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      crown_index: 0,
    });
    
    const request = createRequest('POST', { 
      actionId: 'assassinate', 
      targetIds: [players[1].id] 
    });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('assassinated');
    
    // Verify target is eliminated
    const updatedPlayer = gameService.getPlayers(gameId).find(p => p.id === players[1].id);
    expect(updatedPlayer?.is_alive).toBe(false);
  });

  it('ends game when Seer is assassinated', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-2', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-3', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-4', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-5', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      crown_index: 0,
    });
    
    const seer = players[1];
    const request = createRequest('POST', { 
      actionId: 'assassinate', 
      targetIds: [seer.id] 
    });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.gameEnded).toBe(true);
    expect(data.winner).toBe('evil');
  });

  it('blocks assassination when target is protected', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-2', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-3', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-5', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      crown_index: 0,
    });
    
    const seer = players[1];
    const guardian = players[2];
    
    // Guardian protects Seer first
    const protectRequest = createRequest('POST', { 
      actionId: 'protect', 
      targetIds: [seer.id] 
    }, { userId: 'user-3' });
    
    await gameAction(createActionArgs(protectRequest, { gameId }));
    
    // Now Assassin tries to kill protected Seer
    const assassinateRequest = createRequest('POST', { 
      actionId: 'assassinate', 
      targetIds: [seer.id] 
    });
    
    const response = await gameAction(createActionArgs(assassinateRequest, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain('protected');
    expect(data.gameEnded).toBe(false);
    
    // Verify Seer is still alive
    const updatedSeer = gameService.getPlayers(gameId).find(p => p.id === seer.id);
    expect(updatedSeer?.is_alive).toBe(true);
  });

  it('returns 400 for invalid action ID', async () => {
    const { gameId } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
    });
    
    const request = createRequest('POST', { 
      actionId: 'invalid_action', 
      targetIds: [] 
    });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('Invalid action');
  });

  it('returns 403 for player not in game', async () => {
    const { gameId } = setupGameWithPlayers('other-user-id', [
      { userId: 'other-user-id', name: 'Host', character: 'Assassin', team: 'evil' },
      { userId: 'user-2', name: 'Player2', character: 'Seer', team: 'good' },
      { userId: 'user-3', name: 'Player3', character: 'Villager', team: 'good' },
      { userId: 'user-4', name: 'Player4', character: 'Guardian', team: 'good' },
      { userId: 'user-5', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
    });
    
    const request = createRequest('POST', { 
      actionId: 'assassinate', 
      targetIds: [] 
    });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(403);
    expect(data.error).toContain('not in game');
  });

  it('returns 400 for wrong phase', async () => {
    const { gameId, players } = setupGameWithPlayers(mockUser.id, [
      { userId: mockUser.id, name: 'Tracker', character: 'Tracker', team: 'good' },
      { userId: 'user-2', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-3', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-4', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-5', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting', // plant_beeper only works in selecting_team
      current_round: 1,
    });
    
    const request = createRequest('POST', { 
      actionId: 'plant_beeper', 
      targetIds: [players[1].id, players[3].id] 
    });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(400);
    expect(data.error).toContain('phase');
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { gameId } = setupGameWithPlayers('host-user-id', [
      { userId: 'host-user-id', name: 'Host', character: 'Assassin', team: 'evil' },
    ]);
    
    const request = createRequest('POST', { 
      actionId: 'assassinate', 
      targetIds: [] 
    }, { authenticated: false });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});

// =============================================================================
// Complete Voting Round Flow Tests
// =============================================================================

describe('Complete voting round flow', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
  });

  afterEach(() => {
    clearServices();
  });

  it('completes leader voting and advances when approved', async () => {
    const { gameId, players } = setupGameWithPlayers('user-0', [
      { userId: 'user-0', name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-1', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-2', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-3', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-4', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      crown_index: 0,
      rejection_count: 0,
    });
    
    // All 5 players vote (majority yes)
    for (let i = 0; i < 5; i++) {
      const vote = i < 3 ? 'yes' : 'no'; // 3 yes, 2 no
      const request = createRequest('POST', { voteType: 'leader', vote }, { userId: `user-${i}` });
      const response = await voteAction(createActionArgs(request, { gameId }));
      const data = await parseResponse<any>(response);
      expect(data.success).toBe(true);
    }
    
    // Verify game state advanced
    const game = gameService.getGameById(gameId);
    expect(game?.phase).toBe('selecting_team');
  });

  it('handles 3-rejection auto-fail', async () => {
    const { gameId, players } = setupGameWithPlayers('user-0', [
      { userId: 'user-0', name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-1', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-2', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-3', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-4', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      crown_index: 0,
      rejection_count: 2, // Already 2 rejections
      evil_victories: 0,
    });
    
    // All players reject (3rd rejection)
    for (let i = 0; i < 5; i++) {
      const request = createRequest('POST', { voteType: 'leader', vote: 'no' }, { userId: `user-${i}` });
      await voteAction(createActionArgs(request, { gameId }));
    }
    
    // Verify evil got a point and round advanced
    const game = gameService.getGameById(gameId);
    expect(game?.evil_victories).toBe(1);
    expect(game?.rejection_count).toBe(0); // Reset after auto-fail
  });
});

// =============================================================================
// Win Condition Tests
// =============================================================================

describe('Win condition triggers', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
  });

  afterEach(() => {
    clearServices();
  });

  it('triggers assassination phase when good wins 3 missions', async () => {
    const { gameId, players } = setupGameWithPlayers('user-0', [
      { userId: 'user-0', name: 'Host', character: 'Seer', team: 'good' },
      { userId: 'user-1', name: 'Player2', character: 'Villager', team: 'good' },
      { userId: 'user-2', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-3', name: 'Player4', character: 'Assassin', team: 'evil' },
      { userId: 'user-4', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    // Set game state near good victory
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 3,
      crown_index: 0,
      good_victories: 2,
      evil_victories: 0,
      selected_team: [players[0].id, players[1].id],
    });
    
    // Both team members vote pass (mission succeeds = 3rd good victory)
    for (let i = 0; i < 2; i++) {
      const request = createRequest('POST', { voteType: 'mission', vote: 'pass' }, { userId: `user-${i}` });
      await voteAction(createActionArgs(request, { gameId }));
    }
    
    // Verify assassination phase triggered
    const game = gameService.getGameById(gameId);
    expect(game?.phase).toBe('assassination');
    expect(game?.good_victories).toBe(3);
  });

  it('evil wins when 3 missions fail', async () => {
    const { gameId, players } = setupGameWithPlayers('user-0', [
      { userId: 'user-0', name: 'Host', character: 'Assassin', team: 'evil' },
      { userId: 'user-1', name: 'Player2', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Player3', character: 'Guardian', team: 'good' },
      { userId: 'user-3', name: 'Player4', character: 'Villager', team: 'good' },
      { userId: 'user-4', name: 'Player5', character: 'Minion', team: 'evil' },
    ]);
    
    // Set game state near evil victory
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 3,
      crown_index: 0,
      good_victories: 0,
      evil_victories: 2,
      selected_team: [players[0].id, players[1].id], // Assassin and Seer on team
    });
    
    // Assassin votes fail, Seer votes pass (mission fails = 3rd evil victory)
    const request1 = createRequest('POST', { voteType: 'mission', vote: 'fail' }, { userId: 'user-0' });
    await voteAction(createActionArgs(request1, { gameId }));
    
    const request2 = createRequest('POST', { voteType: 'mission', vote: 'pass' }, { userId: 'user-1' });
    await voteAction(createActionArgs(request2, { gameId }));
    
    // Verify evil wins
    const game = gameService.getGameById(gameId);
    expect(game?.status).toBe('finished');
    expect(game?.winner).toBe('evil');
    expect(game?.evil_victories).toBe(3);
  });

  it('good wins when Assassin picks wrong target in assassination phase', async () => {
    const { gameId, players } = setupGameWithPlayers('user-0', [
      { userId: 'user-0', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-1', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'assassination',
      current_round: 3,
      crown_index: 0,
      good_victories: 3,
      evil_victories: 0,
    });
    
    // Assassin picks wrong target (Villager, not Seer)
    const villager = players[2];
    const request = createRequest('POST', { 
      actionId: 'assassinate', 
      targetIds: [villager.id] 
    }, { userId: 'user-0' });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(data.success).toBe(true);
    expect(data.gameEnded).toBe(true);
    expect(data.winner).toBe('good');
    
    const game = gameService.getGameById(gameId);
    expect(game?.status).toBe('finished');
    expect(game?.winner).toBe('good');
  });

  it('evil wins when Assassin picks Seer in assassination phase', async () => {
    const { gameId, players } = setupGameWithPlayers('user-0', [
      { userId: 'user-0', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-1', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-2', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-3', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-4', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);
    
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'assassination',
      current_round: 3,
      crown_index: 0,
      good_victories: 3,
      evil_victories: 0,
    });
    
    // Assassin correctly picks the Seer
    const seer = players[1];
    const request = createRequest('POST', { 
      actionId: 'assassinate', 
      targetIds: [seer.id] 
    }, { userId: 'user-0' });
    
    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);
    
    expect(data.success).toBe(true);
    expect(data.gameEnded).toBe(true);
    expect(data.winner).toBe('evil');
    
    const game = gameService.getGameById(gameId);
    expect(game?.status).toBe('finished');
    expect(game?.winner).toBe('evil');
  });
});
