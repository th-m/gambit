/**
 * PlayerList Component
 *
 * Displays a list of players in the game with:
 * - Player cards/tiles for selection
 * - Clear selected/unselected states
 * - Eliminated players visually distinct
 * - Current leader marked with crown
 * - Team members highlighted during mission
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
  /** Use grid layout (cards) instead of list layout */
  gridLayout?: boolean;
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

function SkullIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2C6.48 2 2 6.48 2 12c0 3.31 1.61 6.24 4.09 8.07V22h2.5v-2h2.91v2h2.5v-1.93C16.39 18.24 18 15.31 18 12c0-5.52-4.48-10-10-10zm-3.5 11c-.83 0-1.5-.67-1.5-1.5S7.67 10 8.5 10s1.5.67 1.5 1.5S9.33 13 8.5 13zm7 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
    </svg>
  );
}

function ShieldIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

// =============================================================================
// Avatar Component
// =============================================================================

interface PlayerAvatarProps {
  player: Player;
  size?: 'sm' | 'md' | 'lg';
  isEliminated: boolean;
  isLeader: boolean;
  isOnTeam: boolean;
}

function PlayerAvatar({ player, size = 'md', isEliminated, isLeader, isOnTeam }: PlayerAvatarProps) {
  const color = getAvatarColor(player.id);
  const initials = getInitials(player.display_name);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  return (
    <div className="relative">
      <div
        className={`
          ${sizeClasses[size]} rounded-full flex items-center justify-center font-bold
          bg-gradient-to-br ${color.from} ${color.to} ${color.text}
          ${isEliminated ? 'grayscale opacity-50' : ''}
          ${isOnTeam && !isEliminated ? 'ring-2 ring-blue-400 ring-offset-2 ring-offset-stone-800' : ''}
          transition-all duration-200
        `}
      >
        {isEliminated ? (
          <SkullIcon className={size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'} />
        ) : (
          initials
        )}
      </div>
      
      {/* Leader crown badge */}
      {isLeader && !isEliminated && (
        <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-0.5 shadow-lg shadow-yellow-500/30">
          <CrownIcon className="h-3 w-3 text-yellow-900" />
        </div>
      )}
      
      {/* Team member badge */}
      {isOnTeam && !isEliminated && !isLeader && (
        <div className="absolute -top-1 -right-1 bg-blue-500 rounded-full p-0.5 shadow-lg shadow-blue-500/30">
          <ShieldIcon className="h-3 w-3 text-white" />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Player Card Component (Grid Layout)
// =============================================================================

interface PlayerCardProps {
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
}

function PlayerCard({
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
}: PlayerCardProps) {
  const isDisabled = selectable && (!canBeSelected || (atMaxSelections && !isSelected));

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

  // Determine card styling based on state
  let cardClasses = `
    relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200
  `;

  if (isEliminated) {
    cardClasses += ' bg-stone-900/50 border-stone-700 opacity-60';
  } else if (selectable) {
    if (isSelected) {
      cardClasses += ' bg-blue-900/40 border-blue-400 shadow-lg shadow-blue-500/20 transform scale-[1.02]';
    } else if (isDisabled) {
      cardClasses += ' bg-stone-800/50 border-stone-700 opacity-40 cursor-not-allowed';
    } else {
      cardClasses += ' bg-stone-800 border-stone-600 hover:border-stone-400 hover:bg-stone-700/80 cursor-pointer';
    }
  } else if (isOnTeam) {
    cardClasses += ' bg-blue-900/30 border-blue-500/50 shadow-md shadow-blue-500/10';
  } else if (isCurrentPlayer) {
    cardClasses += ' bg-stone-700 border-stone-500';
  } else {
    cardClasses += ' bg-stone-800 border-stone-700';
  }

  const Component = selectable ? 'button' : 'div';
  const buttonProps = selectable
    ? {
        type: 'button' as const,
        onClick: handleClick,
        onKeyDown: handleKeyDown,
        disabled: isDisabled,
        'aria-pressed': isSelected,
        'aria-label': `${player.display_name}${isSelected ? ' (selected)' : ''}${isLeader ? ' (leader)' : ''}${isEliminated ? ' (eliminated)' : ''}`,
      }
    : {};

  return (
    <Component className={cardClasses} {...buttonProps}>
      {/* Selection check badge */}
      {selectable && isSelected && (
        <div className="absolute -top-2 -left-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30 z-10">
          <CheckIcon className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Avatar */}
      <PlayerAvatar
        player={player}
        size="lg"
        isEliminated={isEliminated}
        isLeader={isLeader}
        isOnTeam={isOnTeam && !selectable}
      />

      {/* Name */}
      <p className={`
        mt-2 text-sm font-medium truncate max-w-full
        ${isEliminated ? 'text-gray-500 line-through' : ''}
        ${isSelected ? 'text-blue-200' : isCurrentPlayer ? 'text-white' : 'text-gray-200'}
      `}>
        {player.display_name}
      </p>

      {/* You indicator */}
      {isCurrentPlayer && (
        <span className="text-xs text-blue-400 font-medium">(you)</span>
      )}

      {/* Status badges */}
      <div className="flex gap-1 mt-1 flex-wrap justify-center">
        {isLeader && !isEliminated && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-yellow-900/50 text-yellow-300 rounded-full">
            <CrownIcon className="h-2.5 w-2.5" />
            Leader
          </span>
        )}
        {isOnTeam && !selectable && !isEliminated && (
          <span className="text-[10px] px-1.5 py-0.5 bg-blue-900/50 text-blue-300 rounded-full">
            On Team
          </span>
        )}
        {isEliminated && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-red-900/60 text-red-300 rounded-full">
            <SkullIcon className="h-2.5 w-2.5" />
            Eliminated
          </span>
        )}
      </div>
    </Component>
  );
}

// =============================================================================
// Player Item Component (List Layout)
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
  const isDisabled = selectable && (!canBeSelected || (atMaxSelections && !isSelected));

  // Build container classes
  let containerClasses = 'flex items-center gap-3 p-2 rounded-lg transition-all duration-200';

  if (isEliminated) {
    containerClasses += ' bg-stone-900/30 opacity-50';
  } else if (selectable) {
    if (isSelected) {
      containerClasses += ' bg-blue-900/40 border-2 border-blue-400 shadow-md shadow-blue-500/20';
    } else if (isDisabled) {
      containerClasses += ' bg-stone-800/50 opacity-40 cursor-not-allowed border-2 border-transparent';
    } else {
      containerClasses += ' bg-stone-700/50 hover:bg-stone-700 cursor-pointer border-2 border-transparent hover:border-stone-500';
    }
  } else if (isOnTeam) {
    containerClasses += ' bg-blue-900/20 border-l-4 border-blue-400';
  } else {
    containerClasses += isCurrentPlayer ? ' bg-stone-700' : ' bg-stone-800';
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
      {/* Selection indicator for selectable mode */}
      {selectable && (
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            isSelected
              ? 'bg-blue-500 border-blue-500 text-white scale-110'
              : 'border-stone-500 bg-transparent'
          }`}
        >
          {isSelected && <CheckIcon className="h-3 w-3" />}
        </div>
      )}

      {/* Avatar */}
      <PlayerAvatar
        player={player}
        size="sm"
        isEliminated={isEliminated}
        isLeader={isLeader}
        isOnTeam={isOnTeam && !selectable}
      />

      {/* Player info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Leader crown inline */}
          {isLeader && !isEliminated && (
            <CrownIcon className="h-4 w-4 text-yellow-400 flex-shrink-0" />
          )}

          {/* Player name */}
          <span className={`
            truncate
            ${isCurrentPlayer ? 'font-semibold text-white' : 'text-gray-200'}
            ${isEliminated ? 'line-through text-gray-500' : ''}
          `}>
            {player.display_name}
          </span>

          {/* (you) indicator */}
          {isCurrentPlayer && (
            <span className="text-xs text-blue-400 flex-shrink-0">(you)</span>
          )}
        </div>
      </div>

      {/* Status badges (not shown in compact mode) */}
      {!compact && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Team badge */}
          {isOnTeam && !selectable && !isEliminated && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded-full">
              <ShieldIcon className="h-3 w-3" />
              Team
            </span>
          )}

          {/* Eliminated badge */}
          {isEliminated && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-900/60 text-red-300 rounded-full">
              <SkullIcon className="h-3 w-3" />
              Eliminated
            </span>
          )}

          {/* Alive indicator (subtle, only shown when not eliminated in selectable mode) */}
          {!isEliminated && selectable && (
            <span className="text-xs px-2 py-0.5 bg-green-900/30 text-green-400/70 rounded-full">
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
  gridLayout = false,
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
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-gray-400">
            Selected: <span className="font-semibold text-blue-400">{selectedIds.length}</span> / {maxSelections}
          </span>
          {selectedIds.length === maxSelections && (
            <span className="text-xs text-green-400 flex items-center gap-1">
              <CheckIcon className="h-3 w-3" />
              Ready
            </span>
          )}
        </div>
      )}

      {/* Grid or List Layout */}
      {gridLayout ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {sortedPlayers.map((player) => {
            const isCurrentPlayer = player.id === currentPlayerId;
            const isLeader = player.id === leaderId;
            const isOnTeam = selectedTeam?.includes(player.id) ?? false;
            const isEliminated = !player.is_alive;
            const isSelected = selectedIds.includes(player.id);
            const canBeSelected = canSelect ? canSelect(player) : player.is_alive;

            return (
              <PlayerCard
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
              />
            );
          })}
        </div>
      ) : (
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
      )}
    </div>
  );
}

export default PlayerList;
