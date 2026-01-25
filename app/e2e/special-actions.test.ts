/**
 * End-to-end tests for special action effects.
 * Tests the complete integration of character special abilities:
 * 1. Guardian protect prevents assassination
 * 2. Fixer rig_vote forces mission pass
 * 3. Tracker beeper causes vibration on vote reveal
 * 4. Saboteur adds extra fail vote
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
 * Find players by various criteria.
 */
function findPlayerByCharacter(players: Player[], character: CharacterName): Player | undefined {
  return players.find(p => p.character === character);
}

function findPlayersByTeam(players: Player[], team: Team): Player[] {
  return players.filter(p => p.team === team);
}

/**
 * Complete a successful round (leader approved, team selected, mission passed).
 */
function completeSuccessfulRound(
  env: TestEnv,
  gameId: string,
  goodPlayerIds: string[],
  round: number
): void {
  // Set up for leader voting
  env.gameService.updateGame(gameId, {
    phase: 'voting_for_leader',
    current_round: round,
    crown_index: round - 1,
    selected_team: null,
  });

  // Clear any previous votes for this round
  env.voteProcessor.clear();

  // Approve leader
  approveLeader(env, gameId);

  // Move to selecting_team phase
  env.gameService.updateGame(gameId, { phase: 'selecting_team' });

  // Select team (all good players)
  const teamSize = Math.min(goodPlayerIds.length, 3);
  const team = goodPlayerIds.slice(0, teamSize);
  selectTeam(env, gameId, team);

  // All team members vote pass
  for (const playerId of team) {
    env.voteProcessor.submitMissionVote(gameId, playerId, 'pass');
  }
}

// =============================================================================
// E2E Tests: Guardian Protect Prevents Assassination
// =============================================================================

describe('E2E: Guardian Protect Prevents Assassination', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('Guardian can protect the Seer from assassination during mission_voting phase', async () => {
    // Create game with 5 players including Guardian and Assassin
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

    const seer = findPlayerByCharacter(players, 'Seer')!;
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Move to mission_voting phase with a team
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
    expect(protectResult.message).toContain('protected');

    // Verify Seer has protected status
    expect(env.voteProcessor.hasStatus(game.id, seer.id, 'protected', 1)).toBe(true);

    // Assassin attempts to kill Seer
    const assassinateResult = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    expect(assassinateResult.success).toBe(true);
    expect(assassinateResult.message).toContain('protected');
    expect(assassinateResult.gameEnded).toBe(false); // Game didn't end because protection blocked it

    // Verify Seer is still alive
    const updatedSeer = env.gameService.getPlayers(game.id).find(p => p.id === seer.id);
    expect(updatedSeer?.is_alive).toBe(true);
  });

  it('Protection blocks assassination during assassination phase, good wins', async () => {
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
    const players = env.gameService.getPlayers(game.id);

    const seer = findPlayerByCharacter(players, 'Seer')!;
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Complete 3 missions for good team (set up assassination phase)
    env.gameService.updateGame(game.id, {
      good_victories: 3,
      phase: 'mission_voting', // Guardian can only protect during mission_voting
      selected_team: [seer.id, guardian.id],
    });

    // Guardian protects the Seer before assassination phase
    await env.actionProcessor.executeAction(
      game.id,
      guardian.id,
      'protect',
      [seer.id]
    );

    // Now enter assassination phase
    env.gameService.updateGame(game.id, { phase: 'assassination' });

    // Assassin attempts to kill protected Seer
    const assassinateResult = await env.actionProcessor.executeAction(
      game.id,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    // Protection should block the assassination
    expect(assassinateResult.success).toBe(true);
    expect(assassinateResult.message).toContain('protected');
    expect(assassinateResult.gameEnded).toBe(false);

    // Seer survives - in a real game, Assassin would need to wait or pick another target
    const updatedSeer = env.gameService.getPlayers(game.id).find(p => p.id === seer.id);
    expect(updatedSeer?.is_alive).toBe(true);
  });

  it('Protection expires at end of round and does not carry over', async () => {
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
    const guardian = findPlayerByCharacter(players, 'Guardian')!;

    // Round 1 - Guardian protects Seer
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 1,
      selected_team: [seer.id, guardian.id],
    });

    await env.actionProcessor.executeAction(
      game.id,
      guardian.id,
      'protect',
      [seer.id]
    );

    // Verify protection in round 1
    expect(env.voteProcessor.hasStatus(game.id, seer.id, 'protected', 1)).toBe(true);

    // Move to round 2 - protection should NOT apply
    expect(env.voteProcessor.hasStatus(game.id, seer.id, 'protected', 2)).toBe(false);
  });
});

// =============================================================================
// E2E Tests: Fixer Rig Vote Forces Mission Pass
// =============================================================================

describe('E2E: Fixer Rig Vote Forces Mission Pass', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('Fixer rig_vote forces mission to pass despite fail votes', async () => {
    // Create game with Fixer
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
    characterAssignments.set('user-bob', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Fixer', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Assassin', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const seer = findPlayerByCharacter(players, 'Seer')!;
    const fixer = findPlayerByCharacter(players, 'Fixer')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Set up mission with evil players on team
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [seer.id, fixer.id, assassin.id],
    });

    // Fixer uses rig_vote to ensure mission passes
    const rigResult = await env.actionProcessor.executeAction(
      game.id,
      fixer.id,
      'rig_vote',
      []
    );

    expect(rigResult.success).toBe(true);
    expect(rigResult.message).toContain('rigged');

    // Verify modifier was created
    const modifiers = env.voteProcessor.getModifiersForRound(game.id, 1);
    expect(modifiers.some(m => m.modifier_type === 'force_pass')).toBe(true);

    // Evil players vote fail, good player votes pass
    env.voteProcessor.submitMissionVote(game.id, fixer.id, 'fail');
    env.voteProcessor.submitMissionVote(game.id, assassin.id, 'fail');
    const voteResult = env.voteProcessor.submitMissionVote(game.id, seer.id, 'pass');

    // Mission should PASS despite 2 fail votes because of rig_vote
    expect(voteResult.success).toBe(true);
    expect(voteResult.allVotesIn).toBe(true);
    expect(voteResult.result).toBe('passed');

    // Verify good_victories increased
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(1);
  });

  it('Rig vote only affects the current round mission', async () => {
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
    characterAssignments.set('user-bob', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Fixer', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Assassin', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const fixer = findPlayerByCharacter(players, 'Fixer')!;

    // Round 1 - Fixer uses rig_vote
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 1,
      selected_team: [fixer.id, players[0].id],
    });

    await env.actionProcessor.executeAction(
      game.id,
      fixer.id,
      'rig_vote',
      []
    );

    // Verify modifier exists for round 1
    const round1Modifiers = env.voteProcessor.getModifiersForRound(game.id, 1);
    expect(round1Modifiers.length).toBe(1);
    expect(round1Modifiers[0].modifier_type).toBe('force_pass');

    // Verify modifier does NOT exist for round 2
    const round2Modifiers = env.voteProcessor.getModifiersForRound(game.id, 2);
    expect(round2Modifiers.length).toBe(0);
  });

  it('Fixer can only use rig_vote once per game', async () => {
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
    characterAssignments.set('user-bob', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Fixer', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Assassin', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const fixer = findPlayerByCharacter(players, 'Fixer')!;

    // Round 1 - First rig_vote succeeds
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 1,
      selected_team: [fixer.id, players[0].id],
    });

    const firstRig = await env.actionProcessor.executeAction(
      game.id,
      fixer.id,
      'rig_vote',
      []
    );
    expect(firstRig.success).toBe(true);

    // Round 2 - Second rig_vote fails
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 2,
      selected_team: [fixer.id, players[0].id],
    });

    const secondRig = await env.actionProcessor.executeAction(
      game.id,
      fixer.id,
      'rig_vote',
      []
    );
    expect(secondRig.success).toBe(false);
    expect(secondRig.error).toContain('maximum number of times');
  });
});

// =============================================================================
// E2E Tests: Tracker Beeper Causes Vibration on Vote Reveal
// =============================================================================

describe('E2E: Tracker Beeper Causes Vibration', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('Tracker can plant beepers on one good and one evil player', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Tracker', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const tracker = findPlayerByCharacter(players, 'Tracker')!;
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Move to selecting_team phase (plant_beeper only works here)
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Tracker plants beepers on Seer (good) and Assassin (evil)
    const beeperResult = await env.actionProcessor.executeAction(
      game.id,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );

    expect(beeperResult.success).toBe(true);
    expect(beeperResult.message).toContain('Beepers planted');

    // Both players should have beepered status
    expect(env.voteProcessor.hasStatus(game.id, seer.id, 'beepered', 1)).toBe(true);
    expect(env.voteProcessor.hasStatus(game.id, assassin.id, 'beepered', 1)).toBe(true);
  });

  it('Beeper vibration triggers on vote reveal with correct player list', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Tracker', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const tracker = findPlayerByCharacter(players, 'Tracker')!;
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const villager = findPlayerByCharacter(players, 'Villager')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Plant beepers in selecting_team phase
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    
    await env.actionProcessor.executeAction(
      game.id,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );

    // Set up mission with beepered players on team
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [tracker.id, seer.id],
    });

    // When votes are submitted and revealed, triggerBeeperVibration is called
    // Test that the method returns correct player IDs
    const beeperedPlayers = env.voteProcessor.triggerBeeperVibration(game.id, 1);

    // Both beepered players should be in the list
    expect(beeperedPlayers).toContain(seer.id);
    expect(beeperedPlayers).toContain(assassin.id);
    expect(beeperedPlayers).toHaveLength(2);

    // Non-beepered players should NOT be in the list
    expect(beeperedPlayers).not.toContain(tracker.id);
    expect(beeperedPlayers).not.toContain(villager.id);
  });

  it('Beeper status expires at end of round', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Tracker', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const tracker = findPlayerByCharacter(players, 'Tracker')!;
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;

    // Round 1 - Plant beepers
    env.gameService.updateGame(game.id, { phase: 'selecting_team', current_round: 1 });
    
    await env.actionProcessor.executeAction(
      game.id,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );

    // Verify beepered status exists in round 1
    expect(env.voteProcessor.hasStatus(game.id, seer.id, 'beepered', 1)).toBe(true);
    expect(env.voteProcessor.hasStatus(game.id, assassin.id, 'beepered', 1)).toBe(true);

    // Round 2 - Beeper status should still be valid (expires at END of the round it was set)
    // Based on implementation, beeper status expires_at_round equals current_round
    // The hasStatus check uses round parameter for comparison
    expect(env.voteProcessor.hasStatus(game.id, seer.id, 'beepered', 2)).toBe(false);
    expect(env.voteProcessor.hasStatus(game.id, assassin.id, 'beepered', 2)).toBe(false);
  });

  it('Plant beeper requires exactly one good and one evil target', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Tracker', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const tracker = findPlayerByCharacter(players, 'Tracker')!;
    const seer = findPlayerByCharacter(players, 'Seer')!;
    const villager = findPlayerByCharacter(players, 'Villager')!;
    const assassin = findPlayerByCharacter(players, 'Assassin')!;
    const minion = findPlayerByCharacter(players, 'Minion')!;

    env.gameService.updateGame(game.id, { phase: 'selecting_team' });

    // Try with two good players - should fail
    const twoGoodResult = await env.actionProcessor.executeAction(
      game.id,
      tracker.id,
      'plant_beeper',
      [seer.id, villager.id]
    );
    expect(twoGoodResult.success).toBe(false);
    expect(twoGoodResult.error).toContain('1 good player and 1 evil player');

    // Try with two evil players - should fail
    const twoEvilResult = await env.actionProcessor.executeAction(
      game.id,
      tracker.id,
      'plant_beeper',
      [assassin.id, minion.id]
    );
    expect(twoEvilResult.success).toBe(false);
    expect(twoEvilResult.error).toContain('1 good player and 1 evil player');

    // Try with one of each - should succeed
    const validResult = await env.actionProcessor.executeAction(
      game.id,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );
    expect(validResult.success).toBe(true);
  });
});

// =============================================================================
// E2E Tests: Saboteur Adds Extra Fail Vote
// =============================================================================

describe('E2E: Saboteur Adds Extra Fail Vote', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('Saboteur sabotage adds an extra fail vote to mission tally', async () => {
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
    characterAssignments.set('user-bob', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Saboteur', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Assassin', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const seer = findPlayerByCharacter(players, 'Seer')!;
    const saboteur = findPlayerByCharacter(players, 'Saboteur')!;

    // Set up mission with Saboteur on team
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [seer.id, saboteur.id],
    });

    // Saboteur uses sabotage
    const sabotageResult = await env.actionProcessor.executeAction(
      game.id,
      saboteur.id,
      'sabotage',
      []
    );

    expect(sabotageResult.success).toBe(true);
    expect(sabotageResult.message).toContain('extra fail');

    // Verify modifier was created
    const modifiers = env.voteProcessor.getModifiersForRound(game.id, 1);
    expect(modifiers.some(m => m.modifier_type === 'extra_fail')).toBe(true);

    // Both vote pass - but extra_fail should cause mission to fail
    env.voteProcessor.submitMissionVote(game.id, seer.id, 'pass');
    const voteResult = env.voteProcessor.submitMissionVote(game.id, saboteur.id, 'pass');

    // Mission should FAIL despite all pass votes because of sabotage
    expect(voteResult.success).toBe(true);
    expect(voteResult.allVotesIn).toBe(true);
    expect(voteResult.result).toBe('failed');

    // Verify evil_victories increased
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.evil_victories).toBe(1);
  });

  it('Sabotage requires Saboteur to be on mission team', async () => {
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
    characterAssignments.set('user-bob', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Saboteur', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Assassin', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const seer = findPlayerByCharacter(players, 'Seer')!;
    const villager = findPlayerByCharacter(players, 'Villager')!;
    const saboteur = findPlayerByCharacter(players, 'Saboteur')!;

    // Set up mission WITHOUT Saboteur on team
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [seer.id, villager.id],
    });

    // Saboteur tries to use sabotage (not on team)
    const result = await env.actionProcessor.executeAction(
      game.id,
      saboteur.id,
      'sabotage',
      []
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('mission team');
  });

  it('Sabotage can cause mission to fail even with round 4 two-fail requirement', async () => {
    // For 7+ players, round 4 requires 2 fail votes
    // This test verifies sabotage counts toward that threshold
    const playerSetups = [
      { name: 'P1', userId: 'user-1' },
      { name: 'P2', userId: 'user-2' },
      { name: 'P3', userId: 'user-3' },
      { name: 'P4', userId: 'user-4' },
      { name: 'P5', userId: 'user-5' },
      { name: 'P6', userId: 'user-6' },
      { name: 'P7', userId: 'user-7' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-1', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-1', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-2', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-3', { character: 'Tracker', team: 'good' });
    characterAssignments.set('user-4', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-5', { character: 'Saboteur', team: 'evil' });
    characterAssignments.set('user-6', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-7', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const goodPlayers = findPlayersByTeam(players, 'good');
    const saboteur = findPlayerByCharacter(players, 'Saboteur')!;

    // Set up round 4 (requires 2 fail votes for 7 players)
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 4,
      selected_team: [goodPlayers[0].id, goodPlayers[1].id, goodPlayers[2].id, saboteur.id],
    });

    // Saboteur uses sabotage (adds 1 extra fail)
    await env.actionProcessor.executeAction(
      game.id,
      saboteur.id,
      'sabotage',
      []
    );

    // Good players vote pass, Saboteur votes fail
    // Total: 0 pass from action + 3 pass from good + 1 fail from saboteur = 3 pass, 1 fail
    // But sabotage adds extra_fail: 3 pass, 2 fail -> should FAIL (requires 2 fail)
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[0].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[1].id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[2].id, 'pass');
    const voteResult = env.voteProcessor.submitMissionVote(game.id, saboteur.id, 'fail');

    // With sabotage: 1 fail + 1 extra_fail = 2 fails, meets round 4 threshold
    expect(voteResult.success).toBe(true);
    expect(voteResult.result).toBe('failed');
  });

  it('Saboteur can only use sabotage once per game', async () => {
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
    characterAssignments.set('user-bob', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Saboteur', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Assassin', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const seer = findPlayerByCharacter(players, 'Seer')!;
    const saboteur = findPlayerByCharacter(players, 'Saboteur')!;

    // Round 1 - First sabotage succeeds
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 1,
      selected_team: [seer.id, saboteur.id],
    });

    const firstSabotage = await env.actionProcessor.executeAction(
      game.id,
      saboteur.id,
      'sabotage',
      []
    );
    expect(firstSabotage.success).toBe(true);

    // Round 2 - Second sabotage fails
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 2,
      selected_team: [seer.id, saboteur.id],
    });

    const secondSabotage = await env.actionProcessor.executeAction(
      game.id,
      saboteur.id,
      'sabotage',
      []
    );
    expect(secondSabotage.success).toBe(false);
    expect(secondSabotage.error).toContain('maximum number of times');
  });
});

// =============================================================================
// E2E Tests: Combined Special Actions
// =============================================================================

describe('E2E: Combined Special Actions in Complete Game', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('Multiple actions can be used in the same game', async () => {
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
      { name: 'Frank', userId: 'user-frank' },
      { name: 'Grace', userId: 'user-grace' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    // Game with all special characters
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Tracker', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-eve', { character: 'Fixer', team: 'evil' });
    characterAssignments.set('user-frank', { character: 'Saboteur', team: 'evil' });
    characterAssignments.set('user-grace', { character: 'Assassin', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    const seer = findPlayerByCharacter(players, 'Seer')!;
    const guardian = findPlayerByCharacter(players, 'Guardian')!;
    const tracker = findPlayerByCharacter(players, 'Tracker')!;
    const fixer = findPlayerByCharacter(players, 'Fixer')!;
    const saboteur = findPlayerByCharacter(players, 'Saboteur')!;

    // Round 1: Tracker plants beepers
    env.gameService.updateGame(game.id, { phase: 'selecting_team', current_round: 1 });
    
    const beeperResult = await env.actionProcessor.executeAction(
      game.id,
      tracker.id,
      'plant_beeper',
      [seer.id, fixer.id]
    );
    expect(beeperResult.success).toBe(true);

    // Verify beepers were planted before mission
    expect(env.voteProcessor.hasStatus(game.id, seer.id, 'beepered', 1)).toBe(true);
    expect(env.voteProcessor.hasStatus(game.id, fixer.id, 'beepered', 1)).toBe(true);

    // Round 1: Guardian protects Seer during mission
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      selected_team: [seer.id, guardian.id, fixer.id],
    });

    const protectResult = await env.actionProcessor.executeAction(
      game.id,
      guardian.id,
      'protect',
      [seer.id]
    );
    expect(protectResult.success).toBe(true);

    // Round 1: Fixer rigs the vote
    const rigResult = await env.actionProcessor.executeAction(
      game.id,
      fixer.id,
      'rig_vote',
      []
    );
    expect(rigResult.success).toBe(true);

    // Spy on triggerBeeperVibration to verify it's called during mission processing
    const vibrationSpy = vi.spyOn(env.voteProcessor, 'triggerBeeperVibration');

    // Complete round 1 mission (rigged to pass)
    env.voteProcessor.submitMissionVote(game.id, seer.id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, guardian.id, 'pass');
    const round1Result = env.voteProcessor.submitMissionVote(game.id, fixer.id, 'fail');
    expect(round1Result.result).toBe('passed'); // Rigged!

    // Verify beeper vibration was triggered during mission result processing
    expect(vibrationSpy).toHaveBeenCalledWith(game.id, 1);
    const vibrationCall = vibrationSpy.mock.results[0];
    expect(vibrationCall.value).toContain(seer.id);
    expect(vibrationCall.value).toContain(fixer.id);

    vibrationSpy.mockRestore();

    // Round 2: Saboteur sabotages
    env.gameService.updateGame(game.id, {
      phase: 'mission_voting',
      current_round: 2,
      selected_team: [seer.id, tracker.id, saboteur.id],
    });

    const sabotageResult = await env.actionProcessor.executeAction(
      game.id,
      saboteur.id,
      'sabotage',
      []
    );
    expect(sabotageResult.success).toBe(true);

    // Complete round 2 mission (sabotaged to fail)
    env.voteProcessor.submitMissionVote(game.id, seer.id, 'pass');
    env.voteProcessor.submitMissionVote(game.id, tracker.id, 'pass');
    const round2Result = env.voteProcessor.submitMissionVote(game.id, saboteur.id, 'pass');
    expect(round2Result.result).toBe('failed'); // Sabotaged!

    // Verify game state after round 2
    const currentGame = env.gameService.getGameById(game.id)!;
    expect(currentGame.good_victories).toBe(1); // Round 1 (rigged)
    expect(currentGame.evil_victories).toBe(1); // Round 2 (sabotaged)
  });
});
