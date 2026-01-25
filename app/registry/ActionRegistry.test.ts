import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionRegistry, countActionUses, getUsedActionIds } from './ActionRegistry';
import type {
  ActionDefinition,
  ActionId,
  GameContext,
  Game,
  Player,
  GameAction,
} from '../types/game';

/**
 * Helper to create a minimal Game object for testing.
 */
function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    game_key: 'ABC123',
    host_id: 'host-1',
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

/**
 * Helper to create a minimal Player object for testing.
 */
function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    game_id: 'game-1',
    user_id: 'user-1',
    display_name: 'Test Player',
    character: 'Assassin',
    team: 'evil',
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create a minimal GameContext for testing.
 */
function createTestContext(overrides: Partial<GameContext> = {}): GameContext {
  return {
    game: createTestGame(),
    players: [createTestPlayer()],
    currentPlayer: createTestPlayer(),
    modifiers: [],
    statuses: [],
    ...overrides,
  };
}

/**
 * Helper to create a mock ActionDefinition for testing.
 */
function createTestAction(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: 'assassinate',
    name: 'Assassinate',
    description: 'Eliminate a target player',
    phases: ['mission_voting', 'assassination'],
    maxUses: 1,
    requiresOnTeam: false,
    minTargets: 1,
    maxTargets: 1,
    validateTargets: () => ({ valid: true }),
    execute: () => ({ success: true, message: 'Action executed' }),
    ...overrides,
  };
}

describe('ActionRegistry', () => {
  let registry: ActionRegistry;

  beforeEach(() => {
    registry = new ActionRegistry();
  });

  describe('register', () => {
    it('should add action to registry', () => {
      const action = createTestAction();
      registry.register(action);

      expect(registry.get('assassinate')).toBe(action);
    });

    it('should allow registering multiple actions', () => {
      const action1 = createTestAction({ id: 'assassinate' });
      const action2 = createTestAction({ id: 'rig_vote', name: 'Rig Vote' });

      registry.register(action1);
      registry.register(action2);

      expect(registry.get('assassinate')).toBe(action1);
      expect(registry.get('rig_vote')).toBe(action2);
    });

    it('should overwrite existing action with same ID', () => {
      const action1 = createTestAction({ name: 'Original' });
      const action2 = createTestAction({ name: 'Updated' });

      registry.register(action1);
      registry.register(action2);

      expect(registry.get('assassinate')?.name).toBe('Updated');
    });
  });

  describe('get', () => {
    it('should return correct action by ID', () => {
      const action = createTestAction({ id: 'protect' });
      registry.register(action);

      const result = registry.get('protect');
      expect(result).toBe(action);
      expect(result?.id).toBe('protect');
    });

    it('should return undefined for non-existent action', () => {
      expect(registry.get('assassinate')).toBeUndefined();
      expect(registry.get('non_existent' as any)).toBeUndefined();
    });

    it('should return correct action when multiple are registered', () => {
      const actions = [
        createTestAction({ id: 'assassinate' }),
        createTestAction({ id: 'rig_vote' }),
        createTestAction({ id: 'protect' }),
      ];
      actions.forEach((a) => registry.register(a));

      expect(registry.get('rig_vote')).toBe(actions[1]);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no actions registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered actions', () => {
      const actions = [
        createTestAction({ id: 'assassinate' }),
        createTestAction({ id: 'rig_vote' }),
        createTestAction({ id: 'protect' }),
      ];
      actions.forEach((a) => registry.register(a));

      const result = registry.getAll();
      expect(result).toHaveLength(3);
      expect(result).toContain(actions[0]);
      expect(result).toContain(actions[1]);
      expect(result).toContain(actions[2]);
    });
  });

  describe('getAvailableActions', () => {
    beforeEach(() => {
      registry.register(
        createTestAction({
          id: 'assassinate',
          phases: ['mission_voting', 'assassination'],
          maxUses: 1,
        })
      );
      registry.register(
        createTestAction({
          id: 'rig_vote',
          phases: ['mission_voting'],
          maxUses: 1,
        })
      );
      registry.register(
        createTestAction({
          id: 'protect',
          phases: ['mission_voting'],
          maxUses: 1,
        })
      );
      registry.register(
        createTestAction({
          id: 'sabotage',
          phases: ['mission_voting'],
          maxUses: 1,
          requiresOnTeam: true,
        })
      );
    });

    it('should filter by current phase', () => {
      const ctx = createTestContext({
        game: createTestGame({ phase: 'assassination' }),
      });

      const result = registry.getAvailableActions(ctx, [
        'assassinate',
        'rig_vote',
        'protect',
      ]);

      // Only assassinate is available in assassination phase
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('assassinate');
    });

    it('should filter by character actions list', () => {
      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      // Character only has assassinate, not rig_vote or protect
      const result = registry.getAvailableActions(ctx, ['assassinate']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('assassinate');
    });

    it('should exclude actions not in character action list', () => {
      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      // Character has protect but not assassinate
      const result = registry.getAvailableActions(ctx, ['protect']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('protect');
    });

    it('should exclude used one-time actions', () => {
      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      // assassinate already used once
      const usedActionIds: ActionId[] = ['assassinate'];
      const result = registry.getAvailableActions(
        ctx,
        ['assassinate', 'rig_vote'],
        usedActionIds
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('rig_vote');
    });

    it('should allow actions that have remaining uses', () => {
      registry.register(
        createTestAction({
          id: 'plant_beeper',
          phases: ['selecting_team'],
          maxUses: 2,
        })
      );

      const ctx = createTestContext({
        game: createTestGame({ phase: 'selecting_team' }),
      });

      // Used once, but maxUses is 2
      const usedActionIds: ActionId[] = ['plant_beeper'];
      const result = registry.getAvailableActions(
        ctx,
        ['plant_beeper'],
        usedActionIds
      );

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('plant_beeper');
    });

    it('should exclude actions when use limit reached', () => {
      registry.register(
        createTestAction({
          id: 'plant_beeper',
          phases: ['selecting_team'],
          maxUses: 2,
        })
      );

      const ctx = createTestContext({
        game: createTestGame({ phase: 'selecting_team' }),
      });

      // Used twice, maxUses is 2
      const usedActionIds: ActionId[] = ['plant_beeper', 'plant_beeper'];
      const result = registry.getAvailableActions(
        ctx,
        ['plant_beeper'],
        usedActionIds
      );

      expect(result).toHaveLength(0);
    });

    it('should return empty array when phase is null', () => {
      const ctx = createTestContext({
        game: createTestGame({ phase: null }),
      });

      const result = registry.getAvailableActions(ctx, ['assassinate']);
      expect(result).toEqual([]);
    });

    it('should exclude actions requiring team membership when not on team', () => {
      const ctx = createTestContext({
        game: createTestGame({
          phase: 'mission_voting',
          selected_team: ['player-2', 'player-3'],
        }),
        currentPlayer: createTestPlayer({ id: 'player-1' }),
      });

      // sabotage requires being on team
      const result = registry.getAvailableActions(ctx, ['sabotage']);
      expect(result).toHaveLength(0);
    });

    it('should include actions requiring team membership when on team', () => {
      const ctx = createTestContext({
        game: createTestGame({
          phase: 'mission_voting',
          selected_team: ['player-1', 'player-2'],
        }),
        currentPlayer: createTestPlayer({ id: 'player-1' }),
      });

      const result = registry.getAvailableActions(ctx, ['sabotage']);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sabotage');
    });

    it('should handle unknown action IDs gracefully', () => {
      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = registry.getAvailableActions(ctx, [
        'unknown_action' as any,
        'assassinate',
      ]);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('assassinate');
    });
  });

  describe('checkConditions', () => {
    it('should validate phase requirements', () => {
      const action = createTestAction({
        phases: ['assassination'],
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = registry.checkConditions(action, ctx);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be used in phase');
    });

    it('should pass when action is valid for current phase', () => {
      const action = createTestAction({
        phases: ['mission_voting'],
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = registry.checkConditions(action, ctx);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate use limits', () => {
      const action = createTestAction({
        phases: ['mission_voting'],
        maxUses: 1,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = registry.checkConditions(action, ctx, ['assassinate']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('maximum number of times');
    });

    it('should pass when use limit not reached', () => {
      const action = createTestAction({
        phases: ['mission_voting'],
        maxUses: 2,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = registry.checkConditions(action, ctx, ['assassinate']);
      expect(result.valid).toBe(true);
    });

    it('should validate team requirements', () => {
      const action = createTestAction({
        phases: ['mission_voting'],
        requiresOnTeam: true,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({
          phase: 'mission_voting',
          selected_team: ['player-2'],
        }),
        currentPlayer: createTestPlayer({ id: 'player-1' }),
      });

      const result = registry.checkConditions(action, ctx);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('requires being on the mission team');
    });

    it('should fail when phase is null', () => {
      const action = createTestAction({
        phases: ['mission_voting'],
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: null }),
      });

      const result = registry.checkConditions(action, ctx);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be used in phase');
    });
  });

  describe('execute', () => {
    it('should call handler with correct parameters', async () => {
      const executeMock = vi.fn().mockReturnValue({
        success: true,
        message: 'Target eliminated',
      });

      const action = createTestAction({
        execute: executeMock,
        minTargets: 1,
        maxTargets: 1,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });
      const targetIds = ['target-player-1'];

      await registry.execute('assassinate', ctx, targetIds);

      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledWith(ctx, targetIds);
    });

    it('should return action result on success', async () => {
      const action = createTestAction({
        execute: () => ({
          success: true,
          message: 'Target eliminated',
          gameEnded: true,
          winner: 'evil',
        }),
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = await registry.execute('assassinate', ctx, ['target-1']);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Target eliminated');
      expect(result.gameEnded).toBe(true);
      expect(result.winner).toBe('evil');
    });

    it('should return error for non-existent action', async () => {
      const ctx = createTestContext();

      const result = await registry.execute('non_existent' as any, ctx, []);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should validate conditions before executing', async () => {
      const executeMock = vi.fn();
      const action = createTestAction({
        phases: ['assassination'],
        execute: executeMock,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = await registry.execute('assassinate', ctx, ['target-1']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be used in phase');
      expect(executeMock).not.toHaveBeenCalled();
    });

    it('should validate minimum target count', async () => {
      const action = createTestAction({
        minTargets: 2,
        maxTargets: 2,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = await registry.execute('assassinate', ctx, ['target-1']);

      expect(result.success).toBe(false);
      expect(result.error).toContain('at least 2 target');
    });

    it('should validate maximum target count', async () => {
      const action = createTestAction({
        minTargets: 1,
        maxTargets: 1,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = await registry.execute('assassinate', ctx, [
        'target-1',
        'target-2',
      ]);

      expect(result.success).toBe(false);
      expect(result.error).toContain('at most 1 target');
    });

    it('should call validateTargets and reject invalid targets', async () => {
      const action = createTestAction({
        validateTargets: () => ({
          valid: false,
          error: 'Cannot target self',
        }),
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = await registry.execute('assassinate', ctx, ['target-1']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot target self');
    });

    it('should handle async execute functions', async () => {
      const action = createTestAction({
        execute: async () => {
          return { success: true, message: 'Async action completed' };
        },
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = await registry.execute('assassinate', ctx, ['target-1']);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Async action completed');
    });

    it('should catch and return errors thrown by execute', async () => {
      const action = createTestAction({
        execute: () => {
          throw new Error('Execution error');
        },
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      const result = await registry.execute('assassinate', ctx, ['target-1']);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution error');
    });

    it('should respect use limits when executing', async () => {
      const executeMock = vi.fn().mockReturnValue({
        success: true,
        message: 'Done',
      });
      const action = createTestAction({
        maxUses: 1,
        execute: executeMock,
      });
      registry.register(action);

      const ctx = createTestContext({
        game: createTestGame({ phase: 'mission_voting' }),
      });

      // First execution should succeed
      const result1 = await registry.execute('assassinate', ctx, ['target-1']);
      expect(result1.success).toBe(true);

      // Second execution with used action IDs should fail
      const result2 = await registry.execute('assassinate', ctx, ['target-1'], [
        'assassinate',
      ]);
      expect(result2.success).toBe(false);
      expect(executeMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all registered actions', () => {
      registry.register(createTestAction({ id: 'assassinate' }));
      registry.register(createTestAction({ id: 'rig_vote' }));

      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(registry.get('assassinate')).toBeUndefined();
    });
  });
});

describe('Helper Functions', () => {
  describe('countActionUses', () => {
    it('should count how many times an action was used', () => {
      const gameActions: GameAction[] = [
        {
          id: '1',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'assassinate',
          target_ids: ['target-1'],
          round: 1,
          phase: 'assassination',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'vote_yes',
          target_ids: null,
          round: 1,
          phase: 'voting_for_leader',
          created_at: new Date().toISOString(),
        },
        {
          id: '3',
          game_id: 'game-1',
          player_id: 'player-2',
          action_type: 'assassinate',
          target_ids: ['target-2'],
          round: 2,
          phase: 'assassination',
          created_at: new Date().toISOString(),
        },
      ];

      expect(countActionUses('assassinate', gameActions)).toBe(2);
      // vote_yes is ActionType not ActionId, so we just check special actions
      expect(countActionUses('rig_vote', gameActions)).toBe(0);
      expect(countActionUses('protect', gameActions)).toBe(0);
    });

    it('should return 0 for empty action list', () => {
      expect(countActionUses('assassinate', [])).toBe(0);
    });
  });

  describe('getUsedActionIds', () => {
    it('should return action IDs used by a specific player', () => {
      const gameActions: GameAction[] = [
        {
          id: '1',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'assassinate',
          target_ids: ['target-1'],
          round: 1,
          phase: 'assassination',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'vote_yes',
          target_ids: null,
          round: 1,
          phase: 'voting_for_leader',
          created_at: new Date().toISOString(),
        },
        {
          id: '3',
          game_id: 'game-1',
          player_id: 'player-2',
          action_type: 'rig_vote',
          target_ids: null,
          round: 1,
          phase: 'mission_voting',
          created_at: new Date().toISOString(),
        },
      ];

      const result = getUsedActionIds('player-1', gameActions);

      // Should only include special actions (assassinate), not vote_yes
      expect(result).toEqual(['assassinate']);
    });

    it('should filter out non-special action types', () => {
      const gameActions: GameAction[] = [
        {
          id: '1',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'vote_yes',
          target_ids: null,
          round: 1,
          phase: 'voting_for_leader',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'select_team',
          target_ids: ['player-2', 'player-3'],
          round: 1,
          phase: 'selecting_team',
          created_at: new Date().toISOString(),
        },
      ];

      const result = getUsedActionIds('player-1', gameActions);
      expect(result).toEqual([]);
    });

    it('should return empty array for player with no actions', () => {
      const gameActions: GameAction[] = [
        {
          id: '1',
          game_id: 'game-1',
          player_id: 'player-2',
          action_type: 'assassinate',
          target_ids: ['target-1'],
          round: 1,
          phase: 'assassination',
          created_at: new Date().toISOString(),
        },
      ];

      const result = getUsedActionIds('player-1', gameActions);
      expect(result).toEqual([]);
    });

    it('should return all special actions used by player', () => {
      const gameActions: GameAction[] = [
        {
          id: '1',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'assassinate',
          target_ids: ['target-1'],
          round: 1,
          phase: 'assassination',
          created_at: new Date().toISOString(),
        },
        {
          id: '2',
          game_id: 'game-1',
          player_id: 'player-1',
          action_type: 'protect',
          target_ids: ['target-2'],
          round: 1,
          phase: 'mission_voting',
          created_at: new Date().toISOString(),
        },
      ];

      const result = getUsedActionIds('player-1', gameActions);
      expect(result).toEqual(['assassinate', 'protect']);
    });
  });
});
