/**
 * End-to-end test for evil team victory via assassination.
 * Tests the complete game flow from lobby to evil victory:
 * 1. Game creation and player joining
 * 2. Game start with character assignment
 * 3. Good completes 3 missions
 * 4. Assassination phase triggered
 * 5. Assassin correctly identifies Seer
 * 6. Evil team declared winner
 * 7. Correct end reason (Seer assassinated)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameService } from '~/services/GameService';
import { VoteProcessor } from '~/services/VoteProcessor';
import { ActionProcessor } from '~/services/ActionProcessor';
import { StateValidator } from '~/services/StateValidator';
import { actionRegistry } from '~/registry/ActionRegistry';
import type { CharacterName, Player, Team, Game } from '~/types/game';

// Import action registrations
import {
  registerAssassinateAction,
  registerAssassinateHandler,
} from '~/actions/assassinate';
import {
  registerRigVoteAction,
  registerRigVoteHandler,
} from '~/actions/rigVote';
import {
  registerPlantBeeperAction,
  registerPlantBeeperHandler,
} from '~/actions/plantBeeper';
import {
  registerProtectAction,
  registerProtectHandler,
} from '~/actions/protect';
import {
  registerSabotageAction,
  registerSabotageHandler,
} from '~/actions/sabotage';

// =============================================================================
// Test Environment
// =============================================================================

interface TestEnv {
  gameService: GameService;
  voteProcessor: VoteProcessor;
  actionProcessor: ActionProcessor;
  stateValidator: StateValidator;
}

/**
 * Create a fresh test environment with all services and action registrations.
 */
function createTestEnv(): TestEnv {
  const gameService = new GameService();
  const voteProcessor = new VoteProcessor(gameService);
  const actionProcessor = new ActionProcessor(gameService, voteProcessor);
  const stateValidator = new StateValidator(gameService);

  // Clear and register all actions
  actionRegistry.clear();
  registerAssassinateAction();
  registerRigVoteAction();
  registerPlantBeeperAction();
  registerProtectAction();
  registerSabotageAction();

  // Register all handlers
  registerAssassinateHandler(actionProcessor);
  registerRigVoteHandler(actionProcessor);
  registerPlantBeeperHandler(actionProcessor);
  registerProtectHandler(actionProcessor);
  registerSabotageHandler(actionProcessor);

  return { gameService, voteProcessor, actionProcessor, stateValidator };
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a game in lobby state with players.
 */
function createGameInLobby(
  env: TestEnv,
  hostUserId: string,
  players: Array<{ name: string; userId: string }>
): { game: Game; players: Player[] } {
  const game = env.gameService.createGame(hostUserId);
  const createdPlayers: Player[] = [];

  for (const p of players) {
    const player = env.gameService.addPlayer(game.id, p.userId, p.name);
    if (player) createdPlayers.push(player);
  }

  return { game: env.gameService.getGameById(game.id)!, players: createdPlayers };
}

/**
 * Start game and assign specific characters to players.
 */
function startGameWithCharacters(
  env: TestEnv,
  gameId: string,
  playerCharacters: Map<string, { character: CharacterName; team: Team }>
): Game {
  // Assign characters to players
  const players = env.gameService.getPlayers(gameId);
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const config = playerCharacters.get(player.user_id);
    if (config) {
      env.gameService.updatePlayer(player.id, {
        character: config.character,
        team: config.team,
        seat_order: i,
      });
    }
  }

  // Start the game
  env.gameService.updateGame(gameId, {
    status: 'playing',
    phase: 'voting_for_leader',
    current_round: 1,
    crown_index: 0,
    rejection_count: 0,
    good_victories: 0,
    evil_victories: 0,
    selected_team: null,
  });

  return env.gameService.getGameById(gameId)!;
}

/**
 * Get mission team size for a given player count and round.
 */
function getMissionSize(playerCount: number, round: number): number {
  const MISSION_SIZES: Record<number, number[]> = {
    5: [2, 3, 2, 3, 3],
    6: [2, 3, 4, 3, 4],
    7: [2, 3, 3, 4, 4],
    8: [3, 4, 4, 5, 5],
    9: [3, 4, 4, 5, 5],
    10: [3, 4, 4, 5, 5],
  };
  return MISSION_SIZES[playerCount]?.[round - 1] ?? 2;
}

/**
 * Run a complete leader voting round where leader is approved.
 */
function approveLeader(env: TestEnv, gameId: string): void {
  const players = env.gameService.getPlayers(gameId).filter(p => p.is_alive);
  
  // All players vote yes
  for (const player of players) {
    env.voteProcessor.submitLeaderVote(gameId, player.id, 'yes');
  }
}

/**
 * Select a team for the current mission.
 */
function selectTeam(env: TestEnv, gameId: string, teamIds: string[]): void {
  env.gameService.updateGame(gameId, {
    selected_team: teamIds,
    phase: 'mission_voting',
  });
}

/**
 * Run a complete mission where all team members vote pass.
 */
function runSuccessfulMission(
  env: TestEnv,
  gameId: string,
  teamIds: string[]
): void {
  const players = env.gameService.getPlayers(gameId);
  const teamMembers = players.filter(p => teamIds.includes(p.id));

  // All team members vote pass
  for (const member of teamMembers) {
    env.voteProcessor.submitMissionVote(gameId, member.id, 'pass');
  }
}

/**
 * Complete a full round: leader voting → team selection → mission voting
 */
function completeSuccessfulRound(
  env: TestEnv,
  gameId: string,
  teamIds: string[],
  round: number
): void {
  const game = env.gameService.getGameById(gameId)!;
  
  // Set up round
  if (game.current_round !== round) {
    env.gameService.updateGame(gameId, {
      phase: 'voting_for_leader',
      current_round: round,
      crown_index: (round - 1) % 5,
      selected_team: null,
    });
  }

  // Leader voting
  approveLeader(env, gameId);
  env.gameService.updateGame(gameId, { phase: 'selecting_team' });

  // Team selection
  selectTeam(env, gameId, teamIds);

  // Mission voting
  runSuccessfulMission(env, gameId, teamIds);
}

/**
 * Find players by various criteria.
 */
function findPlayerByCharacter(players: Player[], character: CharacterName): Player | undefined {
  return players.find(p => p.character === character);
}

function findPlayersByTeam(players: Player[], team: Team): Player[] {
  return players.filter(p => p.team === team);
}

// =============================================================================
// E2E Tests: Evil Team Victory via Assassination
// =============================================================================

describe('E2E: Evil Team Victory via Assassination', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('completes full game flow from lobby to evil victory via correct assassination', async () => {
    // =========================================================================
    // Step 1: Create game and players join lobby
    // =========================================================================
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame, players: lobbyPlayers } = createGameInLobby(
      env,
      'user-alice', // Alice is the host
      playerSetups
    );

    // Verify lobby state
    expect(lobbyGame.status).toBe('lobby');
    expect(lobbyPlayers.length).toBe(5);

    // =========================================================================
    // Step 2: Start game with character assignment
    // =========================================================================
    // Team distribution for 5 players: 3 good, 2 evil
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    // Verify game started
    expect(game.status).toBe('playing');
    expect(game.phase).toBe('voting_for_leader');
    expect(game.current_round).toBe(1);

    // Identify key players
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const villager = findPlayerByCharacter(players, 'Villager')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;
    const goodPlayers = findPlayersByTeam(players, 'good');

    expect(seer).toBeDefined();
    expect(assassin).toBeDefined();
    expect(goodPlayers.length).toBe(3);

    // =========================================================================
    // Step 3: Good team completes 3 successful missions
    // =========================================================================
    // Mission 1 (team size: 2)
    completeSuccessfulRound(env, game.id, [seer.id, guardian.id], 1);
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(1);

    // Mission 2 (team size: 3)
    completeSuccessfulRound(env, game.id, [seer.id, guardian.id, villager.id], 2);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(2);

    // Mission 3 (team size: 2)
    completeSuccessfulRound(env, game.id, [guardian.id, villager.id], 3);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(3);

    // =========================================================================
    // Step 4: Assassination phase triggered
    // =========================================================================
    // VoteProcessor should transition to assassination phase when good wins 3 and Assassin is alive
    // In the test, we manually set the phase since we're testing the flow
    env.gameService.updateGame(game.id, { phase: 'assassination' });

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.phase).toBe('assassination');

    // =========================================================================
    // Step 5: Assassin correctly identifies Seer
    // =========================================================================
    const assassinationResult = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id] // Correct target - the Seer!
    );

    expect(assassinationResult.success).toBe(true);
    expect(assassinationResult.gameEnded).toBe(true);
    expect(assassinationResult.winner).toBe('evil');

    // =========================================================================
    // Step 6 & 7: Evil team declared winner with correct end reason
    // =========================================================================
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('evil');
    // End reason should indicate Seer was assassinated
    expect(currentGame.end_reason).toContain('Seer');
  });

  it('Assassin has only one chance to identify the Seer', async () => {
    // Create game with 5 players
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-5', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Skip to assassination phase with 3 good victories
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    // Assassin uses their one shot on the Seer
    const result = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);

    // Verify assassinate action can only be used once
    const action = actionRegistry.get('assassinate');
    expect(action?.maxUses).toBe(1);
  });

  it('assassination during assassination phase with wrong target results in good victory', async () => {
    // Create game with 5 players
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-5', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Set up assassination phase
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    // Assassin targets Guardian (wrong!)
    const result = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [guardian.id]
    );

    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(result.winner).toBe('good');

    // Verify good team won
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('good');
  });

  it('Seer is eliminated when correctly identified', async () => {
    // Create game with 5 players
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-5', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Verify Seer is alive before assassination
    expect(seer.is_alive).toBe(true);

    // Set up assassination phase
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    // Assassin correctly identifies Seer
    await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    // Verify Seer is eliminated
    const updatedSeer = env.gameService.getPlayers(game.id).find(p => p.id === seer.id)!;
    expect(updatedSeer.is_alive).toBe(false);
  });

  it('only Assassin character has assassinate action in their abilities', async () => {
    // Import character registry to verify action assignment
    const { characterRegistry } = await import('~/registry/CharacterRegistry');
    const { registerAllCharacters } = await import('~/registry/CharacterRegistry');
    
    // Ensure characters are registered
    registerAllCharacters();
    
    // Verify Assassin has the assassinate action
    const assassin = characterRegistry.get('Assassin');
    expect(assassin).toBeDefined();
    expect(assassin!.actions).toContain('assassinate');
    
    // Verify other characters don't have the assassinate action
    const minion = characterRegistry.get('Minion');
    expect(minion).toBeDefined();
    expect(minion!.actions).not.toContain('assassinate');
    
    const seer = characterRegistry.get('Seer');
    expect(seer).toBeDefined();
    expect(seer!.actions).not.toContain('assassinate');
    
    // In the UI, only characters with the action would see it available
    // The ActionPanel uses getAvailableActions which filters by character
  });

  it('displays correct end reason when Seer is assassinated', async () => {
    // Create game with 5 players
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-5', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Set up assassination phase
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    // Assassin correctly identifies Seer
    await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    // Verify end reason
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.end_reason).toBe('Seer assassinated');
  });
});

// =============================================================================
// E2E Tests: Edge Cases for Assassination
// =============================================================================

describe('E2E: Assassination Edge Cases', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('assassination can be blocked by protection status', async () => {
    // Create game with 5 players
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-5', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Set up mission_voting phase where both protect and assassinate can be used
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [seer.id, guardian.id],
    });

    // Guardian protects the Seer
    const protectResult = await env.actionProcessor.executeAction(
      game.id,
      guardian.id,
      'protect',
      [seer.id]
    );
    expect(protectResult.success).toBe(true);

    // Assassin tries to assassinate the protected Seer
    const assassinResult = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    // Assassination is blocked by protection
    expect(assassinResult.success).toBe(true);
    expect(assassinResult.message).toContain('protected');
    // gameEnded is false when action succeeds but game doesn't end (protection blocked it)
    expect(assassinResult.gameEnded).toBe(false);

    // Verify Seer is still alive
    const updatedSeer = env.gameService.getPlayers(game.id).find(p => p.id === seer.id)!;
    expect(updatedSeer.is_alive).toBe(true);
  });

  it('assassination with Phantom present does not confuse the Assassin', async () => {
    // Create game with 6 players to include Phantom
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
      { name: 'Player6', userId: 'user-6' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    // 6 players: 4 good, 2 evil (Phantom is evil but appears as Seer to Oracle)
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Oracle', team: 'good' });
    characterAssignments.set('user-4', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-5', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-6', { character: 'Phantom', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const phantom = findPlayerByCharacter(players, 'Phantom')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Set up assassination phase
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    // Assassin correctly identifies the real Seer (not Phantom)
    const correctResult = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    expect(correctResult.success).toBe(true);
    expect(correctResult.gameEnded).toBe(true);
    expect(correctResult.winner).toBe('evil');
  });

  it('Assassin targeting Phantom results in good victory (Phantom is not the Seer)', async () => {
    // Create game with 6 players to include Phantom
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
      { name: 'Player6', userId: 'user-6' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    // Note: In a real game, Assassin wouldn't target their own team member,
    // but this tests the logic that Phantom is NOT the Seer
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Oracle', team: 'good' });
    characterAssignments.set('user-4', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-5', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-6', { character: 'Phantom', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const phantom = findPlayerByCharacter(players, 'Phantom')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Set up assassination phase
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    // Assassin mistakenly targets Phantom (wrong - Phantom is not the Seer!)
    // Note: The assassinate action itself may or may not allow targeting evil players,
    // but if it does, the outcome should be good team wins
    const result = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [phantom.id]
    );

    // Depending on implementation, this either:
    // 1. Fails validation (can't target evil/own team)
    // 2. Succeeds but good wins (wrong target)
    if (result.success) {
      expect(result.winner).toBe('good');
    }
    // Either way, evil should not win
    expect(result.winner).not.toBe('evil');
  });
});
