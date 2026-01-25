/**
 * Unit tests for GameFlowContext
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { Game, Player, GameAction, GameModifier, PlayerStatus } from '~/types/game';
import React from 'react';

// =============================================================================
// Mock Setup - Must be before imports that use the mocked modules
// =============================================================================

// Mock channel instance factory
const createMockChannel = () => {
  const handlers: Map<string, (payload: unknown) => void> = new Map();
  const channel = {
    on: vi.fn().mockImplementation((_event: string, config: { table: string; event: string }, handler: (payload: unknown) => void) => {
      const key = `${config.table}-${config.event}`;
      handlers.set(key, handler);
      return channel;
    }),
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

// Now import the component being tested
import { GameFlowProvider, useGameFlow, GameFlowContext } from './GameFlowContext';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

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
    character: 'Seer',
    team: 'good',
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

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

function createTestModifier(overrides: Partial<GameModifier> = {}): GameModifier {
  return {
    id: 'modifier-1',
    game_id: 'game-123',
    modifier_type: 'force_pass',
    round: 1,
    created_by: 'player-1',
    metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createTestStatus(overrides: Partial<PlayerStatus> = {}): PlayerStatus {
  return {
    id: 'status-1',
    game_id: 'game-123',
    player_id: 'player-1',
    status_type: 'protected',
    expires_at_round: 1,
    created_by: 'player-2',
    metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Test component that uses the context
function TestConsumer() {
  const { game, players, ctx, isLoading, error, currentPlayer } = useGameFlow();

  return (
    <div>
      <span data-testid="loading">{isLoading ? 'loading' : 'loaded'}</span>
      <span data-testid="error">{error || 'no-error'}</span>
      <span data-testid="game-id">{game?.id || 'no-game'}</span>
      <span data-testid="player-count">{players.length}</span>
      <span data-testid="current-player">{currentPlayer?.display_name || 'no-current'}</span>
      <span data-testid="ctx">{ctx ? 'has-ctx' : 'no-ctx'}</span>
    </div>
  );
}

// Action test component
function ActionTestConsumer({ onResult }: { onResult: (result: unknown) => void }) {
  const { submitLeaderVote, selectTeam, submitMissionVote, executeAction } = useGameFlow();

  return (
    <div>
      <button data-testid="vote-yes" onClick={async () => onResult(await submitLeaderVote(true))}>
        Vote Yes
      </button>
      <button data-testid="vote-no" onClick={async () => onResult(await submitLeaderVote(false))}>
        Vote No
      </button>
      <button
        data-testid="select-team"
        onClick={async () => onResult(await selectTeam(['player-1', 'player-2']))}
      >
        Select Team
      </button>
      <button
        data-testid="mission-pass"
        onClick={async () => onResult(await submitMissionVote('pass'))}
      >
        Pass
      </button>
      <button
        data-testid="mission-fail"
        onClick={async () => onResult(await submitMissionVote('fail'))}
      >
        Fail
      </button>
      <button
        data-testid="action"
        onClick={async () => onResult(await executeAction('assassinate', ['player-2']))}
      >
        Execute
      </button>
    </div>
  );
}

// =============================================================================
// Setup/Teardown
// =============================================================================

beforeEach(() => {
  vi.clearAllMocks();
  mockChannels = [];

  // Default mock responses for Supabase queries
  mockSupabaseClient.from.mockImplementation((table: string) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: table === 'games' ? createTestGame() : null,
      error: null,
    }),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Tests: Initialization
// =============================================================================

describe('GameFlowContext - Initialization', () => {
  it('shows loading state when no initial data provided', async () => {
    render(
      <GameFlowProvider gameId="game-123" userId="user-1">
        <TestConsumer />
      </GameFlowProvider>
    );

    // Initially loading
    expect(screen.getByTestId('loading').textContent).toBe('loading');
  });

  it('uses initial data when provided', async () => {
    const initialGame = createTestGame({ id: 'initial-game' });
    const initialPlayers = [createTestPlayer({ user_id: 'user-1', display_name: 'Test User' })];

    render(
      <GameFlowProvider
        gameId="game-123"
        userId="user-1"
        initialGame={initialGame}
        initialPlayers={initialPlayers}
      >
        <TestConsumer />
      </GameFlowProvider>
    );

    // Should not be loading since initial data was provided
    expect(screen.getByTestId('loading').textContent).toBe('loaded');
    expect(screen.getByTestId('game-id').textContent).toBe('initial-game');
    expect(screen.getByTestId('current-player').textContent).toBe('Test User');
  });

  it('builds ctx from game state', async () => {
    const initialGame = createTestGame();
    const initialPlayers = [createTestPlayer()];

    render(
      <GameFlowProvider
        gameId="game-123"
        userId="user-1"
        initialGame={initialGame}
        initialPlayers={initialPlayers}
      >
        <TestConsumer />
      </GameFlowProvider>
    );

    expect(screen.getByTestId('ctx').textContent).toBe('has-ctx');
  });

  it('ctx is null when game is null', async () => {
    render(
      <GameFlowProvider gameId="game-123" userId="user-1">
        <TestConsumer />
      </GameFlowProvider>
    );

    // While loading, game is null
    expect(screen.getByTestId('ctx').textContent).toBe('no-ctx');
  });
});

// =============================================================================
// Tests: Subscriptions
// =============================================================================

describe('GameFlowContext - Subscriptions', () => {
  it('initializes subscriptions on mount', async () => {
    const initialGame = createTestGame();

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    // Should create 4 channels (games, players, actions, statuses)
    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(4);
    });

    // Verify channel names
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-flow-game-123');
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-flow-players-game-123');
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-flow-actions-game-123');
    expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-flow-statuses-game-123');
  });

  it('subscribes to each channel', async () => {
    const initialGame = createTestGame();

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      // Each channel should have subscribe called
      mockChannels.forEach((channel) => {
        expect(channel.subscribe).toHaveBeenCalled();
      });
    });
  });

  it('cleans up subscriptions on unmount', async () => {
    const initialGame = createTestGame();

    const { unmount } = render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      expect(mockChannels.length).toBe(4);
    });

    unmount();

    // Should call removeChannel for each channel
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(4);
  });

  it('sets up game table listener', async () => {
    const initialGame = createTestGame();

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      expect(mockChannels[0].on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'games',
          filter: 'id=eq.game-123',
        }),
        expect.any(Function)
      );
    });
  });

  it('sets up players table listener', async () => {
    const initialGame = createTestGame();

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      expect(mockChannels[1].on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'players',
          filter: 'game_id=eq.game-123',
        }),
        expect.any(Function)
      );
    });
  });

  it('sets up actions table listener', async () => {
    const initialGame = createTestGame();

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      expect(mockChannels[2].on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'game_actions',
          filter: 'game_id=eq.game-123',
        }),
        expect.any(Function)
      );
    });
  });

  it('sets up statuses table listener', async () => {
    const initialGame = createTestGame();

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      expect(mockChannels[3].on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({
          table: 'player_statuses',
          filter: 'game_id=eq.game-123',
        }),
        expect.any(Function)
      );
    });
  });
});

// =============================================================================
// Tests: Real-time State Updates
// =============================================================================

describe('GameFlowContext - Real-time Updates', () => {
  it('updates game state on game UPDATE event', async () => {
    const initialGame = createTestGame({ phase: 'voting_for_leader' });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      expect(mockChannels.length).toBe(4);
    });

    // Simulate game UPDATE event
    const gameChannel = mockChannels[0];
    const updatedGame = createTestGame({ phase: 'selecting_team', id: 'updated-game-id' });

    await act(async () => {
      gameChannel._trigger('games', '*', {
        eventType: 'UPDATE',
        new: updatedGame,
      });
    });

    expect(screen.getByTestId('game-id').textContent).toBe('updated-game-id');
  });

  it('updates game state on game INSERT event', async () => {
    const initialGame = createTestGame();

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <TestConsumer />
      </GameFlowProvider>
    );

    await waitFor(() => {
      expect(mockChannels.length).toBe(4);
    });

    const gameChannel = mockChannels[0];
    const newGame = createTestGame({ id: 'new-game-id' });

    await act(async () => {
      gameChannel._trigger('games', '*', {
        eventType: 'INSERT',
        new: newGame,
      });
    });

    expect(screen.getByTestId('game-id').textContent).toBe('new-game-id');
  });
});

// =============================================================================
// Tests: API Methods
// =============================================================================

describe('GameFlowContext - API Methods', () => {
  it('submitLeaderVote calls correct endpoint with yes vote', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, allVotesIn: false }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('vote-yes').click();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/games/game-123/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType: 'leader', vote: 'yes' }),
      });
    });

    expect(result).toEqual({ success: true, allVotesIn: false });
  });

  it('submitLeaderVote calls correct endpoint with no vote', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, allVotesIn: false }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('vote-no').click();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/games/game-123/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType: 'leader', vote: 'no' }),
      });
    });
  });

  it('selectTeam calls correct endpoint', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('select-team').click();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/games/game-123/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamIds: ['player-1', 'player-2'] }),
      });
    });

    expect(result).toEqual({ success: true });
  });

  it('submitMissionVote calls correct endpoint with pass vote', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, allVotesIn: false }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('mission-pass').click();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/games/game-123/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType: 'mission', vote: 'pass' }),
      });
    });
  });

  it('submitMissionVote calls correct endpoint with fail vote', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, allVotesIn: false }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('mission-fail').click();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/games/game-123/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType: 'mission', vote: 'fail' }),
      });
    });
  });

  it('executeAction calls correct endpoint', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: 'Action executed' }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('action').click();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/games/game-123/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionId: 'assassinate', targetIds: ['player-2'] }),
      });
    });

    expect(result).toEqual({ success: true, message: 'Action executed' });
  });
});

// =============================================================================
// Tests: Error Handling
// =============================================================================

describe('GameFlowContext - Error Handling', () => {
  it('submitLeaderVote returns error on failed response', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Vote failed' }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('vote-yes').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        allVotesIn: false,
        error: 'Vote failed',
      });
    });
  });

  it('submitLeaderVote handles network errors', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('vote-yes').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        allVotesIn: false,
        error: 'Network error',
      });
    });
  });

  it('selectTeam returns error on failed response', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid team' }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('select-team').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        error: 'Invalid team',
      });
    });
  });

  it('selectTeam handles network errors', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockRejectedValueOnce(new Error('Connection lost'));

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('select-team').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        error: 'Connection lost',
      });
    });
  });

  it('submitMissionVote returns error on failed response', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Not on team' }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('mission-pass').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        allVotesIn: false,
        error: 'Not on team',
      });
    });
  });

  it('submitMissionVote handles network errors', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockRejectedValueOnce(new Error('Timeout'));

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('mission-pass').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        allVotesIn: false,
        error: 'Timeout',
      });
    });
  });

  it('executeAction returns error on failed response', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Invalid target' }),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('action').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        message: 'Invalid target',
        error: 'Invalid target',
      });
    });
  });

  it('executeAction handles network errors', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockRejectedValueOnce(new Error('Server unreachable'));

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('action').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        message: 'Server unreachable',
        error: 'Server unreachable',
      });
    });
  });

  it('handles default error message when none provided', async () => {
    const initialGame = createTestGame();
    let result: unknown;

    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    render(
      <GameFlowProvider gameId="game-123" userId="user-1" initialGame={initialGame}>
        <ActionTestConsumer onResult={(r) => (result = r)} />
      </GameFlowProvider>
    );

    await act(async () => {
      screen.getByTestId('vote-yes').click();
    });

    await waitFor(() => {
      expect(result).toEqual({
        success: false,
        allVotesIn: false,
        error: 'Failed to submit vote',
      });
    });
  });
});

// =============================================================================
// Tests: useGameFlow Hook
// =============================================================================

describe('useGameFlow', () => {
  it('throws error when used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useGameFlow must be used within a GameFlowProvider');

    consoleSpy.mockRestore();
  });
});

// =============================================================================
// Tests: Current Player Resolution
// =============================================================================

describe('GameFlowContext - Current Player', () => {
  it('resolves current player from players list', async () => {
    const initialGame = createTestGame();
    const initialPlayers = [
      createTestPlayer({ user_id: 'user-1', display_name: 'Current User' }),
      createTestPlayer({ user_id: 'user-2', display_name: 'Other User', id: 'player-2' }),
    ];

    render(
      <GameFlowProvider
        gameId="game-123"
        userId="user-1"
        initialGame={initialGame}
        initialPlayers={initialPlayers}
      >
        <TestConsumer />
      </GameFlowProvider>
    );

    expect(screen.getByTestId('current-player').textContent).toBe('Current User');
  });

  it('currentPlayer is null when user not in game', async () => {
    const initialGame = createTestGame();
    const initialPlayers = [createTestPlayer({ user_id: 'other-user' })];

    render(
      <GameFlowProvider
        gameId="game-123"
        userId="user-1"
        initialGame={initialGame}
        initialPlayers={initialPlayers}
      >
        <TestConsumer />
      </GameFlowProvider>
    );

    expect(screen.getByTestId('current-player').textContent).toBe('no-current');
  });
});
