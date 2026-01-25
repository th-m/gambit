/**
 * MissionVoting Component
 *
 * Displays the mission voting interface with:
 * - Team member identification with visual cards
 * - Pass button (all team members) with icon
 * - Fail button (evil team members only) with icon
 * - Good players cannot vote fail
 * - Non-team members see animated waiting state
 * - Vote progress with player indicators
 * - Results display shuffled with reveal animation
 * - Handles vote modifiers (rig_vote)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVoteSubscription } from '~/hooks/useVoteSubscription';
import { useVoteCompletion } from '~/hooks/useVoteCompletion';
import {
  useScreenReaderAnnouncer,
  formatVoteResultAnnouncement,
} from '~/hooks/useScreenReaderAnnouncer';
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
 * Get team members as player objects
 */
function getTeamMembers(selectedTeam: string[] | null, players: Player[]): Player[] {
  if (!selectedTeam) return [];
  return selectedTeam
    .map((playerId) => players.find((p) => p.id === playerId))
    .filter((player): player is Player => !!player);
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

function ShieldIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SkullIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="10" r="2" />
      <circle cx="15" cy="10" r="2" />
      <path d="M12 2C6.477 2 2 6.477 2 12c0 3.5 1.8 6.5 4.5 8.3V22h11v-1.7c2.7-1.8 4.5-4.8 4.5-8.3 0-5.523-4.477-10-10-10zm0 14c-2.5 0-4.5-1.5-4.5-3.5h3v-1h3v1h3c0 2-2 3.5-4.5 3.5z" />
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

function UsersIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
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
    <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
      {/* Pass Button */}
      <button
        onClick={onPass}
        disabled={disabled || isSubmitting}
        className={`
          group relative w-full sm:w-auto min-w-[160px] px-8 py-4 rounded-2xl font-bold text-lg
          transition-all duration-300 transform
          ${disabled || isSubmitting
            ? 'bg-stone-700 text-stone-500 cursor-not-allowed scale-95 opacity-60'
            : 'bg-gradient-to-br from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white shadow-lg shadow-green-900/30 hover:shadow-green-900/50 hover:scale-105 active:scale-[0.98]'
          }
        `}
        aria-label="Vote pass on mission"
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
                <ShieldIcon className="w-5 h-5" />
              </span>
              <span>Pass</span>
            </>
          )}
        </span>
        {!disabled && !isSubmitting && (
          <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {/* Fail Button - Only for evil team members */}
      {canVoteFail && (
        <button
          onClick={onFail}
          disabled={disabled || isSubmitting}
          className={`
            group relative w-full sm:w-auto min-w-[160px] px-8 py-4 rounded-2xl font-bold text-lg
            transition-all duration-300 transform
            ${disabled || isSubmitting
              ? 'bg-stone-700 text-stone-500 cursor-not-allowed scale-95 opacity-60'
              : 'bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white shadow-lg shadow-red-900/30 hover:shadow-red-900/50 hover:scale-105 active:scale-[0.98]'
            }
          `}
          aria-label="Vote fail on mission"
          aria-busy={isSubmitting}
        >
          <span className="flex items-center justify-center gap-3">
            <span className="p-1 rounded-lg bg-white/20">
              <SkullIcon className="w-5 h-5" />
            </span>
            <span>Fail</span>
          </span>
          {!disabled && !isSubmitting && (
            <div className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
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
  teamMembers: Player[];
  votes: Record<string, string>;
}

function WaitingMessage({
  voteCount,
  expectedCount,
  hasVoted,
  myVote,
  isOnTeam,
  teamMembers,
  votes,
}: WaitingMessageProps) {
  const votedPlayerIds = new Set(Object.keys(votes));
  
  return (
    <div className="space-y-6">
      {/* Your vote confirmation */}
      {hasVoted && myVote && (
        <div className="flex justify-center animate-fade-in">
          <div
            className={`
              inline-flex items-center gap-3 px-6 py-3 rounded-xl
              ${myVote === 'pass' 
                ? 'bg-gradient-to-r from-emerald-900/60 to-green-900/60 border border-emerald-600/50 text-emerald-300' 
                : 'bg-gradient-to-r from-red-900/60 to-rose-900/60 border border-red-600/50 text-red-300'
              }
            `}
          >
            <span className={`p-1 rounded-lg ${myVote === 'pass' ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
              {myVote === 'pass' ? <ShieldIcon className="w-5 h-5" /> : <SkullIcon className="w-5 h-5" />}
            </span>
            <span className="font-semibold">
              You voted to {myVote === 'pass' ? 'Pass' : 'Fail'} the mission
            </span>
          </div>
        </div>
      )}

      {/* Team member vote progress */}
      <div className="bg-stone-800/50 rounded-2xl p-4 border border-stone-700/50">
        <div className="flex items-center justify-center gap-2 mb-4">
          <SpinnerIcon className="w-5 h-5 text-blue-400" />
          <span className="text-gray-300">
            {isOnTeam ? 'Waiting for team votes...' : 'Team members are voting...'}
          </span>
        </div>
        
        {/* Team member indicators */}
        <div className="flex flex-wrap gap-2 justify-center">
          {teamMembers.map((player) => {
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
                  {hasVoted ? (
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-stone-500" />
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

interface MissionResultsDisplayProps {
  results: MissionVoteResults;
  wasRigged: boolean;
}

function MissionResultsDisplay({ results, wasRigged }: MissionResultsDisplayProps) {
  const { passCount, failCount, passed } = results;
  const [showResult, setShowResult] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [revealedCards, setRevealedCards] = useState<number[]>([]);

  // Create shuffled vote display (no attribution)
  const shuffledVotes = shuffleArray([
    ...Array(passCount).fill('pass'),
    ...Array(failCount).fill('fail'),
  ]);

  // Staggered animation with suspenseful card reveal
  useEffect(() => {
    const timer1 = setTimeout(() => setShowResult(true), 200);
    const timer2 = setTimeout(() => setShowCards(true), 600);
    
    // Reveal cards one by one with suspense
    shuffledVotes.forEach((_, index) => {
      setTimeout(() => {
        setRevealedCards(prev => [...prev, index]);
      }, 800 + index * 400);
    });
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [shuffledVotes.length]);

  return (
    <div className="space-y-6">
      {/* Result banner with animation */}
      <div
        className={`
          p-6 rounded-2xl transform transition-all duration-700 ease-out
          ${showResult ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-4'}
          ${passed 
            ? 'bg-gradient-to-br from-emerald-900/60 to-green-900/60 border-2 border-emerald-500/50' 
            : 'bg-gradient-to-br from-red-900/60 to-rose-900/60 border-2 border-red-500/50'
          }
        `}
      >
        <div className="flex items-center justify-center gap-3 mb-2">
          <span className={`p-2 rounded-xl ${passed ? 'bg-emerald-500/30' : 'bg-red-500/30'}`}>
            {passed ? <ShieldIcon className="w-8 h-8 text-emerald-400" /> : <SkullIcon className="w-8 h-8 text-red-400" />}
          </span>
        </div>
        <h3
          className={`text-2xl font-bold text-center ${passed ? 'text-emerald-300' : 'text-red-300'}`}
          role="alert"
        >
          {passed ? 'Mission Passed!' : 'Mission Failed!'}
        </h3>
        {wasRigged && (
          <p className="text-sm text-blue-400 mt-2 text-center">
            (Mission was influenced by the Fixer)
          </p>
        )}
      </div>

      {/* Suspenseful card reveal */}
      <div className={`transition-opacity duration-300 ${showCards ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-sm text-gray-400 mb-4 text-center">Revealing votes...</p>
        <div className="flex gap-3 justify-center flex-wrap">
          {shuffledVotes.map((vote, index) => {
            const isRevealed = revealedCards.includes(index);
            const isPass = vote === 'pass';
            return (
              <div
                key={index}
                className="relative perspective-500"
              >
                {/* Card back (before reveal) */}
                <div
                  className={`
                    w-14 h-14 rounded-xl flex items-center justify-center
                    bg-gradient-to-br from-stone-600 to-stone-700 border-2 border-stone-500
                    transform transition-all duration-500 ease-out shadow-lg
                    ${isRevealed ? 'opacity-0 scale-0 rotate-y-180' : 'opacity-100 scale-100'}
                  `}
                >
                  <span className="text-2xl text-stone-400">?</span>
                </div>
                {/* Card front (after reveal) */}
                <div
                  className={`
                    absolute inset-0 w-14 h-14 rounded-xl flex items-center justify-center
                    transform transition-all duration-500 ease-out shadow-lg
                    ${isPass 
                      ? 'bg-gradient-to-br from-emerald-600 to-green-700 border-2 border-emerald-400/50' 
                      : 'bg-gradient-to-br from-red-600 to-rose-700 border-2 border-red-400/50'
                    }
                    ${isRevealed ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}
                  `}
                >
                  {isPass ? (
                    <CheckIcon className="w-7 h-7 text-white" />
                  ) : (
                    <XIcon className="w-7 h-7 text-white" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vote count display */}
      <div className={`flex justify-center gap-12 transition-all duration-500 ${revealedCards.length === shuffledVotes.length ? 'opacity-100' : 'opacity-0'}`}>
        <div className="text-center">
          <p className="text-4xl font-bold text-emerald-400 tabular-nums">{passCount}</p>
          <p className="text-sm text-gray-400 font-medium">Pass</p>
        </div>
        <div className="text-center">
          <p className="text-4xl font-bold text-red-400 tabular-nums">{failCount}</p>
          <p className="text-sm text-gray-400 font-medium">Fail</p>
        </div>
      </div>

      {/* Progress message */}
      <p className={`text-center text-gray-400 transition-opacity duration-500 ${revealedCards.length === shuffledVotes.length ? 'opacity-100' : 'opacity-0'}`}>
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

  // Screen reader announcer
  const { announcePolite, announceAssertive, AnnouncerRegion } = useScreenReaderAnnouncer();

  // Refs for double-click prevention
  const lastClickRef = useRef<number>(0);
  const CLICK_DEBOUNCE_MS = 500;

  // Determine team membership and team info
  const isOnTeam = game.selected_team?.includes(currentPlayer.id) ?? false;
  const isEvil = currentPlayer.team === 'evil';
  const canVoteFail = isOnTeam && isEvil;
  const teamSize = game.selected_team?.length ?? 0;
  const teamMembers = getTeamMembers(game.selected_team, players);

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
      
      // Announce results to screen readers
      const announcement = formatVoteResultAnnouncement(
        'mission',
        results.passed ? 'passed' : 'failed',
        results.passCount,
        results.failCount
      );
      announceAssertive(announcement);
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
        
        // Announce vote submission to screen readers
        announcePolite(`You voted ${vote}. Waiting for other team members.`);
      } catch (error) {
        // Reset on error
        setMyVote(null);
        console.error('Failed to submit mission vote:', error);
        // Announce error to screen readers
        announceAssertive('Failed to submit vote. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [hasVoted, isSubmitting, isEvil, onVote, announcePolite, announceAssertive]
  );

  const handlePass = useCallback(() => handleVote('pass'), [handleVote]);
  const handleFail = useCallback(() => handleVote('fail'), [handleVote]);

  // Loading state
  if (votesLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12" aria-busy="true" aria-label="Loading mission status">
        <AnnouncerRegion />
        <div className="relative">
          <div className="w-16 h-16 rounded-full border-4 border-stone-700" />
          <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-t-blue-500 animate-spin" />
        </div>
        <p className="mt-4 text-gray-400 font-medium" aria-live="polite">Loading mission status...</p>
      </div>
    );
  }

  // Show results when voting is complete
  if (showResults && voteResults) {
    return (
      <div className="max-w-lg mx-auto" aria-label="Mission results">
        <AnnouncerRegion />
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-white mb-2">Mission Complete</h2>
          <p className="text-gray-400">Round {game.current_round}</p>
        </div>
        <MissionResultsDisplay results={voteResults} wasRigged={wasRigged} />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto" role="region" aria-label="Mission voting">
      <AnnouncerRegion />
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-4" id="mission-vote-heading">Mission Vote</h2>
        
        {/* Mission info card */}
        <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border-2 border-blue-500/50 rounded-2xl">
          <span className="p-2 rounded-xl bg-blue-500/30">
            <UsersIcon className="w-6 h-6 text-blue-400" />
          </span>
          <div className="text-left">
            <p className="text-xs text-blue-400/80 uppercase tracking-wide font-medium">Round {game.current_round} Team</p>
            <p className="text-xl font-bold text-blue-200">{teamSize} members</p>
          </div>
        </div>
        
        {/* Your status badge */}
        <div className={`
          mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl
          ${isOnTeam 
            ? 'bg-blue-900/40 border border-blue-500/50 text-blue-300' 
            : 'bg-stone-800/50 border border-stone-600/50 text-stone-400'
          }
        `}>
          {isOnTeam ? (
            <>
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-sm font-medium">You are on the team</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-stone-500" />
              <span className="text-sm font-medium">Observing the mission</span>
            </>
          )}
        </div>
      </div>

      {/* Voting area */}
      <div className="space-y-6">
        {/* Show voting UI for team members, waiting state for others */}
        {isOnTeam && !hasVoted && !isComplete ? (
          <div className="space-y-4">
            <p className="text-center text-gray-300 mb-2">
              Cast your vote for this mission
            </p>
            <VotingButtons
              onPass={handlePass}
              onFail={handleFail}
              canVoteFail={canVoteFail}
              disabled={hasVoted}
              isSubmitting={isSubmitting}
            />
            {!canVoteFail && (
              <p className="text-center text-sm text-emerald-400/70 bg-emerald-900/20 rounded-lg py-2 px-4 border border-emerald-600/30">
                As a loyal team member, you can only vote Pass
              </p>
            )}
          </div>
        ) : (
          <WaitingMessage
            voteCount={voteCount}
            expectedCount={expectedCount}
            hasVoted={hasVoted}
            myVote={myVote}
            isOnTeam={isOnTeam}
            teamMembers={teamMembers}
            votes={votes}
          />
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
              <span className="text-blue-400 font-medium">{voteCount}</span> of <span className="font-medium">{expectedCount}</span> team votes cast
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default MissionVoting;
