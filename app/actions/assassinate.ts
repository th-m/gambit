/**
 * Assassinate Action - Assassin's special ability to eliminate a player.
 *
 * - Available in: mission_voting and assassination phases
 * - Uses: 1 (single use per game)
 * - Targets: 1 player
 * - Effect: Eliminates target player
 * - Win conditions:
 *   - If target is Seer, evil wins immediately
 *   - If target is NOT Seer during assassination phase, good wins
 * - Blocked by: protect status
 */

import type {
  ActionDefinition,
  ActionResult,
  GameContext,
  ValidationResult,
} from '~/types/game';
import { actionRegistry } from '~/registry/ActionRegistry';
import { ActionProcessor } from '~/services/ActionProcessor';

/**
 * Validate that assassination targets are valid.
 * - Exactly 1 target required
 * - Target must be in the game
 * - Target must be alive
 * - Cannot target self
 */
function validateTargets(ctx: GameContext, targetIds: string[]): ValidationResult {
  if (targetIds.length !== 1) {
    return {
      valid: false,
      error: 'Assassinate requires exactly 1 target',
    };
  }

  const targetId = targetIds[0];
  const target = ctx.players.find((p) => p.id === targetId);

  if (!target) {
    return {
      valid: false,
      error: 'Target player not found in game',
    };
  }

  if (!target.is_alive) {
    return {
      valid: false,
      error: 'Cannot assassinate a player who is already eliminated',
    };
  }

  if (targetId === ctx.currentPlayer?.id) {
    return {
      valid: false,
      error: 'Cannot assassinate yourself',
    };
  }

  return { valid: true };
}

/**
 * Execute the assassination action.
 * This is the action's execute function - it performs validation
 * and returns the action result. Side effects (elimination, game end)
 * are handled by the registered handler.
 */
function execute(ctx: GameContext, targetIds: string[]): ActionResult {
  const targetId = targetIds[0];
  const target = ctx.players.find((p) => p.id === targetId);

  if (!target) {
    return {
      success: false,
      message: 'Target not found',
      error: 'Target player not found',
    };
  }

  // Check if target is protected
  const isProtected = ctx.statuses.some(
    (s) => s.player_id === targetId && s.status_type === 'protected'
  );

  if (isProtected) {
    return {
      success: true,
      message: `${target.display_name} was protected from assassination!`,
      gameEnded: false,
    };
  }

  // Action succeeded - handler will process elimination and win conditions
  return {
    success: true,
    message: `${target.display_name} has been assassinated!`,
  };
}

/**
 * The assassinate action definition.
 */
export const assassinateAction: ActionDefinition = {
  id: 'assassinate',
  name: 'Assassinate',
  description: 'Eliminate a player. If you kill the Seer, evil wins immediately.',
  phases: ['mission_voting', 'assassination'],
  maxUses: 1,
  requiresOnTeam: false,
  minTargets: 1,
  maxTargets: 1,
  validateTargets,
  execute,
};

/**
 * Handler for assassination side effects.
 * Called by ActionProcessor after successful action execution.
 */
export function createAssassinateHandler(processor: ActionProcessor) {
  return async (
    ctx: GameContext,
    targetIds: string[],
    proc: ActionProcessor
  ): Promise<ActionResult> => {
    const targetId = targetIds[0];
    const target = ctx.players.find((p) => p.id === targetId);

    if (!target) {
      return {
        success: false,
        message: 'Target not found',
        error: 'Target player not found',
      };
    }

    // Check if target is protected
    const isProtected = proc.hasStatus(ctx.game.id, targetId, 'protected');

    if (isProtected) {
      return {
        success: true,
        message: `${target.display_name} was protected from assassination!`,
        gameEnded: false,
      };
    }

    // Eliminate the target
    proc.eliminatePlayer(targetId);

    // Check win conditions based on whether target was Seer
    const targetIsSeer = target.character === 'Seer';

    if (targetIsSeer) {
      // Evil wins by killing the Seer
      proc.endGame(ctx.game.id, 'evil', 'Seer assassinated');
      return {
        success: true,
        message: `${target.display_name} was the Seer! Evil wins!`,
        gameEnded: true,
        winner: 'evil',
      };
    }

    // If we're in assassination phase and Seer wasn't killed, good wins
    if (ctx.game.phase === 'assassination') {
      proc.endGame(ctx.game.id, 'good', 'Good completed 3 successful missions');
      return {
        success: true,
        message: `${target.display_name} was not the Seer. Good wins!`,
        gameEnded: true,
        winner: 'good',
      };
    }

    // During mission_voting, just eliminate and continue
    return {
      success: true,
      message: `${target.display_name} has been assassinated!`,
      gameEnded: false,
    };
  };
}

/**
 * Register the assassinate action with the ActionRegistry.
 */
export function registerAssassinateAction(): void {
  actionRegistry.register(assassinateAction);
}

/**
 * Register the assassinate handler with an ActionProcessor.
 * @param processor - The ActionProcessor to register the handler with
 */
export function registerAssassinateHandler(processor: ActionProcessor): void {
  processor.registerHandler('assassinate', createAssassinateHandler(processor));
}
