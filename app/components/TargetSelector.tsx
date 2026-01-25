/**
 * TargetSelector Component
 *
 * Reusable component for selecting player targets for actions.
 * Features:
 * - Player cards/tiles for selection with clear visual states
 * - Eliminated players visually distinct
 * - Enforces target count limits
 * - Validates target requirements
 * - Visual feedback on selection with amber accent color
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
// Constants
// =============================================================================

// Deterministic avatar colors based on player ID
const AVATAR_COLORS = [
  { from: 'from-blue-500', to: 'to-blue-700', text: 'text-blue-100' },
  { from: 'from-emerald-500', to: 'to-emerald-700', text: 'text-emerald-100' },
  { from: 'from-purple-500', to: 'to-purple-700', text: 'text-purple-100' },
  { from: 'from-amber-500', to: 'to-amber-700', text: 'text-amber-100' },
  { from: 'from-rose-500', to: 'to-rose-700', text: 'text-rose-100' },
  { from: 'from-cyan-500', to: 'to-cyan-700', text: 'text-cyan-100' },
  { from: 'from-orange-500', to: 'to-orange-700', text: 'text-orange-100' },
  { from: 'from-indigo-500', to: 'to-indigo-700', text: 'text-indigo-100' },
];

function getAvatarColor(playerId: string) {
  const hash = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
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
// Icons
// =============================================================================

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function TargetIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-5-9h4V7h2v4h4v2h-4v4h-2v-4H7v-2z"/>
    </svg>
  );
}

function XIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// =============================================================================
// Sub-Components
// =============================================================================

interface PlayerTargetCardProps {
  player: Player;
  isSelected: boolean;
  isCurrentPlayer: boolean;
  isDisabled: boolean;
  selectionOrder?: number;
  onClick: () => void;
}

function PlayerTargetCard({
  player,
  isSelected,
  isCurrentPlayer,
  isDisabled,
  selectionOrder,
  onClick,
}: PlayerTargetCardProps) {
  const color = getAvatarColor(player.id);
  const initials = getInitials(player.display_name);

  // Build card classes
  let cardClasses = `
    relative p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center
  `;

  if (isSelected) {
    cardClasses += ' bg-amber-900/40 border-amber-400 shadow-lg shadow-amber-500/25 transform scale-[1.02] ring-2 ring-amber-400/30 ring-offset-2 ring-offset-stone-800';
  } else if (isDisabled) {
    cardClasses += ' bg-stone-800/50 border-stone-700 opacity-40 cursor-not-allowed';
  } else {
    cardClasses += ' bg-stone-800 border-stone-600 hover:border-amber-400/60 hover:bg-stone-700/80 cursor-pointer hover:shadow-md';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      aria-pressed={isSelected}
      aria-label={`${player.display_name}${isSelected ? ' - Selected' : ''}${isCurrentPlayer ? ' (you)' : ''}`}
      className={cardClasses}
    >
      {/* Selection indicator badge */}
      {isSelected && (
        <div className="absolute -top-2.5 -left-2.5 w-6 h-6 bg-gradient-to-br from-amber-400 to-amber-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/40 z-10">
          {selectionOrder !== undefined ? (
            <span className="text-xs font-bold text-amber-900">{selectionOrder + 1}</span>
          ) : (
            <CheckIcon className="h-3.5 w-3.5 text-white" />
          )}
        </div>
      )}

      {/* Avatar */}
      <div
        className={`
          w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm mb-1.5
          bg-gradient-to-br ${color.from} ${color.to} ${color.text}
          ${isSelected ? 'ring-2 ring-white/30' : ''}
          transition-all duration-200
        `}
      >
        {initials}
      </div>

      {/* Player name */}
      <p className={`
        text-sm font-medium text-center truncate max-w-full
        ${isSelected ? 'text-amber-200' : 'text-gray-200'}
      `}>
        {player.display_name}
      </p>

      {/* You indicator */}
      {isCurrentPlayer && (
        <span className="text-[10px] text-amber-400/70 font-medium">(you)</span>
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
    <div className="flex items-center gap-1.5">
      <span
        className={`text-xs font-medium ${isComplete ? 'text-green-400' : 'text-gray-400'}`}
      >
        {current}/{rangeText}
      </span>
      {isComplete && (
        <div className="flex items-center gap-0.5 text-[10px] text-green-400 bg-green-900/30 px-1.5 py-0.5 rounded-full">
          <CheckIcon className="h-2.5 w-2.5" />
          Ready
        </div>
      )}
    </div>
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
  const showSelectionOrder = action.maxTargets > 1;

  return (
    <div className="space-y-4 bg-stone-800/50 rounded-xl p-4 border border-stone-700">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-900/30 rounded-lg">
            <TargetIcon className="h-4 w-4 text-amber-400" />
          </div>
          <h4 className="text-sm font-semibold text-gray-200">
            Select Target{action.maxTargets > 1 ? 's' : ''}
          </h4>
        </div>
        <SelectionCounter
          current={selectedTargets.length}
          min={action.minTargets}
          max={action.maxTargets}
        />
      </div>

      {/* Action description */}
      <div className="px-3 py-2 bg-stone-700/50 rounded-lg border border-stone-600/50">
        <p className="text-xs text-gray-400">{action.description}</p>
      </div>

      {/* Player Grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-2"
        role="group"
        aria-label="Select targets"
      >
        {eligibleTargets.map((player) => {
          const isSelected = selectedTargets.includes(player.id);
          const isCurrentPlayer = player.id === currentPlayerId;
          const atMaxAndNotSelected =
            selectedTargets.length >= action.maxTargets && !isSelected;
          const selectionIndex = selectedTargets.indexOf(player.id);

          return (
            <PlayerTargetCard
              key={player.id}
              player={player}
              isSelected={isSelected}
              isCurrentPlayer={isCurrentPlayer}
              isDisabled={atMaxAndNotSelected}
              selectionOrder={showSelectionOrder && selectionIndex >= 0 ? selectionIndex : undefined}
              onClick={() => handleToggleTarget(player.id)}
            />
          );
        })}
      </div>

      {/* No eligible targets message */}
      {eligibleTargets.length === 0 && (
        <div className="text-center py-4 bg-red-900/20 rounded-lg border border-red-500/30">
          <p className="text-sm text-red-400">No eligible targets available</p>
        </div>
      )}

      {/* Validation error */}
      {validation.error && selectedTargets.length > 0 && (
        <div className="px-3 py-2 bg-amber-900/20 rounded-lg border border-amber-500/30">
          <p className="text-xs text-amber-400">{validation.error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 px-4 rounded-xl bg-stone-700 text-gray-300 hover:bg-stone-600 transition-all duration-200 text-sm font-medium flex items-center justify-center gap-2 border border-stone-600 hover:border-stone-500"
        >
          <XIcon className="h-4 w-4" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          aria-disabled={!canConfirm}
          className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
            canConfirm
              ? 'bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 shadow-lg shadow-amber-500/25 hover:shadow-amber-500/40 active:scale-[0.98]'
              : 'bg-stone-700 text-gray-500 cursor-not-allowed border border-stone-600'
          }`}
        >
          <CheckIcon className="h-4 w-4" />
          Confirm Target{action.maxTargets > 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}

export default TargetSelector;
