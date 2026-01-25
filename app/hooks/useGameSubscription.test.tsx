/**
 * Unit tests for useGameSubscription hook
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { Game, Player, GameAction } from '~/types/game';

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
import { useGameSubscription } from './useGameSubscription';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-123',
    game_key: 'ABC123',
    host_id: 'host-user-id',
    status: 'lobby',
    phase: null,
    current_round: 0,
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
    display_name: 'Player One',
    character: null,
    team: null,
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

// Mock query builder for Supabase
function createMockQueryBuilder<T>(data: T, error: { message: string } | null = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(Promise.resolve({ data, error })),
  };
}

// Mock query builder for array results (players, actions)
function createMockArrayQueryBuilder<T>(data: T[], error: { message: string } | null = null) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnValue(Promise.resolve({ data, error })),
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

describe('useGameSubscription - Initialization', () => {
  it('returns initial state with loading true when no initial data provided', async () => {
    const game = createTestGame();
    const players = [createTestPlayer()];
    const actions: GameAction[] = [];

    let callCount = 0;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder(players);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder(actions);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    // Initially should be loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.game).toBeNull();
    expect(result.current.players).toEqual([]);
    expect(result.current.actions).toEqual([]);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.game).toEqual(game);
    expect(result.current.players).toEqual(players);
    expect(result.current.actions).toEqual(actions);
    expect(result.current.error).toBeNull();
  });

  it('uses initial game data when provided', async () => {
    const initialGame = createTestGame({ status: 'playing' });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(initialGame);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() =>
      useGameSubscription('game-123', { initialGame })
    );

    // Should not be loading since initial data was provided
    expect(result.current.isLoading).toBe(false);
    expect(result.current.game).toEqual(initialGame);
  });

  it('uses initial players data when provided', async () => {
    const initialGame = createTestGame();
    const initialPlayers = [
      createTestPlayer({ id: 'p1', display_name: 'Alice', seat_order: 0 }),
      createTestPlayer({ id: 'p2', display_name: 'Bob', seat_order: 1 }),
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(initialGame);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() =>
      useGameSubscription('game-123', { initialGame, initialPlayers })
    );

    expect(result.current.players).toEqual(initialPlayers);
  });

  it('uses initial actions data when provided', async () => {
    const initialGame = createTestGame();
    const initialActions = [createTestAction({ id: 'act-1' })];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(initialGame);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() =>
      useGameSubscription('game-123', { initialGame, initialActions })
    );

    expect(result.current.actions).toEqual(initialActions);
  });
});

// =============================================================================
// Tests: Data Fetching
// =============================================================================

describe('useGameSubscription - Data Fetching', () => {
  it('fetches game data on mount', async () => {
    const game = createTestGame();
    const players = [createTestPlayer()];
    const actions = [createTestAction()];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder(players);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder(actions);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.game).toEqual(game);
    expect(result.current.players).toEqual(players);
    expect(result.current.actions).toEqual(actions);
  });

  it('handles game fetch error', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(null, { message: 'Game not found' });
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load game: Game not found');
    });
  });

  it('handles players fetch error', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(
            Promise.resolve({ data: null, error: { message: 'Players error' } })
          ),
        };
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load players: Players error');
    });
  });

  it('handles actions fetch error', async () => {
    const game = createTestGame();
    const players = [createTestPlayer()];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder(players);
      } else if (table === 'game_actions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(
            Promise.resolve({ data: null, error: { message: 'Actions error' } })
          ),
        };
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load actions: Actions error');
    });
  });
});

// =============================================================================
// Tests: Subscriptions
// =============================================================================

describe('useGameSubscription - Subscriptions', () => {
  it('subscribes to games table', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-sub-game-123');
    });

    expect(mockChannels[0].on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        table: 'games',
        filter: 'id=eq.game-123',
      }),
      expect.any(Function)
    );
  });

  it('subscribes to players table', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-sub-players-game-123');
    });

    expect(mockChannels[1].on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        table: 'players',
        filter: 'game_id=eq.game-123',
      }),
      expect.any(Function)
    );
  });

  it('subscribes to game_actions table', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-sub-actions-game-123');
    });

    expect(mockChannels[2].on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        table: 'game_actions',
        filter: 'game_id=eq.game-123',
      }),
      expect.any(Function)
    );
  });

  it('cleans up all subscriptions on unmount', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { unmount } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(mockChannels.length).toBe(3);
    });

    unmount();

    // Should remove all 3 channels
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(3);
  });

  it('resubscribes when gameId changes', async () => {
    const game1 = createTestGame({ id: 'game-1' });
    const game2 = createTestGame({ id: 'game-2' });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game1);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { rerender } = renderHook(
      ({ gameId }) => useGameSubscription(gameId),
      { initialProps: { gameId: 'game-1' } }
    );

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-sub-game-1');
    });

    // Change gameId
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game2);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    rerender({ gameId: 'game-2' });

    await waitFor(() => {
      expect(mockSupabaseClient.channel).toHaveBeenCalledWith('game-sub-game-2');
    });

    // Old subscriptions should be removed
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalled();
  });
});

// =============================================================================
// Tests: Real-time Updates - Game
// =============================================================================

describe('useGameSubscription - Game Updates', () => {
  it('updates game state on UPDATE event', async () => {
    const game = createTestGame({ status: 'lobby' });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.game?.status).toBe('lobby');
    });

    const updatedGame = createTestGame({ status: 'playing', phase: 'voting_for_leader' });
    const gameChannel = mockChannels[0];

    await act(async () => {
      gameChannel._trigger('games', '*', {
        eventType: 'UPDATE',
        new: updatedGame,
      });
    });

    expect(result.current.game?.status).toBe('playing');
    expect(result.current.game?.phase).toBe('voting_for_leader');
  });

  it('updates game state on INSERT event', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const newGame = createTestGame({ id: 'game-new', game_key: 'NEW123' });
    const gameChannel = mockChannels[0];

    await act(async () => {
      gameChannel._trigger('games', '*', {
        eventType: 'INSERT',
        new: newGame,
      });
    });

    expect(result.current.game?.game_key).toBe('NEW123');
  });

  it('sets game to null on DELETE event', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.game).not.toBeNull();
    });

    const gameChannel = mockChannels[0];

    await act(async () => {
      gameChannel._trigger('games', '*', {
        eventType: 'DELETE',
        old: game,
      });
    });

    expect(result.current.game).toBeNull();
  });
});

// =============================================================================
// Tests: Real-time Updates - Players
// =============================================================================

describe('useGameSubscription - Player Updates', () => {
  it('refetches players on INSERT event', async () => {
    const game = createTestGame();
    const player1 = createTestPlayer({ id: 'p1', display_name: 'Alice' });

    let fetchCount = 0;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        // Return additional player on subsequent fetches
        if (fetchCount++ === 0) {
          return createMockArrayQueryBuilder([player1]);
        }
        const player2 = createTestPlayer({ id: 'p2', display_name: 'Bob', seat_order: 1 });
        return createMockArrayQueryBuilder([player1, player2]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.players.length).toBe(1);
    });

    const playersChannel = mockChannels[1];
    const newPlayer = createTestPlayer({ id: 'p2', display_name: 'Bob' });

    await act(async () => {
      playersChannel._trigger('players', '*', {
        eventType: 'INSERT',
        new: newPlayer,
      });
    });

    await waitFor(() => {
      expect(result.current.players.length).toBe(2);
    });
  });

  it('updates specific player on UPDATE event', async () => {
    const game = createTestGame();
    const player = createTestPlayer({ id: 'p1', display_name: 'Alice', character: null });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([player]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.players[0]?.character).toBeNull();
    });

    const playersChannel = mockChannels[1];
    const updatedPlayer = createTestPlayer({ id: 'p1', display_name: 'Alice', character: 'Seer' });

    await act(async () => {
      playersChannel._trigger('players', '*', {
        eventType: 'UPDATE',
        new: updatedPlayer,
      });
    });

    expect(result.current.players[0]?.character).toBe('Seer');
  });

  it('removes player on DELETE event', async () => {
    const game = createTestGame();
    const player1 = createTestPlayer({ id: 'p1', display_name: 'Alice' });
    const player2 = createTestPlayer({ id: 'p2', display_name: 'Bob', seat_order: 1 });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([player1, player2]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.players.length).toBe(2);
    });

    const playersChannel = mockChannels[1];

    await act(async () => {
      playersChannel._trigger('players', '*', {
        eventType: 'DELETE',
        old: player1,
      });
    });

    expect(result.current.players.length).toBe(1);
    expect(result.current.players[0]?.id).toBe('p2');
  });
});

// =============================================================================
// Tests: Real-time Updates - Actions
// =============================================================================

describe('useGameSubscription - Action Updates', () => {
  it('adds action on INSERT event', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.actions.length).toBe(0);

    const actionsChannel = mockChannels[2];
    const newAction = createTestAction({ id: 'act-1', action_type: 'vote_yes' });

    await act(async () => {
      actionsChannel._trigger('game_actions', '*', {
        eventType: 'INSERT',
        new: newAction,
      });
    });

    expect(result.current.actions.length).toBe(1);
    expect(result.current.actions[0]?.action_type).toBe('vote_yes');
  });

  it('updates action on UPDATE event', async () => {
    const game = createTestGame();
    const action = createTestAction({ id: 'act-1', action_type: 'vote_yes' });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([action]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.actions[0]?.action_type).toBe('vote_yes');
    });

    const actionsChannel = mockChannels[2];
    const updatedAction = createTestAction({ id: 'act-1', action_type: 'vote_no' });

    await act(async () => {
      actionsChannel._trigger('game_actions', '*', {
        eventType: 'UPDATE',
        new: updatedAction,
      });
    });

    expect(result.current.actions[0]?.action_type).toBe('vote_no');
  });

  it('removes action on DELETE event', async () => {
    const game = createTestGame();
    const action1 = createTestAction({ id: 'act-1', action_type: 'vote_yes' });
    const action2 = createTestAction({ id: 'act-2', action_type: 'vote_no' });

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([action1, action2]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.actions.length).toBe(2);
    });

    const actionsChannel = mockChannels[2];

    await act(async () => {
      actionsChannel._trigger('game_actions', '*', {
        eventType: 'DELETE',
        old: action1,
      });
    });

    expect(result.current.actions.length).toBe(1);
    expect(result.current.actions[0]?.id).toBe('act-2');
  });

  it('accumulates multiple actions from real-time events', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const actionsChannel = mockChannels[2];

    // Add first action
    await act(async () => {
      actionsChannel._trigger('game_actions', '*', {
        eventType: 'INSERT',
        new: createTestAction({ id: 'act-1', player_id: 'p1' }),
      });
    });

    // Add second action
    await act(async () => {
      actionsChannel._trigger('game_actions', '*', {
        eventType: 'INSERT',
        new: createTestAction({ id: 'act-2', player_id: 'p2' }),
      });
    });

    expect(result.current.actions.length).toBe(2);
  });
});

// =============================================================================
// Tests: Refresh
// =============================================================================

describe('useGameSubscription - Refresh', () => {
  it('refresh reloads all data from server', async () => {
    const game = createTestGame({ status: 'lobby' });
    const updatedGame = createTestGame({ status: 'playing' });

    let fetchCount = 0;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(fetchCount === 0 ? game : updatedGame);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        fetchCount++;
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.game?.status).toBe('lobby');
    });

    // Call refresh
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.game?.status).toBe('playing');
  });

  it('refresh sets loading state', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

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
// Tests: Edge Cases
// =============================================================================

describe('useGameSubscription - Edge Cases', () => {
  it('handles null data responses gracefully', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
        };
      } else if (table === 'game_actions') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue(Promise.resolve({ data: null, error: null })),
        };
      }
      return createMockQueryBuilder(null);
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have empty arrays for null data
    expect(result.current.players).toEqual([]);
    expect(result.current.actions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('handles unexpected errors during fetch', async () => {
    mockSupabaseClient.from.mockImplementation(() => {
      throw new Error('Network error');
    });

    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.error).toContain('Unexpected error');
    });
  });

  it('maintains subscription across multiple rapid renders', async () => {
    const game = createTestGame();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { rerender } = renderHook(
      ({ gameId }) => useGameSubscription(gameId),
      { initialProps: { gameId: 'game-123' } }
    );

    // Rerender multiple times with same gameId
    rerender({ gameId: 'game-123' });
    rerender({ gameId: 'game-123' });
    rerender({ gameId: 'game-123' });

    await waitFor(() => {
      // Should only create channels once for the same gameId
      expect(mockChannels.length).toBe(3); // 3 channels for 1 subscription (games, players, actions)
    });
  });
});
