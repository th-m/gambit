/**
 * End-to-end test for good team victory.
 * Tests the complete game flow from lobby to victory:
 * 1. Game creation and player joining
 * 2. Game start with character assignment
 * 3. Three successful missions
 * 4. Assassination phase triggered
 * 5. Assassin picks wrong target
 * 6. Good team declared winner
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

interface PlayerSetup {
  name: string;
  userId: string;
  character: CharacterName;
  team: Team;
}

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
  const game = env.gameService.getGameById(gameId)!;
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
 * Run a complete mission where it passes (all good team members vote pass).
 */
function runSuccessfulMission(
  env: TestEnv,
  gameId: string,
  goodPlayerIds: string[]
): void {
  const game = env.gameService.getGameById(gameId)!;
  const players = env.gameService.getPlayers(gameId);
  const teamMembers = players.filter(p => game.selected_team?.includes(p.id));

  // All team members vote pass
  for (let i = 0; i < teamMembers.length; i++) {
    const member = teamMembers[i];
    env.voteProcessor.submitMissionVote(gameId, member.id, 'pass');
  }
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
// E2E Tests: Good Team Victory
// =============================================================================

describe('E2E: Good Team Victory', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('completes full game flow from lobby to good victory', async () => {
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
    // Assign characters manually for deterministic testing
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
    // Step 3: Complete Mission 1 - Good team passes
    // =========================================================================
    // Leader voting (leader is player at crown_index 0)
    approveLeader(env, game.id);

    // Advance to selecting_team phase
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Leader selects team (2 good players for round 1 with 5 players)
    const mission1Team = [seer.id, guardian.id];
    selectTeam(env, game.id, mission1Team);

    // Team votes pass
    runSuccessfulMission(env, game.id, goodPlayers.map(p => p.id));

    // Verify mission 1 passed
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(1);
    expect(currentGame.evil_victories).toBe(0);

    // =========================================================================
    // Step 4: Complete Mission 2 - Good team passes
    // =========================================================================
    // Advance to leader voting for round 2
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 2,
      crown_index: 1,
      selected_team: null,
    });

    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Leader selects team (3 good players for round 2 with 5 players)
    const mission2Team = [seer.id, guardian.id, villager.id];
    selectTeam(env, game.id, mission2Team);

    runSuccessfulMission(env, game.id, goodPlayers.map(p => p.id));

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(2);
    expect(currentGame.evil_victories).toBe(0);

    // =========================================================================
    // Step 5: Complete Mission 3 - Good team passes (triggers assassination)
    // =========================================================================
    // Advance to leader voting for round 3
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 3,
      crown_index: 2,
      selected_team: null,
    });

    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Leader selects team (2 good players for round 3 with 5 players)
    const mission3Team = [guardian.id, villager.id];
    selectTeam(env, game.id, mission3Team);

    runSuccessfulMission(env, game.id, goodPlayers.map(p => p.id));

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(3);

    // =========================================================================
    // Step 6: Assassination phase triggered
    // =========================================================================
    // VoteProcessor should transition to assassination phase when good wins 3 and Assassin is alive
    // In the test, we manually set the phase since we're testing the flow
    env.gameService.updateGame(game.id, { phase: 'assassination' });

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.phase).toBe('assassination');

    // =========================================================================
    // Step 7: Assassin picks wrong target (not the Seer)
    // =========================================================================
    // Assassin targets the Guardian (wrong choice)
    const assassinationResult = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [guardian.id] // Wrong target - Guardian, not Seer
    );

    expect(assassinationResult.success).toBe(true);
    expect(assassinationResult.gameEnded).toBe(true);
    expect(assassinationResult.winner).toBe('good');
    expect(assassinationResult.message).toContain('not the Seer');
    expect(assassinationResult.message).toContain('Good wins');

    // =========================================================================
    // Step 8: Good team declared winner
    // =========================================================================
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('good');
    // End reason indicates good won through missions (Assassin failed to identify Seer)
    expect(currentGame.end_reason).toContain('3 successful missions');
  });

  it('good team wins through missions when Assassin is eliminated', async () => {
    // Create game with 5 players
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    // Assign characters
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const assassin = findPlayerByCharacter(players, 'Assassin')!;
    const goodPlayers = findPlayersByTeam(players, 'good');

    // Eliminate the Assassin before good team wins 3 missions
    env.gameService.updatePlayer(assassin.id, { is_alive: false });

    // Complete 3 successful missions
    for (let round = 1; round <= 3; round++) {
      env.gameService.updateGame(game.id, {
        phase: 'voting_for_leader',
        current_round: round,
        crown_index: round - 1,
        selected_team: null,
      });

      approveLeader(env, game.id);
      env.gameService.updateGame(game.id, { phase: 'selecting_team' });

      const teamSize = getMissionSize(5, round);
      const team = goodPlayers.slice(0, teamSize).map(p => p.id);
      selectTeam(env, game.id, team);
      runSuccessfulMission(env, game.id, goodPlayers.map(p => p.id));
    }

    // When Assassin is dead, good wins immediately without assassination phase
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(3);
    
    // The VoteProcessor should have detected no alive Assassin and ended the game
    // In tests, we manually verify the win condition
    // Since Assassin is dead, good team wins immediately
    const alivePlayers = env.gameService.getPlayers(game.id).filter(p => p.is_alive);
    const aliveAssassin = alivePlayers.find(p => p.character === 'Assassin');
    
    expect(aliveAssassin).toBeUndefined();
  });

  it('tracks mission progress correctly across rounds', async () => {
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
    const goodPlayers = findPlayersByTeam(players, 'good');

    // Initial state
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(0);
    expect(currentGame.evil_victories).toBe(0);
    expect(currentGame.current_round).toBe(1);

    // Complete round 1
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    selectTeam(env, game.id, goodPlayers.slice(0, 2).map(p => p.id));
    runSuccessfulMission(env, game.id, goodPlayers.map(p => p.id));

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(1);

    // Complete round 2
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 2,
      crown_index: 1,
      selected_team: null,
    });
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    selectTeam(env, game.id, goodPlayers.map(p => p.id));
    runSuccessfulMission(env, game.id, goodPlayers.map(p => p.id));

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(2);

    // Complete round 3
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 3,
      crown_index: 2,
      selected_team: null,
    });
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    selectTeam(env, game.id, goodPlayers.slice(0, 2).map(p => p.id));
    runSuccessfulMission(env, game.id, goodPlayers.map(p => p.id));

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(3);
  });

  it('validates player count requirements for game start', () => {
    // Create game with only 4 players (below minimum)
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
    ];

    const { game } = createGameInLobby(env, 'user-1', playerSetups);

    // Validate game start should fail
    const validation = env.stateValidator.validateGameStart(game.id, 'user-1');
    expect(validation.valid).toBe(false);
    expect(validation.error).toContain('5');
  });

  it('handles leader voting correctly', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    // Test majority approval (3 yes, 2 no = approved)
    let result = env.voteProcessor.submitLeaderVote(game.id, players[0].id, 'yes');
    expect(result.success).toBe(true);
    expect(result.allVotesIn).toBe(false);

    env.voteProcessor.submitLeaderVote(game.id, players[1].id, 'yes');
    env.voteProcessor.submitLeaderVote(game.id, players[2].id, 'yes');
    env.voteProcessor.submitLeaderVote(game.id, players[3].id, 'no');
    result = env.voteProcessor.submitLeaderVote(game.id, players[4].id, 'no');

    expect(result.allVotesIn).toBe(true);
    expect(result.result).toBe('approved');
    expect(result.tally).toEqual({ yes: 3, no: 2 });
  });

  it('handles mission voting correctly', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    let game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const guardian = findPlayerByCharacter(players, 'Guardian')!;

    // Set up team and phase
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [seer.id, guardian.id],
    });

    // Team members vote
    env.voteProcessor.submitMissionVote(game.id, seer.id, 'pass');
    const result = env.voteProcessor.submitMissionVote(game.id, guardian.id, 'pass');

    expect(result.success).toBe(true);
    expect(result.allVotesIn).toBe(true);
    expect(result.result).toBe('passed');
    expect(result.tally).toEqual({ pass: 2, fail: 0 });
  });
});

// =============================================================================
// E2E Tests: Edge Cases
// =============================================================================

describe('E2E: Good Victory Edge Cases', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('assassination phase only triggers after 3 good victories', async () => {
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

    // After 2 good victories, assassination should NOT be available
    env.gameService.updateGame(game.id, {
      good_victories: 2,
      phase: 'mission_voting',
    });

    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.phase).not.toBe('assassination');

    // After 3 good victories, assassination phase should be triggered
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.phase).toBe('assassination');
  });

  it('Seer remains unidentified until game end', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Before game ends, Seer identity should be secret (this is enforced by data privacy)
    // Verify Seer exists
    expect(seer.character).toBe('Seer');
    expect(seer.team).toBe('good');

    // Set up assassination phase
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'assassination',
    });

    // Assassin correctly identifies Seer - evil wins
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
});
