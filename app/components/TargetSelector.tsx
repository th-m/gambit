/**
 * TargetSelector Component
 *
 * Reusable component for selecting player targets for actions.
 * Features:
 * - Filters eligible targets based on action requirements
 * - Displays player grid with selection state
 * - Enforces target count limits
 * - Validates target requirements
 * - Visual feedback on selection
 * - Calls onChange with selected players
 */

import { useState, useCallback } from 'react';
import type {
  Player,
  GameContext,
  ActionDefinition,
} from '~/types/game';

// =============================================================================
// Types
// =============================================================================

export interface TargetSelectorProps {
  /** Action being executed (provides validation info) */
  action: ActionDefinition;
  /** Available players to target */
  players: Player[];
  /** Current player ID (for self-targeting rules) */
  currentPlayerId: string;
  /** Game context for validation */
  ctx: GameContext;
  /** Callback when targets are selected and confirmed */
  onSelect: (targetIds: string[]) => void;
  /** Callback to cancel selection */
  onCancel: () => void;
  /** Optional custom filter for eligible targets */
  filterTargets?: (player: Player, ctx: GameContext) => boolean;
  /** Whether to allow self-targeting (default: depends on action) */
  allowSelfTarget?: boolean;
}

export interface TargetSelectorState {
  /** Currently selected target IDs */
  selectedTargets: string[];
  /** Whether current selection is valid */
  isValid: boolean;
  /** Validation error message if any */
  validationError: string | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Default filter for eligible targets: alive players only
 */
function defaultTargetFilter(player: Player): boolean {
  return player.is_alive;
}

/**
 * Check if action allows self-targeting
 * Some actions like 'protect' allow self-targeting
 */
function actionAllowsSelfTarget(actionId: string): boolean {
  const selfTargetActions = ['protect'];
  return selfTargetActions.includes(actionId);
}

/**
 * Validate targets against action requirements
 */
function validateTargets(
  action: ActionDefinition,
  selectedTargets: string[],
  eligibleTargets: Player[],
  ctx: GameContext
): { isValid: boolean; error: string | null } {
  const count = selectedTargets.length;

  // Check minimum targets
  if (count < action.minTargets) {
    return {
      isValid: false,
      error: `Select at least ${action.minTargets} target${action.minTargets > 1 ? 's' : ''}`,
    };
  }

  // Check maximum targets
  if (count > action.maxTargets) {
    return {
      isValid: false,
      error: `Select at most ${action.maxTargets} target${action.maxTargets > 1 ? 's' : ''}`,
    };
  }

  // Check all targets are eligible
  const eligibleIds = new Set(eligibleTargets.map((p) => p.id));
  const invalidTargets = selectedTargets.filter((id) => !eligibleIds.has(id));
  if (invalidTargets.length > 0) {
    return {
      isValid: false,
      error: 'Some selected targets are not eligible',
    };
  }

  // Use action's custom validateTargets if provided
  if (action.validateTargets) {
    const result = action.validateTargets(ctx, selectedTargets);
    if (!result.valid) {
      return {
        isValid: false,
        error: result.error || 'Invalid target selection',
      };
    }
  }

  return { isValid: true, error: null };
}

// =============================================================================
// Sub-Components
// =============================================================================

interface PlayerTargetButtonProps {
  player: Player;
  isSelected: boolean;
  isCurrentPlayer: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

function PlayerTargetButton({
  player,
  isSelected,
  isCurrentPlayer,
  isDisabled,
  onClick,
}: PlayerTargetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-pressed={isSelected}
      className={`
        relative p-3 rounded-lg text-sm font-medium transition-all
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${
          isSelected
            ? 'bg-amber-600/30 border-2 border-amber-500 text-amber-300 shadow-lg shadow-amber-500/20'
            : 'bg-stone-700 border-2 border-transparent text-gray-300 hover:bg-stone-600 hover:border-stone-500'
        }
      `}
    >
      <span className="block truncate">{player.display_name}</span>
      {isCurrentPlayer && (
        <span className="text-xs text-gray-500 block mt-0.5">(you)</span>
      )}
      {/* Selection indicator */}
      {isSelected && (
        <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400" />
      )}
    </button>
  );
}

interface SelectionCounterProps {
  current: number;
  min: number;
  max: number;
}

function SelectionCounter({ current, min, max }: SelectionCounterProps) {
  const rangeText = min === max ? `${max}` : `${min}-${max}`;
  const isComplete = current >= min && current <= max;

  return (
    <span
      className={`text-xs ${isComplete ? 'text-green-400' : 'text-gray-500'}`}
    >
      {current}/{rangeText} selected
    </span>
  );
}

// =============================================================================
// Main TargetSelector Component
// =============================================================================

export function TargetSelector({
  action,
  players,
  currentPlayerId,
  ctx,
  onSelect,
  onCancel,
  filterTargets,
  allowSelfTarget,
}: TargetSelectorProps) {
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);

  // Determine if self-targeting is allowed
  const canSelfTarget =
    allowSelfTarget !== undefined
      ? allowSelfTarget
      : actionAllowsSelfTarget(action.id);

  // Filter eligible targets
  const customFilter = filterTargets || defaultTargetFilter;
  const eligibleTargets = players.filter((p) => {
    // Apply custom/default filter
    if (!customFilter(p, ctx)) return false;
    // Self-targeting check
    if (p.id === currentPlayerId && !canSelfTarget) return false;
    return true;
  });

  // Validate current selection
  const validation = validateTargets(action, selectedTargets, eligibleTargets, ctx);

  // Toggle target selection
  const handleToggleTarget = useCallback(
    (playerId: string) => {
      setSelectedTargets((prev) => {
        if (prev.includes(playerId)) {
          // Deselect
          return prev.filter((id) => id !== playerId);
        }
        // Check if we've reached max targets
        if (prev.length >= action.maxTargets) {
          // Replace the oldest target if at max
          return [...prev.slice(1), playerId];
        }
        // Add to selection
        return [...prev, playerId];
      });
    },
    [action.maxTargets]
  );

  // Confirm selection
  const handleConfirm = useCallback(() => {
    if (!validation.isValid) return;
    onSelect(selectedTargets);
  }, [validation.isValid, selectedTargets, onSelect]);

  // Check if we have enough selections to confirm
  const canConfirm = validation.isValid;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-300">
          Select Target{action.maxTargets > 1 ? 's' : ''}
        </h4>
        <SelectionCounter
          current={selectedTargets.length}
          min={action.minTargets}
          max={action.maxTargets}
        />
      </div>

      {/* Action description reminder */}
      <p className="text-xs text-gray-500">{action.description}</p>

      {/* Player Grid */}
      <div
        className="grid grid-cols-2 gap-2"
        role="group"
        aria-label="Select targets"
      >
        {eligibleTargets.map((player) => {
          const isSelected = selectedTargets.includes(player.id);
          const isCurrentPlayer = player.id === currentPlayerId;
          const atMaxAndNotSelected =
            selectedTargets.length >= action.maxTargets && !isSelected;

          return (
            <PlayerTargetButton
              key={player.id}
              player={player}
              isSelected={isSelected}
              isCurrentPlayer={isCurrentPlayer}
              isDisabled={atMaxAndNotSelected}
              onClick={() => handleToggleTarget(player.id)}
            />
          );
        })}
      </div>

      {/* No eligible targets message */}
      {eligibleTargets.length === 0 && (
        <p className="text-sm text-red-400 text-center py-2">
          No eligible targets available
        </p>
      )}

      {/* Validation error */}
      {validation.error && selectedTargets.length > 0 && (
        <p className="text-xs text-amber-400">{validation.error}</p>
      )}

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
          aria-disabled={!canConfirm}
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

export default TargetSelector;
