/**
 * ActionRegistry - Manages character action definitions.
 *
 * Provides registration, retrieval, validation, and execution of character
 * special abilities. Actions are filtered by current game phase and character.
 */

import type {
  ActionDefinition,
  ActionId,
  ActionResult,
  GameContext,
  GamePhase,
  ValidationResult,
  GameAction,
} from '../types/game';

/**
 * Registry class for managing character actions.
 * Can be used as a singleton or instantiated for testing.
 */
export class ActionRegistry {
  private actions: Map<ActionId, ActionDefinition> = new Map();

  /**
   * Register an action definition.
   * @param action - The action definition to register
   */
  register(action: ActionDefinition): void {
    this.actions.set(action.id, action);
  }

  /**
   * Get a single action by ID.
   * @param actionId - The action ID to look up
   * @returns The action definition or undefined if not found
   */
  get(actionId: ActionId): ActionDefinition | undefined {
    return this.actions.get(actionId);
  }

  /**
   * Get all registered actions.
   * @returns Array of all action definitions
   */
  getAll(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }

  /**
   * Get actions available to a character in the current context.
   * Filters by:
   * - Current game phase
   * - Character's action list
   * - Actions not yet used (if single-use)
   *
   * @param ctx - Current game context
   * @param characterActions - Array of action IDs the character has
   * @param usedActionIds - Array of action IDs already used this game
   * @returns Array of available action definitions
   */
  getAvailableActions(
    ctx: GameContext,
    characterActions: ActionId[],
    usedActionIds: ActionId[] = []
  ): ActionDefinition[] {
    const currentPhase = ctx.game.phase;

    if (!currentPhase) {
      return [];
    }

    return characterActions
      .map((actionId) => this.actions.get(actionId))
      .filter((action): action is ActionDefinition => {
        if (!action) return false;

        // Check if action is available in current phase
        if (!action.phases.includes(currentPhase)) {
          return false;
        }

        // Check if action has been used up (for limited-use actions)
        if (action.maxUses > 0) {
          const useCount = usedActionIds.filter((id) => id === action.id).length;
          if (useCount >= action.maxUses) {
            return false;
          }
        }

        // Check if player needs to be on team
        if (action.requiresOnTeam) {
          const isOnTeam =
            ctx.game.selected_team?.includes(ctx.currentPlayer?.id ?? '') ?? false;
          if (!isOnTeam) {
            return false;
          }
        }

        return true;
      });
  }

  /**
   * Check if an action's conditions are met.
   * Validates:
   * - Action exists
   * - Current phase allows the action
   * - Player hasn't exceeded use limit
   * - Player meets team requirements
   *
   * @param action - The action to check
   * @param ctx - Current game context
   * @param usedActionIds - Array of action IDs already used this game
   * @returns Validation result with valid flag and optional error
   */
  checkConditions(
    action: ActionDefinition,
    ctx: GameContext,
    usedActionIds: ActionId[] = []
  ): ValidationResult {
    const currentPhase = ctx.game.phase;

    // Check phase
    if (!currentPhase || !action.phases.includes(currentPhase)) {
      return {
        valid: false,
        error: `Action "${action.name}" cannot be used in phase "${currentPhase ?? 'none'}"`,
      };
    }

    // Check use limit
    if (action.maxUses > 0) {
      const useCount = usedActionIds.filter((id) => id === action.id).length;
      if (useCount >= action.maxUses) {
        return {
          valid: false,
          error: `Action "${action.name}" has already been used the maximum number of times (${action.maxUses})`,
        };
      }
    }

    // Check team requirement
    if (action.requiresOnTeam) {
      const isOnTeam =
        ctx.game.selected_team?.includes(ctx.currentPlayer?.id ?? '') ?? false;
      if (!isOnTeam) {
        return {
          valid: false,
          error: `Action "${action.name}" requires being on the mission team`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Execute an action by ID.
   * Validates conditions and targets before executing.
   *
   * @param actionId - The action ID to execute
   * @param ctx - Current game context
   * @param targetIds - Array of target player IDs
   * @param usedActionIds - Array of action IDs already used this game
   * @returns Action result with success, message, and optional game end info
   */
  async execute(
    actionId: ActionId,
    ctx: GameContext,
    targetIds: string[],
    usedActionIds: ActionId[] = []
  ): Promise<ActionResult> {
    const action = this.actions.get(actionId);

    if (!action) {
      return {
        success: false,
        message: 'Action execution failed',
        error: `Action "${actionId}" not found`,
      };
    }

    // Check conditions
    const conditionsResult = this.checkConditions(action, ctx, usedActionIds);
    if (!conditionsResult.valid) {
      return {
        success: false,
        message: 'Action conditions not met',
        error: conditionsResult.error,
      };
    }

    // Validate target count
    if (targetIds.length < action.minTargets) {
      return {
        success: false,
        message: 'Invalid targets',
        error: `Action "${action.name}" requires at least ${action.minTargets} target(s)`,
      };
    }

    if (targetIds.length > action.maxTargets) {
      return {
        success: false,
        message: 'Invalid targets',
        error: `Action "${action.name}" allows at most ${action.maxTargets} target(s)`,
      };
    }

    // Validate targets using action's validation function
    const targetValidation = action.validateTargets(ctx, targetIds);
    if (!targetValidation.valid) {
      return {
        success: false,
        message: 'Invalid targets',
        error: targetValidation.error,
      };
    }

    // Execute the action
    try {
      const result = await action.execute(ctx, targetIds);
      return result;
    } catch (error) {
      return {
        success: false,
        message: 'Action execution failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Clear all registered actions.
   * Useful for testing.
   */
  clear(): void {
    this.actions.clear();
  }
}

/**
 * Singleton instance for global use.
 * Import this for production code.
 */
export const actionRegistry = new ActionRegistry();

/**
 * Helper function to count how many times an action has been used.
 * Uses the game_actions table to count occurrences.
 *
 * @param actionId - The action ID to count
 * @param gameActions - Array of game actions to search
 * @returns Number of times the action was used
 */
export function countActionUses(actionId: ActionId, gameActions: GameAction[]): number {
  return gameActions.filter((action) => action.action_type === actionId).length;
}

/**
 * Get array of used action IDs from game actions.
 *
 * @param playerId - Player ID to filter by
 * @param gameActions - Array of game actions
 * @returns Array of action IDs used by the player
 */
export function getUsedActionIds(playerId: string, gameActions: GameAction[]): ActionId[] {
  const specialActions: ActionId[] = ['assassinate', 'rig_vote', 'plant_beeper', 'protect', 'sabotage'];
  
  return gameActions
    .filter((action) => action.player_id === playerId)
    .map((action) => action.action_type as ActionId)
    .filter((actionType) => specialActions.includes(actionType));
}
