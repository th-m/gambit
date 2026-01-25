/**
 * LeaderVoting Component
 *
 * Displays the leader voting interface with:
 * - Current crown holder's name
 * - Rejection count (X/3)
 * - Approve/Reject buttons (disabled after voting)
 * - Waiting message after voting
 * - Vote results when all votes are in
 * - Double-click prevention
 * - Vote completion handling
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoteSubscription } from '~/hooks/useVoteSubscription';
import { useVoteCompletion } from '~/hooks/useVoteCompletion';
import type { Game, Player, LeaderVote, VoteResult } from '~/types/game';

// =============================================================================
// Types
// =============================================================================

export interface LeaderVotingProps {
  /** Current game state */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** The current player */
  currentPlayer: Player;
  /** Callback to submit a leader vote */
  onVote: (approve: boolean) => Promise<VoteResult>;
}

interface VoteResults {
  yesCount: number;
  noCount: number;
  approved: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Calculate the current leader from game state
 */
function getLeader(game: Game, players: Player[]): Player | undefined {
  const alivePlayers = players
    .filter((p) => p.is_alive)
    .sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0));
  return alivePlayers[game.crown_index % alivePlayers.length];
}

/**
 * Calculate vote results from vote map
 */
function calculateResults(votes: Record<string, string>): VoteResults {
  const voteValues = Object.values(votes);
  const yesCount = voteValues.filter((v) => v === 'yes').length;
  const noCount = voteValues.filter((v) => v === 'no').length;
  // Strict majority required - ties go to rejection
  const approved = yesCount > noCount;
  return { yesCount, noCount, approved };
}

// =============================================================================
// Sub-Components
// =============================================================================

interface VotingButtonsProps {
  onApprove: () => void;
  onReject: () => void;
  disabled: boolean;
  isSubmitting: boolean;
}

function VotingButtons({ onApprove, onReject, disabled, isSubmitting }: VotingButtonsProps) {
  return (
    <div className="flex gap-4 justify-center">
      <button
        onClick={onApprove}
        disabled={disabled || isSubmitting}
        className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
          disabled || isSubmitting
            ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
            : 'bg-green-600 hover:bg-green-500 text-white'
        }`}
        aria-label="Approve leader"
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Voting...
          </span>
        ) : (
          'Approve'
        )}
      </button>
      <button
        onClick={onReject}
        disabled={disabled || isSubmitting}
        className={`px-8 py-3 rounded-xl font-semibold transition-colors ${
          disabled || isSubmitting
            ? 'bg-stone-600 text-stone-400 cursor-not-allowed'
            : 'bg-red-600 hover:bg-red-500 text-white'
        }`}
        aria-label="Reject leader"
        aria-busy={isSubmitting}
      >
        Reject
      </button>
    </div>
  );
}

interface WaitingMessageProps {
  voteCount: number;
  expectedCount: number;
  hasVoted: boolean;
  myVote: LeaderVote | null;
}

function WaitingMessage({ voteCount, expectedCount, hasVoted, myVote }: WaitingMessageProps) {
  return (
    <div className="text-center">
      {hasVoted && myVote && (
        <div className="mb-4">
          <span
            className={`inline-block px-4 py-2 rounded-lg ${
              myVote === 'yes' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
            }`}
          >
            You voted: {myVote === 'yes' ? 'Approve' : 'Reject'}
          </span>
        </div>
      )}
      <div className="flex items-center justify-center gap-2 text-gray-400">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>
          Waiting for votes... ({voteCount}/{expectedCount})
        </span>
      </div>
    </div>
  );
}

interface VoteResultsDisplayProps {
  results: VoteResults;
}

function VoteResultsDisplay({ results }: VoteResultsDisplayProps) {
  const { yesCount, noCount, approved } = results;

  return (
    <div className="text-center animate-fade-in">
      {/* Result banner */}
      <div
        className={`mb-6 py-4 px-6 rounded-xl ${
          approved ? 'bg-green-900/50 border border-green-700' : 'bg-red-900/50 border border-red-700'
        }`}
      >
        <h3
          className={`text-2xl font-bold ${approved ? 'text-green-400' : 'text-red-400'}`}
          role="alert"
        >
          {approved ? 'Leader Approved!' : 'Leader Rejected!'}
        </h3>
      </div>

      {/* Vote breakdown */}
      <div className="flex justify-center gap-8">
        <div className="text-center">
          <p className="text-3xl font-bold text-green-400">{yesCount}</p>
          <p className="text-sm text-gray-400">Approved</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold text-red-400">{noCount}</p>
          <p className="text-sm text-gray-400">Rejected</p>
        </div>
      </div>

      {/* Progress message */}
      <p className="mt-6 text-gray-400">
        {approved ? 'Proceeding to team selection...' : 'Next leader will be proposed...'}
      </p>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function LeaderVoting({ game, players, currentPlayer, onVote }: LeaderVotingProps) {
  // Local state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const [myVote, setMyVote] = useState<LeaderVote | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [voteResults, setVoteResults] = useState<VoteResults | null>(null);

  // Refs for double-click prevention
  const lastClickRef = useRef<number>(0);
  const CLICK_DEBOUNCE_MS = 500;

  // Subscribe to real-time vote updates
  const { votes, isLoading: votesLoading } = useVoteSubscription(
    game.id,
    game.current_round ?? 1,
    'voting_for_leader'
  );

  // Monitor vote completion
  const { isComplete, voteCount, expectedCount } = useVoteCompletion(game, players, votes, {
    onComplete: (result) => {
      // Calculate final results
      const results = calculateResults(votes);
      setVoteResults(results);
      setShowResults(true);
    },
    debounceMs: 300,
    enabled: true,
  });

  // Check if current player has already voted (from subscription)
  useEffect(() => {
    const existingVote = votes[currentPlayer.id];
    if (existingVote) {
      setHasVoted(true);
      setMyVote(existingVote as LeaderVote);
    }
  }, [votes, currentPlayer.id]);

  // Reset state when round changes
  useEffect(() => {
    setHasVoted(false);
    setMyVote(null);
    setShowResults(false);
    setVoteResults(null);
  }, [game.current_round, game.rejection_count]);

  // Calculate leader
  const leader = getLeader(game, players);

  // Handle vote submission with double-click prevention
  const handleVote = useCallback(
    async (approve: boolean) => {
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

      try {
        setIsSubmitting(true);
        const vote: LeaderVote = approve ? 'yes' : 'no';
        setMyVote(vote);
        await onVote(approve);
        setHasVoted(true);
      } catch (error) {
        // Reset on error
        setMyVote(null);
        console.error('Failed to submit vote:', error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [hasVoted, isSubmitting, onVote]
  );

  const handleApprove = useCallback(() => handleVote(true), [handleVote]);
  const handleReject = useCallback(() => handleVote(false), [handleVote]);

  // Loading state
  if (votesLoading) {
    return (
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading vote status...</span>
        </div>
      </div>
    );
  }

  // Show results when voting is complete
  if (showResults && voteResults) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Vote for Leader</h2>
        <p className="text-gray-400 mb-6">
          <span className="text-blue-400 font-semibold">{leader?.display_name}</span> was proposed
        </p>
        <VoteResultsDisplay results={voteResults} />
      </div>
    );
  }

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2">Vote for Leader</h2>
      <p className="text-gray-400 mb-2">
        <span className="text-blue-400 font-semibold">{leader?.display_name}</span> is the proposed leader
      </p>
      <p className="text-sm text-gray-500 mb-6">
        Rejections: <span className={game.rejection_count >= 2 ? 'text-red-400' : ''}>{game.rejection_count}/3</span>
        {game.rejection_count === 2 && (
          <span className="ml-2 text-red-400">(Next rejection = automatic evil win)</span>
        )}
      </p>

      {/* Show voting buttons or waiting message */}
      {hasVoted || isComplete ? (
        <WaitingMessage
          voteCount={voteCount}
          expectedCount={expectedCount}
          hasVoted={hasVoted}
          myVote={myVote}
        />
      ) : (
        <VotingButtons
          onApprove={handleApprove}
          onReject={handleReject}
          disabled={hasVoted}
          isSubmitting={isSubmitting}
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
            {voteCount} of {expectedCount} votes cast
          </p>
        </div>
      )}
    </div>
  );
}

export default LeaderVoting;
