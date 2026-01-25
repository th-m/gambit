/**
 * Rig Vote Action - Fixer's special ability to force a mission pass.
 *
 * - Available in: mission_voting phase
 * - Uses: 1 (single use per game)
 * - Targets: 0 (no targets required)
 * - Effect: Creates a game modifier that forces the mission to pass
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
 * Validate that rig_vote has no targets (none required).
 */
function validateTargets(_ctx: GameContext, targetIds: string[]): ValidationResult {
  if (targetIds.length !== 0) {
    return {
      valid: false,
      error: 'Rig vote does not require any targets',
    };
  }

  return { valid: true };
}

/**
 * Execute the rig vote action.
 * This is the action's execute function - it performs validation
 * and returns the action result. Side effects (adding modifier)
 * are handled by the registered handler.
 */
function execute(ctx: GameContext, _targetIds: string[]): ActionResult {
  // Verify player is on evil team (Fixer is evil)
  if (ctx.currentPlayer?.team !== 'evil') {
    return {
      success: false,
      message: 'Only evil team members can rig votes',
      error: 'Invalid team',
    };
  }

  // Action succeeded - handler will add the force_pass modifier
  return {
    success: true,
    message: 'Vote rigged! This mission will pass regardless of votes.',
  };
}

/**
 * The rig vote action definition.
 */
export const rigVoteAction: ActionDefinition = {
  id: 'rig_vote',
  name: 'Rig Vote',
  description: 'Force this mission to pass regardless of how team members vote.',
  phases: ['mission_voting'],
  maxUses: 1,
  requiresOnTeam: false,
  minTargets: 0,
  maxTargets: 0,
  validateTargets,
  execute,
};

/**
 * Handler for rig vote side effects.
 * Called by ActionProcessor after successful action execution.
 */
export function createRigVoteHandler(_processor: ActionProcessor) {
  return async (
    ctx: GameContext,
    _targetIds: string[],
    proc: ActionProcessor
  ): Promise<ActionResult> => {
    // Add the force_pass modifier for the current round
    proc.addModifier(
      ctx.game.id,
      ctx.game.current_round,
      'force_pass',
      ctx.currentPlayer!.id
    );

    return {
      success: true,
      message: 'Vote rigged! This mission will pass regardless of votes.',
      gameEnded: false,
    };
  };
}

/**
 * Register the rig vote action with the ActionRegistry.
 */
export function registerRigVoteAction(): void {
  actionRegistry.register(rigVoteAction);
}

/**
 * Register the rig vote handler with an ActionProcessor.
 * @param processor - The ActionProcessor to register the handler with
 */
export function registerRigVoteHandler(processor: ActionProcessor): void {
  processor.registerHandler('rig_vote', createRigVoteHandler(processor));
}
