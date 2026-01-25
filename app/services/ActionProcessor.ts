/**
 * ActionProcessor - Handles character special ability execution.
 * Validates phase, use limits, targets, and executes action handlers.
 */

import type {
  Game,
  Player,
  GameAction,
  ActionId,
  ActionResult,
  GameContext,
  GamePhase,
  Team,
} from '~/types/game';
import { GameService, gameService as defaultGameService } from './GameService';
import { VoteProcessor, voteProcessor as defaultVoteProcessor } from './VoteProcessor';
import { actionRegistry } from '~/registry/ActionRegistry';
import { getUsedActionIds } from '~/registry/ActionRegistry';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a UUID v4.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =============================================================================
// Action Handler Type
// =============================================================================

/**
 * Custom action handler that can be registered for specific action types.
 * These handlers are called during action execution to perform side effects.
 */
export type ActionHandler = (
  ctx: GameContext,
  targetIds: string[],
  processor: ActionProcessor
) => ActionResult | Promise<ActionResult>;

// =============================================================================
// ActionProcessor Class
// =============================================================================

export class ActionProcessor {
  private gameService: GameService;
  private voteProcessor: VoteProcessor;
  private actions: Map<string, GameAction> = new Map();
  private handlers: Map<ActionId, ActionHandler> = new Map();

  constructor(
    gameService: GameService = defaultGameService,
    voteProcessor: VoteProcessor = defaultVoteProcessor
  ) {
    this.gameService = gameService;
    this.voteProcessor = voteProcessor;
  }

  // ===========================================================================
  // Handler Registration
  // ===========================================================================

  /**
   * Register a custom handler for an action type.
   * Handlers are called during action execution to perform side effects.
   * @param actionId - The action ID to handle
   * @param handler - The handler function
   */
  registerHandler(actionId: ActionId, handler: ActionHandler): void {
    this.handlers.set(actionId, handler);
  }

  /**
   * Get a registered handler for an action type.
   */
  getHandler(actionId: ActionId): ActionHandler | undefined {
    return this.handlers.get(actionId);
  }

  // ===========================================================================
  // Action Storage Methods
  // ===========================================================================

  /**
   * Record a game action.
   */
  recordAction(
    gameId: string,
    playerId: string,
    actionType: GameAction['action_type'],
    round: number | null,
    phase: GamePhase | null,
    targetIds?: string[]
  ): GameAction {
    const action: GameAction = {
      id: generateUUID(),
      game_id: gameId,
      player_id: playerId,
      action_type: actionType,
      target_ids: targetIds ?? null,
      round,
      phase,
      created_at: new Date().toISOString(),
    };
    this.actions.set(action.id, action);
    return action;
  }

  /**
   * Get all actions for a game.
   */
  getActions(gameId: string): GameAction[] {
    const result: GameAction[] = [];
    for (const action of this.actions.values()) {
      if (action.game_id === gameId) {
        result.push(action);
      }
    }
    return result;
  }

  /**
   * Get actions for a specific player in a game.
   */
  getPlayerActions(gameId: string, playerId: string): GameAction[] {
    return this.getActions(gameId).filter((a) => a.player_id === playerId);
  }

  // ===========================================================================
  // Context Building
  // ===========================================================================

  /**
   * Build a GameContext for action execution.
   */
  buildContext(game: Game, players: Player[], currentPlayer: Player | null): GameContext {
    return {
      game,
      players,
      currentPlayer,
      modifiers: this.voteProcessor.getModifiersForRound(game.id, game.current_round),
      statuses: this.getAllStatuses(game.id, game.current_round),
    };
  }

  /**
   * Get all active statuses for a game and round.
   */
  private getAllStatuses(gameId: string, currentRound: number) {
    // Collect statuses for all players in the game
    const players = this.gameService.getPlayers(gameId);
    const allStatuses: ReturnType<typeof this.voteProcessor.getPlayerStatuses> = [];
    for (const player of players) {
      const statuses = this.voteProcessor.getPlayerStatuses(gameId, player.id, currentRound);
      allStatuses.push(...statuses);
    }
    return allStatuses;
  }

  // ===========================================================================
  // Action Execution
  // ===========================================================================

  /**
   * Execute a character action.
   * Validates player, phase, use limits, and targets before execution.
   * @param gameId - The game ID
   * @param playerId - The player ID executing the action
   * @param actionId - The action ID to execute
   * @param targetIds - Array of target player IDs
   * @returns ActionResult with success, message, gameEnded, winner
   */
  async executeAction(
    gameId: string,
    playerId: string,
    actionId: ActionId,
    targetIds: string[]
  ): Promise<ActionResult> {
    // Get game
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return {
        success: false,
        message: 'Action failed',
        error: 'Game not found',
      };
    }

    // Get player
    const player = this.gameService.getPlayerById(playerId);
    if (!player || player.game_id !== gameId) {
      return {
        success: false,
        message: 'Action failed',
        error: 'Player not in game',
      };
    }

    // Check player is alive
    if (!player.is_alive) {
      return {
        success: false,
        message: 'Action failed',
        error: 'Player is not alive',
      };
    }

    // Get action definition
    const action = actionRegistry.get(actionId);
    if (!action) {
      return {
        success: false,
        message: 'Action failed',
        error: `Action "${actionId}" not found`,
      };
    }

    // Build context
    const players = this.gameService.getPlayers(gameId);
    const ctx = this.buildContext(game, players, player);

    // Get used action IDs for this player
    const gameActions = this.getActions(gameId);
    const usedActionIds = getUsedActionIds(playerId, gameActions);

    // Execute through ActionRegistry (handles all validation)
    const result = await actionRegistry.execute(actionId, ctx, targetIds, usedActionIds);

    if (result.success) {
      // Record the action
      this.recordAction(
        gameId,
        playerId,
        actionId,
        game.current_round,
        game.phase,
        targetIds
      );

      // Execute any registered handler for side effects
      const handler = this.handlers.get(actionId);
      if (handler) {
        try {
          const handlerResult = await handler(ctx, targetIds, this);
          // If handler modified the result (e.g., game ended), use that result
          if (handlerResult.gameEnded !== undefined) {
            return handlerResult;
          }
        } catch (error) {
          // Handler errors don't fail the action, just log
          console.error(`Handler error for ${actionId}:`, error);
        }
      }
    }

    return result;
  }

  // ===========================================================================
  // Helper Methods for Action Handlers
  // ===========================================================================

  /**
   * Eliminate a player (set is_alive to false).
   */
  eliminatePlayer(playerId: string): Player | null {
    return this.gameService.updatePlayer(playerId, { is_alive: false });
  }

  /**
   * Check if a player has a specific status.
   */
  hasStatus(gameId: string, playerId: string, statusType: 'protected' | 'beepered'): boolean {
    const game = this.gameService.getGameById(gameId);
    if (!game) return false;
    return this.voteProcessor.hasStatus(gameId, playerId, statusType, game.current_round);
  }

  /**
   * Add a game modifier (e.g., force_pass, extra_fail).
   */
  addModifier(
    gameId: string,
    round: number,
    modifierType: 'force_pass' | 'extra_fail',
    createdBy: string
  ) {
    return this.voteProcessor.addModifier(gameId, round, modifierType, createdBy);
  }

  /**
   * Add a player status (e.g., protected, beepered).
   */
  addStatus(
    gameId: string,
    playerId: string,
    statusType: 'protected' | 'beepered',
    createdBy: string,
    expiresAtRound: number | null = null
  ) {
    return this.voteProcessor.addStatus(gameId, playerId, statusType, createdBy, expiresAtRound);
  }

  /**
   * End the game with a winner.
   */
  endGame(gameId: string, winner: Team, endReason: string): void {
    this.gameService.updateGame(gameId, {
      status: 'finished',
      winner,
      end_reason: endReason as Game['end_reason'],
      phase: null,
    });
  }

  /**
   * Get a player by ID.
   */
  getPlayer(playerId: string): Player | null {
    return this.gameService.getPlayerById(playerId);
  }

  /**
   * Get all players in a game.
   */
  getPlayers(gameId: string): Player[] {
    return this.gameService.getPlayers(gameId);
  }

  /**
   * Get a game by ID.
   */
  getGame(gameId: string): Game | null {
    return this.gameService.getGameById(gameId);
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.actions.clear();
    this.handlers.clear();
  }
}

// Export singleton instance for production use
export const actionProcessor = new ActionProcessor();
