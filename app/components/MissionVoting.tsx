/**
 * MissionVoting Component
 *
 * Displays the mission voting interface with:
 * - Team member identification
 * - Pass button (all team members)
 * - Fail button (evil team members only)
 * - Good players cannot vote fail
 * - Non-team members see waiting state
 * - Vote progress (X/Y voted)
 * - Results display shuffled (no attribution)
 * - Handles vote modifiers (rig_vote)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoteSubscription } from '~/hooks/useVoteSubscription';
import { useVoteCompletion } from '~/hooks/useVoteCompletion';
import type { Game, Player, MissionVote, VoteResult } from '~/types/game';

// =============================================================================
// Types
// =============================================================================

export interface MissionVotingProps {
  /** Current game state */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** The current player */
  currentPlayer: Player;
  /** Callback to submit a mission vote */
  onVote: (vote: MissionVote) => Promise<VoteResult>;
}

interface MissionVoteResults {
  passCount: number;
  failCount: number;
  passed: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get team member display names
 */
function getTeamMemberNames(selectedTeam: string[] | null, players: Player[]): string[] {
  if (!selectedTeam) return [];
  return selectedTeam
    .map((playerId) => players.find((p) => p.id === playerId)?.display_name)
    .filter((name): name is string => !!name);
}

/**
 * Calculate vote results from vote map
 * Results are shuffled to prevent vote attribution
 */
function calculateResults(votes: Record<string, string>): MissionVoteResults {
  const voteValues = Object.values(votes);
  const passCount = voteValues.filter((v) => v === 'pass').length;
  const failCount = voteValues.filter((v) => v === 'fail').length;
  // Mission fails if there's at least one fail vote (unless modified)
  const passed = failCount === 0;
  return { passCount, failCount, passed };
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 * Used to display vote results without attribution
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// Sub-Components
// =============================================================================

interface VotingButtonsProps {
  onPass: () => void;
  onFail: () => void;
  canVoteFail: boolean;
  disabled: boolean;
  isSubmitting: boolean;
}

function VotingButtons({
  onPass,
  onFail,
  canVoteFail,
  disabled,
  isSubmitting,
}: VotingButtonsProps) {
  return (
    <div className="flex gap-4 justify-center">
      <button
        onClick={onPass}
        disabled={disabled || isSubmitting}
        className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
          disabled || isSubmitting
            ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-500 text-white'
        }`}
        aria-label="Vote pass on mission"
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
            Voting...
          </span>
        ) : (
          'Pass'
        )}
      </button>
      {canVoteFail && (
        <button
          onClick={onFail}
          disabled={disabled || isSubmitting}
          className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
            disabled || isSubmitting
              ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
          aria-label="Vote fail on mission"
          aria-busy={isSubmitting}
        >
          Fail
        </button>
      )}
    </div>
  );
}

interface WaitingMessageProps {
  voteCount: number;
  expectedCount: number;
  hasVoted: boolean;
  myVote: MissionVote | null;
  isOnTeam: boolean;
  teamMemberNames: string[];
}

function WaitingMessage({
  voteCount,
  expectedCount,
  hasVoted,
  myVote,
  isOnTeam,
  teamMemberNames,
}: WaitingMessageProps) {
  return (
    <div className="text-center">
      {hasVoted && myVote && (
        <div className="mb-4">
          <span
            className={`inline-block px-4 py-2 rounded-lg ${
              myVote === 'pass' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
            }`}
          >
            You voted: {myVote === 'pass' ? 'Pass' : 'Fail'}
          </span>
        </div>
      )}

      {!isOnTeam && (
        <div className="mb-4">
          <p className="text-gray-400 mb-2">Team members voting:</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {teamMemberNames.map((name) => (
              <span key={name} className="px-3 py-1 bg-blue-900/30 border border-blue-700 rounded-lg text-sm">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-gray-400">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span>
          Waiting for votes... ({voteCount}/{expectedCount})
        </span>
      </div>
    </div>
  );
}

interface MissionResultsDisplayProps {
  results: MissionVoteResults;
  wasRigged: boolean;
}

function MissionResultsDisplay({ results, wasRigged }: MissionResultsDisplayProps) {
  const { passCount, failCount, passed } = results;

  // Create shuffled vote display (no attribution)
  const shuffledVotes = shuffleArray([
    ...Array(passCount).fill('pass'),
    ...Array(failCount).fill('fail'),
  ]);

  return (
    <div className="text-center animate-fade-in">
      {/* Result banner */}
      <div
        className={`mb-6 py-4 px-6 rounded-xl ${
          passed
            ? 'bg-green-900/50 border border-green-700'
            : 'bg-red-900/50 border border-red-700'
        }`}
      >
        <h3
          className={`text-2xl font-bold ${passed ? 'text-green-400' : 'text-red-400'}`}
          role="alert"
        >
          {passed ? 'Mission Passed!' : 'Mission Failed!'}
        </h3>
        {wasRigged && (
          <p className="text-sm text-blue-400 mt-2">
            (Mission was influenced by the Fixer)
          </p>
        )}
      </div>

      {/* Shuffled vote display (no attribution) */}
      <div className="mb-6">
        <p className="text-sm text-gray-400 mb-3">Votes (shuffled):</p>
        <div className="flex gap-2 justify-center flex-wrap">
          {shuffledVotes.map((vote, index) => (
            <div
              key={index}
              className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                vote === 'pass'
                  ? 'bg-green-900/50 border border-green-700'
                  : 'bg-red-900/50 border border-red-700'
              }`}
            >
              <span className={vote === 'pass' ? 'text-green-400' : 'text-red-400'}>
                {vote === 'pass' ? '✓' : '✗'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Vote breakdown */}
      <div className="flex justify-center gap-8">
        <div className="text-center">
          <p className="text-3xl font-bold text-green-400">{passCount}</p>
          <p className="text-sm text-gray-400">Pass</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-red-400">{failCount}</p>
          <p className="text-sm text-gray-400">Fail</p>
        </div>
      </div>

      {/* Progress message */}
      <p className="mt-6 text-gray-400">
        {passed ? 'Good team scores a point!' : 'Evil team scores a point!'}
      </p>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function MissionVoting({ game, players, currentPlayer, onVote }: MissionVotingProps) {
  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [myVote, setMyVote] = useState<MissionVote | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [voteResults, setVoteResults] = useState<MissionVoteResults | null>(null);
  const [wasRigged, setWasRigged] = useState(false);

  // Refs for double-click prevention
  const lastClickRef = useRef<number>(0);
  const CLICK_DEBOUNCE_MS = 500;

  // Determine team membership and team info
  const isOnTeam = game.selected_team?.includes(currentPlayer.id) ?? false;
  const isEvil = currentPlayer.team === 'evil';
  const canVoteFail = isOnTeam && isEvil;
  const teamSize = game.selected_team?.length ?? 0;
  const teamMemberNames = getTeamMemberNames(game.selected_team, players);

  // Subscribe to real-time vote updates
  const { votes, isLoading: votesLoading } = useVoteSubscription(
    game.id,
    game.current_round ?? 1,
    'mission_voting'
  );

  // Monitor vote completion (only team members vote)
  const { isComplete, voteCount, expectedCount } = useVoteCompletion(game, players, votes, {
    onComplete: () => {
      // Calculate final results from local vote data
      const results = calculateResults(votes);
      setVoteResults(results);
      setShowResults(true);
      // Note: Rigging detection would require comparing with server state after processing
      // For now, we show results as-is and server handles the actual pass/fail determination
    },
    debounceMs: 300,
    enabled: true,
  });

  // Check if current player has already voted (from subscription)
  useEffect(() => {
    const existingVote = votes[currentPlayer.id];
    if (existingVote === 'pass' || existingVote === 'fail') {
      setHasVoted(true);
      setMyVote(existingVote as MissionVote);
    }
  }, [votes, currentPlayer.id]);

  // Reset state when round changes
  useEffect(() => {
    setHasVoted(false);
    setMyVote(null);
    setShowResults(false);
    setVoteResults(null);
    setWasRigged(false);
  }, [game.current_round]);

  // Handle vote submission with double-click prevention
  const handleVote = useCallback(
    async (vote: MissionVote) => {
      // Double-click prevention
      const now = Date.now();
      if (now - lastClickRef.current < CLICK_DEBOUNCE_MS) {
        return;
      }
      lastClickRef.current = now;

      // Prevent duplicate votes
      if (hasVoted || isSubmitting) {
        return;
      }

      // Good players cannot vote fail
      if (vote === 'fail' && !isEvil) {
        return;
      }

      try {
        setIsSubmitting(true);
        setMyVote(vote);
        await onVote(vote);
        setHasVoted(true);
      } catch (error) {
        // Reset on error
        setMyVote(null);
        console.error('Failed to submit mission vote:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [hasVoted, isSubmitting, isEvil, onVote]
  );

  const handlePass = useCallback(() => handleVote('pass'), [handleVote]);
  const handleFail = useCallback(() => handleVote('fail'), [handleVote]);

  // Loading state
  if (votesLoading) {
    return (
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 text-gray-400">
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
          <span>Loading mission status...</span>
        </div>
      </div>
    );
  }

  // Show results when voting is complete
  if (showResults && voteResults) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Mission Vote</h2>
        <p className="text-gray-400 mb-6">Round {game.current_round} Mission Complete</p>
        <MissionResultsDisplay results={voteResults} wasRigged={wasRigged} />
      </div>
    );
  }

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2">Mission Vote</h2>
      <p className="text-gray-400 mb-2">Round {game.current_round}</p>
      <p className="text-sm text-gray-500 mb-6">
        Team size: <span className="text-blue-400">{teamSize} members</span>
      </p>

      {/* Show voting UI for team members, waiting state for others */}
      {isOnTeam && !hasVoted && !isComplete ? (
        <>
          <p className="text-gray-300 mb-6">
            You are on the mission team. Cast your vote.
          </p>
          <VotingButtons
            onPass={handlePass}
            onFail={handleFail}
            canVoteFail={canVoteFail}
            disabled={hasVoted}
            isSubmitting={isSubmitting}
          />
          {!canVoteFail && (
            <p className="mt-4 text-sm text-gray-500">
              (As a good team member, you can only vote Pass)
            </p>
          )}
        </>
      ) : (
        <WaitingMessage
          voteCount={voteCount}
          expectedCount={expectedCount}
          hasVoted={hasVoted}
          myVote={myVote}
          isOnTeam={isOnTeam}
          teamMemberNames={teamMemberNames}
        />
      )}

      {/* Vote progress indicator */}
      {!showResults && (
        <div className="mt-6">
          <div className="w-full max-w-xs mx-auto bg-stone-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(voteCount / expectedCount) * 100}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {voteCount} of {expectedCount} team member votes cast
          </p>
        </div>
      )}
    </div>
  );
}

export default MissionVoting;
