import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ActionProcessor } from './ActionProcessor';
import { GameService } from './GameService';
import { VoteProcessor } from './VoteProcessor';
import { actionRegistry, ActionRegistry } from '~/registry/ActionRegistry';
import type {
  ActionDefinition,
  ActionId,
  CharacterName,
  Team,
  GameContext,
  ActionResult,
} from '~/types/game';

describe('ActionProcessor', () => {
  let processor: ActionProcessor;
  let gameService: GameService;
  let voteProcessor: VoteProcessor;
  let testRegistry: ActionRegistry;

  beforeEach(() => {
    gameService = new GameService();
    voteProcessor = new VoteProcessor(gameService);
    processor = new ActionProcessor(gameService, voteProcessor);

    // Clear and set up a fresh action registry
    actionRegistry.clear();
    testRegistry = actionRegistry;
  });

  afterEach(() => {
    processor.clear();
    actionRegistry.clear();
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  function createTestAction(
    id: ActionId,
    options: Partial<ActionDefinition> = {}
  ): ActionDefinition {
    return {
      id,
      name: `Test ${id}`,
      description: `Test action for ${id}`,
      phases: options.phases ?? ['mission_voting'],
      maxUses: options.maxUses ?? 1,
      minTargets: options.minTargets ?? 0,
      maxTargets: options.maxTargets ?? 1,
      requiresOnTeam: options.requiresOnTeam ?? false,
      validateTargets:
        options.validateTargets ?? (() => ({ valid: true })),
      execute:
        options.execute ??
        (() => ({ success: true, message: 'Action executed successfully' })),
    };
  }

  function setupGameWithPlayers(
    playerCount: number,
    phase: 'voting_for_leader' | 'selecting_team' | 'mission_voting' | 'assassination' = 'mission_voting'
  ) {
    const game = gameService.createGame('host-1');

    // Add players first (while game is in lobby status)
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const player = gameService.addPlayer(game.id, `user-${i}`, `Player ${i}`);
      // First player: Assassin (evil), second player: Seer (good), others alternate
      let team: Team;
      let character: CharacterName;

      if (i === 0) {
        team = 'evil';
        character = 'Assassin';
      } else if (i === 1) {
        team = 'good';
        character = 'Seer';
      } else if (i === 2) {
        team = 'good';
        character = 'Guardian';
      } else if (i === 3) {
        team = 'evil';
        character = 'Fixer';
      } else if (i === 4) {
        team = 'good';
        character = 'Tracker';
      } else {
        team = i % 2 === 0 ? 'evil' : 'good';
        character = team === 'evil' ? 'Saboteur' : 'Villager';
      }

      gameService.updatePlayer(player.id, {
        team,
        character,
        seat_order: i,
      });
      players.push(gameService.getPlayerById(player.id)!);
    }

    // Update game status after adding players
    gameService.updateGame(game.id, {
      status: 'playing',
      phase,
      current_round: 1,
      crown_index: 0,
    });

    return { game: gameService.getGameById(game.id)!, players };
  }

  function setupMissionGame(playerCount: number) {
    const { game, players } = setupGameWithPlayers(playerCount, 'mission_voting');

    // Set up a team of first 3 players for mission
    const teamIds = players.slice(0, 3).map((p) => p.id);
    gameService.updateGame(game.id, { selected_team: teamIds });

    return {
      game: gameService.getGameById(game.id)!,
      players,
      teamPlayers: players.slice(0, 3),
    };
  }

  // ===========================================================================
  // Handler Registration Tests
  // ===========================================================================

  describe('registerHandler', () => {
    it('registers a handler for an action', () => {
      const handler = vi.fn().mockReturnValue({ success: true, message: 'Done' });
      processor.registerHandler('assassinate', handler);

      expect(processor.getHandler('assassinate')).toBe(handler);
    });

    it('returns undefined for unregistered handler', () => {
      expect(processor.getHandler('assassinate')).toBeUndefined();
    });

    it('overwrites existing handler when re-registering', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      processor.registerHandler('assassinate', handler1);
      processor.registerHandler('assassinate', handler2);

      expect(processor.getHandler('assassinate')).toBe(handler2);
    });
  });

  // ===========================================================================
  // Action Storage Tests
  // ===========================================================================

  describe('recordAction', () => {
    it('records an action with all fields', () => {
      const action = processor.recordAction(
        'game-1',
        'player-1',
        'assassinate',
        1,
        'mission_voting',
        ['target-1']
      );

      expect(action.game_id).toBe('game-1');
      expect(action.player_id).toBe('player-1');
      expect(action.action_type).toBe('assassinate');
      expect(action.round).toBe(1);
      expect(action.phase).toBe('mission_voting');
      expect(action.target_ids).toEqual(['target-1']);
      expect(action.id).toBeDefined();
      expect(action.created_at).toBeDefined();
    });

    it('records action without targets', () => {
      const action = processor.recordAction(
        'game-1',
        'player-1',
        'rig_vote',
        1,
        'mission_voting'
      );

      expect(action.target_ids).toBeNull();
    });
  });

  describe('getActions', () => {
    it('returns all actions for a game', () => {
      processor.recordAction('game-1', 'player-1', 'assassinate', 1, 'mission_voting');
      processor.recordAction('game-1', 'player-2', 'protect', 1, 'mission_voting');
      processor.recordAction('game-2', 'player-3', 'rig_vote', 1, 'mission_voting');

      const actions = processor.getActions('game-1');
      expect(actions).toHaveLength(2);
      expect(actions.every((a) => a.game_id === 'game-1')).toBe(true);
    });

    it('returns empty array for game with no actions', () => {
      const actions = processor.getActions('nonexistent');
      expect(actions).toEqual([]);
    });
  });

  describe('getPlayerActions', () => {
    it('returns actions for specific player in game', () => {
      processor.recordAction('game-1', 'player-1', 'assassinate', 1, 'mission_voting');
      processor.recordAction('game-1', 'player-1', 'vote_yes', 1, 'voting_for_leader');
      processor.recordAction('game-1', 'player-2', 'protect', 1, 'mission_voting');

      const actions = processor.getPlayerActions('game-1', 'player-1');
      expect(actions).toHaveLength(2);
      expect(actions.every((a) => a.player_id === 'player-1')).toBe(true);
    });
  });

  // ===========================================================================
  // Context Building Tests
  // ===========================================================================

  describe('buildContext', () => {
    it('builds context with all required fields', () => {
      const { game, players } = setupMissionGame(5);
      const currentPlayer = players[0];

      const ctx = processor.buildContext(game, players, currentPlayer);

      expect(ctx.game).toBe(game);
      expect(ctx.players).toBe(players);
      expect(ctx.currentPlayer).toBe(currentPlayer);
      expect(ctx.modifiers).toBeDefined();
      expect(ctx.statuses).toBeDefined();
    });

    it('includes modifiers for current round', () => {
      const { game, players } = setupMissionGame(5);
      
      // Add a modifier
      voteProcessor.addModifier(game.id, 1, 'force_pass', players[0].id);

      const ctx = processor.buildContext(game, players, players[0]);

      expect(ctx.modifiers).toHaveLength(1);
      expect(ctx.modifiers[0].modifier_type).toBe('force_pass');
    });

    it('includes statuses for players', () => {
      const { game, players } = setupMissionGame(5);
      
      // Add a status
      voteProcessor.addStatus(game.id, players[1].id, 'protected', players[0].id, 2);

      const ctx = processor.buildContext(game, players, players[0]);

      expect(ctx.statuses).toHaveLength(1);
      expect(ctx.statuses[0].status_type).toBe('protected');
    });
  });

  // ===========================================================================
  // Phase Validation Tests
  // ===========================================================================

  describe('executeAction - phase validation', () => {
    it('rejects action in wrong phase', async () => {
      const { game, players } = setupGameWithPlayers(5, 'voting_for_leader');
      
      // Register action only available in mission_voting
      testRegistry.register(
        createTestAction('assassinate', { phases: ['mission_voting'] })
      );

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[1].id]
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be used in phase');
    });

    it('allows action in correct phase', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('protect', { phases: ['mission_voting'] })
      );

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'protect',
        [players[1].id]
      );

      expect(result.success).toBe(true);
    });

    it('rejects action when game has no phase', async () => {
      const { game, players } = setupGameWithPlayers(5, 'mission_voting');
      
      // Set phase to null
      gameService.updateGame(game.id, { phase: null });

      testRegistry.register(createTestAction('protect'));

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'protect',
        []
      );

      expect(result.success).toBe(false);
    });
  });

  // ===========================================================================
  // Use Limit Enforcement Tests
  // ===========================================================================

  describe('executeAction - use limit enforcement', () => {
    it('allows first use of limited action', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('assassinate', { maxUses: 1, phases: ['mission_voting'] })
      );

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[1].id]
      );

      expect(result.success).toBe(true);
    });

    it('rejects action when use limit exceeded', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('assassinate', { maxUses: 1, phases: ['mission_voting'] })
      );

      // Use the action once
      await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[1].id]
      );

      // Try to use again
      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[2].id]
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('maximum number of times');
    });

    it('tracks uses per player separately', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('protect', { maxUses: 1, phases: ['mission_voting'] })
      );

      // Player 1 uses protect
      await processor.executeAction(
        game.id,
        players[0].id,
        'protect',
        [players[1].id]
      );

      // Player 2 should still be able to use protect
      const result = await processor.executeAction(
        game.id,
        players[2].id,
        'protect',
        [players[1].id]
      );

      expect(result.success).toBe(true);
    });

    it('allows unlimited uses when maxUses is 0', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('protect', { maxUses: 0, phases: ['mission_voting'] })
      );

      // Use multiple times
      for (let i = 0; i < 3; i++) {
        const result = await processor.executeAction(
          game.id,
          players[0].id,
          'protect',
          [players[1].id]
        );
        expect(result.success).toBe(true);
      }
    });
  });

  // ===========================================================================
  // Target Validation Tests
  // ===========================================================================

  describe('executeAction - target validation (count limits)', () => {
    it('rejects when too few targets provided', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('plant_beeper', {
          phases: ['mission_voting'],
          minTargets: 2,
          maxTargets: 2,
        })
      );

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'plant_beeper',
        [players[1].id] // Only 1 target, needs 2
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 2');
    });

    it('rejects when too many targets provided', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('assassinate', {
          phases: ['mission_voting'],
          minTargets: 1,
          maxTargets: 1,
        })
      );

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[1].id, players[2].id] // 2 targets, max is 1
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('at most 1');
    });

    it('accepts correct number of targets', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('plant_beeper', {
          phases: ['mission_voting'],
          minTargets: 2,
          maxTargets: 2,
        })
      );

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'plant_beeper',
        [players[1].id, players[2].id]
      );

      expect(result.success).toBe(true);
    });

    it('rejects when validateTargets returns invalid', async () => {
      const { game, players } = setupMissionGame(5);

      testRegistry.register(
        createTestAction('assassinate', {
          phases: ['mission_voting'],
          validateTargets: () => ({
            valid: false,
            error: 'Cannot target yourself',
          }),
        })
      );

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[0].id]
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot target yourself');
    });
  });

  // ===========================================================================
  // Game/Player Validation Tests
  // ===========================================================================

  describe('executeAction - game/player validation', () => {
    it('rejects when game not found', async () => {
      testRegistry.register(createTestAction('protect'));

      const result = await processor.executeAction(
        'nonexistent-game',
        'player-1',
        'protect',
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    it('rejects when player not found', async () => {
      const { game } = setupMissionGame(5);

      testRegistry.register(createTestAction('protect'));

      const result = await processor.executeAction(
        game.id,
        'nonexistent-player',
        'protect',
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not in game');
    });

    it('rejects when player not in game', async () => {
      const { game: game1 } = setupMissionGame(5);
      const { players: players2 } = setupMissionGame(5);

      testRegistry.register(createTestAction('protect'));

      // Try to use player from game2 in game1
      const result = await processor.executeAction(
        game1.id,
        players2[0].id,
        'protect',
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not in game');
    });

    it('rejects when player is not alive', async () => {
      const { game, players } = setupMissionGame(5);

      // Eliminate the player
      gameService.updatePlayer(players[0].id, { is_alive: false });

      testRegistry.register(createTestAction('protect'));

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'protect',
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Player is not alive');
    });

    it('rejects when action not found in registry', async () => {
      const { game, players } = setupMissionGame(5);

      // Don't register any action
      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        []
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Action "assassinate" not found');
    });
  });

  // ===========================================================================
  // Handler Execution Tests
  // ===========================================================================

  describe('executeAction - handler execution', () => {
    it('calls registered handler after successful action', async () => {
      const { game, players } = setupMissionGame(5);
      const handler = vi.fn().mockReturnValue({ success: true, message: 'Handler done' });

      testRegistry.register(createTestAction('protect'));
      processor.registerHandler('protect', handler);

      await processor.executeAction(game.id, players[0].id, 'protect', [players[1].id]);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.any(Object), // ctx
        [players[1].id],
        processor
      );
    });

    it('does not call handler when action validation fails', async () => {
      const { game, players } = setupMissionGame(5);
      const handler = vi.fn();

      // Register action that requires 2 targets
      testRegistry.register(
        createTestAction('plant_beeper', { minTargets: 2, maxTargets: 2 })
      );
      processor.registerHandler('plant_beeper', handler);

      // Execute with only 1 target
      await processor.executeAction(game.id, players[0].id, 'plant_beeper', [players[1].id]);

      expect(handler).not.toHaveBeenCalled();
    });

    it('uses handler result when gameEnded is set', async () => {
      const { game, players } = setupMissionGame(5);
      const handler = vi.fn().mockReturnValue({
        success: true,
        message: 'Seer assassinated!',
        gameEnded: true,
        winner: 'evil' as Team,
      });

      testRegistry.register(createTestAction('assassinate'));
      processor.registerHandler('assassinate', handler);

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[1].id]
      );

      expect(result.gameEnded).toBe(true);
      expect(result.winner).toBe('evil');
    });

    it('returns action result when handler does not set gameEnded', async () => {
      const { game, players } = setupMissionGame(5);
      const handler = vi.fn().mockReturnValue({ success: true, message: 'Protected' });

      testRegistry.register(
        createTestAction('protect', {
          execute: () => ({ success: true, message: 'Protection applied' }),
        })
      );
      processor.registerHandler('protect', handler);

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'protect',
        [players[1].id]
      );

      // Returns the original action result since handler didn't set gameEnded
      expect(result.message).toBe('Protection applied');
    });

    it('handles async handler', async () => {
      const { game, players } = setupMissionGame(5);
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: true, message: 'Async done', gameEnded: true, winner: 'good' as Team };
      });

      testRegistry.register(createTestAction('protect'));
      processor.registerHandler('protect', handler);

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'protect',
        [players[1].id]
      );

      expect(result.gameEnded).toBe(true);
      expect(result.winner).toBe('good');
    });

    it('handles handler errors gracefully', async () => {
      const { game, players } = setupMissionGame(5);
      const handler = vi.fn().mockImplementation(() => {
        throw new Error('Handler crashed');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      testRegistry.register(createTestAction('protect'));
      processor.registerHandler('protect', handler);

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'protect',
        [players[1].id]
      );

      // Action still succeeds - handler errors don't fail the action
      expect(result.success).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // Protection Blocks Assassination Tests
  // ===========================================================================

  describe('protection blocks assassination', () => {
    it('handler can check protection status via hasStatus', async () => {
      const { game, players } = setupMissionGame(5);

      // Add protected status to player 1
      processor.addStatus(game.id, players[1].id, 'protected', players[2].id, 2);

      // Verify protection exists
      const isProtected = processor.hasStatus(game.id, players[1].id, 'protected');
      expect(isProtected).toBe(true);
    });

    it('hasStatus returns false when no protection', async () => {
      const { game, players } = setupMissionGame(5);

      const isProtected = processor.hasStatus(game.id, players[1].id, 'protected');
      expect(isProtected).toBe(false);
    });

    it('assassination handler can block based on protection', async () => {
      const { game, players } = setupMissionGame(5);

      // Add protected status
      processor.addStatus(game.id, players[1].id, 'protected', players[2].id, 2);

      // Register assassination handler that checks protection
      testRegistry.register(createTestAction('assassinate', { phases: ['assassination'] }));
      processor.registerHandler('assassinate', (ctx, targetIds, proc) => {
        const targetId = targetIds[0];
        if (proc.hasStatus(ctx.game.id, targetId, 'protected')) {
          // gameEnded must be set for handler result to be used
          return { success: true, message: 'Target was protected from assassination', gameEnded: false };
        }
        proc.eliminatePlayer(targetId);
        return { success: true, message: 'Target assassinated', gameEnded: true, winner: 'evil' };
      });

      // Update to assassination phase
      gameService.updateGame(game.id, { phase: 'assassination' });

      const result = await processor.executeAction(
        game.id,
        players[0].id,
        'assassinate',
        [players[1].id]
      );

      // Target should still be alive due to protection
      const target = processor.getPlayer(players[1].id);
      expect(target?.is_alive).toBe(true);
      expect(result.message).toContain('protected');
      expect(result.gameEnded).toBe(false);
    });
  });

  // ===========================================================================
  // Seer Assassination Ends Game for Evil Tests
  // ===========================================================================

  describe('Seer assassination ends game for evil', () => {
    it('assassinating Seer triggers evil victory', async () => {
      const { game, players } = setupGameWithPlayers(5, 'assassination');
      const seer = players.find((p) => p.character === 'Seer')!;
      const assassin = players.find((p) => p.character === 'Assassin')!;

      testRegistry.register(createTestAction('assassinate', { phases: ['assassination'] }));
      processor.registerHandler('assassinate', (ctx, targetIds, proc) => {
        const target = proc.getPlayer(targetIds[0]);
        proc.eliminatePlayer(targetIds[0]);

        if (target?.character === 'Seer') {
          proc.endGame(ctx.game.id, 'evil', 'Seer assassinated');
          return {
            success: true,
            message: 'The Seer has been assassinated!',
            gameEnded: true,
            winner: 'evil',
          };
        }

        // Wrong target means good wins
        proc.endGame(ctx.game.id, 'good', 'Good completed 3 successful missions');
        return {
          success: true,
          message: 'Assassination failed - wrong target!',
          gameEnded: true,
          winner: 'good',
        };
      });

      const result = await processor.executeAction(
        game.id,
        assassin.id,
        'assassinate',
        [seer.id]
      );

      expect(result.success).toBe(true);
      expect(result.gameEnded).toBe(true);
      expect(result.winner).toBe('evil');

      // Verify game state updated
      const updatedGame = processor.getGame(game.id);
      expect(updatedGame?.status).toBe('finished');
      expect(updatedGame?.winner).toBe('evil');
      expect(updatedGame?.end_reason).toBe('Seer assassinated');
    });

    it('assassinating non-Seer triggers good victory', async () => {
      const { game, players } = setupGameWithPlayers(5, 'assassination');
      const guardian = players.find((p) => p.character === 'Guardian')!;
      const assassin = players.find((p) => p.character === 'Assassin')!;

      testRegistry.register(createTestAction('assassinate', { phases: ['assassination'] }));
      processor.registerHandler('assassinate', (ctx, targetIds, proc) => {
        const target = proc.getPlayer(targetIds[0]);
        proc.eliminatePlayer(targetIds[0]);

        if (target?.character === 'Seer') {
          proc.endGame(ctx.game.id, 'evil', 'Seer assassinated');
          return {
            success: true,
            message: 'The Seer has been assassinated!',
            gameEnded: true,
            winner: 'evil',
          };
        }

        proc.endGame(ctx.game.id, 'good', 'Good completed 3 successful missions');
        return {
          success: true,
          message: 'Assassination failed!',
          gameEnded: true,
          winner: 'good',
        };
      });

      const result = await processor.executeAction(
        game.id,
        assassin.id,
        'assassinate',
        [guardian.id]
      );

      expect(result.success).toBe(true);
      expect(result.gameEnded).toBe(true);
      expect(result.winner).toBe('good');
    });
  });

  // ===========================================================================
  // Rigged Votes Force Mission Pass Tests
  // ===========================================================================

  describe('rigged votes force mission pass', () => {
    it('rig_vote handler adds force_pass modifier', async () => {
      const { game, players } = setupMissionGame(5);
      const fixer = players.find((p) => p.character === 'Fixer');
      // If no fixer, use first player
      const player = fixer ?? players[0];

      testRegistry.register(
        createTestAction('rig_vote', {
          phases: ['mission_voting'],
          minTargets: 0,
          maxTargets: 0,
        })
      );
      processor.registerHandler('rig_vote', (ctx, _targetIds, proc) => {
        proc.addModifier(ctx.game.id, ctx.game.current_round, 'force_pass', ctx.currentPlayer!.id);
        return { success: true, message: 'Vote has been rigged' };
      });

      await processor.executeAction(game.id, player.id, 'rig_vote', []);

      // Verify modifier was added
      const modifiers = voteProcessor.getModifiersForRound(game.id, 1);
      expect(modifiers).toHaveLength(1);
      expect(modifiers[0].modifier_type).toBe('force_pass');
    });

    it('force_pass modifier forces mission to pass', async () => {
      const { game, players, teamPlayers } = setupMissionGame(5);

      // Add force_pass modifier
      voteProcessor.addModifier(game.id, 1, 'force_pass', players[0].id);

      // All team members vote fail
      let lastResult;
      for (const p of teamPlayers) {
        // Update player to evil so they can vote fail
        gameService.updatePlayer(p.id, { team: 'evil' });
        lastResult = voteProcessor.submitMissionVote(game.id, p.id, 'fail');
      }

      // Last vote returns the final result
      expect(lastResult?.allVotesIn).toBe(true);
      // force_pass modifier ignores all fail votes - mission passes
      expect(lastResult?.result).toBe('passed');
    });
  });

  // ===========================================================================
  // Beeper Status Created Correctly Tests
  // ===========================================================================

  describe('beeper status created correctly', () => {
    it('plant_beeper handler creates beepered status for targets', async () => {
      const { game, players } = setupGameWithPlayers(5, 'selecting_team');
      const tracker = players.find((p) => p.character === 'Tracker') ?? players[0];
      const goodPlayer = players.find((p) => p.team === 'good' && p.id !== tracker.id)!;
      const evilPlayer = players.find((p) => p.team === 'evil')!;

      testRegistry.register(
        createTestAction('plant_beeper', {
          phases: ['selecting_team'],
          minTargets: 2,
          maxTargets: 2,
          validateTargets: (ctx, targetIds) => {
            const targets = targetIds.map((id) => ctx.players.find((p) => p.id === id));
            const hasGood = targets.some((t) => t?.team === 'good');
            const hasEvil = targets.some((t) => t?.team === 'evil');
            if (!hasGood || !hasEvil) {
              return { valid: false, error: 'Must select one good and one evil player' };
            }
            return { valid: true };
          },
        })
      );
      processor.registerHandler('plant_beeper', (ctx, targetIds, proc) => {
        for (const targetId of targetIds) {
          proc.addStatus(ctx.game.id, targetId, 'beepered', ctx.currentPlayer!.id, null);
        }
        return { success: true, message: 'Beepers planted' };
      });

      await processor.executeAction(
        game.id,
        tracker.id,
        'plant_beeper',
        [goodPlayer.id, evilPlayer.id]
      );

      // Verify both players have beepered status
      expect(processor.hasStatus(game.id, goodPlayer.id, 'beepered')).toBe(true);
      expect(processor.hasStatus(game.id, evilPlayer.id, 'beepered')).toBe(true);
    });

    it('plant_beeper validates 1 good + 1 evil requirement', async () => {
      const { game, players } = setupGameWithPlayers(5, 'selecting_team');
      const tracker = players.find((p) => p.character === 'Tracker') ?? players[0];
      const goodPlayers = players.filter((p) => p.team === 'good');

      testRegistry.register(
        createTestAction('plant_beeper', {
          phases: ['selecting_team'],
          minTargets: 2,
          maxTargets: 2,
          validateTargets: (ctx, targetIds) => {
            const targets = targetIds.map((id) => ctx.players.find((p) => p.id === id));
            const hasGood = targets.some((t) => t?.team === 'good');
            const hasEvil = targets.some((t) => t?.team === 'evil');
            if (!hasGood || !hasEvil) {
              return { valid: false, error: 'Must select one good and one evil player' };
            }
            return { valid: true };
          },
        })
      );

      // Try to beep two good players
      const result = await processor.executeAction(
        game.id,
        tracker.id,
        'plant_beeper',
        [goodPlayers[0].id, goodPlayers[1].id]
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('one good and one evil');
    });
  });

  // ===========================================================================
  // Sabotage Adds Extra Fail Vote Tests
  // ===========================================================================

  describe('sabotage adds extra fail vote', () => {
    it('sabotage handler adds extra_fail modifier', async () => {
      const { game, players, teamPlayers } = setupMissionGame(5);
      // Find an evil player on the team
      const saboteur = teamPlayers.find((p) => p.team === 'evil') ?? teamPlayers[0];

      testRegistry.register(
        createTestAction('sabotage', {
          phases: ['mission_voting'],
          minTargets: 0,
          maxTargets: 0,
          requiresOnTeam: true,
        })
      );
      processor.registerHandler('sabotage', (ctx, _targetIds, proc) => {
        proc.addModifier(ctx.game.id, ctx.game.current_round, 'extra_fail', ctx.currentPlayer!.id);
        return { success: true, message: 'Sabotage planted' };
      });

      // Update game to have the saboteur on team
      gameService.updateGame(game.id, {
        selected_team: [...(gameService.getGameById(game.id)?.selected_team ?? []), saboteur.id],
      });

      await processor.executeAction(game.id, saboteur.id, 'sabotage', []);

      // Verify modifier was added
      const modifiers = voteProcessor.getModifiersForRound(game.id, 1);
      const extraFailMod = modifiers.find((m) => m.modifier_type === 'extra_fail');
      expect(extraFailMod).toBeDefined();
    });

    it('extra_fail modifier adds one fail vote to tally', async () => {
      const { game, players, teamPlayers } = setupMissionGame(5);

      // Add extra_fail modifier
      voteProcessor.addModifier(game.id, 1, 'extra_fail', players[0].id);

      // All team members vote pass (everyone is good in this test)
      let lastResult;
      for (const p of teamPlayers) {
        lastResult = voteProcessor.submitMissionVote(game.id, p.id, 'pass');
      }

      // Last vote returns the final result
      expect(lastResult?.allVotesIn).toBe(true);
      // 0 natural fails + 1 from modifier = 1 fail, mission fails
      expect(lastResult?.result).toBe('failed');
    });

    it('sabotage requires being on team', async () => {
      const { game, players } = setupMissionGame(5);
      // Pick a player NOT on the team
      const nonTeamPlayer = players.find(
        (p) => !gameService.getGameById(game.id)?.selected_team?.includes(p.id)
      )!;

      testRegistry.register(
        createTestAction('sabotage', {
          phases: ['mission_voting'],
          requiresOnTeam: true,
        })
      );

      const result = await processor.executeAction(game.id, nonTeamPlayer.id, 'sabotage', []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('requires being on the mission team');
    });
  });

  // ===========================================================================
  // Helper Method Tests
  // ===========================================================================

  describe('helper methods', () => {
    describe('eliminatePlayer', () => {
      it('sets player is_alive to false', () => {
        const { players } = setupMissionGame(5);

        const result = processor.eliminatePlayer(players[0].id);

        expect(result?.is_alive).toBe(false);
      });

      it('returns null for non-existent player', () => {
        const result = processor.eliminatePlayer('nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('addModifier', () => {
      it('adds modifier via voteProcessor', () => {
        const { game, players } = setupMissionGame(5);

        processor.addModifier(game.id, 1, 'force_pass', players[0].id);

        const modifiers = voteProcessor.getModifiersForRound(game.id, 1);
        expect(modifiers).toHaveLength(1);
      });
    });

    describe('addStatus', () => {
      it('adds status via voteProcessor', () => {
        const { game, players } = setupMissionGame(5);

        processor.addStatus(game.id, players[1].id, 'protected', players[0].id, 2);

        const hasStatus = processor.hasStatus(game.id, players[1].id, 'protected');
        expect(hasStatus).toBe(true);
      });
    });

    describe('endGame', () => {
      it('updates game to finished state', () => {
        const { game } = setupMissionGame(5);

        processor.endGame(game.id, 'good', 'Good completed 3 successful missions');

        const updatedGame = processor.getGame(game.id);
        expect(updatedGame?.status).toBe('finished');
        expect(updatedGame?.winner).toBe('good');
        expect(updatedGame?.end_reason).toBe('Good completed 3 successful missions');
        expect(updatedGame?.phase).toBeNull();
      });
    });

    describe('getPlayer', () => {
      it('returns player by ID', () => {
        const { players } = setupMissionGame(5);

        const player = processor.getPlayer(players[0].id);

        expect(player?.id).toBe(players[0].id);
      });
    });

    describe('getPlayers', () => {
      it('returns all players in game', () => {
        const { game } = setupMissionGame(5);

        const players = processor.getPlayers(game.id);

        expect(players).toHaveLength(5);
      });
    });

    describe('getGame', () => {
      it('returns game by ID', () => {
        const { game } = setupMissionGame(5);

        const result = processor.getGame(game.id);

        expect(result?.id).toBe(game.id);
      });
    });
  });

  // ===========================================================================
  // Clear Tests
  // ===========================================================================

  describe('clear', () => {
    it('clears all actions', () => {
      processor.recordAction('game-1', 'player-1', 'protect', 1, 'mission_voting');

      processor.clear();

      expect(processor.getActions('game-1')).toHaveLength(0);
    });

    it('clears all handlers', () => {
      processor.registerHandler('protect', vi.fn());

      processor.clear();

      expect(processor.getHandler('protect')).toBeUndefined();
    });
  });
});
