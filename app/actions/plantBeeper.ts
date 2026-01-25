/**
 * Plant Beeper Action - Tracker's special ability to tag players.
 *
 * - Available in: selecting_team phase
 * - Uses: 1 (single use per game)
 * - Targets: 2 players (must be 1 good + 1 evil)
 * - Effect: Creates player_status 'beepered' for each target
 * - Tagged players' devices vibrate on vote reveal
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
 * Validate that beeper targets are valid.
 * - Exactly 2 targets required
 * - Both targets must be in the game
 * - Both targets must be alive
 * - Cannot target self
 * - Must have exactly 1 good and 1 evil player
 */
function validateTargets(ctx: GameContext, targetIds: string[]): ValidationResult {
  if (targetIds.length !== 2) {
    return {
      valid: false,
      error: 'Plant beeper requires exactly 2 targets',
    };
  }

  // Check both targets exist and are alive
  const targets = targetIds.map((id) => ctx.players.find((p) => p.id === id));
  
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    if (!target) {
      return {
        valid: false,
        error: 'Target player not found in game',
      };
    }

    if (!target.is_alive) {
      return {
        valid: false,
        error: 'Cannot target a player who is eliminated',
      };
    }

    if (targetIds[i] === ctx.currentPlayer?.id) {
      return {
        valid: false,
        error: 'Cannot target yourself',
      };
    }
  }

  // Verify 1 good + 1 evil (need both targets to have teams assigned)
  const target1 = targets[0]!;
  const target2 = targets[1]!;

  if (!target1.team || !target2.team) {
    return {
      valid: false,
      error: 'Cannot plant beeper before teams are assigned',
    };
  }

  const teams = [target1.team, target2.team].sort();
  if (teams[0] !== 'evil' || teams[1] !== 'good') {
    return {
      valid: false,
      error: 'Must target exactly 1 good player and 1 evil player',
    };
  }

  return { valid: true };
}

/**
 * Execute the plant beeper action.
 * This is the action's execute function - it performs validation
 * and returns the action result. Side effects (creating statuses)
 * are handled by the registered handler.
 */
function execute(ctx: GameContext, targetIds: string[]): ActionResult {
  // Get target display names for the message
  const targets = targetIds.map((id) => ctx.players.find((p) => p.id === id));
  const targetNames = targets.map((t) => t?.display_name ?? 'Unknown').join(' and ');

  // Action succeeded - handler will create the beepered statuses
  return {
    success: true,
    message: `Beepers planted on ${targetNames}. They will vibrate on vote reveal.`,
  };
}

/**
 * The plant beeper action definition.
 */
export const plantBeeperAction: ActionDefinition = {
  id: 'plant_beeper',
  name: 'Plant Beeper',
  description: 'Tag 1 good and 1 evil player. Their devices vibrate when votes are revealed.',
  phases: ['selecting_team'],
  maxUses: 1,
  requiresOnTeam: false,
  minTargets: 2,
  maxTargets: 2,
  validateTargets,
  execute,
};

/**
 * Handler for plant beeper side effects.
 * Called by ActionProcessor after successful action execution.
 */
export function createPlantBeeperHandler(_processor: ActionProcessor) {
  return async (
    ctx: GameContext,
    targetIds: string[],
    proc: ActionProcessor
  ): Promise<ActionResult> => {
    const targets = targetIds.map((id) => ctx.players.find((p) => p.id === id));
    const targetNames = targets.map((t) => t?.display_name ?? 'Unknown').join(' and ');

    // Create beepered status for each target
    // Status expires at end of current round
    for (const targetId of targetIds) {
      proc.addStatus(
        ctx.game.id,
        targetId,
        'beepered',
        ctx.currentPlayer!.id,
        ctx.game.current_round // Expires at end of this round
      );
    }

    return {
      success: true,
      message: `Beepers planted on ${targetNames}. They will vibrate on vote reveal.`,
      gameEnded: false,
    };
  };
}

/**
 * Register the plant beeper action with the ActionRegistry.
 */
export function registerPlantBeeperAction(): void {
  actionRegistry.register(plantBeeperAction);
}

/**
 * Register the plant beeper handler with an ActionProcessor.
 * @param processor - The ActionProcessor to register the handler with
 */
export function registerPlantBeeperHandler(processor: ActionProcessor): void {
  processor.registerHandler('plant_beeper', createPlantBeeperHandler(processor));
}
