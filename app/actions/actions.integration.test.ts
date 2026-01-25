/**
 * Integration tests for all character actions.
 * Tests the full flow from action execution through handlers and side effects.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GameService } from '~/services/GameService';
import { VoteProcessor } from '~/services/VoteProcessor';
import { ActionProcessor } from '~/services/ActionProcessor';
import { actionRegistry } from '~/registry/ActionRegistry';
import type { CharacterName, Player, Team } from '~/types/game';

// Import action registrations
import {
  registerAssassinateAction,
  registerAssassinateHandler,
} from './assassinate';
import {
  registerRigVoteAction,
  registerRigVoteHandler,
} from './rigVote';
import {
  registerPlantBeeperAction,
  registerPlantBeeperHandler,
} from './plantBeeper';
import {
  registerProtectAction,
  registerProtectHandler,
} from './protect';
import {
  registerSabotageAction,
  registerSabotageHandler,
} from './sabotage';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Create a test environment with fresh service instances.
 */
function createTestEnv() {
  const gameService = new GameService();
  const voteProcessor = new VoteProcessor(gameService);
  const actionProcessor = new ActionProcessor(gameService, voteProcessor);

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

  return { gameService, voteProcessor, actionProcessor };
}

/**
 * Create a game with players assigned to specific characters/teams.
 */
function setupGameWithPlayers(
  gameService: GameService,
  playerConfigs: Array<{
    name: string;
    character: CharacterName;
    team: Team;
  }>
): { gameId: string; players: Player[] } {
  const game = gameService.createGame('host-user-id');
  const gameId = game.id;

  // Add players before changing status
  const players: Player[] = [];
  for (let i = 0; i < playerConfigs.length; i++) {
    const config = playerConfigs[i];
    const player = gameService.addPlayer(gameId, `user-${i}`, config.name);
    if (player) {
      const updated = gameService.updatePlayer(player.id, {
        character: config.character,
        team: config.team,
        seat_order: i,
      });
      if (updated) players.push(updated);
    }
  }

  // Set game to playing state
  gameService.updateGame(gameId, {
    status: 'playing',
    phase: 'mission_voting',
    current_round: 1,
    crown_index: 0,
    rejection_count: 0,
    good_victories: 0,
    evil_victories: 0,
    selected_team: [],
  });

  return { gameId, players };
}

// =============================================================================
// Assassinate Tests
// =============================================================================

describe('assassinate action integration', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('kills target correctly', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
    ]);

    const assassin = players[0];
    const villager = players[1];

    const result = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [villager.id]
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('assassinated');

    // Verify target is eliminated
    const updatedVillager = env.actionProcessor.getPlayer(villager.id);
    expect(updatedVillager?.is_alive).toBe(false);
  });

  it('ends game for evil when Seer is killed', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
    ]);

    const assassin = players[0];
    const seer = players[1];

    const result = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(result.winner).toBe('evil');
    expect(result.message).toContain('Seer');
    expect(result.message).toContain('Evil wins');

    // Verify game state
    const game = env.actionProcessor.getGame(gameId);
    expect(game?.status).toBe('finished');
    expect(game?.winner).toBe('evil');
  });

  it('is blocked by protect status', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const assassin = players[0];
    const seer = players[1];
    const guardian = players[2];

    // Guardian protects the Seer first
    const protectResult = await env.actionProcessor.executeAction(
      gameId,
      guardian.id,
      'protect',
      [seer.id]
    );
    expect(protectResult.success).toBe(true);

    // Now assassin tries to kill protected Seer
    const result = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [seer.id]
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('protected');
    expect(result.gameEnded).toBe(false);

    // Verify Seer is still alive
    const updatedSeer = env.actionProcessor.getPlayer(seer.id);
    expect(updatedSeer?.is_alive).toBe(true);
  });

  it('ends game for good when wrong target killed in assassination phase', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
    ]);

    // Set game to assassination phase
    env.gameService.updateGame(gameId, { phase: 'assassination' });

    const assassin = players[0];
    const villager = players[2]; // Not the Seer

    const result = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [villager.id]
    );

    expect(result.success).toBe(true);
    expect(result.gameEnded).toBe(true);
    expect(result.winner).toBe('good');
    expect(result.message).toContain('not the Seer');
    expect(result.message).toContain('Good wins');
  });
});

// =============================================================================
// Rig Vote Tests
// =============================================================================

describe('rig_vote action integration', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('forces mission pass regardless of fail votes', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Fixer', character: 'Fixer', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
    ]);

    const fixer = players[0];
    const minion = players[1];
    const seer = players[2];

    // Set up selected team
    env.gameService.updateGame(gameId, {
      selected_team: [fixer.id, minion.id, seer.id],
    });

    // Fixer uses rig_vote
    const result = await env.actionProcessor.executeAction(
      gameId,
      fixer.id,
      'rig_vote',
      []
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('rigged');

    // Verify modifier was created
    const modifiers = env.voteProcessor.getModifiersForRound(gameId, 1);
    expect(modifiers.length).toBe(1);
    expect(modifiers[0].modifier_type).toBe('force_pass');

    // Now submit all fail votes - mission should still pass
    env.voteProcessor.submitMissionVote(gameId, fixer.id, 'fail');
    env.voteProcessor.submitMissionVote(gameId, minion.id, 'fail');
    const voteResult = env.voteProcessor.submitMissionVote(gameId, seer.id, 'pass');

    expect(voteResult.success).toBe(true);
    expect(voteResult.allVotesIn).toBe(true);
    expect(voteResult.result).toBe('passed'); // Forced pass despite fail votes
  });
});

// =============================================================================
// Plant Beeper Tests
// =============================================================================

describe('plant_beeper action integration', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('validates target alignment (1 good + 1 evil required)', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Tracker', character: 'Tracker', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    // Set game to selecting_team phase
    env.gameService.updateGame(gameId, { phase: 'selecting_team' });

    const tracker = players[0];
    const seer = players[1];
    const villager = players[2];
    const assassin = players[3];

    // Try with 2 good players - should fail
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      tracker.id,
      'plant_beeper',
      [seer.id, villager.id]
    );
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('1 good player and 1 evil player');

    // Try with 1 good + 1 evil - should succeed
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );
    expect(result2.success).toBe(true);

    // Verify statuses were created
    const hasBeeperSeer = env.voteProcessor.hasStatus(gameId, seer.id, 'beepered', 1);
    const hasBeeperAssassin = env.voteProcessor.hasStatus(gameId, assassin.id, 'beepered', 1);
    expect(hasBeeperSeer).toBe(true);
    expect(hasBeeperAssassin).toBe(true);
  });

  it('creates beepered status for both targets', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Tracker', character: 'Tracker', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    env.gameService.updateGame(gameId, { phase: 'selecting_team' });

    const tracker = players[0];
    const villager = players[2];
    const assassin = players[3];

    const result = await env.actionProcessor.executeAction(
      gameId,
      tracker.id,
      'plant_beeper',
      [villager.id, assassin.id]
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('Beepers planted');

    // Both targets should have beepered status
    expect(env.voteProcessor.hasStatus(gameId, villager.id, 'beepered', 1)).toBe(true);
    expect(env.voteProcessor.hasStatus(gameId, assassin.id, 'beepered', 1)).toBe(true);
  });
});

// =============================================================================
// Protect Tests
// =============================================================================

describe('protect action integration', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('creates protected status for target', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const guardian = players[0];
    const seer = players[1];

    const result = await env.actionProcessor.executeAction(
      gameId,
      guardian.id,
      'protect',
      [seer.id]
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('protected');

    // Verify status was created
    const hasProtection = env.voteProcessor.hasStatus(gameId, seer.id, 'protected', 1);
    expect(hasProtection).toBe(true);
  });

  it('protection expires at end of round', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const guardian = players[0];
    const seer = players[1];

    // Protect in round 1
    await env.actionProcessor.executeAction(
      gameId,
      guardian.id,
      'protect',
      [seer.id]
    );

    // Verify protected in round 1
    expect(env.voteProcessor.hasStatus(gameId, seer.id, 'protected', 1)).toBe(true);

    // Move to round 2 - protection should not apply
    expect(env.voteProcessor.hasStatus(gameId, seer.id, 'protected', 2)).toBe(false);
  });

  it('only good team can use protect', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const assassin = players[0];
    const seer = players[1];

    // Register protect action for assassin (evil player)
    // This should fail because protect checks team in execute()
    const result = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'protect',
      [seer.id]
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid team');
  });
});

// =============================================================================
// Sabotage Tests
// =============================================================================

describe('sabotage action integration', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('adds fail vote to mission tally', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Saboteur', character: 'Saboteur', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const saboteur = players[0];
    const seer = players[1];

    // Set up selected team with Saboteur on it
    env.gameService.updateGame(gameId, {
      selected_team: [saboteur.id, seer.id],
    });

    // Saboteur uses sabotage
    const result = await env.actionProcessor.executeAction(
      gameId,
      saboteur.id,
      'sabotage',
      []
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('extra fail');

    // Verify modifier was created
    const modifiers = env.voteProcessor.getModifiersForRound(gameId, 1);
    expect(modifiers.length).toBe(1);
    expect(modifiers[0].modifier_type).toBe('extra_fail');

    // Even if both vote pass, the extra_fail should cause mission to fail
    env.voteProcessor.submitMissionVote(gameId, saboteur.id, 'pass');
    const voteResult = env.voteProcessor.submitMissionVote(gameId, seer.id, 'pass');

    expect(voteResult.success).toBe(true);
    expect(voteResult.allVotesIn).toBe(true);
    expect(voteResult.result).toBe('failed'); // Extra fail added by sabotage
  });

  it('requires player to be on mission team', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Saboteur', character: 'Saboteur', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const saboteur = players[0];
    const seer = players[1];
    const villager = players[2];

    // Set up selected team WITHOUT Saboteur
    env.gameService.updateGame(gameId, {
      selected_team: [seer.id, villager.id],
    });

    // Saboteur tries to use sabotage (not on team)
    const result = await env.actionProcessor.executeAction(
      gameId,
      saboteur.id,
      'sabotage',
      []
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('mission team');
  });
});

// =============================================================================
// Use Limits Tests
// =============================================================================

describe('action use limits', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('prevents assassinate from being used twice', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Villager1', character: 'Villager', team: 'good' },
      { name: 'Villager2', character: 'Villager', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const assassin = players[0];
    const villager1 = players[1];
    const villager2 = players[2];

    // First assassination should succeed
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [villager1.id]
    );
    expect(result1.success).toBe(true);

    // Second assassination should fail
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [villager2.id]
    );
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('maximum number of times');
  });

  it('prevents rig_vote from being used twice', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Fixer', character: 'Fixer', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const fixer = players[0];

    // First rig_vote should succeed
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      fixer.id,
      'rig_vote',
      []
    );
    expect(result1.success).toBe(true);

    // Second rig_vote should fail (even in different round)
    env.gameService.updateGame(gameId, { current_round: 2 });
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      fixer.id,
      'rig_vote',
      []
    );
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('maximum number of times');
  });

  it('prevents protect from being used twice', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const guardian = players[0];
    const seer = players[1];
    const villager = players[2];

    // First protect should succeed
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      guardian.id,
      'protect',
      [seer.id]
    );
    expect(result1.success).toBe(true);

    // Second protect should fail
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      guardian.id,
      'protect',
      [villager.id]
    );
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('maximum number of times');
  });

  it('prevents plant_beeper from being used twice', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Tracker', character: 'Tracker', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    env.gameService.updateGame(gameId, { phase: 'selecting_team' });

    const tracker = players[0];
    const seer = players[1];
    const villager = players[2];
    const assassin = players[3];
    const minion = players[4];

    // First beeper should succeed
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );
    expect(result1.success).toBe(true);

    // Second beeper should fail
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      tracker.id,
      'plant_beeper',
      [villager.id, minion.id]
    );
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('maximum number of times');
  });

  it('prevents sabotage from being used twice', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Saboteur', character: 'Saboteur', team: 'evil' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const saboteur = players[0];

    env.gameService.updateGame(gameId, {
      selected_team: [saboteur.id, players[1].id],
    });

    // First sabotage should succeed
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      saboteur.id,
      'sabotage',
      []
    );
    expect(result1.success).toBe(true);

    // Second sabotage should fail
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      saboteur.id,
      'sabotage',
      []
    );
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('maximum number of times');
  });
});

// =============================================================================
// Phase Validation Tests
// =============================================================================

describe('action phase validation', () => {
  let env: ReturnType<typeof createTestEnv>;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('assassinate only works in mission_voting and assassination phases', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Guardian', character: 'Guardian', team: 'good' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const assassin = players[0];
    const villager = players[1];

    // Should fail in selecting_team phase
    env.gameService.updateGame(gameId, { phase: 'selecting_team' });
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [villager.id]
    );
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('phase');

    // Should succeed in mission_voting phase
    env.gameService.updateGame(gameId, { phase: 'mission_voting' });
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      assassin.id,
      'assassinate',
      [villager.id]
    );
    expect(result2.success).toBe(true);
  });

  it('plant_beeper only works in selecting_team phase', async () => {
    const { gameId, players } = setupGameWithPlayers(env.gameService, [
      { name: 'Tracker', character: 'Tracker', team: 'good' },
      { name: 'Seer', character: 'Seer', team: 'good' },
      { name: 'Villager', character: 'Villager', team: 'good' },
      { name: 'Assassin', character: 'Assassin', team: 'evil' },
      { name: 'Minion', character: 'Minion', team: 'evil' },
    ]);

    const tracker = players[0];
    const seer = players[1];
    const assassin = players[3];

    // Should fail in mission_voting phase
    env.gameService.updateGame(gameId, { phase: 'mission_voting' });
    const result1 = await env.actionProcessor.executeAction(
      gameId,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('phase');

    // Should succeed in selecting_team phase
    env.gameService.updateGame(gameId, { phase: 'selecting_team' });
    const result2 = await env.actionProcessor.executeAction(
      gameId,
      tracker.id,
      'plant_beeper',
      [seer.id, assassin.id]
    );
    expect(result2.success).toBe(true);
  });
});
