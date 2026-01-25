/**
 * LeaderVoting Component
 *
 * Displays the leader voting interface with:
 * - Current crown holder's name with prominent styling
 * - Rejection count (X/3) with warning states
 * - Clear approve/reject buttons with icons
 * - Animated waiting state with vote progress
 * - Vote result reveal animation
 * - Double-click prevention
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoteSubscription } from '~/hooks/useVoteSubscription';
import { useVoteCompletion } from '~/hooks/useVoteCompletion';
import {
  useScreenReaderAnnouncer,
  formatVoteResultAnnouncement,
  formatTurnAnnouncement,
} from '~/hooks/useScreenReaderAnnouncer';
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
// Icons
// =============================================================================

function CheckIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CrownIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L9 9l-8 3 8 3 3 8 3-8 8-3-8-3-3-8z" />
    </svg>
  );
}

function SpinnerIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
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
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
      {/* Approve Button */}
      <button
        onClick={onApprove}
        disabled={disabled || isSubmitting}
        className={`
          group relative w-full sm:w-auto min-w-[160px] px-8 py-4 rounded-2xl font-bold text-lg
          transition-all duration-300 transform
          ${disabled || isSubmitting
            ? 'bg-stone-700 text-stone-500 cursor-not-allowed scale-95 opacity-60'
            : 'bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-lg shadow-green-900/30 hover:shadow-green-900/50 hover:scale-105 active:scale-[0.98]'
          }
        `}
        aria-label="Approve leader"
        aria-busy={isSubmitting}
      >
        <span className="flex items-center justify-center gap-3">
          {isSubmitting ? (
            <>
              <SpinnerIcon className="w-5 h-5" />
              <span>Voting...</span>
            </>
          ) : (
            <>
              <span className="p-1 rounded-lg bg-white/20">
                <CheckIcon className="w-5 h-5" />
              </span>
              <span>Approve</span>
            </>
          )}
        </span>
        {!disabled && !isSubmitting && (
          <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Reject Button */}
      <button
        onClick={onReject}
        disabled={disabled || isSubmitting}
        className={`
          group relative w-full sm:w-auto min-w-[160px] px-8 py-4 rounded-2xl font-bold text-lg
          transition-all duration-300 transform
          ${disabled || isSubmitting
            ? 'bg-stone-700 text-stone-500 cursor-not-allowed scale-95 opacity-60'
            : 'bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:scale-105 active:scale-[0.98]'
          }
        `}
        aria-label="Reject leader"
        aria-busy={isSubmitting}
      >
        <span className="flex items-center justify-center gap-3">
          <span className="p-1 rounded-lg bg-white/20">
            <XIcon className="w-5 h-5" />
          </span>
          <span>Reject</span>
        </span>
        {!disabled && !isSubmitting && (
          <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>
    </div>
  );
}

interface WaitingMessageProps {
  voteCount: number;
  expectedCount: number;
  hasVoted: boolean;
  myVote: LeaderVote | null;
  players: Player[];
  votes: Record<string, string>;
}

function WaitingMessage({ voteCount, expectedCount, hasVoted, myVote, players, votes }: WaitingMessageProps) {
  // Get voted/not-voted players
  const votedPlayerIds = new Set(Object.keys(votes));
  const alivePlayers = players.filter(p => p.is_alive);
  
  return (
    <div className="space-y-6">
      {/* Your vote confirmation */}
      {hasVoted && myVote && (
        <div className="flex justify-center animate-fade-in">
          <div
            className={`
              inline-flex items-center gap-3 px-6 py-3 rounded-xl
              ${myVote === 'yes' 
                ? 'bg-gradient-to-r from-emerald-900/60 to-green-900/60 border border-emerald-600/50 text-emerald-300' 
                : 'bg-gradient-to-r from-red-900/60 to-rose-900/60 border border-red-600/50 text-red-300'
              }
            `}
          >
            <span className={`p-1 rounded-lg ${myVote === 'yes' ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
              {myVote === 'yes' ? <CheckIcon className="w-5 h-5" /> : <XIcon className="w-5 h-5" />}
            </span>
            <span className="font-semibold">
              You voted to {myVote === 'yes' ? 'Approve' : 'Reject'}
            </span>
          </div>
        </div>
      )}

      {/* Vote progress visualization */}
      <div className="bg-stone-800/50 rounded-2xl p-4 border border-stone-700/50">
        <div className="flex items-center justify-center gap-2 mb-4">
          <SpinnerIcon className="w-5 h-5 text-blue-400" />
          <span className="text-gray-300">
            Waiting for votes...
          </span>
        </div>
        
        {/* Player vote indicators */}
        <div className="flex flex-wrap gap-2 justify-center">
          {alivePlayers.map((player) => {
            const hasVoted = votedPlayerIds.has(player.id);
            return (
              <div
                key={player.id}
                className={`
                  px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-300
                  ${hasVoted 
                    ? 'bg-blue-600/40 border border-blue-500/50 text-blue-300' 
                    : 'bg-stone-700/50 border border-stone-600/50 text-stone-400'
                  }
                `}
              >
                <span className="flex items-center gap-2">
                  {hasVoted && (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  )}
                  {player.display_name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface VoteResultsDisplayProps {
  results: VoteResults;
}

function VoteResultsDisplay({ results }: VoteResultsDisplayProps) {
  const { yesCount, noCount, approved } = results;
  const [showResult, setShowResult] = useState(false);
  const [showCards, setShowCards] = useState(false);
  
  // Staggered animation
  useEffect(() => {
    const timer1 = setTimeout(() => setShowResult(true), 200);
    const timer2 = setTimeout(() => setShowCards(true), 500);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Result banner with animation */}
      <div
        className={`
          p-6 rounded-2xl transform transition-all duration-700 ease-out
          ${showResult ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4'}
          ${approved 
            ? 'bg-gradient-to-br from-emerald-900/60 to-green-900/60 border-2 border-emerald-500/50' 
            : 'bg-gradient-to-br from-red-900/60 to-rose-900/60 border-2 border-red-500/50'
          }
        `}
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className={`p-2 rounded-xl ${approved ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
            {approved ? <CheckIcon className="w-8 h-8 text-emerald-400" /> : <XIcon className="w-8 h-8 text-red-400" />}
          </span>
        </div>
        <h3
          className={`text-2xl font-bold text-center ${approved ? 'text-emerald-300' : 'text-red-300'}`}
          role="alert"
        >
          {approved ? 'Leader Approved!' : 'Leader Rejected!'}
        </h3>
      </div>

      {/* Vote cards with staggered reveal */}
      <div className="flex justify-center gap-3 flex-wrap">
        {[...Array(yesCount)].map((_, i) => (
          <div
            key={`yes-${i}`}
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-emerald-600 to-green-700 border-2 border-emerald-400/50
              transform transition-all duration-500 ease-out shadow-lg shadow-emerald-900/30
              ${showCards ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
            `}
            style={{ transitionDelay: `${i * 100}ms` }}
          >
            <CheckIcon className="w-6 h-6 text-white" />
          </div>
        ))}
        {[...Array(noCount)].map((_, i) => (
          <div
            key={`no-${i}`}
            className={`
              w-12 h-12 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-red-600 to-rose-700 border-2 border-red-400/50
              transform transition-all duration-500 ease-out shadow-lg shadow-red-900/30
              ${showCards ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
            `}
            style={{ transitionDelay: `${(yesCount + i) * 100}ms` }}
          >
            <XIcon className="w-6 h-6 text-white" />
          </div>
        ))}
      </div>

      {/* Vote count display */}
      <div className="flex justify-center gap-12">
        <div className="text-center">
          <p className="text-4xl font-bold text-emerald-400 tabular-nums">{yesCount}</p>
          <p className="text-sm text-gray-400 font-medium">Approved</p>
        </div>
        <div className="text-center">
          <p className="text-4xl font-bold text-red-400 tabular-nums">{noCount}</p>
          <p className="text-sm text-gray-400 font-medium">Rejected</p>
        </div>
      </div>

      {/* Progress message */}
      <p className={`text-center text-gray-400 transition-opacity duration-500 ${showCards ? 'opacity-100' : 'opacity-0'}`}>
        {approved ? 'Proceeding to team selection...' : 'Crown passes to the next player...'}
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

  // Screen reader announcer
  const { announcePolite, announceAssertive, AnnouncerRegion } = useScreenReaderAnnouncer();

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
      
      // Announce results to screen readers
      const announcement = formatVoteResultAnnouncement(
        'leader',
        results.approved ? 'approved' : 'rejected',
        results.yesCount,
        results.noCount
      );
      announceAssertive(announcement);
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
        
        // Announce vote submission to screen readers
        announcePolite(`You voted to ${approve ? 'approve' : 'reject'}. Waiting for other votes.`);
      } catch (error) {
        // Reset on error
        setMyVote(null);
        console.error('Failed to submit vote:', error);
        // Announce error to screen readers
        announceAssertive('Failed to submit vote. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [hasVoted, isSubmitting, onVote, announcePolite, announceAssertive]
  );

  const handleApprove = useCallback(() => handleVote(true), [handleVote]);
  const handleReject = useCallback(() => handleVote(false), [handleVote]);

  // Loading state
  if (votesLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12" aria-busy="true" aria-label="Loading vote status">
        <AnnouncerRegion />
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-stone-700" />
          <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-t-blue-500 animate-spin" />
        </div>
        <p className="mt-4 text-gray-400 font-medium" aria-live="polite">Loading vote status...</p>
      </div>
    );
  }

  // Show results when voting is complete
  if (showResults && voteResults) {
    return (
      <div className="max-w-lg mx-auto" aria-label="Vote results">
        <AnnouncerRegion />
        {/* Header with leader info */}
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Leader Vote Complete</h2>
          <p className="text-gray-400">
            <span className="text-blue-400 font-semibold">{leader?.display_name}</span> was proposed
          </p>
        </div>
        <VoteResultsDisplay results={voteResults} />
      </div>
    );
  }

  // Rejection warning level
  const rejectionWarning = game.rejection_count >= 2 ? 'critical' : game.rejection_count >= 1 ? 'warning' : 'normal';

  return (
    <div className="max-w-lg mx-auto" role="region" aria-label="Leader voting">
      <AnnouncerRegion />
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-4" id="leader-vote-heading">Vote for Leader</h2>
        
        {/* Leader card with crown */}
        <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-amber-900/40 to-yellow-900/40 border-2 border-amber-500/50 rounded-2xl">
          <span className="p-2 rounded-xl bg-amber-500/30">
            <CrownIcon className="w-6 h-6 text-amber-400" />
          </span>
          <div className="text-left">
            <p className="text-xs text-amber-400/80 uppercase tracking-wide font-medium">Proposed Leader</p>
            <p className="text-xl font-bold text-amber-200">{leader?.display_name}</p>
          </div>
        </div>
        
        {/* Rejection counter */}
        <div className={`
          mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-colors
          ${rejectionWarning === 'critical' 
            ? 'bg-red-900/40 border border-red-500/50' 
            : rejectionWarning === 'warning'
            ? 'bg-orange-900/40 border border-orange-500/50'
            : 'bg-stone-800/50 border border-stone-600/50'
          }
        `}>
          <span className={`text-sm font-medium ${
            rejectionWarning === 'critical' ? 'text-red-400' :
            rejectionWarning === 'warning' ? 'text-orange-400' : 'text-gray-400'
          }`}>
            Rejections: 
          </span>
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`w-3 h-3 rounded-full transition-colors ${
                  i < game.rejection_count
                    ? rejectionWarning === 'critical' ? 'bg-red-500' : 'bg-orange-500'
                    : 'bg-stone-600'
                }`}
              />
            ))}
          </div>
          {game.rejection_count === 2 && (
            <span className="text-xs text-red-400 font-medium ml-1 animate-pulse">
              Final chance!
            </span>
          )}
        </div>
      </div>

      {/* Voting area */}
      <div className="space-y-6">
        {/* Show voting buttons or waiting message */}
        {hasVoted || isComplete ? (
          <WaitingMessage
            voteCount={voteCount}
            expectedCount={expectedCount}
            hasVoted={hasVoted}
            myVote={myVote}
            players={players}
            votes={votes}
          />
        ) : (
          <div className="space-y-4">
            <p className="text-center text-gray-300 mb-2">
              Should this player lead the next mission?
            </p>
            <VotingButtons
              onApprove={handleApprove}
              onReject={handleReject}
              disabled={hasVoted}
              isSubmitting={isSubmitting}
            />
          </div>
        )}

        {/* Vote progress indicator */}
        {!showResults && (
          <div className="mt-6">
            <div className="relative w-full max-w-xs mx-auto">
              <div className="h-3 bg-stone-700/50 rounded-full overflow-hidden border border-stone-600/50">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${(voteCount / expectedCount) * 100}%` }}
                />
              </div>
              {/* Progress glow effect */}
              <div
                className="absolute top-0 left-0 h-3 bg-blue-400/20 rounded-full blur-sm transition-all duration-500"
                style={{ width: `${(voteCount / expectedCount) * 100}%` }}
              />
            </div>
            <p className="text-sm text-gray-500 mt-3 text-center tabular-nums">
              <span className="text-blue-400 font-medium">{voteCount}</span> of <span className="font-medium">{expectedCount}</span> votes cast
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LeaderVoting;
