/**
 * Protect Action - Guardian's special ability to protect a player.
 *
 * - Available in: mission_voting phase
 * - Uses: 1 (single use per game)
 * - Targets: 1 player
 * - Effect: Creates 'protected' status for target
 * - Protection expires at end of round
 * - Protected player cannot be assassinated
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
 * Validate that protect targets are valid.
 * - Exactly 1 target required
 * - Target must be in the game
 * - Target must be alive
 */
function validateTargets(ctx: GameContext, targetIds: string[]): ValidationResult {
  if (targetIds.length !== 1) {
    return {
      valid: false,
      error: 'Protect requires exactly 1 target',
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
      error: 'Cannot protect a player who is already eliminated',
    };
  }

  return { valid: true };
}

/**
 * Execute the protect action.
 * This is the action's execute function - it performs validation
 * and returns the action result. Side effects (adding status)
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

  // Verify player is on good team (Guardian is good)
  if (ctx.currentPlayer?.team !== 'good') {
    return {
      success: false,
      message: 'Only good team members can protect players',
      error: 'Invalid team',
    };
  }

  // Action succeeded - handler will add the protected status
  return {
    success: true,
    message: `${target.display_name} is now protected from assassination this round!`,
  };
}

/**
 * The protect action definition.
 */
export const protectAction: ActionDefinition = {
  id: 'protect',
  name: 'Protect',
  description: 'Protect a player from assassination until the end of this round.',
  phases: ['mission_voting'],
  maxUses: 1,
  requiresOnTeam: false,
  minTargets: 1,
  maxTargets: 1,
  validateTargets,
  execute,
};

/**
 * Handler for protect side effects.
 * Called by ActionProcessor after successful action execution.
 */
export function createProtectHandler(_processor: ActionProcessor) {
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

    // Add the protected status for the current round (expires at end of round)
    proc.addStatus(
      ctx.game.id,
      targetId,
      'protected',
      ctx.currentPlayer!.id,
      ctx.game.current_round // Expires at end of this round
    );

    return {
      success: true,
      message: `${target.display_name} is now protected from assassination this round!`,
      gameEnded: false,
    };
  };
}

/**
 * Register the protect action with the ActionRegistry.
 */
export function registerProtectAction(): void {
  actionRegistry.register(protectAction);
}

/**
 * Register the protect handler with an ActionProcessor.
 * @param processor - The ActionProcessor to register the handler with
 */
export function registerProtectHandler(processor: ActionProcessor): void {
  processor.registerHandler('protect', createProtectHandler(processor));
}
