/**
 * PlayerList Component
 *
 * Displays a list of players in the game with:
 * - Player names with optional (you) indicator
 * - Crown icon for leader
 * - Team selection state (badge)
 * - Eliminated/dead status
 * - Selectable mode for team/target selection
 */

import type { Player } from '~/types/game';

// =============================================================================
// Types
// =============================================================================

export interface PlayerListProps {
  /** List of players to display */
  players: Player[];
  /** Current player's ID to show (you) indicator */
  currentPlayerId: string;
  /** Leader player's ID for crown icon */
  leaderId?: string;
  /** Currently selected team members */
  selectedTeam?: string[] | null;
  /** Enable selectable mode for team/target selection */
  selectable?: boolean;
  /** Currently selected player IDs (for selectable mode) */
  selectedIds?: string[];
  /** Callback when player is selected/deselected */
  onSelectPlayer?: (playerId: string, selected: boolean) => void;
  /** Filter function to determine which players can be selected */
  canSelect?: (player: Player) => boolean;
  /** Maximum number of selectable players (0 = no limit) */
  maxSelections?: number;
  /** Show compact view without badges */
  compact?: boolean;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface CrownIconProps {
  className?: string;
}

function CrownIcon({ className = 'h-4 w-4 text-yellow-400' }: CrownIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 1l3.22 6.636 7.28.772-5.384 4.96 1.554 7.132L12 17.27 5.33 20.5l1.554-7.132L1.5 8.408l7.28-.772L12 1z" />
    </svg>
  );
}

interface CheckIconProps {
  className?: string;
}

function CheckIcon({ className = 'h-4 w-4' }: CheckIconProps) {
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

// =============================================================================
// Player Item Component
// =============================================================================

interface PlayerItemProps {
  player: Player;
  isCurrentPlayer: boolean;
  isLeader: boolean;
  isOnTeam: boolean;
  isEliminated: boolean;
  selectable: boolean;
  isSelected: boolean;
  canBeSelected: boolean;
  atMaxSelections: boolean;
  onSelect?: () => void;
  compact: boolean;
}

function PlayerItem({
  player,
  isCurrentPlayer,
  isLeader,
  isOnTeam,
  isEliminated,
  selectable,
  isSelected,
  canBeSelected,
  atMaxSelections,
  onSelect,
  compact,
}: PlayerItemProps) {
  // Determine if this item is disabled in selectable mode
  const isDisabled = selectable && (!canBeSelected || (atMaxSelections && !isSelected));

  // Base styles
  let containerClasses = 'flex items-center justify-between p-2 rounded-lg transition-colors';

  // Background based on state
  if (selectable) {
    if (isSelected) {
      containerClasses += ' bg-blue-900/50 border-2 border-blue-500';
    } else if (isDisabled) {
      containerClasses += ' bg-stone-800/50 opacity-50 cursor-not-allowed';
    } else {
      containerClasses += ' bg-stone-700/50 hover:bg-stone-700 cursor-pointer';
    }
  } else {
    containerClasses += isCurrentPlayer ? ' bg-stone-700' : ' bg-stone-800';
  }

  // Eliminated styling
  if (isEliminated && !selectable) {
    containerClasses += ' opacity-50';
  }

  const handleClick = () => {
    if (selectable && canBeSelected && onSelect && (!atMaxSelections || isSelected)) {
      onSelect();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // Render as button if selectable, div otherwise
  const Component = selectable ? 'button' : 'div';
  const buttonProps = selectable
    ? {
        type: 'button' as const,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        disabled: isDisabled,
        'aria-pressed': isSelected,
        'aria-label': `${player.display_name}${isSelected ? ' (selected)' : ''}${isLeader ? ' (leader)' : ''}`,
      }
    : {};

  return (
    <Component className={containerClasses} {...buttonProps}>
      <div className="flex items-center gap-2">
        {/* Selection indicator for selectable mode */}
        {selectable && (
          <div
            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
              isSelected
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-stone-500 bg-transparent'
            }`}
          >
            {isSelected && <CheckIcon className="h-3 w-3" />}
          </div>
        )}

        {/* Leader crown */}
        {isLeader && <CrownIcon />}

        {/* Player name */}
        <span className={isCurrentPlayer ? 'font-semibold' : ''}>
          {player.display_name}
        </span>

        {/* (you) indicator */}
        {isCurrentPlayer && (
          <span className="text-xs text-gray-500">(you)</span>
        )}
      </div>

      {/* Status badges (not shown in compact mode) */}
      {!compact && (
        <div className="flex items-center gap-2">
          {/* Team badge */}
          {isOnTeam && !selectable && (
            <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-400 rounded">
              Team
            </span>
          )}

          {/* Eliminated badge */}
          {isEliminated && (
            <span className="text-xs px-2 py-0.5 bg-red-900/50 text-red-400 rounded">
              {selectable ? 'Dead' : 'Eliminated'}
            </span>
          )}

          {/* Alive indicator (subtle, only shown when not eliminated) */}
          {!isEliminated && selectable && (
            <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-400/70 rounded">
              Alive
            </span>
          )}
        </div>
      )}
    </Component>
  );
}

// =============================================================================
// Main PlayerList Component
// =============================================================================

export function PlayerList({
  players,
  currentPlayerId,
  leaderId,
  selectedTeam,
  selectable = false,
  selectedIds = [],
  onSelectPlayer,
  canSelect,
  maxSelections = 0,
  compact = false,
}: PlayerListProps) {
  // Sort players by seat order
  const sortedPlayers = [...players].sort(
    (a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0)
  );

  // Check if at max selections
  const atMaxSelections = maxSelections > 0 && selectedIds.length >= maxSelections;

  const handleSelectPlayer = (playerId: string, currentlySelected: boolean) => {
    if (onSelectPlayer) {
      onSelectPlayer(playerId, !currentlySelected);
    }
  };

  return (
    <div
      className="bg-stone-800 rounded-xl p-4 border border-stone-700"
      role={selectable ? 'group' : undefined}
      aria-label={selectable ? 'Select players' : 'Player list'}
    >
      {!compact && (
        <h3 className="font-semibold mb-3 text-gray-300">
          {selectable ? 'Select Players' : 'Players'}
        </h3>
      )}

      {/* Selection counter for selectable mode */}
      {selectable && maxSelections > 0 && (
        <div className="mb-3 text-sm text-gray-400">
          Selected: {selectedIds.length} / {maxSelections}
        </div>
      )}

      <div className="space-y-2">
        {sortedPlayers.map((player) => {
          const isCurrentPlayer = player.id === currentPlayerId;
          const isLeader = player.id === leaderId;
          const isOnTeam = selectedTeam?.includes(player.id) ?? false;
          const isEliminated = !player.is_alive;
          const isSelected = selectedIds.includes(player.id);
          const canBeSelected = canSelect ? canSelect(player) : player.is_alive;

          return (
            <PlayerItem
              key={player.id}
              player={player}
              isCurrentPlayer={isCurrentPlayer}
              isLeader={isLeader}
              isOnTeam={isOnTeam}
              isEliminated={isEliminated}
              selectable={selectable}
              isSelected={isSelected}
              canBeSelected={canBeSelected}
              atMaxSelections={atMaxSelections}
              onSelect={() => handleSelectPlayer(player.id, isSelected)}
              compact={compact}
            />
          );
        })}
      </div>
    </div>
  );
}

export default PlayerList;
