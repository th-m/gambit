/**
 * Sabotage Action - Saboteur's special ability to add an extra fail vote.
 *
 * - Available in: mission_voting phase
 * - Uses: 1 (single use per game)
 * - Targets: 0 (no targets required)
 * - Requirement: Must be on the mission team
 * - Effect: Adds one extra fail vote to the mission tally
 * - Modifier: Applies only to the current round
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
 * Validate that sabotage has no targets (none required).
 */
function validateTargets(_ctx: GameContext, targetIds: string[]): ValidationResult {
  if (targetIds.length !== 0) {
    return {
      valid: false,
      error: 'Sabotage does not require any targets',
    };
  }

  return { valid: true };
}

/**
 * Execute the sabotage action.
 * This is the action's execute function - it performs validation
 * and returns the action result. Side effects (adding modifier)
 * are handled by the registered handler.
 */
function execute(ctx: GameContext, _targetIds: string[]): ActionResult {
  // Verify player is on evil team (Saboteur is evil)
  if (ctx.currentPlayer?.team !== 'evil') {
    return {
      success: false,
      message: 'Only evil team members can sabotage',
      error: 'Invalid team',
    };
  }

  // Verify player is on the mission team
  const selectedTeam = ctx.game.selected_team ?? [];
  if (!selectedTeam.includes(ctx.currentPlayer.id)) {
    return {
      success: false,
      message: 'You must be on the mission team to sabotage',
      error: 'Not on team',
    };
  }

  // Action succeeded - handler will add the extra_fail modifier
  return {
    success: true,
    message: 'Sabotage activated! An extra fail vote will be added to this mission.',
  };
}

/**
 * The sabotage action definition.
 */
export const sabotageAction: ActionDefinition = {
  id: 'sabotage',
  name: 'Sabotage',
  description: 'Add an extra fail vote to this mission. You must be on the mission team.',
  phases: ['mission_voting'],
  maxUses: 1,
  requiresOnTeam: true,
  minTargets: 0,
  maxTargets: 0,
  validateTargets,
  execute,
};

/**
 * Handler for sabotage side effects.
 * Called by ActionProcessor after successful action execution.
 */
export function createSabotageHandler(_processor: ActionProcessor) {
  return async (
    ctx: GameContext,
    _targetIds: string[],
    proc: ActionProcessor
  ): Promise<ActionResult> => {
    // Add the extra_fail modifier for the current round
    proc.addModifier(
      ctx.game.id,
      ctx.game.current_round,
      'extra_fail',
      ctx.currentPlayer!.id
    );

    return {
      success: true,
      message: 'Sabotage activated! An extra fail vote will be added to this mission.',
      gameEnded: false,
    };
  };
}

/**
 * Register the sabotage action with the ActionRegistry.
 */
export function registerSabotageAction(): void {
  actionRegistry.register(sabotageAction);
}

/**
 * Register the sabotage handler with an ActionProcessor.
 * @param processor - The ActionProcessor to register the handler with
 */
export function registerSabotageHandler(processor: ActionProcessor): void {
  processor.registerHandler('sabotage', createSabotageHandler(processor));
}
