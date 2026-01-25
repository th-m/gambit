import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EffectRegistry } from './EffectRegistry';
import type {
  EffectDefinition,
  EffectId,
  GameContext,
  Game,
  Player,
  GameEventType,
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
    character: 'Seer',
    team: 'good',
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
 * Helper to create a mock EffectDefinition for testing.
 */
function createTestEffect(overrides: Partial<EffectDefinition> = {}): EffectDefinition {
  return {
    id: 'appears_as_seer',
    name: 'Appears as Seer',
    description: 'This character appears as a Seer candidate to the Oracle',
    hooks: {},
    modifiers: [
      {
        type: 'appears_as_seer',
        description: 'Oracle sees this character as potential Seer',
      },
    ],
    ...overrides,
  };
}

describe('EffectRegistry', () => {
  let registry: EffectRegistry;

  beforeEach(() => {
    registry = new EffectRegistry();
  });

  describe('register', () => {
    it('should add effect to registry', () => {
      const effect = createTestEffect();
      registry.register(effect);

      expect(registry.get('appears_as_seer')).toBe(effect);
    });

    it('should allow registering multiple effects', () => {
      const effect1 = createTestEffect({ id: 'appears_as_seer' });
      const effect2 = createTestEffect({
        id: 'appears_as_good',
        name: 'Appears as Good',
        modifiers: [{ type: 'appears_as_good', description: 'Seer does not see this character as evil' }],
      });

      registry.register(effect1);
      registry.register(effect2);

      expect(registry.get('appears_as_seer')).toBe(effect1);
      expect(registry.get('appears_as_good')).toBe(effect2);
    });

    it('should overwrite existing effect with same ID', () => {
      const effect1 = createTestEffect({ name: 'Original' });
      const effect2 = createTestEffect({ name: 'Updated' });

      registry.register(effect1);
      registry.register(effect2);

      expect(registry.get('appears_as_seer')?.name).toBe('Updated');
    });
  });

  describe('get', () => {
    it('should return correct effect by ID', () => {
      const effect = createTestEffect({ id: 'appears_as_good' });
      registry.register(effect);

      const result = registry.get('appears_as_good');
      expect(result).toBe(effect);
      expect(result?.id).toBe('appears_as_good');
    });

    it('should return undefined for non-existent effect', () => {
      expect(registry.get('appears_as_seer')).toBeUndefined();
      expect(registry.get('non_existent' as EffectId)).toBeUndefined();
    });

    it('should return correct effect when multiple are registered', () => {
      const effects = [
        createTestEffect({ id: 'appears_as_seer' }),
        createTestEffect({ id: 'appears_as_good' }),
      ];
      effects.forEach((e) => registry.register(e));

      expect(registry.get('appears_as_good')).toBe(effects[1]);
    });
  });

  describe('getAll', () => {
    it('should return empty array when no effects registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered effects', () => {
      const effects = [
        createTestEffect({ id: 'appears_as_seer' }),
        createTestEffect({ id: 'appears_as_good' }),
      ];
      effects.forEach((e) => registry.register(e));

      const result = registry.getAll();
      expect(result).toHaveLength(2);
      expect(result).toContain(effects[0]);
      expect(result).toContain(effects[1]);
    });
  });

  describe('getModifiers', () => {
    it('should return correct modifiers for effect', () => {
      const effect = createTestEffect({
        modifiers: [
          { type: 'appears_as_seer', description: 'Appears as Seer' },
        ],
      });
      registry.register(effect);

      const modifiers = registry.getModifiers('appears_as_seer');
      expect(modifiers).toHaveLength(1);
      expect(modifiers[0].type).toBe('appears_as_seer');
    });

    it('should return empty array for non-existent effect', () => {
      const modifiers = registry.getModifiers('appears_as_good');
      expect(modifiers).toEqual([]);
    });

    it('should return empty array for effect with no modifiers', () => {
      const effect = createTestEffect({ modifiers: [] });
      registry.register(effect);

      const modifiers = registry.getModifiers('appears_as_seer');
      expect(modifiers).toEqual([]);
    });

    it('should return multiple modifiers if effect has them', () => {
      const effect = createTestEffect({
        modifiers: [
          { type: 'appears_as_seer', description: 'First modifier' },
          { type: 'appears_as_good', description: 'Second modifier' },
        ],
      });
      registry.register(effect);

      const modifiers = registry.getModifiers('appears_as_seer');
      expect(modifiers).toHaveLength(2);
    });
  });

  describe('getAllModifiers', () => {
    it('should return modifiers for all active effects', () => {
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          modifiers: [{ type: 'appears_as_seer', description: 'Phantom effect' }],
        })
      );
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          modifiers: [{ type: 'appears_as_good', description: 'Saboteur effect' }],
        })
      );

      const activeEffects: EffectId[] = ['appears_as_seer', 'appears_as_good'];
      const modifiers = registry.getAllModifiers(activeEffects);

      expect(modifiers).toHaveLength(2);
      expect(modifiers.some((m) => m.type === 'appears_as_seer')).toBe(true);
      expect(modifiers.some((m) => m.type === 'appears_as_good')).toBe(true);
    });

    it('should return empty array when no active effects', () => {
      registry.register(createTestEffect());

      const modifiers = registry.getAllModifiers([]);
      expect(modifiers).toEqual([]);
    });

    it('should handle missing effects gracefully', () => {
      registry.register(createTestEffect({ id: 'appears_as_seer' }));

      // 'appears_as_good' not registered
      const activeEffects: EffectId[] = ['appears_as_seer', 'appears_as_good'];
      const modifiers = registry.getAllModifiers(activeEffects);

      expect(modifiers).toHaveLength(1);
      expect(modifiers[0].type).toBe('appears_as_seer');
    });
  });

  describe('hasModifier', () => {
    beforeEach(() => {
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          modifiers: [{ type: 'appears_as_seer', description: 'Phantom effect' }],
        })
      );
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          modifiers: [{ type: 'appears_as_good', description: 'Saboteur effect' }],
        })
      );
    });

    it('should return true if active effects include modifier type', () => {
      const activeEffects: EffectId[] = ['appears_as_seer'];
      expect(registry.hasModifier(activeEffects, 'appears_as_seer')).toBe(true);
    });

    it('should return false if modifier type not in active effects', () => {
      const activeEffects: EffectId[] = ['appears_as_seer'];
      expect(registry.hasModifier(activeEffects, 'appears_as_good')).toBe(false);
    });

    it('should return false for empty active effects', () => {
      expect(registry.hasModifier([], 'appears_as_seer')).toBe(false);
    });

    it('should return true when multiple effects have the modifier', () => {
      // Add another effect with same modifier type
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          modifiers: [
            { type: 'appears_as_good', description: 'First' },
            { type: 'appears_as_seer', description: 'Also appears as seer' },
          ],
        })
      );

      const activeEffects: EffectId[] = ['appears_as_good'];
      expect(registry.hasModifier(activeEffects, 'appears_as_seer')).toBe(true);
    });
  });

  describe('triggerHooks', () => {
    it('should call appropriate handlers for event', async () => {
      const hookMock = vi.fn();
      const effect = createTestEffect({
        hooks: {
          round_start: hookMock,
        },
      });
      registry.register(effect);

      const ctx = createTestContext();
      const activeEffects: EffectId[] = ['appears_as_seer'];

      await registry.triggerHooks('round_start', ctx, activeEffects);

      expect(hookMock).toHaveBeenCalledTimes(1);
      expect(hookMock).toHaveBeenCalledWith(ctx, {});
    });

    it('should pass event data to handlers', async () => {
      const hookMock = vi.fn();
      const effect = createTestEffect({
        hooks: {
          mission_success: hookMock,
        },
      });
      registry.register(effect);

      const ctx = createTestContext();
      const eventData = { round: 1, passVotes: 3, failVotes: 0 };

      await registry.triggerHooks('mission_success', ctx, ['appears_as_seer'], eventData);

      expect(hookMock).toHaveBeenCalledWith(ctx, eventData);
    });

    it('should not call handlers for different events', async () => {
      const roundStartMock = vi.fn();
      const roundEndMock = vi.fn();
      const effect = createTestEffect({
        hooks: {
          round_start: roundStartMock,
          round_end: roundEndMock,
        },
      });
      registry.register(effect);

      const ctx = createTestContext();
      await registry.triggerHooks('round_start', ctx, ['appears_as_seer']);

      expect(roundStartMock).toHaveBeenCalledTimes(1);
      expect(roundEndMock).not.toHaveBeenCalled();
    });

    it('should not call handlers for inactive effects', async () => {
      const hookMock = vi.fn();
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { round_start: hookMock },
        })
      );
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          hooks: { round_start: vi.fn() },
        })
      );

      const ctx = createTestContext();
      // Only appears_as_seer is active
      await registry.triggerHooks('round_start', ctx, ['appears_as_seer']);

      expect(hookMock).toHaveBeenCalledTimes(1);
    });

    it('should call multiple handlers for same event', async () => {
      const hookMock1 = vi.fn();
      const hookMock2 = vi.fn();

      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { game_start: hookMock1 },
        })
      );
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          hooks: { game_start: hookMock2 },
        })
      );

      const ctx = createTestContext();
      await registry.triggerHooks('game_start', ctx, ['appears_as_seer', 'appears_as_good']);

      expect(hookMock1).toHaveBeenCalledTimes(1);
      expect(hookMock2).toHaveBeenCalledTimes(1);
    });

    it('should handle async hooks correctly', async () => {
      const asyncHookMock = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const effect = createTestEffect({
        hooks: {
          round_end: asyncHookMock,
        },
      });
      registry.register(effect);

      const ctx = createTestContext();
      await registry.triggerHooks('round_end', ctx, ['appears_as_seer']);

      expect(asyncHookMock).toHaveBeenCalledTimes(1);
    });

    it('should wait for all async hooks to complete', async () => {
      const order: number[] = [];

      const asyncHook1 = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push(1);
      });
      const asyncHook2 = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(2);
      });

      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { phase_change: asyncHook1 },
        })
      );
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          hooks: { phase_change: asyncHook2 },
        })
      );

      const ctx = createTestContext();
      await registry.triggerHooks('phase_change', ctx, ['appears_as_seer', 'appears_as_good']);

      // Both should have completed
      expect(order).toContain(1);
      expect(order).toContain(2);
    });

    it('should handle effects with no hook for event', async () => {
      const hookMock = vi.fn();
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { round_start: hookMock },
        })
      );

      const ctx = createTestContext();
      // Trigger an event the effect doesn't have a hook for
      await registry.triggerHooks('mission_fail', ctx, ['appears_as_seer']);

      expect(hookMock).not.toHaveBeenCalled();
    });

    it('should handle missing effects gracefully', async () => {
      const hookMock = vi.fn();
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { round_start: hookMock },
        })
      );

      const ctx = createTestContext();
      // Include non-existent effect in active effects
      await registry.triggerHooks('round_start', ctx, ['appears_as_seer', 'appears_as_good']);

      // Should still call the hook for the existing effect
      expect(hookMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('getEffectsWithHook', () => {
    it('should return effects that have handler for event', () => {
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { round_start: vi.fn() },
        })
      );
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          hooks: { round_end: vi.fn() },
        })
      );

      const activeEffects: EffectId[] = ['appears_as_seer', 'appears_as_good'];
      const result = registry.getEffectsWithHook('round_start', activeEffects);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('appears_as_seer');
    });

    it('should return empty array when no effects have hook', () => {
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { round_start: vi.fn() },
        })
      );

      const result = registry.getEffectsWithHook('mission_fail', ['appears_as_seer']);
      expect(result).toEqual([]);
    });

    it('should filter by active effects', () => {
      registry.register(
        createTestEffect({
          id: 'appears_as_seer',
          hooks: { round_start: vi.fn() },
        })
      );
      registry.register(
        createTestEffect({
          id: 'appears_as_good',
          hooks: { round_start: vi.fn() },
        })
      );

      // Only appears_as_seer is active
      const result = registry.getEffectsWithHook('round_start', ['appears_as_seer']);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('appears_as_seer');
    });
  });

  describe('clear', () => {
    it('should remove all registered effects', () => {
      registry.register(createTestEffect({ id: 'appears_as_seer' }));
      registry.register(createTestEffect({ id: 'appears_as_good' }));

      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(registry.get('appears_as_seer')).toBeUndefined();
    });
  });

  describe('Perception Effect Tests', () => {
    /**
     * Test that appears_as_seer effect modifies Oracle perception.
     * Oracle sees Phantom as a Seer candidate.
     */
    describe('appears_as_seer effect (Phantom)', () => {
      it('should have appears_as_seer modifier for Oracle perception', () => {
        const phantomEffect = createTestEffect({
          id: 'appears_as_seer',
          name: 'Appears as Seer',
          description: 'Phantom appears as a Seer candidate to the Oracle',
          modifiers: [
            {
              type: 'appears_as_seer',
              description: 'Oracle sees this character as potential Seer',
            },
          ],
        });
        registry.register(phantomEffect);

        const modifiers = registry.getModifiers('appears_as_seer');
        expect(modifiers).toHaveLength(1);
        expect(modifiers[0].type).toBe('appears_as_seer');
      });

      it('should indicate Phantom appears as Seer to Oracle via hasModifier', () => {
        registry.register(
          createTestEffect({
            id: 'appears_as_seer',
            modifiers: [{ type: 'appears_as_seer', description: 'Oracle perception' }],
          })
        );

        // Phantom has appears_as_seer effect active
        const phantomEffects: EffectId[] = ['appears_as_seer'];

        // Oracle should see Phantom as potential Seer
        expect(registry.hasModifier(phantomEffects, 'appears_as_seer')).toBe(true);
        // Seer should NOT be affected by this
        expect(registry.hasModifier(phantomEffects, 'appears_as_good')).toBe(false);
      });

      it('should not affect actual Seer perception (Seer sees evil normally)', () => {
        registry.register(
          createTestEffect({
            id: 'appears_as_seer',
            modifiers: [{ type: 'appears_as_seer', description: 'Oracle perception only' }],
          })
        );

        // Phantom's appears_as_seer effect does NOT include appears_as_good
        const phantomEffects: EffectId[] = ['appears_as_seer'];

        // Seer's perception of evil is NOT affected by appears_as_seer
        expect(registry.hasModifier(phantomEffects, 'appears_as_good')).toBe(false);
      });
    });

    /**
     * Test that appears_as_good effect modifies Seer perception.
     * Seer does not see Saboteur in the evil list.
     */
    describe('appears_as_good effect (Saboteur)', () => {
      it('should have appears_as_good modifier for Seer perception', () => {
        const saboteurEffect = createTestEffect({
          id: 'appears_as_good',
          name: 'Appears as Good',
          description: 'Saboteur appears as good to the Seer',
          modifiers: [
            {
              type: 'appears_as_good',
              description: 'Seer does not see this character as evil',
            },
          ],
        });
        registry.register(saboteurEffect);

        const modifiers = registry.getModifiers('appears_as_good');
        expect(modifiers).toHaveLength(1);
        expect(modifiers[0].type).toBe('appears_as_good');
      });

      it('should indicate Saboteur is hidden from Seer via hasModifier', () => {
        registry.register(
          createTestEffect({
            id: 'appears_as_good',
            modifiers: [{ type: 'appears_as_good', description: 'Seer perception' }],
          })
        );

        // Saboteur has appears_as_good effect active
        const saboteurEffects: EffectId[] = ['appears_as_good'];

        // Seer should NOT see Saboteur in evil list
        expect(registry.hasModifier(saboteurEffects, 'appears_as_good')).toBe(true);
        // Oracle is NOT affected by this
        expect(registry.hasModifier(saboteurEffects, 'appears_as_seer')).toBe(false);
      });

      it('should not affect other evil players knowledge', () => {
        registry.register(
          createTestEffect({
            id: 'appears_as_good',
            modifiers: [{ type: 'appears_as_good', description: 'Only affects Seer' }],
          })
        );

        // Other evil players should still know Saboteur is evil
        // The effect only affects Seer's info resolution, not evil team communication
        const saboteurEffects: EffectId[] = ['appears_as_good'];

        // The modifier only affects Seer perception
        const modifiers = registry.getAllModifiers(saboteurEffects);
        expect(modifiers).toHaveLength(1);
        expect(modifiers[0].type).toBe('appears_as_good');
        // No modifier that would hide from other evil players
        expect(modifiers.some((m) => m.type === 'appears_as_seer')).toBe(false);
      });
    });

    /**
     * Integration test: verifying perception modifiers can be queried
     * to implement character info resolution.
     */
    describe('perception modifier integration', () => {
      beforeEach(() => {
        // Register both perception effects
        registry.register(
          createTestEffect({
            id: 'appears_as_seer',
            name: 'Appears as Seer',
            description: 'Phantom effect',
            modifiers: [{ type: 'appears_as_seer', description: 'Oracle sees as Seer candidate' }],
          })
        );
        registry.register(
          createTestEffect({
            id: 'appears_as_good',
            name: 'Appears as Good',
            description: 'Saboteur effect',
            modifiers: [{ type: 'appears_as_good', description: 'Hidden from Seer' }],
          })
        );
      });

      it('should allow checking if player should appear differently to Oracle', () => {
        // Phantom has appears_as_seer
        const phantomEffects: EffectId[] = ['appears_as_seer'];

        // When Oracle resolves info, check if this player appears as Seer
        const appearsAsSeer = registry.hasModifier(phantomEffects, 'appears_as_seer');
        expect(appearsAsSeer).toBe(true);

        // Assassin does not have this effect
        const assassinEffects: EffectId[] = [];
        expect(registry.hasModifier(assassinEffects, 'appears_as_seer')).toBe(false);
      });

      it('should allow checking if player should be hidden from Seer', () => {
        // Saboteur has appears_as_good
        const saboteurEffects: EffectId[] = ['appears_as_good'];

        // When Seer resolves info, check if this evil player should be hidden
        const hiddenFromSeer = registry.hasModifier(saboteurEffects, 'appears_as_good');
        expect(hiddenFromSeer).toBe(true);

        // Assassin does not have this effect
        const assassinEffects: EffectId[] = [];
        expect(registry.hasModifier(assassinEffects, 'appears_as_good')).toBe(false);
      });

      it('should support querying all modifiers for info resolution', () => {
        const phantomEffects: EffectId[] = ['appears_as_seer'];
        const saboteurEffects: EffectId[] = ['appears_as_good'];
        const villagerEffects: EffectId[] = [];

        // Get all modifiers for each character
        const phantomMods = registry.getAllModifiers(phantomEffects);
        const saboteurMods = registry.getAllModifiers(saboteurEffects);
        const villagerMods = registry.getAllModifiers(villagerEffects);

        expect(phantomMods).toHaveLength(1);
        expect(phantomMods[0].type).toBe('appears_as_seer');

        expect(saboteurMods).toHaveLength(1);
        expect(saboteurMods[0].type).toBe('appears_as_good');

        expect(villagerMods).toHaveLength(0);
      });
    });
  });
});
