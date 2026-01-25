/**
 * VoteResults Component
 *
 * Displays vote results with:
 * - Vote counts (approve/reject for leader, pass/fail for mission)
 * - Pass/fail or approve/reject result
 * - Animated reveal effect
 * - Continue button
 * - Different styling for success/failure
 */

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export type VoteResultType = 'leader' | 'mission';

export interface LeaderVoteResult {
  yesCount: number;
  noCount: number;
  approved: boolean;
}

export interface MissionVoteResult {
  passCount: number;
  failCount: number;
  passed: boolean;
  wasRigged?: boolean;
}

export interface VoteResultsProps {
  /** Type of vote (leader or mission) */
  type: VoteResultType;
  /** Leader vote results */
  leaderResult?: LeaderVoteResult;
  /** Mission vote results */
  missionResult?: MissionVoteResult;
  /** Callback when continue is clicked */
  onContinue?: () => void;
  /** Whether to show the continue button */
  showContinueButton?: boolean;
  /** Custom continue button text */
  continueText?: string;
  /** Whether to auto-continue after delay (ms), 0 = disabled */
  autoContinueMs?: number;
}

// =============================================================================
// Animation Constants
// =============================================================================

const REVEAL_DELAY_MS = 500; // Delay before starting reveal
const REVEAL_DURATION_MS = 600; // Duration of each vote reveal
const VOTE_STAGGER_MS = 150; // Stagger between vote card reveals

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Shuffle an array using Fisher-Yates algorithm
 * Used to display mission votes without attribution
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

interface VoteCardProps {
  vote: 'yes' | 'no' | 'pass' | 'fail';
  revealed: boolean;
  index: number;
}

function VoteCard({ vote, revealed, index }: VoteCardProps) {
  const isPositive = vote === 'yes' || vote === 'pass';
  
  return (
    <div
      className={`
        w-14 h-14 rounded-lg flex items-center justify-center text-xl
        transform transition-all duration-500 ease-out
        ${revealed ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
        ${isPositive 
          ? 'bg-green-900/50 border-2 border-green-600' 
          : 'bg-red-900/50 border-2 border-red-600'}
      `}
      style={{
        transitionDelay: revealed ? `${index * VOTE_STAGGER_MS}ms` : '0ms',
      }}
      aria-label={`${vote} vote`}
    >
      <span className={isPositive ? 'text-green-400' : 'text-red-400'}>
        {isPositive ? '✓' : '✗'}
      </span>
    </div>
  );
}

interface ResultBannerProps {
  success: boolean;
  title: string;
  subtitle?: string;
  revealed: boolean;
}

function ResultBanner({ success, title, subtitle, revealed }: ResultBannerProps) {
  return (
    <div
      className={`
        mb-6 py-4 px-6 rounded-xl transform transition-all duration-700 ease-out
        ${revealed ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 -translate-y-4'}
        ${success 
          ? 'bg-green-900/50 border-2 border-green-600' 
          : 'bg-red-900/50 border-2 border-red-600'}
      `}
    >
      <h3
        className={`text-2xl font-bold ${success ? 'text-green-400' : 'text-red-400'}`}
        role="alert"
        aria-live="polite"
      >
        {title}
      </h3>
      {subtitle && (
        <p className="text-sm text-blue-400 mt-2">{subtitle}</p>
      )}
    </div>
  );
}

interface VoteCountDisplayProps {
  positiveCount: number;
  negativeCount: number;
  positiveLabel: string;
  negativeLabel: string;
  revealed: boolean;
}

function VoteCountDisplay({
  positiveCount,
  negativeCount,
  positiveLabel,
  negativeLabel,
  revealed,
}: VoteCountDisplayProps) {
  return (
    <div 
      className={`
        flex justify-center gap-12 transition-all duration-500 ease-out
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      style={{ transitionDelay: revealed ? '400ms' : '0ms' }}
    >
      <div className="text-center">
        <p className="text-4xl font-bold text-green-400 tabular-nums">
          {positiveCount}
        </p>
        <p className="text-sm text-gray-400">{positiveLabel}</p>
      </div>
      <div className="text-center">
        <p className="text-4xl font-bold text-red-400 tabular-nums">
          {negativeCount}
        </p>
        <p className="text-sm text-gray-400">{negativeLabel}</p>
      </div>
    </div>
  );
}

interface ContinueButtonProps {
  onClick: () => void;
  text: string;
  revealed: boolean;
  autoCountdown?: number;
}

function ContinueButton({ onClick, text, revealed, autoCountdown }: ContinueButtonProps) {
  return (
    <div
      className={`
        mt-8 transition-all duration-500 ease-out
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      style={{ transitionDelay: revealed ? '800ms' : '0ms' }}
    >
      <button
        onClick={onClick}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors"
        aria-label={text}
      >
        {text}
        {autoCountdown !== undefined && autoCountdown > 0 && (
          <span className="ml-2 text-blue-200">({autoCountdown}s)</span>
        )}
      </button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function VoteResults({
  type,
  leaderResult,
  missionResult,
  onContinue,
  showContinueButton = true,
  continueText,
  autoContinueMs = 0,
}: VoteResultsProps) {
  // Animation state
  const [phase, setPhase] = useState<'initial' | 'revealing' | 'complete'>('initial');
  const [cardsRevealed, setCardsRevealed] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState<number | undefined>(
    autoContinueMs > 0 ? Math.ceil(autoContinueMs / 1000) : undefined
  );

  // Start reveal animation on mount
  useEffect(() => {
    const timer1 = setTimeout(() => {
      setPhase('revealing');
    }, REVEAL_DELAY_MS);

    const timer2 = setTimeout(() => {
      setCardsRevealed(true);
    }, REVEAL_DELAY_MS + 100);

    const timer3 = setTimeout(() => {
      setPhase('complete');
    }, REVEAL_DELAY_MS + REVEAL_DURATION_MS + 500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);

  // Auto-continue countdown
  useEffect(() => {
    if (autoContinueMs > 0 && phase === 'complete' && onContinue) {
      const countdownInterval = setInterval(() => {
        setAutoCountdown((prev) => {
          if (prev === undefined || prev <= 1) {
            clearInterval(countdownInterval);
            onContinue();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [autoContinueMs, phase, onContinue]);

  const handleContinue = useCallback(() => {
    onContinue?.();
  }, [onContinue]);

  // Determine content based on type
  if (type === 'leader' && leaderResult) {
    const { yesCount, noCount, approved } = leaderResult;
    const totalVotes = yesCount + noCount;
    const votes = shuffleArray([
      ...Array(yesCount).fill('yes' as const),
      ...Array(noCount).fill('no' as const),
    ]);

    return (
      <div className="text-center" aria-label="Vote results">
        <ResultBanner
          success={approved}
          title={approved ? 'Leader Approved!' : 'Leader Rejected!'}
          revealed={phase !== 'initial'}
        />

        {/* Vote cards with staggered reveal */}
        <div className="mb-6">
          <p 
            className={`text-sm text-gray-400 mb-3 transition-opacity duration-300 ${
              phase !== 'initial' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            Votes:
          </p>
          <div className="flex gap-2 justify-center flex-wrap max-w-md mx-auto">
            {votes.map((vote, index) => (
              <VoteCard 
                key={index} 
                vote={vote} 
                revealed={cardsRevealed} 
                index={index}
              />
            ))}
          </div>
        </div>

        <VoteCountDisplay
          positiveCount={yesCount}
          negativeCount={noCount}
          positiveLabel="Approved"
          negativeLabel="Rejected"
          revealed={phase !== 'initial'}
        />

        {/* Progress message */}
        <p 
          className={`mt-6 text-gray-400 transition-all duration-500 ${
            phase === 'complete' ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {approved ? 'Proceeding to team selection...' : 'Crown passes to the next player...'}
        </p>

        {showContinueButton && onContinue && phase === 'complete' && (
          <ContinueButton
            onClick={handleContinue}
            text={continueText || 'Continue'}
            revealed={phase === 'complete'}
            autoCountdown={autoCountdown}
          />
        )}
      </div>
    );
  }

  if (type === 'mission' && missionResult) {
    const { passCount, failCount, passed, wasRigged } = missionResult;
    const votes = shuffleArray([
      ...Array(passCount).fill('pass' as const),
      ...Array(failCount).fill('fail' as const),
    ]);

    return (
      <div className="text-center" aria-label="Mission results">
        <ResultBanner
          success={passed}
          title={passed ? 'Mission Passed!' : 'Mission Failed!'}
          subtitle={wasRigged ? '(Mission was influenced by the Fixer)' : undefined}
          revealed={phase !== 'initial'}
        />

        {/* Vote cards with staggered reveal */}
        <div className="mb-6">
          <p 
            className={`text-sm text-gray-400 mb-3 transition-opacity duration-300 ${
              phase !== 'initial' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            Votes (shuffled):
          </p>
          <div className="flex gap-2 justify-center flex-wrap max-w-md mx-auto">
            {votes.map((vote, index) => (
              <VoteCard 
                key={index} 
                vote={vote} 
                revealed={cardsRevealed} 
                index={index}
              />
            ))}
          </div>
        </div>

        <VoteCountDisplay
          positiveCount={passCount}
          negativeCount={failCount}
          positiveLabel="Pass"
          negativeLabel="Fail"
          revealed={phase !== 'initial'}
        />

        {/* Progress message */}
        <p 
          className={`mt-6 text-gray-400 transition-all duration-500 ${
            phase === 'complete' ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {passed ? 'Good team scores a point!' : 'Evil team scores a point!'}
        </p>

        {showContinueButton && onContinue && phase === 'complete' && (
          <ContinueButton
            onClick={handleContinue}
            text={continueText || 'Continue'}
            revealed={phase === 'complete'}
            autoCountdown={autoCountdown}
          />
        )}
      </div>
    );
  }

  // Invalid props - should not happen in practice
  return (
    <div className="text-center text-red-400" role="alert">
      Invalid vote results configuration
    </div>
  );
}

export default VoteResults;
