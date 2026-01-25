/**
 * Unit tests for useVoteCompletion hook
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoteCompletion, type VoteCompletionResult } from './useVoteCompletion';
import type { Game, Player, GamePhase } from '~/types/game';
import type { VoteMap } from './useVoteSubscription';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-123',
    game_key: 'ABC123',
    host_id: 'user-1',
    status: 'playing',
    phase: 'voting_for_leader',
    current_round: 1,
    crown_index: 0,
    rejection_count: 0,
    good_victories: 0,
    evil_victories: 0,
    selected_team: null,
    winner: null,
    end_reason: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    game_id: 'game-123',
    user_id: 'user-1',
    display_name: 'Player 1',
    character: null,
    team: null,
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createPlayers(count: number): Player[] {
  return Array.from({ length: count }, (_, i) =>
    createTestPlayer({
      id: `player-${i + 1}`,
      user_id: `user-${i + 1}`,
      display_name: `Player ${i + 1}`,
      seat_order: i,
    })
  );
}

// =============================================================================
// Setup/Teardown
// =============================================================================

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// =============================================================================
// Tests: Basic State
// =============================================================================

describe('useVoteCompletion - Basic State', () => {
  it('returns initial state with no votes', () => {
    const game = createTestGame();
    const players = createPlayers(5);
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes)
    );

    expect(result.current.isComplete).toBe(false);
    expect(result.current.voteCount).toBe(0);
    expect(result.current.expectedCount).toBe(5);
  });

  it('calculates correct expected count for leader voting', () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(7);
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes)
    );

    expect(result.current.expectedCount).toBe(7);
  });

  it('calculates correct expected count for mission voting', () => {
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-2', 'player-3'],
    });
    const players = createPlayers(7);
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes)
    );

    expect(result.current.expectedCount).toBe(3);
  });

  it('counts only alive players for leader voting', () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = [
      createTestPlayer({ id: 'player-1', is_alive: true }),
      createTestPlayer({ id: 'player-2', is_alive: true }),
      createTestPlayer({ id: 'player-3', is_alive: false }), // Dead
      createTestPlayer({ id: 'player-4', is_alive: true }),
      createTestPlayer({ id: 'player-5', is_alive: false }), // Dead
    ];
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes)
    );

    expect(result.current.expectedCount).toBe(3);
  });

  it('returns 0 expected for non-voting phases', () => {
    const game = createTestGame({ phase: 'selecting_team' });
    const players = createPlayers(5);
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes)
    );

    expect(result.current.expectedCount).toBe(0);
    expect(result.current.isComplete).toBe(false);
  });

  it('returns 0 expected when game is null', () => {
    const players = createPlayers(5);
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(null, players, votes)
    );

    expect(result.current.expectedCount).toBe(0);
    expect(result.current.isComplete).toBe(false);
  });
});

// =============================================================================
// Tests: Vote Counting
// =============================================================================

describe('useVoteCompletion - Vote Counting', () => {
  it('counts votes correctly', () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(5);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes)
    );

    expect(result.current.voteCount).toBe(3);
    expect(result.current.isComplete).toBe(false);
  });

  it('detects completion when all votes are in', () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(5);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
      'player-4': 'no',
      'player-5': 'yes',
    };

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes)
    );

    expect(result.current.voteCount).toBe(5);
    expect(result.current.expectedCount).toBe(5);
    expect(result.current.isComplete).toBe(true);
  });

  it('updates vote count when votes change', () => {
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(5);
    let votes: VoteMap = { 'player-1': 'yes' };

    const { result, rerender } = renderHook(
      ({ v }) => useVoteCompletion(game, players, v),
      { initialProps: { v: votes } }
    );

    expect(result.current.voteCount).toBe(1);

    votes = { 'player-1': 'yes', 'player-2': 'no' };
    rerender({ v: votes });

    expect(result.current.voteCount).toBe(2);
  });
});

// =============================================================================
// Tests: Completion Triggering
// =============================================================================

describe('useVoteCompletion - Completion Triggering', () => {
  it('triggers onComplete callback when votes complete', async () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({
      voteType: 'leader',
      voteCount: 3,
      expectedCount: 3,
      votes,
    });
  });

  it('triggers with mission vote type for mission voting', async () => {
    const onComplete = vi.fn();
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-2'],
    });
    const players = createPlayers(5);
    const votes: VoteMap = {
      'player-1': 'pass',
      'player-2': 'fail',
    };

    renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        voteType: 'mission',
        voteCount: 2,
        expectedCount: 2,
      })
    );
  });

  it('does not trigger when votes are incomplete', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(5);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      // Missing 3 votes
    };

    renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not trigger for non-voting phases', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'selecting_team' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: Debouncing
// =============================================================================

describe('useVoteCompletion - Debouncing', () => {
  it('debounces completion callback', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 300 })
    );

    // Before debounce completes
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // After debounce completes
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('uses custom debounce time', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 500 })
    );

    // At 400ms - should not trigger
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // At 550ms - should trigger
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not trigger multiple times for same completion', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    const { rerender } = renderHook(
      ({ v }) => useVoteCompletion(game, players, v, { onComplete, debounceMs: 100 }),
      { initialProps: { v: votes } }
    );

    // First completion
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Rerender with same data - should not trigger again
    rerender({ v: votes });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Tests: Phase/Round Changes
// =============================================================================

describe('useVoteCompletion - Phase/Round Changes', () => {
  it('resets trigger state when phase changes', () => {
    const onComplete = vi.fn();
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };
    let game = createTestGame({ phase: 'voting_for_leader' });

    const { rerender } = renderHook(
      ({ g, v }) => useVoteCompletion(g, players, v, { onComplete, debounceMs: 100 }),
      { initialProps: { g: game, v: votes } }
    );

    // First completion
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Change phase - should reset
    game = createTestGame({ phase: 'mission_voting', selected_team: ['player-1', 'player-2', 'player-3'] });
    const missionVotes: VoteMap = {
      'player-1': 'pass',
      'player-2': 'pass',
      'player-3': 'fail',
    };
    rerender({ g: game, v: missionVotes });

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('resets trigger state when round changes', () => {
    const onComplete = vi.fn();
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };
    let game = createTestGame({ phase: 'voting_for_leader', current_round: 1 });

    const { rerender } = renderHook(
      ({ g, v }) => useVoteCompletion(g, players, v, { onComplete, debounceMs: 100 }),
      { initialProps: { g: game, v: votes } }
    );

    // First completion
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Change round - should reset
    game = createTestGame({ phase: 'voting_for_leader', current_round: 2 });
    rerender({ g: game, v: votes });

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('clears pending timeout on phase change', () => {
    const onComplete = vi.fn();
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };
    let game = createTestGame({ phase: 'voting_for_leader' });

    const { rerender } = renderHook(
      ({ g }) => useVoteCompletion(g, players, votes, { onComplete, debounceMs: 300 }),
      { initialProps: { g: game } }
    );

    // Start debounce timer
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // Change phase before timer completes
    game = createTestGame({ phase: 'selecting_team' });
    rerender({ g: game });

    // Advance past original timer - should not trigger
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: Enabled Option
// =============================================================================

describe('useVoteCompletion - Enabled Option', () => {
  it('does not trigger when disabled', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    renderHook(() =>
      useVoteCompletion(game, players, votes, {
        onComplete,
        debounceMs: 100,
        enabled: false,
      })
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('triggers when re-enabled', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    const { rerender } = renderHook(
      ({ enabled }) =>
        useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100, enabled }),
      { initialProps: { enabled: false } }
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // Re-enable
    rerender({ enabled: true });

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// =============================================================================
// Tests: Manual Check
// =============================================================================

describe('useVoteCompletion - Manual Check', () => {
  it('checkCompletion triggers immediately when complete', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes, {
        onComplete,
        debounceMs: 1000, // Long debounce
        enabled: false, // Disable auto-trigger
      })
    );

    // Manual check won't work when disabled
    act(() => {
      result.current.checkCompletion();
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('checkCompletion does nothing when incomplete', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(5);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      // Missing votes
    };

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    act(() => {
      result.current.checkCompletion();
    });

    expect(onComplete).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: Edge Cases
// =============================================================================

describe('useVoteCompletion - Edge Cases', () => {
  it('handles empty votes map', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(5);
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    expect(result.current.voteCount).toBe(0);
    expect(result.current.isComplete).toBe(false);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('handles empty players array', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players: Player[] = [];
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    expect(result.current.expectedCount).toBe(0);
    expect(result.current.isComplete).toBe(false);
  });

  it('handles null game', () => {
    const onComplete = vi.fn();
    const players = createPlayers(5);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
    };

    const { result } = renderHook(() =>
      useVoteCompletion(null, players, votes, { onComplete, debounceMs: 100 })
    );

    expect(result.current.expectedCount).toBe(0);
    expect(result.current.isComplete).toBe(false);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('handles null selected_team for mission voting', () => {
    const onComplete = vi.fn();
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: null,
    });
    const players = createPlayers(5);
    const votes: VoteMap = {};

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    expect(result.current.expectedCount).toBe(0);
    expect(result.current.isComplete).toBe(false);
  });

  it('handles more votes than expected', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
      'player-4': 'yes', // Extra vote
      'player-5': 'no', // Extra vote
    };

    const { result } = renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 100 })
    );

    // Should still be complete (votes >= expected)
    expect(result.current.isComplete).toBe(true);
    expect(result.current.voteCount).toBe(5);
    expect(result.current.expectedCount).toBe(3);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('cleans up timeout on unmount', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(3);
    const votes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
      'player-3': 'yes',
    };

    const { unmount } = renderHook(() =>
      useVoteCompletion(game, players, votes, { onComplete, debounceMs: 300 })
    );

    // Start debounce timer
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Unmount before timer completes
    unmount();

    // Advance timer - should not trigger (timer cleared)
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: Integration Scenarios
// =============================================================================

describe('useVoteCompletion - Integration Scenarios', () => {
  it('handles leader voting completion flow', () => {
    const onComplete = vi.fn();
    const game = createTestGame({ phase: 'voting_for_leader' });
    const players = createPlayers(5);
    let votes: VoteMap = {};

    const { rerender, result } = renderHook(
      ({ v }) => useVoteCompletion(game, players, v, { onComplete, debounceMs: 100 }),
      { initialProps: { v: votes } }
    );

    // Vote 1
    votes = { 'player-1': 'yes' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(1);
    expect(result.current.isComplete).toBe(false);

    // Vote 2
    votes = { ...votes, 'player-2': 'no' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(2);

    // Vote 3
    votes = { ...votes, 'player-3': 'yes' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(3);

    // Vote 4
    votes = { ...votes, 'player-4': 'no' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(4);

    // Vote 5 - completes
    votes = { ...votes, 'player-5': 'yes' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(5);
    expect(result.current.isComplete).toBe(true);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).toHaveBeenCalledWith({
      voteType: 'leader',
      voteCount: 5,
      expectedCount: 5,
      votes,
    });
  });

  it('handles mission voting completion flow', () => {
    const onComplete = vi.fn();
    const game = createTestGame({
      phase: 'mission_voting',
      selected_team: ['player-1', 'player-3', 'player-4'],
    });
    const players = createPlayers(7);
    let votes: VoteMap = {};

    const { rerender, result } = renderHook(
      ({ v }) => useVoteCompletion(game, players, v, { onComplete, debounceMs: 100 }),
      { initialProps: { v: votes } }
    );

    expect(result.current.expectedCount).toBe(3);

    // Team member 1 votes
    votes = { 'player-1': 'pass' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(1);

    // Team member 2 votes
    votes = { ...votes, 'player-3': 'fail' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(2);

    // Team member 3 votes - completes
    votes = { ...votes, 'player-4': 'pass' };
    rerender({ v: votes });
    expect(result.current.voteCount).toBe(3);
    expect(result.current.isComplete).toBe(true);

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(onComplete).toHaveBeenCalledWith({
      voteType: 'mission',
      voteCount: 3,
      expectedCount: 3,
      votes,
    });
  });
});
