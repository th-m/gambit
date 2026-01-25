/**
 * End-to-end test for evil team victory via failed missions.
 * Tests the complete game flow from lobby to evil victory:
 * 1. Game creation and player joining
 * 2. Game start with character assignment
 * 3. Three failed missions (evil players vote fail)
 * 4. Evil team declared winner
 * 5. Correct end reason displayed
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
 * Run a mission where evil players vote fail (mission fails).
 */
function runFailedMission(
  env: TestEnv,
  gameId: string,
  teamIds: string[]
): void {
  const game = env.gameService.getGameById(gameId)!;
  const players = env.gameService.getPlayers(gameId);
  const teamMembers = players.filter(p => teamIds.includes(p.id));

  // Team members vote - evil votes fail, good votes pass
  for (const member of teamMembers) {
    if (member.team === 'evil') {
      env.voteProcessor.submitMissionVote(gameId, member.id, 'fail');
    } else {
      env.voteProcessor.submitMissionVote(gameId, member.id, 'pass');
    }
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
// E2E Tests: Evil Team Victory via Missions
// =============================================================================

describe('E2E: Evil Team Victory via Missions', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('completes full game flow from lobby to evil victory via 3 failed missions', async () => {
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
    const assassin = findPlayerByCharacter(players, 'Assassin')!;
    const minion = findPlayerByCharacter(players, 'Minion')!;
    const evilPlayers = findPlayersByTeam(players, 'evil');

    expect(seer).toBeDefined();
    expect(assassin).toBeDefined();
    expect(evilPlayers.length).toBe(2);

    // =========================================================================
    // Step 3: Complete Mission 1 - Evil player on team votes fail
    // =========================================================================
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Team of 2 includes 1 evil player
    const mission1Team = [seer.id, assassin.id];
    selectTeam(env, game.id, mission1Team);
    runFailedMission(env, game.id, mission1Team);

    // Verify mission 1 failed
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(0);
    expect(currentGame.evil_victories).toBe(1);

    // =========================================================================
    // Step 4: Complete Mission 2 - Evil player on team votes fail
    // =========================================================================
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 2,
      crown_index: 1,
      selected_team: null,
    });

    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Team of 3 includes 1 evil player
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const mission2Team = [seer.id, guardian.id, minion.id];
    selectTeam(env, game.id, mission2Team);
    runFailedMission(env, game.id, mission2Team);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(0);
    expect(currentGame.evil_victories).toBe(2);

    // =========================================================================
    // Step 5: Complete Mission 3 - Evil player on team votes fail (evil wins)
    // =========================================================================
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 3,
      crown_index: 2,
      selected_team: null,
    });

    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Team of 2 includes 1 evil player
    const mission3Team = [guardian.id, assassin.id];
    selectTeam(env, game.id, mission3Team);
    runFailedMission(env, game.id, mission3Team);

    // =========================================================================
    // Step 6: Evil team declared winner
    // =========================================================================
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(3);
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('evil');
    expect(currentGame.end_reason).toContain('Evil sabotaged 3 missions');
  });

  it('evil wins with mixed mission outcomes (2-3 score)', async () => {
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
    const evilPlayers = findPlayersByTeam(players, 'evil');

    // Mission 1: Good wins (no evil on team)
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const m1Team = goodPlayers.slice(0, 2).map(p => p.id);
    selectTeam(env, game.id, m1Team);
    for (const id of m1Team) {
      env.voteProcessor.submitMissionVote(game.id, id, 'pass');
    }

    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(1);
    expect(currentGame.evil_victories).toBe(0);

    // Mission 2: Evil wins (evil on team votes fail)
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 2,
      crown_index: 1,
      selected_team: null,
    });
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const m2Team = [goodPlayers[0].id, goodPlayers[1].id, evilPlayers[0].id];
    selectTeam(env, game.id, m2Team);
    runFailedMission(env, game.id, m2Team);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(1);
    expect(currentGame.evil_victories).toBe(1);

    // Mission 3: Good wins (no evil on team)
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 3,
      crown_index: 2,
      selected_team: null,
    });
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const m3Team = goodPlayers.slice(0, 2).map(p => p.id);
    selectTeam(env, game.id, m3Team);
    for (const id of m3Team) {
      env.voteProcessor.submitMissionVote(game.id, id, 'pass');
    }

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(2);
    expect(currentGame.evil_victories).toBe(1);

    // Mission 4: Evil wins
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 4,
      crown_index: 3,
      selected_team: null,
    });
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const m4Team = [goodPlayers[0].id, goodPlayers[1].id, evilPlayers[0].id];
    selectTeam(env, game.id, m4Team);
    runFailedMission(env, game.id, m4Team);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(2);
    expect(currentGame.evil_victories).toBe(2);

    // Mission 5: Evil wins (final mission, evil victory)
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 5,
      crown_index: 4,
      selected_team: null,
    });
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const m5Team = [goodPlayers[0].id, goodPlayers[1].id, evilPlayers[0].id];
    selectTeam(env, game.id, m5Team);
    runFailedMission(env, game.id, m5Team);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(3);
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('evil');
  });

  it('tracks mission progress correctly - evil victories', async () => {
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
    const evilPlayers = findPlayersByTeam(players, 'evil');

    // Initial state
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(0);
    expect(currentGame.evil_victories).toBe(0);
    expect(currentGame.current_round).toBe(1);

    // Mission with evil player - should fail
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const team1 = [goodPlayers[0].id, evilPlayers[0].id];
    selectTeam(env, game.id, team1);
    runFailedMission(env, game.id, team1);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(1);
    expect(currentGame.good_victories).toBe(0);

    // Advance and run another failed mission
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 2,
      crown_index: 1,
      selected_team: null,
    });
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const team2 = [goodPlayers[0].id, goodPlayers[1].id, evilPlayers[0].id];
    selectTeam(env, game.id, team2);
    runFailedMission(env, game.id, team2);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(2);
    expect(currentGame.good_victories).toBe(0);
  });

  it('handles mission voting where only evil votes fail', async () => {
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
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Set up team with 2 good and 1 evil
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 2,
      selected_team: [seer.id, guardian.id, assassin.id],
    });

    // Good players vote pass, evil votes fail
    env.voteProcessor.submitMissionVote(game.id, seer.id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, guardian.id, 'pass');
    const result = env.voteProcessor.submitMissionVote(game.id, assassin.id, 'fail');

    expect(result.success).toBe(true);
    expect(result.allVotesIn).toBe(true);
    expect(result.result).toBe('failed');
    expect(result.tally).toEqual({ pass: 2, fail: 1 });
  });

  it('good players cannot vote fail on missions', async () => {
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

    // Set up team with 2 good players
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [seer.id, guardian.id],
    });

    // Good player tries to vote fail - should be rejected
    const result = env.voteProcessor.submitMissionVote(game.id, seer.id, 'fail');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Good players cannot vote fail');
  });

  it('does not trigger assassination phase when evil wins via missions', async () => {
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
    const evilPlayers = findPlayersByTeam(players, 'evil');

    // Complete 3 failed missions quickly
    for (let round = 1; round <= 3; round++) {
      if (round > 1) {
        env.gameService.updateGame(game.id, {
          phase: 'voting_for_leader',
          current_round: round,
          crown_index: round - 1,
          selected_team: null,
        });
      }

      approveLeader(env, game.id);
      env.gameService.updateGame(game.id, { phase: 'selecting_team' });

      const teamSize = getMissionSize(5, round);
      // Include evil player in team
      const team = [...goodPlayers.slice(0, teamSize - 1).map(p => p.id), evilPlayers[0].id];
      selectTeam(env, game.id, team);
      runFailedMission(env, game.id, team);
    }

    // Game should end immediately without assassination phase
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(3);
    expect(currentGame.status).toBe('finished');
    expect(currentGame.phase).not.toBe('assassination');
    expect(currentGame.winner).toBe('evil');
  });

  it('displays correct end reason for evil victory via missions', async () => {
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
    const evilPlayers = findPlayersByTeam(players, 'evil');

    // Complete 3 failed missions
    for (let round = 1; round <= 3; round++) {
      if (round > 1) {
        env.gameService.updateGame(game.id, {
          phase: 'voting_for_leader',
          current_round: round,
          crown_index: round - 1,
          selected_team: null,
        });
      }

      approveLeader(env, game.id);
      env.gameService.updateGame(game.id, { phase: 'selecting_team' });

      const teamSize = getMissionSize(5, round);
      const team = [...goodPlayers.slice(0, teamSize - 1).map(p => p.id), evilPlayers[0].id];
      selectTeam(env, game.id, team);
      runFailedMission(env, game.id, team);
    }

    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.end_reason).toBe('Evil sabotaged 3 missions');
  });
});

// =============================================================================
// E2E Tests: Edge Cases for Evil Victory
// =============================================================================

describe('E2E: Evil Victory Edge Cases', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('handles round 4 requiring 2 fail votes with 7+ players', async () => {
    // Create game with 7 players
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
      { name: 'Player6', userId: 'user-6' },
      { name: 'Player7', userId: 'user-7' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    // 7 players: 4 good, 3 evil
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Oracle', team: 'good' });
    characterAssignments.set('user-5', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-6', { character: 'Minion', team: 'evil' });
    characterAssignments.set('user-7', { character: 'Saboteur', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const goodPlayers = findPlayersByTeam(players, 'good');
    const evilPlayers = findPlayersByTeam(players, 'evil');

    // Skip to round 4 with 1 good, 1 evil victory
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 4,
      crown_index: 3,
      good_victories: 1,
      evil_victories: 1,
      selected_team: null,
    });

    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Round 4 with 7 players requires team of 4
    // For 7+ players, round 4 requires 2 fail votes
    const team = [
      goodPlayers[0].id,
      goodPlayers[1].id,
      evilPlayers[0].id,
      evilPlayers[1].id,
    ];
    selectTeam(env, game.id, team);

    // Only 1 evil votes fail - mission should PASS with 7+ players on round 4
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[0].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[1].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, evilPlayers[0].id, 'fail');
    const result = env.voteProcessor.submitMissionVote(game.id, evilPlayers[1].id, 'pass');

    expect(result.success).toBe(true);
    expect(result.allVotesIn).toBe(true);
    // With only 1 fail vote, mission passes (need 2 for round 4 with 7+ players)
    expect(result.result).toBe('passed');
    expect(result.tally).toEqual({ pass: 3, fail: 1 });
  });

  it('evil wins round 4 with 7+ players when 2 fail votes', async () => {
    // Create game with 7 players
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
      { name: 'Player6', userId: 'user-6' },
      { name: 'Player7', userId: 'user-7' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    // 7 players: 4 good, 3 evil
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Oracle', team: 'good' });
    characterAssignments.set('user-5', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-6', { character: 'Minion', team: 'evil' });
    characterAssignments.set('user-7', { character: 'Saboteur', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);
    const goodPlayers = findPlayersByTeam(players, 'good');
    const evilPlayers = findPlayersByTeam(players, 'evil');

    // Skip to round 4
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 4,
      crown_index: 3,
      good_victories: 2,
      evil_victories: 0,
      selected_team: null,
    });

    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Round 4 with 7 players requires team of 4
    const team = [
      goodPlayers[0].id,
      goodPlayers[1].id,
      evilPlayers[0].id,
      evilPlayers[1].id,
    ];
    selectTeam(env, game.id, team);

    // 2 evil players vote fail - mission should fail
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[0].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[1].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, evilPlayers[0].id, 'fail');
    const result = env.voteProcessor.submitMissionVote(game.id, evilPlayers[1].id, 'fail');

    expect(result.success).toBe(true);
    expect(result.allVotesIn).toBe(true);
    // With 2 fail votes, mission fails on round 4 with 7+ players
    expect(result.result).toBe('failed');
    expect(result.tally).toEqual({ pass: 2, fail: 2 });
  });
});
