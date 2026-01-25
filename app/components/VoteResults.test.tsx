/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { VoteResults, type LeaderVoteResult, type MissionVoteResult } from './VoteResults';

// =============================================================================
// Test Setup
// =============================================================================

describe('VoteResults', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Leader Vote Results
  // ===========================================================================

  describe('leader vote results', () => {
    const approvedResult: LeaderVoteResult = {
      yesCount: 4,
      noCount: 2,
      approved: true,
    };

    const rejectedResult: LeaderVoteResult = {
      yesCount: 2,
      noCount: 4,
      approved: false,
    };

    it('displays vote counts for approved leader', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={approvedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to complete reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('4')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('Approved')).toBeTruthy();
      expect(screen.getByText('Rejected')).toBeTruthy();
    });

    it('shows approved result with correct styling', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={approvedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Leader Approved!')).toBeTruthy();
      expect(screen.getByText('Proceeding to team selection...')).toBeTruthy();
    });

    it('shows rejected result with correct styling', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={rejectedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Leader Rejected!')).toBeTruthy();
      expect(screen.getByText('Crown passes to the next player...')).toBeTruthy();
    });

    it('displays correct number of vote cards', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={approvedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal cards
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const voteCards = screen.getAllByLabelText(/vote$/);
      expect(voteCards.length).toBe(6); // 4 yes + 2 no
    });

    it('renders vote cards with staggered animation', async () => {
      const result: LeaderVoteResult = {
        yesCount: 3,
        noCount: 0,
        approved: true,
      };

      render(
        <VoteResults
          type="leader"
          leaderResult={result}
          showContinueButton={false}
        />
      );

      // Initially all cards should be hidden (scale-0)
      const voteCards = screen.getAllByLabelText(/vote$/);
      voteCards.forEach((card) => {
        expect(card.className).toContain('scale-0');
      });

      // Advance past reveal delay
      act(() => {
        vi.advanceTimersByTime(700);
      });

      // Cards should now be scaling up
      voteCards.forEach((card) => {
        expect(card.className).toContain('scale-100');
      });
    });
  });

  // ===========================================================================
  // Mission Vote Results
  // ===========================================================================

  describe('mission vote results', () => {
    const passedResult: MissionVoteResult = {
      passCount: 3,
      failCount: 0,
      passed: true,
    };

    const failedResult: MissionVoteResult = {
      passCount: 2,
      failCount: 1,
      passed: false,
    };

    it('displays vote counts for passed mission', async () => {
      render(
        <VoteResults
          type="mission"
          missionResult={passedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to complete reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
      expect(screen.getByText('Pass')).toBeTruthy();
      expect(screen.getByText('Fail')).toBeTruthy();
    });

    it('shows passed result with correct styling', async () => {
      render(
        <VoteResults
          type="mission"
          missionResult={passedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Mission Passed!')).toBeTruthy();
      expect(screen.getByText('Good team scores a point!')).toBeTruthy();
    });

    it('shows failed result with correct styling', async () => {
      render(
        <VoteResults
          type="mission"
          missionResult={failedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Mission Failed!')).toBeTruthy();
      expect(screen.getByText('Evil team scores a point!')).toBeTruthy();
    });

    it('shows rigged indicator when wasRigged is true', async () => {
      const riggedResult: MissionVoteResult = {
        passCount: 2,
        failCount: 1,
        passed: true,
        wasRigged: true,
      };

      render(
        <VoteResults
          type="mission"
          missionResult={riggedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('(Mission was influenced by the Fixer)')).toBeTruthy();
    });

    it('displays shuffled votes label', async () => {
      render(
        <VoteResults
          type="mission"
          missionResult={passedResult}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Votes (shuffled):')).toBeTruthy();
    });
  });

  // ===========================================================================
  // Continue Button
  // ===========================================================================

  describe('continue button', () => {
    it('shows continue button when showContinueButton is true', async () => {
      const onContinue = vi.fn();

      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={true}
          onContinue={onContinue}
        />
      );

      // Advance timers to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    });

    it('hides continue button when showContinueButton is false', async () => {
      const onContinue = vi.fn();

      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={false}
          onContinue={onContinue}
        />
      );

      // Advance timers to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    });

    it('calls onContinue when continue button is clicked', async () => {
      const onContinue = vi.fn();

      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={true}
          onContinue={onContinue}
        />
      );

      // Advance timers to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const button = screen.getByRole('button', { name: 'Continue' });
      fireEvent.click(button);

      expect(onContinue).toHaveBeenCalledTimes(1);
    });

    it('uses custom continue text when provided', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={true}
          onContinue={() => {}}
          continueText="Next Round"
        />
      );

      // Advance timers to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole('button', { name: 'Next Round' })).toBeTruthy();
    });
  });

  // ===========================================================================
  // Auto-Continue
  // ===========================================================================

  describe('auto-continue', () => {
    it('shows countdown when autoContinueMs is set', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={true}
          onContinue={() => {}}
          autoContinueMs={5000}
        />
      );

      // Advance to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Should show countdown
      expect(screen.getByText('(5s)')).toBeTruthy();
    });

    it('counts down each second', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={true}
          onContinue={() => {}}
          autoContinueMs={3000}
        />
      );

      // Advance to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('(3s)')).toBeTruthy();

      // Advance 1 second
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText('(2s)')).toBeTruthy();
    });

    it('calls onContinue after countdown completes', async () => {
      const onContinue = vi.fn();

      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={true}
          onContinue={onContinue}
          autoContinueMs={2000}
        />
      );

      // Advance to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onContinue).not.toHaveBeenCalled();

      // Advance through countdown
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onContinue).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Animation Phases
  // ===========================================================================

  describe('animation phases', () => {
    it('starts in initial phase with hidden elements', () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={false}
        />
      );

      // Check that vote cards start hidden
      const voteCards = screen.getAllByLabelText(/vote$/);
      voteCards.forEach((card) => {
        expect(card.className).toContain('scale-0');
        expect(card.className).toContain('opacity-0');
      });
    });

    it('transitions to revealing phase after delay', () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={false}
        />
      );

      // Advance past REVEAL_DELAY_MS (500) + a bit
      act(() => {
        vi.advanceTimersByTime(700);
      });

      // Cards should now be visible
      const voteCards = screen.getAllByLabelText(/vote$/);
      voteCards.forEach((card) => {
        expect(card.className).toContain('scale-100');
        expect(card.className).toContain('opacity-100');
      });
    });

    it('shows continue button only after complete phase', () => {
      const onContinue = vi.fn();

      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={true}
          onContinue={onContinue}
        />
      );

      // Initially no button
      expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();

      // Advance to complete phase
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Button should now be visible
      expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe('accessibility', () => {
    it('has proper aria-label on container', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={false}
        />
      );

      expect(screen.getByLabelText('Vote results')).toBeTruthy();
    });

    it('has role="alert" on result banner', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByRole('alert')).toBeTruthy();
    });

    it('has aria-live="polite" on result banner', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 3, noCount: 2, approved: true }}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      const banner = screen.getByRole('alert');
      expect(banner.getAttribute('aria-live')).toBe('polite');
    });

    it('has proper aria-label on vote cards', async () => {
      render(
        <VoteResults
          type="mission"
          missionResult={{ passCount: 2, failCount: 1, passed: false }}
          showContinueButton={false}
        />
      );

      const passVotes = screen.getAllByLabelText('pass vote');
      const failVotes = screen.getAllByLabelText('fail vote');

      expect(passVotes.length).toBe(2);
      expect(failVotes.length).toBe(1);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe('edge cases', () => {
    it('handles unanimous approval', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 5, noCount: 0, approved: true }}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('5')).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
    });

    it('handles unanimous rejection', async () => {
      render(
        <VoteResults
          type="leader"
          leaderResult={{ yesCount: 0, noCount: 5, approved: false }}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Leader Rejected!')).toBeTruthy();
    });

    it('handles mission with all pass votes', async () => {
      render(
        <VoteResults
          type="mission"
          missionResult={{ passCount: 4, failCount: 0, passed: true }}
          showContinueButton={false}
        />
      );

      // Advance timers to reveal
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(screen.getByText('Mission Passed!')).toBeTruthy();
    });

    it('shows error message for invalid configuration', async () => {
      render(
        <VoteResults
          type="leader"
          // Missing leaderResult
          showContinueButton={false}
        />
      );

      expect(screen.getByRole('alert')).toBeTruthy();
      expect(screen.getByText('Invalid vote results configuration')).toBeTruthy();
    });

    it('handles mission type with missing missionResult', async () => {
      render(
        <VoteResults
          type="mission"
          // Missing missionResult
          showContinueButton={false}
        />
      );

      expect(screen.getByText('Invalid vote results configuration')).toBeTruthy();
    });
  });
});
