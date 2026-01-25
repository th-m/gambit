/**
 * AssassinationPhase Component
 *
 * Displays the assassination phase interface with:
 * - Only Assassin can select target
 * - Displays selectable player grid for Assassin
 * - Non-Assassin players see waiting state
 * - Submit button for Assassin
 * - Correct target (Seer) ends game for evil
 * - Wrong target ends game for good
 * - Displays result and transitions to game over
 */

import { useState, useCallback, useRef } from 'react';
import {
  useScreenReaderAnnouncer,
  formatGameOverAnnouncement,
} from '~/hooks/useScreenReaderAnnouncer';
import type { Game, Player, ActionResult } from '~/types/game';

// =============================================================================
// Types
// =============================================================================

export interface AssassinationPhaseProps {
  /** Current game state */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** The current player */
  currentPlayer: Player;
  /** Callback to execute the assassination action */
  onExecuteAction: (actionId: 'assassinate', targetIds: string[]) => Promise<ActionResult>;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the list of players that can be targeted (alive, not the Assassin)
 */
function getTargetablePlayers(players: Player[], currentPlayerId: string): Player[] {
  return players.filter((p) => p.is_alive && p.id !== currentPlayerId);
}

// =============================================================================
// Sub-Components
// =============================================================================

interface PlayerGridProps {
  players: Player[];
  selectedPlayerId: string | null;
  onSelectPlayer: (playerId: string) => void;
  disabled: boolean;
}

function PlayerGrid({ players, selectedPlayerId, onSelectPlayer, disabled }: PlayerGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-md mx-auto" role="group" aria-label="Select assassination target">
      {players.map((player) => {
        const isSelected = selectedPlayerId === player.id;
        return (
          <button
            key={player.id}
            onClick={() => onSelectPlayer(player.id)}
            disabled={disabled}
            aria-pressed={isSelected}
            className={`p-4 rounded-xl border-2 transition-all ${
              isSelected
                ? 'bg-red-900/50 border-red-500 text-white'
                : disabled
                ? 'bg-stone-800/50 border-stone-700 text-stone-500 cursor-not-allowed'
                : 'bg-stone-800 border-stone-600 hover:border-red-500 hover:bg-red-900/30 text-white'
            }`}
          >
            <p className="font-semibold">{player.display_name}</p>
            {isSelected && (
              <span className="inline-block mt-2 text-xs text-red-400">
                Target Selected
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface WaitingViewProps {
  assassinName: string;
}

function WaitingView({ assassinName }: WaitingViewProps) {
  return (
    <div className="text-center">
      <div className="mb-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/50 border-2 border-red-600 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p className="text-xl font-semibold text-red-400 mb-2">Assassination in Progress</p>
        <p className="text-gray-400">
          <span className="text-red-300">{assassinName}</span> is choosing their target...
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 text-gray-500">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>Waiting for decision...</span>
      </div>
    </div>
  );
}

interface ResultDisplayProps {
  result: ActionResult;
  targetName: string;
}

function ResultDisplay({ result, targetName }: ResultDisplayProps) {
  const isEvilWin = result.winner === 'evil';
  
  return (
    <div className="text-center animate-fade-in">
      {/* Result banner */}
      <div
        className={`mb-6 py-6 px-6 rounded-xl ${
          isEvilWin
            ? 'bg-red-900/50 border-2 border-red-600'
            : 'bg-blue-900/50 border-2 border-blue-600'
        }`}
      >
        <h3
          className={`text-2xl font-bold mb-2 ${isEvilWin ? 'text-red-400' : 'text-blue-400'}`}
          role="alert"
        >
          {isEvilWin ? 'Evil Wins!' : 'Good Wins!'}
        </h3>
        <p className="text-gray-300">{result.message}</p>
      </div>

      {/* Target info */}
      <div className="mb-6">
        <p className="text-gray-400 mb-2">The Assassin targeted:</p>
        <span
          className={`inline-block px-4 py-2 rounded-lg text-lg font-semibold ${
            isEvilWin ? 'bg-red-900/30 text-red-300' : 'bg-blue-900/30 text-blue-300'
          }`}
        >
          {targetName}
        </span>
      </div>

      {/* Explanation */}
      <p className="text-sm text-gray-500">
        {isEvilWin
          ? 'The Seer has been assassinated! Evil claims victory!'
          : 'The Assassin failed to identify the Seer. Good prevails!'}
      </p>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AssassinationPhase({
  game,
  players,
  currentPlayer,
  onExecuteAction,
}: AssassinationPhaseProps) {
  // Local state
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  // Screen reader announcer
  const { announcePolite, announceAssertive, AnnouncerRegion } = useScreenReaderAnnouncer();

  // Refs for double-click prevention
  const lastClickRef = useRef<number>(0);
  const CLICK_DEBOUNCE_MS = 500;

  // Determine if current player is the Assassin
  const isAssassin = currentPlayer.character === 'Assassin';
  
  // Get the Assassin player for waiting message
  const assassinPlayer = players.find((p) => p.character === 'Assassin' && p.is_alive);
  const assassinName = assassinPlayer?.display_name ?? 'The Assassin';

  // Get targetable players (alive, not the assassin)
  const targetablePlayers = getTargetablePlayers(players, currentPlayer.id);

  // Get selected target name for result display
  const selectedTargetPlayer = selectedTarget
    ? players.find((p) => p.id === selectedTarget)
    : null;

  // Handle player selection
  const handleSelectPlayer = useCallback((playerId: string) => {
    if (isSubmitting || result) return;
    setSelectedTarget((current) => (current === playerId ? null : playerId));
  }, [isSubmitting, result]);

  // Handle assassination submission
  const handleSubmit = useCallback(async () => {
    // Double-click prevention
    const now = Date.now();
    if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) {
      return;
    }
    lastClickRef.current = now;

    // Validation
    if (!selectedTarget || isSubmitting || result) {
      return;
    }

    try {
      setIsSubmitting(true);
      const actionResult = await onExecuteAction('assassinate', [selectedTarget]);
      setResult(actionResult);
      
      // Announce result to screen readers
      if (actionResult.gameEnded && actionResult.winner) {
        const endReason = actionResult.winner === 'evil'
          ? 'The Seer has been assassinated.'
          : 'The Assassin failed to identify the Seer.';
        const announcement = formatGameOverAnnouncement(actionResult.winner, endReason);
        announceAssertive(announcement);
      }
    } catch (error) {
      console.error('Failed to execute assassination:', error);
      // Reset state on error to allow retry
      setIsSubmitting(false);
      // Announce error to screen readers
      announceAssertive('Failed to execute assassination. Please try again.');
    }
  }, [selectedTarget, isSubmitting, result, onExecuteAction, announceAssertive]);

  // Show result if assassination has been completed
  if (result) {
    return (
      <div className="text-center" role="region" aria-label="Assassination result">
        <AnnouncerRegion />
        <h2 className="text-2xl font-bold mb-2 text-red-400">Assassination Complete</h2>
        <p className="text-gray-400 mb-6">The deed is done...</p>
        <ResultDisplay
          result={result}
          targetName={selectedTargetPlayer?.display_name ?? 'Unknown'}
        />
      </div>
    );
  }

  // Show waiting state for non-Assassin players
  if (!isAssassin) {
    return (
      <div className="text-center" role="region" aria-label="Assassination phase - waiting">
        <AnnouncerRegion />
        <h2 className="text-2xl font-bold mb-2 text-red-400">Assassination Phase</h2>
        <p className="text-gray-400 mb-6">Good team has won 3 missions, but the Assassin has one last chance...</p>
        <WaitingView assassinName={assassinName} />
      </div>
    );
  }

  // Show assassination interface for the Assassin
  return (
    <div className="text-center" role="region" aria-label="Assassination phase - select target">
      <AnnouncerRegion />
      <h2 className="text-2xl font-bold mb-2 text-red-400" id="assassination-heading">Assassination Phase</h2>
      <p className="text-gray-400 mb-2">
        Good has won 3 missions, but you have one last chance to win!
      </p>
      <p className="text-lg text-red-300 mb-6">
        Choose wisely - if you find the <span className="font-bold">Seer</span>, Evil wins!
      </p>

      {/* Target selection grid */}
      <PlayerGrid
        players={targetablePlayers}
        selectedPlayerId={selectedTarget}
        onSelectPlayer={handleSelectPlayer}
        disabled={isSubmitting}
      />

      {/* Submit button */}
      <div className="mt-6">
        <button
          onClick={handleSubmit}
          disabled={!selectedTarget || isSubmitting}
          className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
            !selectedTarget || isSubmitting
              ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
          aria-label="Confirm assassination target"
          aria-busy={isSubmitting}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Assassinating...
            </span>
          ) : (
            'Assassinate'
          )}
        </button>
      </div>

      {/* Warning message */}
      <p className="mt-4 text-sm text-stone-500">
        This action cannot be undone. Choose carefully.
      </p>
    </div>
  );
}

export default AssassinationPhase;
