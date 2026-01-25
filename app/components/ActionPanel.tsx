/**
 * ActionPanel Component
 *
 * Displays available character special abilities based on current phase.
 * Features:
 * - Filters available actions based on current phase
 * - Hides used one-time actions
 * - Displays action buttons with descriptions
 * - Integrates with TargetSelector when targets needed
 * - Submits action execution
 * - Shows confirmation/result
 * - Handles execution errors
 */

import { useState, useCallback, useRef } from 'react';
import { actionRegistry, getUsedActionIds } from '~/registry/ActionRegistry';
import { characterRegistry } from '~/registry/CharacterRegistry';
import type {
  Player,
  Game,
  GameAction,
  GameContext,
  ActionDefinition,
  ActionId,
  ActionResult,
} from '~/types/game';

// =============================================================================
// Types
// =============================================================================

interface ActionPanelProps {
  /** Current player */
  player: Player;
  /** Current game state */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** Game actions (for tracking used actions) */
  actions: GameAction[];
  /** Game context for action validation */
  ctx: GameContext;
  /** Callback to execute an action */
  onExecuteAction: (actionId: ActionId, targetIds: string[]) => Promise<ActionResult>;
}

interface TargetSelectorProps {
  /** Action being executed */
  action: ActionDefinition;
  /** Available players to target */
  players: Player[];
  /** Current player (cannot target self for some actions) */
  currentPlayerId: string;
  /** Game context for validation */
  ctx: GameContext;
  /** Callback when targets are selected */
  onSelect: (targetIds: string[]) => void;
  /** Callback to cancel selection */
  onCancel: () => void;
}

type PanelState =
  | { type: 'idle' }
  | { type: 'selecting'; action: ActionDefinition }
  | { type: 'executing'; action: ActionDefinition }
  | { type: 'result'; action: ActionDefinition; result: ActionResult };

// =============================================================================
// Target Selector Component
// =============================================================================

function TargetSelector({
  action,
  players,
  currentPlayerId,
  ctx,
  onSelect,
  onCancel,
}: TargetSelectorProps) {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  // Get eligible targets (alive players, excluding self for most actions)
  const eligibleTargets = players.filter((p) => {
    if (!p.is_alive) return false;
    // Allow self-targeting only for certain actions (like protect)
    if (p.id === currentPlayerId && action.id !== 'protect') return false;
    return true;
  });

  const handleToggleTarget = (playerId: string) => {
    setSelectedTargets((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      // Check if we've reached max targets
      if (prev.length >= action.maxTargets) {
        // Replace the first target if at max
        return [...prev.slice(1), playerId];
      }
      return [...prev, playerId];
    });
  };

  const handleConfirm = () => {
    // Validate target count
    if (selectedTargets.length < action.minTargets) {
      return;
    }
    onSelect(selectedTargets);
  };

  const canConfirm =
    selectedTargets.length >= action.minTargets && selectedTargets.length <= action.maxTargets;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-300">Select Target{action.maxTargets > 1 ? 's' : ''}</h4>
        <span className="text-xs text-gray-500">
          {selectedTargets.length}/{action.minTargets === action.maxTargets ? action.maxTargets : `${action.minTargets}-${action.maxTargets}`}
        </span>
      </div>

      {/* Player Grid */}
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select targets">
        {eligibleTargets.map((player) => {
          const isSelected = selectedTargets.includes(player.id);
          return (
            <button
              key={player.id}
              type="button"
              onClick={() => handleToggleTarget(player.id)}
              aria-pressed={isSelected}
              className={`p-2 rounded-lg text-sm font-medium transition-all ${
                isSelected
                  ? 'bg-amber-600/30 border-2 border-amber-500 text-amber-300'
                  : 'bg-stone-700 border-2 border-transparent text-gray-300 hover:bg-stone-600'
              }`}
            >
              {player.display_name}
              {player.id === currentPlayerId && (
                <span className="text-xs text-gray-500 ml-1">(you)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 px-3 rounded-lg bg-stone-700 text-gray-300 hover:bg-stone-600 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            canConfirm
              ? 'bg-amber-600 text-white hover:bg-amber-500'
              : 'bg-stone-700 text-gray-500 cursor-not-allowed'
          }`}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Action Button Component
// =============================================================================

interface ActionButtonProps {
  action: ActionDefinition;
  onClick: () => void;
  disabled?: boolean;
}

function ActionButton({ action, onClick, disabled }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-3 rounded-lg transition-colors ${
        disabled
          ? 'bg-stone-800 text-gray-600 cursor-not-allowed'
          : 'bg-stone-700 hover:bg-stone-600 text-gray-200'
      }`}
    >
      <p className="font-semibold text-amber-400">{action.name}</p>
      <p className="text-sm text-gray-400 mt-1">{action.description}</p>
    </button>
  );
}

// =============================================================================
// Result Display Component
// =============================================================================

interface ResultDisplayProps {
  action: ActionDefinition;
  result: ActionResult;
  onDismiss: () => void;
}

function ResultDisplay({ action, result, onDismiss }: ResultDisplayProps) {
  const isSuccess = result.success;
  const bgColor = isSuccess ? 'bg-green-900/30' : 'bg-red-900/30';
  const borderColor = isSuccess ? 'border-green-700' : 'border-red-700';
  const textColor = isSuccess ? 'text-green-400' : 'text-red-400';

  return (
    <div className={`p-4 rounded-lg border ${bgColor} ${borderColor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`font-semibold ${textColor}`}>
            {isSuccess ? 'Action Successful!' : 'Action Failed'}
          </p>
          <p className="text-sm text-gray-300 mt-1">{result.message}</p>
          {result.error && <p className="text-sm text-red-400 mt-1">{result.error}</p>}
          {result.gameEnded && result.winner && (
            <p className="text-sm text-amber-400 mt-2">
              Game Over! {result.winner === 'good' ? 'Good' : 'Evil'} team wins!
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 w-full py-2 px-3 rounded-lg bg-stone-700 text-gray-300 hover:bg-stone-600 transition-colors text-sm"
      >
        {result.gameEnded ? 'View Results' : 'Continue'}
      </button>
    </div>
  );
}

// =============================================================================
// Loading Spinner
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-4">
      <svg
        className="animate-spin h-6 w-6 text-amber-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span className="ml-2 text-gray-400">Executing action...</span>
    </div>
  );
}

// =============================================================================
// Main ActionPanel Component
// =============================================================================

export function ActionPanel({
  player,
  game,
  players,
  actions,
  ctx,
  onExecuteAction,
}: ActionPanelProps) {
  const [state, setState] = useState<PanelState>({ type: 'idle' });
  const lastClickRef = useRef<number>(0);
  const CLICK_DEBOUNCE_MS = 500;

  // Get character definition to find available actions
  const characterDef = player.character ? characterRegistry.get(player.character) : null;
  const characterActions = characterDef?.actions ?? [];

  // Get used action IDs for this player
  const usedActionIds = getUsedActionIds(player.id, actions);

  // Get available actions based on phase, character, and use limits
  const availableActions = actionRegistry.getAvailableActions(ctx, characterActions, usedActionIds);

  // Handle action click
  const handleActionClick = useCallback(
    (action: ActionDefinition) => {
      // Debounce clicks
      const now = Date.now();
      if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) {
        return;
      }
      lastClickRef.current = now;

      // Check if action requires targets
      if (action.minTargets > 0) {
        setState({ type: 'selecting', action });
      } else {
        // Execute immediately if no targets needed
        executeActionWithTargets(action, []);
      }
    },
    [ctx]
  );

  // Execute action with selected targets
  const executeActionWithTargets = useCallback(
    async (action: ActionDefinition, targetIds: string[]) => {
      setState({ type: 'executing', action });

      try {
        const result = await onExecuteAction(action.id, targetIds);
        setState({ type: 'result', action, result });
      } catch (error) {
        setState({
          type: 'result',
          action,
          result: {
            success: false,
            message: 'Failed to execute action',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    },
    [onExecuteAction]
  );

  // Handle target selection complete
  const handleTargetsSelected = useCallback(
    (targetIds: string[]) => {
      if (state.type !== 'selecting') return;
      executeActionWithTargets(state.action, targetIds);
    },
    [state, executeActionWithTargets]
  );

  // Handle cancel
  const handleCancel = useCallback(() => {
    setState({ type: 'idle' });
  }, []);

  // Handle dismiss result
  const handleDismissResult = useCallback(() => {
    setState({ type: 'idle' });
  }, []);

  // Don't render if player has no character or no actions
  if (!characterDef || characterActions.length === 0) {
    return null;
  }

  // Don't render if no actions available in current phase
  if (availableActions.length === 0 && state.type === 'idle') {
    // Show disabled state with used actions info
    const hasUsedAllActions = characterActions.every((actionId) =>
      usedActionIds.includes(actionId)
    );

    if (hasUsedAllActions) {
      return (
        <div className="bg-stone-800 rounded-xl p-4 border border-stone-700">
          <h3 className="font-semibold mb-2 text-gray-300">Special Ability</h3>
          <p className="text-sm text-gray-500">All abilities have been used</p>
        </div>
      );
    }

    return (
      <div className="bg-stone-800 rounded-xl p-4 border border-stone-700">
        <h3 className="font-semibold mb-2 text-gray-300">Special Ability</h3>
        <p className="text-sm text-gray-500">No actions available in this phase</p>
      </div>
    );
  }

  return (
    <div className="bg-stone-800 rounded-xl p-4 border border-stone-700">
      <h3 className="font-semibold mb-3 text-gray-300">Special Ability</h3>

      {/* Idle State - Show action buttons */}
      {state.type === 'idle' && (
        <div className="space-y-2">
          {availableActions.map((action) => (
            <ActionButton
              key={action.id}
              action={action}
              onClick={() => handleActionClick(action)}
            />
          ))}
          {/* Show phase indicator if actions are available */}
          <p className="text-xs text-green-400 mt-2">Available this phase</p>
        </div>
      )}

      {/* Selecting Targets State */}
      {state.type === 'selecting' && (
        <TargetSelector
          action={state.action}
          players={players}
          currentPlayerId={player.id}
          ctx={ctx}
          onSelect={handleTargetsSelected}
          onCancel={handleCancel}
        />
      )}

      {/* Executing State */}
      {state.type === 'executing' && <LoadingSpinner />}

      {/* Result State */}
      {state.type === 'result' && (
        <ResultDisplay
          action={state.action}
          result={state.result}
          onDismiss={handleDismissResult}
        />
      )}
    </div>
  );
}

export default ActionPanel;
