/**
 * EffectRegistry - Manages passive effect definitions.
 *
 * Provides registration, retrieval, and event handling for character
 * passive effects. Effects can modify perception (appears_as_seer, appears_as_good)
 * and respond to game events via hooks.
 */

import type {
  EffectDefinition,
  EffectId,
  EffectModifier,
  GameContext,
  GameEventType,
} from '../types/game';

/**
 * Registry class for managing passive effects.
 * Can be used as a singleton or instantiated for testing.
 */
export class EffectRegistry {
  private effects: Map<EffectId, EffectDefinition> = new Map();

  /**
   * Register an effect definition.
   * @param effect - The effect definition to register
   */
  register(effect: EffectDefinition): void {
    this.effects.set(effect.id, effect);
  }

  /**
   * Get a single effect by ID.
   * @param effectId - The effect ID to look up
   * @returns The effect definition or undefined if not found
   */
  get(effectId: EffectId): EffectDefinition | undefined {
    return this.effects.get(effectId);
  }

  /**
   * Get all registered effects.
   * @returns Array of all effect definitions
   */
  getAll(): EffectDefinition[] {
    return Array.from(this.effects.values());
  }

  /**
   * Get modifiers for a specific effect.
   * @param effectId - The effect ID to look up
   * @returns Array of modifiers for the effect, or empty array if effect not found
   */
  getModifiers(effectId: EffectId): EffectModifier[] {
    const effect = this.effects.get(effectId);
    return effect?.modifiers ?? [];
  }

  /**
   * Get all modifiers for a list of active effects.
   * Useful for computing the combined perception changes for a character.
   * @param activeEffects - Array of effect IDs that are currently active
   * @returns Array of all modifiers from the active effects
   */
  getAllModifiers(activeEffects: EffectId[]): EffectModifier[] {
    const modifiers: EffectModifier[] = [];
    for (const effectId of activeEffects) {
      const effect = this.effects.get(effectId);
      if (effect) {
        modifiers.push(...effect.modifiers);
      }
    }
    return modifiers;
  }

  /**
   * Check if any active effect has a specific modifier type.
   * @param activeEffects - Array of effect IDs that are currently active
   * @param modifierType - The modifier type to check for
   * @returns True if any active effect has the specified modifier
   */
  hasModifier(
    activeEffects: EffectId[],
    modifierType: 'appears_as_seer' | 'appears_as_good'
  ): boolean {
    const allModifiers = this.getAllModifiers(activeEffects);
    return allModifiers.some((mod) => mod.type === modifierType);
  }

  /**
   * Trigger event hooks for all active effects.
   * Calls the appropriate hook handler for each effect that has one registered.
   *
   * @param event - The game event type that occurred
   * @param ctx - Current game context
   * @param activeEffects - Array of effect IDs that are currently active
   * @param eventData - Additional data about the event
   */
  async triggerHooks(
    event: GameEventType,
    ctx: GameContext,
    activeEffects: EffectId[],
    eventData: Record<string, unknown> = {}
  ): Promise<void> {
    const hookPromises: Promise<void>[] = [];

    for (const effectId of activeEffects) {
      const effect = this.effects.get(effectId);
      if (effect) {
        const hookHandler = effect.hooks[event];
        if (hookHandler) {
          // Handle both sync and async handlers
          const result = hookHandler(ctx, eventData);
          if (result instanceof Promise) {
            hookPromises.push(result);
          }
        }
      }
    }

    // Wait for all async hooks to complete
    if (hookPromises.length > 0) {
      await Promise.all(hookPromises);
    }
  }

  /**
   * Get effects that have a handler for a specific event.
   * @param event - The game event type
   * @param activeEffects - Array of effect IDs that are currently active
   * @returns Array of effect definitions that have handlers for the event
   */
  getEffectsWithHook(event: GameEventType, activeEffects: EffectId[]): EffectDefinition[] {
    return activeEffects
      .map((effectId) => this.effects.get(effectId))
      .filter((effect): effect is EffectDefinition => {
        if (!effect) return false;
        return effect.hooks[event] !== undefined;
      });
  }

  /**
   * Clear all registered effects.
   * Useful for testing.
   */
  clear(): void {
    this.effects.clear();
  }
}

/**
 * Singleton instance for global use.
 * Import this for production code.
 */
export const effectRegistry = new EffectRegistry();
