/**
 * TeamSelection Component
 *
 * Displays a selectable player grid for the leader to choose mission team members.
 * Non-leaders see a waiting message with the current selection state.
 * 
 * Features:
 * - Player cards/tiles for selection
 * - Clear selected/unselected states with animations
 * - Eliminated players visually distinct
 * - Current leader marked with crown
 * - Team members highlighted during mission
 * - Selection pop and ripple animations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Game, Player } from '~/types/game';
import { getMissionSize } from '~/services/StateValidator';
import { useKeyboardNavigation, FOCUS_RING_CLASSES } from '~/hooks/useKeyboardNavigation';
import { 
  SELECTION_KEYFRAMES, 
  ANIMATION_DURATIONS,
  ANIMATION_EASINGS,
} from '~/utils/animations';

// =============================================================================
// Types
// =============================================================================

interface TeamSelectionProps {
  game: Game;
  players: Player[];
  currentPlayer: Player;
  onSelectTeam: (teamIds: string[]) => Promise<{ success: boolean; error?: string }>;
}

// =============================================================================
// Constants
// =============================================================================

const CLICK_DEBOUNCE_MS = 500;

// Avatar colors for player cards
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
 * Get the current leader based on crown_index and alive players.
 */
function getCurrentLeader(players: Player[], crownIndex: number): Player | undefined {
  const alivePlayers = players
    .filter((p) => p.is_alive)
    .sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0));
  return alivePlayers[crownIndex % alivePlayers.length];
}

// =============================================================================
// Icons
// =============================================================================

function CrownIcon({ className = 'h-4 w-4' }: { className?: string }) {
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

function UsersIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
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

// =============================================================================
// Sub-Components
// =============================================================================

interface PlayerCardProps {
  player: Player;
  isSelected: boolean;
  isLeader: boolean;
  isCurrentPlayer: boolean;
  isEliminated: boolean;
  canSelect: boolean;
  isAtLimit: boolean;
  onToggle: () => void;
  // Animation state
  animationState: 'none' | 'selecting' | 'deselecting';
  // Keyboard navigation props
  tabIndex?: number;
  'data-focused'?: boolean;
  onFocus?: () => void;
  itemRef?: (el: HTMLElement | null) => void;
}

function PlayerCard({
  player,
  isSelected,
  isLeader,
  isCurrentPlayer,
  isEliminated,
  canSelect,
  isAtLimit,
  onToggle,
  animationState,
  tabIndex,
  'data-focused': dataFocused,
  onFocus: onFocusNav,
  itemRef,
}: PlayerCardProps) {
  const color = getAvatarColor(player.id);
  const initials = getInitials(player.display_name);
  const canBeSelected = canSelect && (isSelected || !isAtLimit) && !isEliminated;

  // Determine card styling with focus-visible ring for keyboard navigation
  let cardClasses = `
    relative p-4 rounded-xl border-2 flex flex-col items-center
    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900
    transition-[background-color,border-color,opacity] duration-200
  `;

  // Animation classes based on state
  let animationStyle: React.CSSProperties = {};
  if (animationState === 'selecting') {
    animationStyle = {
      animation: `selection-pop ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.bounce}`,
    };
  } else if (animationState === 'deselecting') {
    animationStyle = {
      animation: `selection-pop ${ANIMATION_DURATIONS.fast}ms ${ANIMATION_EASINGS.default} reverse`,
    };
  }

  if (isEliminated) {
    cardClasses += ' bg-stone-900/50 border-stone-700 opacity-40 cursor-not-allowed';
  } else if (isSelected) {
    cardClasses += ' bg-blue-900/40 border-blue-400 shadow-lg shadow-blue-500/25 scale-[1.03] ring-2 ring-blue-400/30 ring-offset-2 ring-offset-stone-900';
  } else if (canBeSelected) {
    cardClasses += ' bg-stone-800 border-stone-600 hover:border-blue-400/60 hover:bg-stone-700/80 cursor-pointer hover:shadow-md hover:-translate-y-1 active:scale-[0.98]';
  } else {
    cardClasses += ' bg-stone-800/50 border-stone-700 opacity-50 cursor-not-allowed';
  }

  return (
    <button
      type="button"
      onClick={() => canBeSelected && onToggle()}
      disabled={!canBeSelected}
      aria-pressed={isSelected}
      aria-label={`${player.display_name}${isLeader ? ' (Leader)' : ''}${isSelected ? ' - Selected' : ''}${isEliminated ? ' - Eliminated' : ''}`}
      className={cardClasses}
      style={animationStyle}
      tabIndex={tabIndex}
      data-focused={dataFocused}
      onFocus={onFocusNav}
      ref={itemRef}
    >
      {/* Selection ripple effect */}
      {animationState === 'selecting' && (
        <div 
          className="absolute inset-0 rounded-xl bg-blue-400/30 pointer-events-none"
          style={{
            animation: `selection-ripple ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.decelerate} forwards`,
          }}
        />
      )}

      {/* Selection check badge with animation */}
      {isSelected && (
        <div 
          className="absolute -top-2.5 -left-2.5 w-7 h-7 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/40 z-10"
          style={{
            animation: animationState === 'selecting' 
              ? `selection-check ${ANIMATION_DURATIONS.standard}ms ${ANIMATION_EASINGS.spring} forwards`
              : undefined,
          }}
        >
          <CheckIcon className="h-4 w-4 text-white" />
        </div>
      )}

      {/* Leader crown badge */}
      {isLeader && !isEliminated && (
        <div className="absolute -top-2.5 -right-2.5 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-full p-1.5 shadow-lg shadow-yellow-500/40 z-10">
          <CrownIcon className="h-3.5 w-3.5 text-yellow-900" />
        </div>
      )}

      {/* Avatar with pulse on selection */}
      <div
        className={`
          w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg mb-2
          bg-gradient-to-br ${color.from} ${color.to} ${color.text}
          ${isEliminated ? 'grayscale opacity-50' : ''}
          ${isSelected ? 'ring-2 ring-white/30' : ''}
          transition-all duration-200
        `}
        style={isSelected && animationState === 'selecting' ? {
          animation: `action-pulse ${ANIMATION_DURATIONS.emphasis}ms ${ANIMATION_EASINGS.default}`,
        } : undefined}
      >
        {isEliminated ? (
          <SkullIcon className="h-6 w-6" />
        ) : (
          initials
        )}
      </div>

      {/* Player name */}
      <p className={`
        font-medium text-center truncate max-w-full transition-colors duration-200
        ${isEliminated ? 'text-gray-500 line-through' : ''}
        ${isSelected ? 'text-blue-200' : 'text-gray-200'}
      `}>
        {player.display_name}
      </p>

      {/* You indicator */}
      {isCurrentPlayer && !isEliminated && (
        <span className="text-xs text-blue-400 font-medium mt-0.5">(you)</span>
      )}

      {/* Status badges */}
      <div className="flex gap-1 mt-1.5 flex-wrap justify-center">
        {isLeader && !isEliminated && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-yellow-900/50 text-yellow-300 rounded-full font-medium">
            <CrownIcon className="h-2.5 w-2.5" />
            Leader
          </span>
        )}
        {isEliminated && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 bg-red-900/60 text-red-300 rounded-full">
            <SkullIcon className="h-2.5 w-2.5" />
            Eliminated
          </span>
        )}
      </div>
    </button>
  );
}

interface WaitingViewProps {
  leaderName: string;
  selectedTeam: string[] | null;
  players: Player[];
  requiredSize: number;
}

function WaitingView({ leaderName, selectedTeam, players, requiredSize }: WaitingViewProps) {
  const selectedPlayers = (selectedTeam || [])
    .map((id) => players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);

  return (
    <div className="text-center">
      {/* Waiting indicator */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-stone-700 to-stone-800 rounded-xl border border-stone-600 shadow-lg">
          <div className="relative">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse" />
            <div className="absolute inset-0 w-3 h-3 bg-blue-400 rounded-full animate-ping opacity-50" />
          </div>
          <span className="text-gray-200">
            Waiting for <span className="text-blue-400 font-semibold">{leaderName}</span> to select the team...
          </span>
        </div>
      </div>

      {/* Selection progress */}
      <div className="bg-stone-800/80 rounded-xl p-5 border border-stone-700 shadow-inner">
        <div className="flex items-center justify-center gap-2 mb-4">
          <UsersIcon className="h-5 w-5 text-blue-400" />
          <p className="text-sm text-gray-300">
            Current selection: <span className="font-semibold text-blue-400">{selectedPlayers.length}</span>/{requiredSize}
          </p>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-stone-700 rounded-full h-2 mb-4 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-blue-400 h-full rounded-full transition-all duration-500 ease-out"
            style={{ width: `${(selectedPlayers.length / requiredSize) * 100}%` }}
          />
        </div>

        {/* Selected player pills */}
        {selectedPlayers.length > 0 ? (
          <div className="flex flex-wrap gap-2 justify-center">
            {selectedPlayers.map((player) => {
              const color = getAvatarColor(player.id);
              const initials = getInitials(player.display_name);
              return (
                <div
                  key={player.id}
                  className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/40 border border-blue-500/40 text-blue-200 rounded-full text-sm"
                >
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-gradient-to-br ${color.from} ${color.to} ${color.text}`}>
                    {initials}
                  </div>
                  {player.display_name}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No players selected yet</p>
        )}

        {/* Empty slots indicator */}
        {selectedPlayers.length < requiredSize && selectedPlayers.length > 0 && (
          <div className="flex justify-center gap-2 mt-3">
            {Array.from({ length: requiredSize - selectedPlayers.length }).map((_, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full border-2 border-dashed border-stone-600 flex items-center justify-center"
              >
                <span className="text-stone-600 text-xs">?</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Selection progress indicator component
interface SelectionProgressProps {
  selected: number;
  required: number;
}

function SelectionProgress({ selected, required }: SelectionProgressProps) {
  const isComplete = selected === required;
  
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <UsersIcon className="h-5 w-5 text-blue-400" />
        <span className="text-sm text-gray-300">
          Selected: <span className={`font-bold ${isComplete ? 'text-green-400' : 'text-blue-400'}`}>{selected}</span>/{required}
        </span>
      </div>
      {isComplete && (
        <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 px-2 py-1 rounded-full">
          <CheckIcon className="h-3 w-3" />
          Ready to confirm
        </span>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function TeamSelection({ game, players, currentPlayer, onSelectTeam }: TeamSelectionProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(game.selected_team || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastClickRef = useRef<number>(0);
  
  // Track animation states for each player
  const [animationStates, setAnimationStates] = useState<Record<string, 'none' | 'selecting' | 'deselecting'>>({});

  // Calculate leader and required team size
  const leader = getCurrentLeader(players, game.crown_index);
  const isLeader = currentPlayer.id === leader?.id;
  const alivePlayers = players.filter((p) => p.is_alive);
  const requiredSize = getMissionSize(alivePlayers.length, game.current_round);

  // Sort players for display
  const sortedPlayers = [...players].sort(
    (a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0)
  );

  // Clear animation state after animation completes
  useEffect(() => {
    const animatingPlayers = Object.entries(animationStates).filter(([_, state]) => state !== 'none');
    if (animatingPlayers.length === 0) return;

    const timer = setTimeout(() => {
      setAnimationStates({});
    }, ANIMATION_DURATIONS.emphasis);

    return () => clearTimeout(timer);
  }, [animationStates]);

  // Toggle player selection with animation
  const handleToggle = useCallback(
    (playerId: string) => {
      if (!isLeader) return;

      const isCurrentlySelected = selectedIds.includes(playerId);
      
      // Set animation state
      setAnimationStates((prev) => ({
        ...prev,
        [playerId]: isCurrentlySelected ? 'deselecting' : 'selecting',
      }));

      setSelectedIds((prev) => {
        if (prev.includes(playerId)) {
          return prev.filter((id) => id !== playerId);
        } else if (prev.length < requiredSize) {
          return [...prev, playerId];
        }
        return prev;
      });
      setError(null);
    },
    [isLeader, requiredSize, selectedIds]
  );

  // Handle keyboard selection
  const handleKeyboardSelect = useCallback((index: number) => {
    const player = sortedPlayers[index];
    if (player && player.is_alive) {
      handleToggle(player.id);
    }
  }, [sortedPlayers, handleToggle]);

  // Keyboard navigation for the grid
  const { containerProps, getItemProps } = useKeyboardNavigation({
    columns: 3, // sm:grid-cols-3
    itemCount: sortedPlayers.length,
    onSelect: handleKeyboardSelect,
    enabled: isLeader && !isSubmitting,
    wrapAround: true,
  });

  // Submit team selection
  const handleSubmit = useCallback(async () => {
    const now = Date.now();
    if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) return;
    lastClickRef.current = now;

    if (selectedIds.length !== requiredSize) {
      setError(`Please select exactly ${requiredSize} players`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await onSelectTeam(selectedIds);
      if (!result.success) {
        setError(result.error || 'Failed to submit team selection');
      }
    } catch (err) {
      setError('An error occurred while submitting the team');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedIds, requiredSize, onSelectTeam]);

  // Non-leader view
  if (!isLeader) {
    return (
      <div>
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Team Selection</h2>
          <p className="text-gray-400">
            Round {game.current_round} requires{' '}
            <span className="text-blue-400 font-semibold">{requiredSize}</span> players
          </p>
        </div>
        <WaitingView
          leaderName={leader?.display_name || 'Leader'}
          selectedTeam={game.selected_team}
          players={players}
          requiredSize={requiredSize}
        />
      </div>
    );
  }

  // Leader view
  const canSubmit = selectedIds.length === requiredSize && !isSubmitting;
  const isAtLimit = selectedIds.length >= requiredSize;

  return (
    <div>
      {/* Inject animation keyframes */}
      <style dangerouslySetInnerHTML={{ __html: SELECTION_KEYFRAMES }} />
      {/* Header */}
      <div className="text-center mb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-900/30 border border-yellow-500/30 rounded-full mb-3">
          <CrownIcon className="h-4 w-4 text-yellow-400" />
          <span className="text-sm text-yellow-300 font-medium">You are the Leader</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Select Your Team</h2>
        <p className="text-gray-400">
          Choose <span className="text-blue-400 font-semibold">{requiredSize}</span> players for Round {game.current_round}
        </p>
      </div>

      {/* Selection progress */}
      <SelectionProgress selected={selectedIds.length} required={requiredSize} />

      {/* Player grid with keyboard navigation */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6"
        {...containerProps}
      >
        {/* Screen reader instruction */}
        <p className="sr-only">
          Use arrow keys to navigate, Enter or Space to select, Escape to cancel
        </p>
        {sortedPlayers.map((player, index) => {
          const isSelected = selectedIds.includes(player.id);
          const isPlayerLeader = player.id === leader?.id;
          const isCurrentPlayer = player.id === currentPlayer.id;
          const isEliminated = !player.is_alive;
          const itemProps = getItemProps(index);
          const animationState = animationStates[player.id] || 'none';

          return (
            <PlayerCard
              key={player.id}
              player={player}
              isSelected={isSelected}
              isLeader={isPlayerLeader}
              isCurrentPlayer={isCurrentPlayer}
              isEliminated={isEliminated}
              canSelect={!isSubmitting}
              isAtLimit={isAtLimit}
              onToggle={() => handleToggle(player.id)}
              animationState={animationState}
              tabIndex={itemProps.tabIndex}
              data-focused={itemProps['data-focused']}
              onFocus={itemProps.onFocus}
              itemRef={itemProps.ref}
            />
          );
        })}
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/30 border border-red-500/30 rounded-lg" role="alert">
          <p className="text-red-400 text-sm text-center">{error}</p>
        </div>
      )}

      {/* Submit button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-busy={isSubmitting}
          className={`
            px-8 py-3 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-900
            ${
              canSubmit
                ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 active:scale-[0.98]'
                : 'bg-stone-700 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Submitting...
            </>
          ) : (
            <>
              <CheckIcon className="h-5 w-5" />
              Confirm Team
            </>
          )}
        </button>
      </div>

      {/* Helper text */}
      {selectedIds.length < requiredSize && (
        <p className="text-xs text-gray-500 text-center mt-4">
          Tap to select {requiredSize - selectedIds.length} more player{requiredSize - selectedIds.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export default TeamSelection;
