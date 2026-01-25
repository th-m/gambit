/**
 * End-to-end test for 3-rejection auto-fail rule.
 * Tests the game behavior when leaders are rejected 3 consecutive times:
 * 1. Leader rejected 3 consecutive times
 * 2. Evil automatically gets a point
 * 3. Round advances correctly
 * 4. Rejection count resets
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
 * Run a complete leader voting round where leader is rejected.
 * Returns the VoteResult from the last vote.
 * Note: VoteProcessor tracks votes by (round, phase), so we need to clear
 * actions between leader voting sessions within the same round.
 */
function rejectLeader(env: TestEnv, gameId: string) {
  const players = env.gameService.getPlayers(gameId).filter(p => p.is_alive);
  
  // Majority votes no
  let result;
  for (let i = 0; i < players.length; i++) {
    const vote = i < Math.ceil(players.length / 2) ? 'no' : 'yes';
    result = env.voteProcessor.submitLeaderVote(gameId, players[i].id, vote);
  }
  
  // Clear actions to allow next voting session in same round
  // This simulates the vote completion clearing the vote records
  env.voteProcessor.clear();
  
  return result;
}

/**
 * Run a complete leader voting round where leader is approved.
 * Note: Clears actions after to allow subsequent voting rounds.
 */
function approveLeader(env: TestEnv, gameId: string) {
  const players = env.gameService.getPlayers(gameId).filter(p => p.is_alive);
  
  // All players vote yes
  let result;
  for (const player of players) {
    result = env.voteProcessor.submitLeaderVote(gameId, player.id, 'yes');
  }
  
  // Clear actions to allow next voting session
  env.voteProcessor.clear();
  
  return result;
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
 * Run a mission where all team members vote pass.
 */
function runSuccessfulMission(env: TestEnv, gameId: string): void {
  const game = env.gameService.getGameById(gameId)!;
  const players = env.gameService.getPlayers(gameId);
  const teamMembers = players.filter(p => game.selected_team?.includes(p.id));

  for (const member of teamMembers) {
    env.voteProcessor.submitMissionVote(gameId, member.id, 'pass');
  }
}

/**
 * Find players by team.
 */
function findPlayersByTeam(players: Player[], team: Team): Player[] {
  return players.filter(p => p.team === team);
}

// =============================================================================
// E2E Tests: 3-Rejection Auto-Fail
// =============================================================================

describe('E2E: 3-Rejection Auto-Fail Rule', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('leader rejected 3 consecutive times gives evil a point', async () => {
    // Create game with 5 players
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

    // Initial state
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.rejection_count).toBe(0);
    expect(currentGame.evil_victories).toBe(0);
    expect(currentGame.current_round).toBe(1);

    // First rejection
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.rejection_count).toBe(1);
    expect(currentGame.evil_victories).toBe(0);

    // Second rejection
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.rejection_count).toBe(2);
    expect(currentGame.evil_victories).toBe(0);

    // Third rejection - evil gets a point
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(1);
  });

  it('round advances correctly after 3 rejections', async () => {
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

    // Verify initial round
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.current_round).toBe(1);

    // Reject 3 times
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    // Round should advance
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.current_round).toBe(2);
    expect(currentGame.phase).toBe('voting_for_leader');
  });

  it('rejection count resets after 3 rejections', async () => {
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

    // Reject 3 times
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    // Rejection count should reset
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.rejection_count).toBe(0);
  });

  it('rejection count resets when leader is approved', async () => {
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

    // Reject twice
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.rejection_count).toBe(2);

    // Now approve
    approveLeader(env, game.id);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.rejection_count).toBe(0);
    expect(currentGame.phase).toBe('selecting_team');
  });

  it('crown passes to next player on each rejection', async () => {
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

    // Initial crown index
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.crown_index).toBe(0);

    // First rejection - crown moves to next player
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.crown_index).toBe(1);

    // Second rejection - crown moves again
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.crown_index).toBe(2);
  });

  it('evil wins game with 3 victories via rejection auto-fail', async () => {
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

    // Pre-set evil victories to 2 to speed up test
    env.gameService.updateGame(game.id, { evil_victories: 2 });

    // Reject 3 times to give evil their third victory
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    // Game should end with evil victory
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(3);
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('evil');
    expect(currentGame.end_reason).toBe('3 consecutive leader rejections');
  });

  it('mixed rejections and missions - evil wins via both paths', async () => {
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
    const goodPlayers = findPlayersByTeam(players, 'good');
    const evilPlayers = findPlayersByTeam(players, 'evil');

    // Round 1: 3 rejections → evil gets 1 point
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(1);
    expect(currentGame.current_round).toBe(2);

    // Round 2: Approve leader, run failed mission → evil gets 1 more point
    approveLeader(env, game.id);
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    
    // Select team with an evil player
    const mission2Team = [goodPlayers[0].id, goodPlayers[1].id, evilPlayers[0].id];
    selectTeam(env, game.id, mission2Team);
    
    // Evil votes fail
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[0].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[1].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, evilPlayers[0].id, 'fail');

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(2);

    // Round 3: 3 more rejections → evil wins
    env.gameService.updateGame(game.id, {
      phase: 'voting_for_leader',
      current_round: 3,
      crown_index: 0,
      selected_team: null,
    });

    rejectLeader(env, game.id);
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(3);
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('evil');
    expect(currentGame.end_reason).toBe('3 consecutive leader rejections');
  });

  it('good can still win after rejection auto-fail gives evil a point', async () => {
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
    const goodPlayers = findPlayersByTeam(players, 'good');

    // Round 1: 3 rejections → evil gets 1 point
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(1);
    expect(currentGame.good_victories).toBe(0);

    // Rounds 2-4: Good wins 3 missions
    for (let round = 2; round <= 4; round++) {
      approveLeader(env, game.id);
      env.gameService.updateGame(game.id, { phase: 'selecting_team' });
      
      const team = goodPlayers.slice(0, round === 2 ? 3 : 2).map(p => p.id);
      selectTeam(env, game.id, team);
      runSuccessfulMission(env, game.id);

      if (round < 4) {
        env.gameService.updateGame(game.id, {
          phase: 'voting_for_leader',
          current_round: round + 1,
          crown_index: round,
          selected_team: null,
        });
      }
    }

    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(3);
    expect(currentGame.evil_victories).toBe(1);
  });
});

// =============================================================================
// E2E Tests: Rejection Edge Cases
// =============================================================================

describe('E2E: Rejection Edge Cases', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('rejection count persists between leader changes within a round', async () => {
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

    // Reject first leader
    rejectLeader(env, game.id);
    let currentGame = env.gameService.getGameById(game.id)!;
    const firstCrown = currentGame.crown_index;
    expect(currentGame.rejection_count).toBe(1);

    // Reject second leader
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.crown_index).not.toBe(firstCrown);
    expect(currentGame.rejection_count).toBe(2);

    // Still in round 1
    expect(currentGame.current_round).toBe(1);
  });

  it('handles tie votes as rejection', async () => {
    // Create game with 6 players for tie scenario
    const playerSetups = [
      { name: 'Player1', userId: 'user-1' },
      { name: 'Player2', userId: 'user-2' },
      { name: 'Player3', userId: 'user-3' },
      { name: 'Player4', userId: 'user-4' },
      { name: 'Player5', userId: 'user-5' },
      { name: 'Player6', userId: 'user-6' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    // 6 players: 4 good, 2 evil
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-4', { character: 'Oracle', team: 'good' });
    characterAssignments.set('user-5', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-6', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    // Submit 3 yes and 3 no votes (tie)
    for (let i = 0; i < 3; i++) {
      env.voteProcessor.submitLeaderVote(game.id, players[i].id, 'yes');
    }
    for (let i = 3; i < 6; i++) {
      env.voteProcessor.submitLeaderVote(game.id, players[i].id, 'no');
    }

    // Tie should count as rejection
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.rejection_count).toBe(1);
  });

  it('does not advance round when rejection count is 1 or 2', async () => {
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

    // After 1 rejection
    rejectLeader(env, game.id);
    let currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.current_round).toBe(1);
    expect(currentGame.phase).toBe('voting_for_leader');

    // After 2 rejections
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.current_round).toBe(1);
    expect(currentGame.phase).toBe('voting_for_leader');

    // After 3 rejections - NOW round advances
    rejectLeader(env, game.id);
    currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.current_round).toBe(2);
  });

  it('end reason is correct for rejection-based evil victory', async () => {
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

    // Set evil to 2 victories already
    env.gameService.updateGame(game.id, { evil_victories: 2 });

    // 3 rejections for the winning point
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);
    rejectLeader(env, game.id);

    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.status).toBe('finished');
    expect(currentGame.winner).toBe('evil');
    expect(currentGame.end_reason).toBe('3 consecutive leader rejections');
  });
});
