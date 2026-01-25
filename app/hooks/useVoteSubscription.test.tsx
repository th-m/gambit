/**
 * Unit tests for useVoteSubscription hook
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { GameAction, GamePhase } from '~/types/game';

// =============================================================================
// Mock Setup - Must be before imports that use the mocked modules
// =============================================================================

// Mock channel instance factory
const createMockChannel = () => {
  const handlers: Map<string, (payload: unknown) => void> = new Map();
  const channel = {
    on: vi.fn().mockImplementation(
      (
        _event: string,
        config: { table: string; event: string },
        handler: (payload: unknown) => void
      ) => {
        const key = `${config.table}-${config.event}`;
        handlers.set(key, handler);
        return channel;
      }
    ),
    subscribe: vi.fn().mockReturnThis(),
    unsubscribe: vi.fn(),
    _trigger: (table: string, event: string, payload: unknown) => {
      const key = `${table}-${event}`;
      const handler = handlers.get(key);
      if (handler) handler(payload);
    },
    _handlers: handlers,
  };
  return channel;
};

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
};

// Track created channels for testing
let mockChannels: ReturnType<typeof createMockChannel>[] = [];

// Hoist mock before any imports
vi.mock('~/lib/supabase/client', () => ({
  createClient: () => {
    mockChannels = [];
    mockSupabaseClient.channel.mockImplementation(() => {
      const channel = createMockChannel();
      mockChannels.push(channel);
      return channel;
    });
    return mockSupabaseClient;
  },
}));

// Now import the hook being tested
import { useVoteSubscription, type VoteMap } from './useVoteSubscription';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestAction(overrides: Partial<GameAction> = {}): GameAction {
  return {
    id: 'action-1',
    game_id: 'game-123',
    player_id: 'player-1',
    action_type: 'vote_yes',
    round: 1,
    phase: 'voting_for_leader',
    target_ids: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Mock query builder for Supabase
function createMockQueryBuilder(data: GameAction[]) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnValue(Promise.resolve({ data, error: null })),
  };
}

// =============================================================================
// Setup/Teardown
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockChannels = [];
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Tests: Initialization
// =============================================================================

describe('useVoteSubscription - Initialization', () => {
  it('returns empty votes when phase is not a voting phase', async () => {
    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'selecting_team')
    );

    expect(result.current.votes).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty votes when phase is lobby', async () => {
    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'lobby')
    );

    expect(result.current.votes).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it('returns empty votes when phase is null', async () => {
    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, null)
    );

    expect(result.current.votes).toEqual({});
    expect(result.current.isLoading).toBe(false);
  });

  it('shows loading state during initial fetch for voting_for_leader phase', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('shows loading state during initial fetch for mission_voting phase', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'mission_voting')
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('uses initial votes when provided', async () => {
    const initialVotes: VoteMap = {
      'player-1': 'yes',
      'player-2': 'no',
    };

    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader', { initialVotes })
    );

    expect(result.current.votes).toEqual(initialVotes);
    expect(result.current.isLoading).toBe(false);
  });
});

// =============================================================================
// Tests: Data Fetching
// =============================================================================

describe('useVoteSubscription - Data Fetching', () => {
  it('fetches leader votes for voting_for_leader phase', async () => {
    const actions = [
      createTestAction({ player_id: 'player-1', action_type: 'vote_yes' }),
      createTestAction({
        id: 'action-2',
        player_id: 'player-2',
        action_type: 'vote_no',
      }),
    ];

    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder(actions)
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.votes).toEqual({
      'player-1': 'yes',
      'player-2': 'no',
    });
  });

  it('fetches mission votes for mission_voting phase', async () => {
    const actions = [
      createTestAction({
        player_id: 'player-1',
        action_type: 'vote_pass',
        phase: 'mission_voting',
      }),
      createTestAction({
        id: 'action-2',
        player_id: 'player-2',
        action_type: 'vote_fail',
        phase: 'mission_voting',
      }),
    ];

    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder(actions)
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'mission_voting')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.votes).toEqual({
      'player-1': 'pass',
      'player-2': 'fail',
    });
  });

  it('filters votes by round', async () => {
    const actions = [
      createTestAction({ player_id: 'player-1', action_type: 'vote_yes', round: 1 }),
      createTestAction({
        id: 'action-2',
        player_id: 'player-2',
        action_type: 'vote_no',
        round: 2, // Different round
      }),
    ];

    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder(actions)
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Only round 1 vote should be included
    expect(result.current.votes).toEqual({
      'player-1': 'yes',
    });
  });

  it('filters votes by phase', async () => {
    const actions = [
      createTestAction({
        player_id: 'player-1',
        action_type: 'vote_yes',
        phase: 'voting_for_leader',
      }),
      createTestAction({
        id: 'action-2',
        player_id: 'player-2',
        action_type: 'vote_pass',
        phase: 'mission_voting', // Different phase
      }),
    ];

    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder(actions)
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Only voting_for_leader vote should be included
    expect(result.current.votes).toEqual({
      'player-1': 'yes',
    });
  });

  it('ignores non-vote actions', async () => {
    const actions = [
      createTestAction({ player_id: 'player-1', action_type: 'vote_yes' }),
      createTestAction({
        id: 'action-2',
        player_id: 'player-2',
        action_type: 'assassinate', // Not a vote action
      }),
    ];

    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder(actions)
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.votes).toEqual({
      'player-1': 'yes',
    });
  });

  it('handles fetch errors', async () => {
    mockSupabaseClient.from.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnValue(
        Promise.resolve({ data: null, error: { message: 'Database error' } })
      ),
    }));

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load votes: Database error');
    });
  });
});

// =============================================================================
// Tests: Subscriptions
// =============================================================================

describe('useVoteSubscription - Subscriptions', () => {
  it('subscribes to game_actions table for voting_for_leader phase', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        'vote-sub-game-123-1-voting_for_leader'
      );
    });

    expect(mockChannels[0].on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        table: 'game_actions',
        filter: 'game_id=eq.game-123',
      }),
      expect.any(Function)
    );
  });

  it('subscribes to game_actions table for mission_voting phase', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    renderHook(() =>
      useVoteSubscription('game-123', 1, 'mission_voting')
    );

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        'vote-sub-game-123-1-mission_voting'
      );
    });
  });

  it('does not subscribe for non-voting phases', async () => {
    renderHook(() =>
      useVoteSubscription('game-123', 1, 'selecting_team')
    );

    // Should not create any channels
    expect(mockSupabaseClient.channel).not.toHaveBeenCalled();
  });

  it('cleans up subscription on unmount', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { unmount } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(mockChannels.length).toBe(1);
    });

    unmount();

    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('resubscribes when round changes', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { rerender } = renderHook(
      ({ round }) =>
        useVoteSubscription('game-123', round, 'voting_for_leader'),
      { initialProps: { round: 1 } }
    );

    await waitFor(() => {
      expect(mockChannels.length).toBe(1);
    });

    rerender({ round: 2 });

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        'vote-sub-game-123-2-voting_for_leader'
      );
    });
  });

  it('resubscribes when phase changes', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { rerender } = renderHook(
      ({ phase }: { phase: GamePhase }) =>
        useVoteSubscription('game-123', 1, phase),
      { initialProps: { phase: 'voting_for_leader' as GamePhase } }
    );

    await waitFor(() => {
      expect(mockChannels.length).toBe(1);
    });

    rerender({ phase: 'mission_voting' as GamePhase });

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith(
        'vote-sub-game-123-1-mission_voting'
      );
    });
  });
});

// =============================================================================
// Tests: Real-time Updates
// =============================================================================

describe('useVoteSubscription - Real-time Updates', () => {
  it('adds new leader vote on INSERT event', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Simulate INSERT event
    const channel = mockChannels[0];
    const newAction = createTestAction({
      id: 'new-action',
      player_id: 'player-3',
      action_type: 'vote_yes',
      round: 1,
      phase: 'voting_for_leader',
    });

    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: newAction,
      });
    });

    expect(result.current.votes).toEqual({
      'player-3': 'yes',
    });
  });

  it('adds new mission vote on INSERT event', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'mission_voting')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const channel = mockChannels[0];
    const newAction = createTestAction({
      id: 'new-action',
      player_id: 'player-3',
      action_type: 'vote_fail',
      round: 1,
      phase: 'mission_voting',
    });

    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: newAction,
      });
    });

    expect(result.current.votes).toEqual({
      'player-3': 'fail',
    });
  });

  it('ignores votes from different rounds', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const channel = mockChannels[0];
    const newAction = createTestAction({
      id: 'new-action',
      player_id: 'player-3',
      action_type: 'vote_yes',
      round: 2, // Different round
      phase: 'voting_for_leader',
    });

    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: newAction,
      });
    });

    expect(result.current.votes).toEqual({});
  });

  it('ignores votes from different phases', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const channel = mockChannels[0];
    const newAction = createTestAction({
      id: 'new-action',
      player_id: 'player-3',
      action_type: 'vote_pass',
      round: 1,
      phase: 'mission_voting', // Different phase
    });

    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: newAction,
      });
    });

    expect(result.current.votes).toEqual({});
  });

  it('ignores non-vote action types', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const channel = mockChannels[0];
    const newAction = createTestAction({
      id: 'new-action',
      player_id: 'player-3',
      action_type: 'assassinate', // Not a vote
      round: 1,
      phase: 'voting_for_leader',
    });

    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: newAction,
      });
    });

    expect(result.current.votes).toEqual({});
  });

  it('accumulates multiple votes from real-time events', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const channel = mockChannels[0];

    // First vote
    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: createTestAction({
          id: 'action-1',
          player_id: 'player-1',
          action_type: 'vote_yes',
          round: 1,
          phase: 'voting_for_leader',
        }),
      });
    });

    // Second vote
    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: createTestAction({
          id: 'action-2',
          player_id: 'player-2',
          action_type: 'vote_no',
          round: 1,
          phase: 'voting_for_leader',
        }),
      });
    });

    expect(result.current.votes).toEqual({
      'player-1': 'yes',
      'player-2': 'no',
    });
  });
});

// =============================================================================
// Tests: Refresh
// =============================================================================

describe('useVoteSubscription - Refresh', () => {
  it('refresh reloads votes from server', async () => {
    const initialActions = [
      createTestAction({ player_id: 'player-1', action_type: 'vote_yes' }),
    ];

    const updatedActions = [
      createTestAction({ player_id: 'player-1', action_type: 'vote_yes' }),
      createTestAction({
        id: 'action-2',
        player_id: 'player-2',
        action_type: 'vote_no',
      }),
    ];

    let fetchCount = 0;
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder(fetchCount++ === 0 ? initialActions : updatedActions)
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.votes).toEqual({
      'player-1': 'yes',
    });

    // Call refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.votes).toEqual({
      'player-1': 'yes',
      'player-2': 'no',
    });
  });

  it('refresh sets loading state', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Start refresh (don't await)
    let refreshPromise: Promise<void>;
    act(() => {
      refreshPromise = result.current.refresh();
    });

    // Should be loading
    expect(result.current.isLoading).toBe(true);

    // Wait for completion
    await act(async () => {
      await refreshPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// =============================================================================
// Tests: Vote Type Filtering by Phase
// =============================================================================

describe('useVoteSubscription - Vote Type Filtering', () => {
  it('only processes leader vote types in voting_for_leader phase', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const channel = mockChannels[0];

    // Mission vote should be ignored in leader phase
    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: createTestAction({
          id: 'action-1',
          player_id: 'player-1',
          action_type: 'vote_pass', // Mission vote type
          round: 1,
          phase: 'voting_for_leader',
        }),
      });
    });

    expect(result.current.votes).toEqual({});

    // Leader vote should be processed
    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: createTestAction({
          id: 'action-2',
          player_id: 'player-1',
          action_type: 'vote_yes', // Leader vote type
          round: 1,
          phase: 'voting_for_leader',
        }),
      });
    });

    expect(result.current.votes).toEqual({
      'player-1': 'yes',
    });
  });

  it('only processes mission vote types in mission_voting phase', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'mission_voting')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const channel = mockChannels[0];

    // Leader vote should be ignored in mission phase
    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: createTestAction({
          id: 'action-1',
          player_id: 'player-1',
          action_type: 'vote_yes', // Leader vote type
          round: 1,
          phase: 'mission_voting',
        }),
      });
    });

    expect(result.current.votes).toEqual({});

    // Mission vote should be processed
    await act(async () => {
      channel._trigger('game_actions', 'INSERT', {
        eventType: 'INSERT',
        new: createTestAction({
          id: 'action-2',
          player_id: 'player-1',
          action_type: 'vote_pass', // Mission vote type
          round: 1,
          phase: 'mission_voting',
        }),
      });
    });

    expect(result.current.votes).toEqual({
      'player-1': 'pass',
    });
  });
});

// =============================================================================
// Tests: Edge Cases
// =============================================================================

describe('useVoteSubscription - Edge Cases', () => {
  it('handles empty actions array', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([])
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.votes).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('handles player voting multiple times (last vote wins in map)', async () => {
    const actions = [
      createTestAction({
        id: 'action-1',
        player_id: 'player-1',
        action_type: 'vote_yes',
        round: 1,
        phase: 'voting_for_leader',
      }),
      createTestAction({
        id: 'action-2',
        player_id: 'player-1',
        action_type: 'vote_no', // Same player, different vote
        round: 1,
        phase: 'voting_for_leader',
      }),
    ];

    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder(actions)
    );

    const { result } = renderHook(() =>
      useVoteSubscription('game-123', 1, 'voting_for_leader')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Last vote should be in the map
    expect(result.current.votes).toEqual({
      'player-1': 'no',
    });
  });

  it('resets votes when phase changes to non-voting phase', async () => {
    mockSupabaseClient.from.mockImplementation(() =>
      createMockQueryBuilder([
        createTestAction({ player_id: 'player-1', action_type: 'vote_yes' }),
      ])
    );

    const { result, rerender } = renderHook(
      ({ phase }: { phase: GamePhase | null }) =>
        useVoteSubscription('game-123', 1, phase),
      { initialProps: { phase: 'voting_for_leader' as GamePhase | null } }
    );

    await waitFor(() => {
      expect(result.current.votes).toEqual({ 'player-1': 'yes' });
    });

    // Change to non-voting phase
    rerender({ phase: 'selecting_team' as GamePhase | null });

    expect(result.current.votes).toEqual({});
  });
});
