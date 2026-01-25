/**
 * Security tests for game integrity.
 *
 * These tests verify that:
 * 1. Users cannot vote as another player
 * 2. Users cannot see other players' character info
 * 3. Users cannot perform actions in wrong phase
 * 4. Users cannot join game as different user (impersonation)
 * 5. Rate limiting blocks excessive requests
 * 6. RLS policies enforce access (database-level - tested via Supabase, not unit tests)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { gameService } from '~/services/GameService';
import { voteProcessor } from '~/services/VoteProcessor';
import { actionProcessor } from '~/services/ActionProcessor';
import { actionRegistry } from '~/registry/ActionRegistry';
import { characterRegistry, registerAllCharacters } from '~/registry/CharacterRegistry';
import { effectRegistry } from '~/registry/EffectRegistry';
import { registerAllEffects } from '~/effects';
import { filterPlayersForViewer } from '~/utils/dataPrivacy';
import type { CharacterName, Team, Player, Game } from '~/types/game';
import { gameCreationLimiter, voteSubmissionLimiter, actionExecutionLimiter } from '~/utils/rateLimiter';

// Import action registrations
import { registerAssassinateAction, registerAssassinateHandler } from '~/actions/assassinate';
import { registerRigVoteAction, registerRigVoteHandler } from '~/actions/rigVote';
import { registerPlantBeeperAction, registerPlantBeeperHandler } from '~/actions/plantBeeper';
import { registerProtectAction, registerProtectHandler } from '~/actions/protect';
import { registerSabotageAction, registerSabotageHandler } from '~/actions/sabotage';

// Import route action functions
import { action as createGameAction } from '~/routes/api.games.create';
import { action as joinGameAction } from '~/routes/api.games.$gameId.join';
import { action as voteAction } from '~/routes/api.games.$gameId.vote';
import { action as teamAction } from '~/routes/api.games.$gameId.team';
import { action as gameAction } from '~/routes/api.games.$gameId.action';

// =============================================================================
// Mock Supabase Auth
// =============================================================================

vi.mock('~/lib/supabase/server', () => ({
  createClient: vi.fn((request: Request) => {
    const authHeader = request.headers.get('Authorization');
    const userId = request.headers.get('X-Test-User-Id');

    if (authHeader === 'Bearer valid-token') {
      return {
        supabase: {
          auth: {
            getUser: vi.fn().mockResolvedValue({
              data: {
                user: {
                  id: userId || 'authenticated-user-id',
                  email: 'test@example.com',
                },
              },
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

function createActionArgs(request: Request, params: Record<string, string> = {}) {
  return {
    request,
    params,
    context: {},
    unstable_pattern: '/api/test',
  } as any;
}

async function parseResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function clearServices() {
  (gameService as any).games.clear();
  (gameService as any).players.clear();
  (gameService as any).gameKeyIndex.clear();
  (voteProcessor as any).actions.clear();
  (voteProcessor as any).modifiers.clear();
  (voteProcessor as any).statuses.clear();
  actionProcessor.clear();
  actionRegistry.clear();
  
  // Clear rate limiters
  gameCreationLimiter.clear();
  voteSubmissionLimiter.clear();
  actionExecutionLimiter.clear();
}

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

function setupGameWithPlayers(
  hostUserId: string,
  playerConfigs: Array<{
    userId: string;
    name: string;
    character?: CharacterName;
    team?: Team;
  }>
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

function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    game_key: 'TEST123',
    host_id: 'user-1',
    status: 'playing',
    phase: 'mission_voting',
    current_round: 1,
    crown_index: 0,
    rejection_count: 0,
    good_victories: 0,
    evil_victories: 0,
    selected_team: null,
    winner: null,
    end_reason: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createTestPlayer(
  id: string,
  character: CharacterName | null,
  team: Team | null,
  overrides: Partial<Player> = {}
): Player {
  return {
    id,
    game_id: 'game-1',
    user_id: `user-${id}`,
    display_name: `Player ${id}`,
    character,
    team,
    is_alive: true,
    seat_order: parseInt(id.replace('player-', ''), 10) || 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// =============================================================================
// SECURITY TEST 1: Cannot vote as another player
// =============================================================================

describe('Security: Cannot vote as another player', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
  });

  afterEach(() => {
    clearServices();
  });

  it('vote uses authenticated user ID, not request body player ID', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Villager', team: 'good' },
      { userId: 'user-c', name: 'PlayerC', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
    ]);

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      crown_index: 0,
      rejection_count: 0,
    });

    // User A is authenticated, tries to submit vote
    // The vote should be recorded for user-a's player, regardless of any body params
    const request = createRequest(
      'POST',
      {
        voteType: 'leader',
        vote: 'yes',
        // Note: Even if attacker tried to add playerId in body, it's ignored
        playerId: players[1].id, // This should be ignored
      },
      { userId: 'user-a' }
    );

    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify the vote was recorded for user-a's player, not the spoofed playerId
    // User A cannot vote again (proves their vote was recorded)
    const secondRequest = createRequest(
      'POST',
      { voteType: 'leader', vote: 'no' },
      { userId: 'user-a' }
    );

    const secondResponse = await voteAction(createActionArgs(secondRequest, { gameId }));
    const secondData = await parseResponse<any>(secondResponse);

    expect(secondResponse.status).toBe(400);
    expect(secondData.error.toLowerCase()).toContain('already voted');
  });

  it('cannot submit vote for player in different game', async () => {
    // Create two separate games
    const game1 = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Villager', team: 'good' },
      { userId: 'user-c', name: 'PlayerC', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
    ]);

    const game2 = setupGameWithPlayers('user-x', [
      { userId: 'user-x', name: 'PlayerX', character: 'Seer', team: 'good' },
      { userId: 'user-y', name: 'PlayerY', character: 'Assassin', team: 'evil' },
      { userId: 'user-z', name: 'PlayerZ', character: 'Villager', team: 'good' },
      { userId: 'user-w', name: 'PlayerW', character: 'Guardian', team: 'good' },
      { userId: 'user-v', name: 'PlayerV', character: 'Minion', team: 'evil' },
    ]);

    gameService.updateGame(game1.gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
    });

    gameService.updateGame(game2.gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
    });

    // User from game1 tries to vote in game2
    const request = createRequest(
      'POST',
      { voteType: 'leader', vote: 'yes' },
      { userId: 'user-a' }
    );

    const response = await voteAction(createActionArgs(request, { gameId: game2.gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(403);
    expect(data.error).toContain('not in game');
  });

  it('mission vote requires player to be on the selected team', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Villager', team: 'good' },
      { userId: 'user-c', name: 'PlayerC', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
    ]);

    // Only players 0 and 1 are on the team
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      selected_team: [players[0].id, players[1].id],
    });

    // Player C (not on team) tries to vote on mission
    const request = createRequest(
      'POST',
      { voteType: 'mission', vote: 'pass' },
      { userId: 'user-c' }
    );

    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toContain('team');
  });
});

// =============================================================================
// SECURITY TEST 2: Cannot see other player's character
// =============================================================================

describe('Security: Cannot see other player character info', () => {
  beforeEach(() => {
    characterRegistry.clear();
    effectRegistry.clear();
    registerAllCharacters();
    registerAllEffects();
  });

  afterEach(() => {
    characterRegistry.clear();
    effectRegistry.clear();
  });

  it('regular player cannot see any other player character or team', () => {
    const game = createTestGame();
    const viewer = createTestPlayer('player-1', 'Villager', 'good');
    const assassin = createTestPlayer('player-2', 'Assassin', 'evil');
    const seer = createTestPlayer('player-3', 'Seer', 'good');
    const players = [viewer, assassin, seer];

    const result = filterPlayersForViewer({ game, players, viewingPlayer: viewer });

    // Viewer sees own info
    const viewerData = result.players.find((p) => p.id === 'player-1');
    expect(viewerData?.character).toBe('Villager');
    expect(viewerData?.team).toBe('good');

    // Viewer cannot see others
    const assassinData = result.players.find((p) => p.id === 'player-2');
    expect(assassinData?.character).toBeNull();
    expect(assassinData?.team).toBeNull();

    const seerData = result.players.find((p) => p.id === 'player-3');
    expect(seerData?.character).toBeNull();
    expect(seerData?.team).toBeNull();
  });

  it('Seer sees evil team but not specific characters (except Saboteur)', () => {
    const game = createTestGame();
    const seer = createTestPlayer('player-1', 'Seer', 'good');
    const assassin = createTestPlayer('player-2', 'Assassin', 'evil');
    const saboteur = createTestPlayer('player-3', 'Saboteur', 'evil');
    const villager = createTestPlayer('player-4', 'Villager', 'good');
    const players = [seer, assassin, saboteur, villager];

    const result = filterPlayersForViewer({ game, players, viewingPlayer: seer });

    // Seer sees Assassin is evil but not character
    const assassinData = result.players.find((p) => p.id === 'player-2');
    expect(assassinData?.team).toBe('evil');
    expect(assassinData?.character).toBeNull(); // Cannot see specific character

    // Seer does NOT see Saboteur (appears_as_good effect)
    const saboteurData = result.players.find((p) => p.id === 'player-3');
    expect(saboteurData?.team).toBeNull();
    expect(saboteurData?.character).toBeNull();

    // Seer doesn't see good players' info
    const villagerData = result.players.find((p) => p.id === 'player-4');
    expect(villagerData?.team).toBeNull();
    expect(villagerData?.character).toBeNull();
  });

  it('evil players know each other but not specific characters', () => {
    const game = createTestGame();
    const assassin = createTestPlayer('player-1', 'Assassin', 'evil');
    const minion = createTestPlayer('player-2', 'Minion', 'evil');
    const fixer = createTestPlayer('player-3', 'Fixer', 'evil');
    const players = [assassin, minion, fixer];

    const result = filterPlayersForViewer({ game, players, viewingPlayer: assassin });

    // Assassin sees own full info
    const assassinData = result.players.find((p) => p.id === 'player-1');
    expect(assassinData?.character).toBe('Assassin');
    expect(assassinData?.team).toBe('evil');

    // Assassin sees others are evil but not their specific characters
    const minionData = result.players.find((p) => p.id === 'player-2');
    expect(minionData?.team).toBe('evil');
    expect(minionData?.character).toBeNull();

    const fixerData = result.players.find((p) => p.id === 'player-3');
    expect(fixerData?.team).toBe('evil');
    expect(fixerData?.character).toBeNull();
  });

  it('unauthenticated viewer sees no character or team info', () => {
    const game = createTestGame();
    const players = [
      createTestPlayer('player-1', 'Seer', 'good'),
      createTestPlayer('player-2', 'Assassin', 'evil'),
    ];

    const result = filterPlayersForViewer({ game, players, viewingPlayer: null });

    expect(result.players.every((p) => p.character === null)).toBe(true);
    expect(result.players.every((p) => p.team === null)).toBe(true);
  });

  it('during lobby no character/team info is visible', () => {
    const game = createTestGame({ status: 'lobby', phase: null });
    const viewer = createTestPlayer('player-1', null, null);
    const other = createTestPlayer('player-2', null, null);
    const players = [viewer, other];

    const result = filterPlayersForViewer({ game, players, viewingPlayer: viewer });

    expect(result.players[0].character).toBeNull();
    expect(result.players[0].team).toBeNull();
    expect(result.players[1].character).toBeNull();
    expect(result.players[1].team).toBeNull();
  });
});

// =============================================================================
// SECURITY TEST 3: Cannot perform actions in wrong phase
// =============================================================================

describe('Security: Cannot perform actions in wrong phase', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
  });

  afterEach(() => {
    clearServices();
  });

  it('cannot vote during lobby phase', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Assassin', team: 'evil' },
      { userId: 'user-c', name: 'PlayerC', character: 'Villager', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Guardian', team: 'good' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
    ]);

    // Game is in lobby phase
    gameService.updateGame(gameId, {
      status: 'lobby',
      phase: null,
    });

    const request = createRequest(
      'POST',
      { voteType: 'leader', vote: 'yes' },
      { userId: 'user-a' }
    );

    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toMatch(/phase|lobby|wrong/);
  });

  it('cannot submit leader vote during mission_voting phase', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Assassin', team: 'evil' },
      { userId: 'user-c', name: 'PlayerC', character: 'Villager', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Guardian', team: 'good' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
    ]);

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      selected_team: [players[0].id, players[1].id],
    });

    const request = createRequest(
      'POST',
      { voteType: 'leader', vote: 'yes' },
      { userId: 'user-a' }
    );

    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toContain('phase');
  });

  it('cannot submit mission vote during voting_for_leader phase', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Assassin', team: 'evil' },
      { userId: 'user-c', name: 'PlayerC', character: 'Villager', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Guardian', team: 'good' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
    ]);

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
    });

    const request = createRequest(
      'POST',
      { voteType: 'mission', vote: 'pass' },
      { userId: 'user-a' }
    );

    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toContain('phase');
  });

  it('cannot use plant_beeper action during mission_voting phase', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'Tracker', character: 'Tracker', team: 'good' },
      { userId: 'user-b', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-c', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-d', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    // plant_beeper is only valid during selecting_team phase
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
    });

    const request = createRequest(
      'POST',
      {
        actionId: 'plant_beeper',
        targetIds: [players[1].id, players[3].id],
      },
      { userId: 'user-a' }
    );

    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toContain('phase');
  });

  it('cannot use protect action during selecting_team phase', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-b', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-c', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-d', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    // protect is only valid during mission_voting phase
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'selecting_team',
      current_round: 1,
      crown_index: 0,
    });

    const request = createRequest(
      'POST',
      {
        actionId: 'protect',
        targetIds: [players[1].id],
      },
      { userId: 'user-a' }
    );

    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toContain('phase');
  });

  it('cannot select team when not the current leader', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Villager', team: 'good' },
      { userId: 'user-c', name: 'PlayerC', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
    ]);

    // crown_index 1 means player B is leader
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'selecting_team',
      current_round: 1,
      crown_index: 1,
    });

    // User A (not leader) tries to select team
    const request = createRequest(
      'POST',
      { teamIds: [players[0].id, players[1].id] },
      { userId: 'user-a' }
    );

    const response = await teamAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(403);
    expect(data.error.toLowerCase()).toContain('leader');
  });
});

// =============================================================================
// SECURITY TEST 4: Cannot join game as different user (impersonation)
// =============================================================================

describe('Security: Cannot join game as different user', () => {
  beforeEach(() => {
    clearServices();
  });

  afterEach(() => {
    clearServices();
  });

  it('join uses authenticated user ID, ignores any user ID in request body', async () => {
    const game = gameService.createGame('host-user-id');
    gameService.addPlayer(game.id, 'host-user-id', 'Host');

    // Attacker authenticates as user-a but tries to claim they are user-b
    const request = createRequest(
      'POST',
      {
        displayName: 'Attacker',
        userId: 'impersonated-user-id', // This should be ignored
      },
      { userId: 'user-a' }
    );

    const response = await joinGameAction(createActionArgs(request, { gameId: game.id }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(200);

    // Verify the player was created with authenticated user ID, not the spoofed one
    const players = gameService.getPlayers(game.id);
    const attackerPlayer = players.find((p) => p.display_name === 'Attacker');
    expect(attackerPlayer?.user_id).toBe('user-a');
    expect(attackerPlayer?.user_id).not.toBe('impersonated-user-id');
  });

  it('cannot create game as different user', async () => {
    // Attacker authenticates as user-a
    const request = createRequest(
      'POST',
      {
        displayName: 'Attacker',
        hostId: 'impersonated-host-id', // This should be ignored
      },
      { userId: 'user-a' }
    );

    const response = await createGameAction(createActionArgs(request));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(201);

    // Verify the game was created with authenticated user as host
    expect(data.game.host_id).toBe('user-a');
    expect(data.game.host_id).not.toBe('impersonated-host-id');
  });

  it('cannot execute action for another player', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-b', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-c', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-e', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
    });

    // User C (Guardian) authenticates but tries to execute Assassin's action
    // by claiming to be user A
    const request = createRequest(
      'POST',
      {
        actionId: 'assassinate',
        targetIds: [players[1].id],
        playerId: players[0].id, // Trying to spoof as Assassin
      },
      { userId: 'user-c' } // Actually authenticated as Guardian
    );

    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    // Should fail because Guardian doesn't have assassinate action
    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toMatch(/action|registered|available/);
  });

  it('unauthenticated requests are rejected', async () => {
    const game = gameService.createGame('host-user-id');

    const request = createRequest(
      'POST',
      { displayName: 'Attacker' },
      { authenticated: false }
    );

    const response = await joinGameAction(createActionArgs(request, { gameId: game.id }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(401);
    expect(data.error).toBe('Unauthorized');
  });
});

// =============================================================================
// SECURITY TEST 5: Rate limiting
// =============================================================================

describe('Security: Rate limiting', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
    registerAllCharacters();
    registerAllEffects();
  });

  afterEach(() => {
    clearServices();
    characterRegistry.clear();
    effectRegistry.clear();
  });

  it('rate limits vote submissions', async () => {
    // Create game and set up for voting
    const { gameId, players } = setupGameWithPlayers('user-1', [
      { userId: 'user-1', name: 'Player 1', character: 'Assassin', team: 'evil' },
      { userId: 'user-2', name: 'Player 2', character: 'Seer', team: 'good' },
      { userId: 'user-3', name: 'Player 3', character: 'Villager', team: 'good' },
      { userId: 'user-4', name: 'Player 4', character: 'Minion', team: 'evil' },
      { userId: 'user-5', name: 'Player 5', character: 'Guardian', team: 'good' },
    ]);

    // Start game for voting
    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      crown_index: 0,
    });

    // Submit 10 votes (the limit for vote submission)
    for (let i = 0; i < 10; i++) {
      const response = await voteAction(
        createActionArgs(
          createRequest('POST', { voteType: 'leader', vote: 'yes' }, { userId: 'user-1' }),
          { gameId }
        )
      );
      // The first vote will succeed, subsequent votes will fail as "already voted"
      // but none should hit rate limit until we reach 10 requests
    }

    // The 11th request should be rate limited
    const response = await voteAction(
      createActionArgs(
        createRequest('POST', { voteType: 'leader', vote: 'yes' }, { userId: 'user-1' }),
        { gameId }
      )
    );

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    expect(response.headers.get('Retry-After')).toBeTruthy();
  });

  it('rate limits action executions', async () => {
    // Create game and set up for actions
    const { gameId, players } = setupGameWithPlayers('user-1', [
      { userId: 'user-1', name: 'Player 1', character: 'Assassin', team: 'evil' },
      { userId: 'user-2', name: 'Player 2', character: 'Seer', team: 'good' },
      { userId: 'user-3', name: 'Player 3', character: 'Villager', team: 'good' },
      { userId: 'user-4', name: 'Player 4', character: 'Minion', team: 'evil' },
      { userId: 'user-5', name: 'Player 5', character: 'Guardian', team: 'good' },
    ]);

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      crown_index: 0,
      selected_team: players.map((p) => p.id),
    });

    // Submit 5 action requests (the limit for action execution)
    for (let i = 0; i < 5; i++) {
      const seerPlayer = players.find((p) => p.character === 'Seer');
      await gameAction(
        createActionArgs(
          createRequest(
            'POST',
            { actionId: 'assassinate', targetIds: [seerPlayer!.id] },
            { userId: 'user-1' }
          ),
          { gameId }
        )
      );
    }

    // The 6th request should be rate limited
    const seerPlayer = players.find((p) => p.character === 'Seer');
    const response = await gameAction(
      createActionArgs(
        createRequest(
          'POST',
          { actionId: 'assassinate', targetIds: [seerPlayer!.id] },
          { userId: 'user-1' }
        ),
        { gameId }
      )
    );

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
  });

  it('rate limits game creation per user', async () => {
    // Create 5 games (the limit for game creation per minute)
    for (let i = 0; i < 5; i++) {
      await createGameAction(
        createActionArgs(
          createRequest('POST', { displayName: `Player ${i}` }, { userId: 'rate-limit-user' })
        )
      );
    }

    // The 6th game creation should be rate limited
    const response = await createGameAction(
      createActionArgs(
        createRequest('POST', { displayName: 'Player 6' }, { userId: 'rate-limit-user' })
      )
    );

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
  });

  it('returns appropriate error messages for rate limited requests', async () => {
    // Fill up the rate limit
    for (let i = 0; i < 5; i++) {
      await createGameAction(
        createActionArgs(
          createRequest('POST', { displayName: `Player ${i}` }, { userId: 'error-message-user' })
        )
      );
    }

    // Make rate-limited request
    const response = await createGameAction(
      createActionArgs(
        createRequest('POST', { displayName: 'Player 6' }, { userId: 'error-message-user' })
      )
    );

    expect(response.status).toBe(429);
    const data = await response.json();
    
    // Check error message
    expect(data.error).toBe('Too many requests. Please try again later.');
    
    // Check retryAfter is present
    expect(typeof data.retryAfter).toBe('number');
    expect(data.retryAfter).toBeGreaterThan(0);
    
    // Check remaining
    expect(data.remaining).toBe(0);
    
    // Check headers
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });
});

// =============================================================================
// SECURITY TEST 6: RLS policies (DATABASE-LEVEL)
// =============================================================================

describe('Security: RLS policies', () => {
  it.skip('RLS policies are tested via Supabase integration tests', () => {
    // RLS (Row Level Security) policies are database-level security rules
    // They cannot be unit tested without a real Supabase connection
    // These should be tested via:
    // 1. Supabase dashboard policy testing
    // 2. Integration tests with real Supabase instance
    // 3. E2E tests that verify data access patterns

    // Policies to verify:
    // - Users can only read their own player's character/team until game ends
    // - Users can only write votes for their own player
    // - Users can only write actions for their own player
    // - Game data is readable by all players in that game
    // - Player list is readable by all players in that game
  });
});

// =============================================================================
// Additional Security Tests
// =============================================================================

describe('Security: Additional authorization checks', () => {
  beforeEach(() => {
    clearServices();
    registerAllActions();
  });

  afterEach(() => {
    clearServices();
  });

  it('good players cannot vote fail on missions', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-c', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
      selected_team: [players[0].id, players[1].id],
    });

    // Good player tries to vote fail (should be rejected)
    const request = createRequest(
      'POST',
      { voteType: 'mission', vote: 'fail' },
      { userId: 'user-a' }
    );

    const response = await voteAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error).toContain('Good players');
  });

  it('dead players cannot vote or take actions', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'Assassin', character: 'Assassin', team: 'evil' },
      { userId: 'user-b', name: 'Seer', character: 'Seer', team: 'good' },
      { userId: 'user-c', name: 'Guardian', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'Villager', character: 'Villager', team: 'good' },
      { userId: 'user-e', name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    // Mark Assassin as dead
    gameService.updatePlayer(players[0].id, { is_alive: false });

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'mission_voting',
      current_round: 1,
    });

    // Dead player tries to use action
    const request = createRequest(
      'POST',
      { actionId: 'assassinate', targetIds: [players[1].id] },
      { userId: 'user-a' }
    );

    const response = await gameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toMatch(/dead|alive|eliminated/);
  });

  it('only host can start the game', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'Host', character: undefined, team: undefined },
      { userId: 'user-b', name: 'Player2', character: undefined, team: undefined },
      { userId: 'user-c', name: 'Player3', character: undefined, team: undefined },
      { userId: 'user-d', name: 'Player4', character: undefined, team: undefined },
      { userId: 'user-e', name: 'Player5', character: undefined, team: undefined },
    ]);

    // Import start action
    const { action: startGameAction } = await import('~/routes/api.games.$gameId.start');

    // Non-host tries to start game
    const request = createRequest('POST', {}, { userId: 'user-b' });

    const response = await startGameAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(403);
    expect(data.error.toLowerCase()).toContain('host');
  });

  it('cannot select eliminated players for team', async () => {
    const { gameId, players } = setupGameWithPlayers('user-a', [
      { userId: 'user-a', name: 'PlayerA', character: 'Seer', team: 'good' },
      { userId: 'user-b', name: 'PlayerB', character: 'Villager', team: 'good' },
      { userId: 'user-c', name: 'PlayerC', character: 'Guardian', team: 'good' },
      { userId: 'user-d', name: 'PlayerD', character: 'Assassin', team: 'evil' },
      { userId: 'user-e', name: 'PlayerE', character: 'Minion', team: 'evil' },
      { userId: 'user-f', name: 'PlayerF', character: 'Tracker', team: 'good' },
    ]);

    // Mark player B as dead
    gameService.updatePlayer(players[1].id, { is_alive: false });

    gameService.updateGame(gameId, {
      status: 'playing',
      phase: 'selecting_team',
      current_round: 1,
      crown_index: 0,
    });

    // Leader tries to select dead player for team
    const request = createRequest(
      'POST',
      { teamIds: [players[0].id, players[1].id] }, // player B is dead
      { userId: 'user-a' }
    );

    const response = await teamAction(createActionArgs(request, { gameId }));
    const data = await parseResponse<any>(response);

    expect(response.status).toBe(400);
    expect(data.error.toLowerCase()).toMatch(/eliminated|dead|alive/);
  });
});
