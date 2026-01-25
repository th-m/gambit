/**
 * TeamSelection Component
 *
 * Displays a selectable player grid for the leader to choose mission team members.
 * Non-leaders see a waiting message with the current selection state.
 */

import { useState, useCallback, useRef } from 'react';
import type { Game, Player } from '~/types/game';
import { getMissionSize } from '~/services/StateValidator';

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
// Sub-Components
// =============================================================================

interface PlayerGridProps {
  players: Player[];
  selectedIds: string[];
  leaderId: string;
  currentPlayerId: string;
  canSelect: boolean;
  maxSelectable: number;
  onToggle: (playerId: string) => void;
}

function PlayerGrid({
  players,
  selectedIds,
  leaderId,
  currentPlayerId,
  canSelect,
  maxSelectable,
  onToggle,
}: PlayerGridProps) {
  const sortedPlayers = [...players]
    .filter((p) => p.is_alive)
    .sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0));

  const isAtLimit = selectedIds.length >= maxSelectable;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="group" aria-label="Player selection grid">
      {sortedPlayers.map((player) => {
        const isSelected = selectedIds.includes(player.id);
        const isLeader = player.id === leaderId;
        const isCurrentPlayer = player.id === currentPlayerId;
        const canBeSelected = canSelect && (isSelected || !isAtLimit);

        return (
          <button
            key={player.id}
            type="button"
            onClick={() => canSelect && onToggle(player.id)}
            disabled={!canSelect || (!isSelected && isAtLimit)}
            aria-pressed={isSelected}
            aria-label={`${player.display_name}${isLeader ? ' (Leader)' : ''}${isSelected ? ' - Selected' : ''}`}
            className={`
              relative p-4 rounded-xl border-2 transition-all duration-200
              ${
                isSelected
                  ? 'bg-blue-600/30 border-blue-400 shadow-lg shadow-blue-500/20'
                  : 'bg-stone-800 border-stone-600 hover:border-stone-500'
              }
              ${canBeSelected ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}
              ${!canSelect ? 'cursor-default opacity-80' : ''}
            `}
          >
            {/* Leader badge */}
            {isLeader && (
              <div className="absolute -top-2 -right-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-yellow-400"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M12 1l3.22 6.636 7.28.772-5.384 4.96 1.554 7.132L12 17.27 5.33 20.5l1.554-7.132L1.5 8.408l7.28-.772L12 1z" />
                </svg>
              </div>
            )}

            {/* Selection indicator */}
            {isSelected && (
              <div className="absolute -top-2 -left-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 text-white"
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
              </div>
            )}

            <p className={`font-medium ${isSelected ? 'text-blue-200' : 'text-gray-200'}`}>
              {player.display_name}
            </p>
            {isCurrentPlayer && <p className="text-xs text-gray-500 mt-1">(you)</p>}
          </button>
        );
      })}
    </div>
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
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-stone-700 rounded-lg">
          <svg
            className="animate-spin h-4 w-4 text-blue-400"
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
          <span className="text-gray-300">
            Waiting for <span className="text-blue-400 font-semibold">{leaderName}</span> to select the team...
          </span>
        </div>
      </div>

      {selectedPlayers.length > 0 && (
        <div className="bg-stone-800/50 rounded-xl p-4 border border-stone-700">
          <p className="text-sm text-gray-400 mb-3">
            Current selection ({selectedPlayers.length}/{requiredSize}):
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {selectedPlayers.map((player) => (
              <span
                key={player.id}
                className="px-3 py-1 bg-blue-900/50 text-blue-300 rounded-full text-sm"
              >
                {player.display_name}
              </span>
            ))}
          </div>
        </div>
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

  // Calculate leader and required team size
  const leader = getCurrentLeader(players, game.crown_index);
  const isLeader = currentPlayer.id === leader?.id;
  const alivePlayers = players.filter((p) => p.is_alive);
  const requiredSize = getMissionSize(alivePlayers.length, game.current_round);

  // Toggle player selection
  const handleToggle = useCallback(
    (playerId: string) => {
      if (!isLeader) return;

      setSelectedIds((prev) => {
        if (prev.includes(playerId)) {
          // Remove from selection
          return prev.filter((id) => id !== playerId);
        } else if (prev.length < requiredSize) {
          // Add to selection (if not at limit)
          return [...prev, playerId];
        }
        return prev;
      });
      setError(null);
    },
    [isLeader, requiredSize]
  );

  // Submit team selection
  const handleSubmit = useCallback(async () => {
    // Debounce rapid clicks
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
        <h2 className="text-2xl font-bold mb-2 text-center">Team Selection</h2>
        <p className="text-gray-400 mb-6 text-center">
          Round {game.current_round} requires <span className="text-blue-400 font-semibold">{requiredSize}</span> players
        </p>
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

  return (
    <div>
      <h2 className="text-2xl font-bold mb-2 text-center">Select Your Team</h2>
      <p className="text-gray-400 mb-2 text-center">
        Choose <span className="text-blue-400 font-semibold">{requiredSize}</span> players for the mission
      </p>
      <p className="text-sm text-gray-500 mb-6 text-center">
        Selected: {selectedIds.length}/{requiredSize}
      </p>

      {/* Player grid */}
      <div className="mb-6">
        <PlayerGrid
          players={players}
          selectedIds={selectedIds}
          leaderId={leader?.id || ''}
          currentPlayerId={currentPlayer.id}
          canSelect={!isSubmitting}
          maxSelectable={requiredSize}
          onToggle={handleToggle}
        />
      </div>

      {/* Error message */}
      {error && (
        <p className="text-red-400 text-sm text-center mb-4" role="alert">
          {error}
        </p>
      )}

      {/* Submit button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-busy={isSubmitting}
          className={`
            px-8 py-3 rounded-xl font-semibold transition-all duration-200
            ${
              canSubmit
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-stone-700 text-gray-500 cursor-not-allowed'
            }
          `}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
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
            </span>
          ) : (
            'Confirm Team'
          )}
        </button>
      </div>

      {/* Helper text */}
      {selectedIds.length < requiredSize && (
        <p className="text-xs text-gray-500 text-center mt-4">
          Select {requiredSize - selectedIds.length} more player{requiredSize - selectedIds.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  );
}

export default TeamSelection;
