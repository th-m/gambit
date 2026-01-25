/**
 * End-to-end test for player disconnect/reconnect.
 * Tests the reconnection flow ensuring:
 * 1. Player can refresh browser during game
 * 2. Game state restored correctly
 * 3. Real-time subscriptions re-established
 * 4. No duplicate actions from reconnect
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { GameService } from '~/services/GameService';
import { VoteProcessor } from '~/services/VoteProcessor';
import { ActionProcessor } from '~/services/ActionProcessor';
import { actionRegistry } from '~/registry/ActionRegistry';
import type { CharacterName, Player, Team, Game, GameAction } from '~/types/game';

// Import action registrations
import {
  registerAssassinateAction,
  registerAssassinateHandler,
} from '~/actions/assassinate';
import {
  registerRigVoteAction,
  registerRigVoteHandler,
} from '~/actions/rigVote';
import {
  registerPlantBeeperAction,
  registerPlantBeeperHandler,
} from '~/actions/plantBeeper';
import {
  registerProtectAction,
  registerProtectHandler,
} from '~/actions/protect';
import {
  registerSabotageAction,
  registerSabotageHandler,
} from '~/actions/sabotage';

// =============================================================================
// Mock Setup - Must be before imports that use the mocked modules
// =============================================================================

// Mock channel instance factory
const createMockChannel = () => {
  const handlers: Map<string, (payload: unknown) => void> = new Map();
  let subscribeCallback: ((status: string) => void) | null = null;
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
    subscribe: vi.fn().mockImplementation((callback?: (status: string) => void) => {
      subscribeCallback = callback ?? null;
      // Simulate successful subscription
      if (subscribeCallback) {
        setTimeout(() => subscribeCallback?.('SUBSCRIBED'), 0);
      }
      return channel;
    }),
    unsubscribe: vi.fn(),
    _trigger: (table: string, event: string, payload: unknown) => {
      const key = `${table}-${event}`;
      const handler = handlers.get(key);
      if (handler) handler(payload);
    },
    _triggerStatus: (status: string) => {
      if (subscribeCallback) subscribeCallback(status);
    },
    _handlers: handlers,
    _subscribeCallback: () => subscribeCallback,
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
import { useGameSubscription } from '~/hooks/useGameSubscription';

// =============================================================================
// Test Environment
// =============================================================================

interface TestEnv {
  gameService: GameService;
  voteProcessor: VoteProcessor;
  actionProcessor: ActionProcessor;
}

/**
 * Create a fresh test environment with all services and action registrations.
 */
function createTestEnv(): TestEnv {
  const gameService = new GameService();
  const voteProcessor = new VoteProcessor(gameService);
  const actionProcessor = new ActionProcessor(gameService, voteProcessor);

  // Clear and register all actions
  actionRegistry.clear();
  registerAssassinateAction();
  registerRigVoteAction();
  registerPlantBeeperAction();
  registerProtectAction();
  registerSabotageAction();

  // Register all handlers
  registerAssassinateHandler(actionProcessor);
  registerRigVoteHandler(actionProcessor);
  registerPlantBeeperHandler(actionProcessor);
  registerProtectHandler(actionProcessor);
  registerSabotageHandler(actionProcessor);

  return { gameService, voteProcessor, actionProcessor };
}

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

/**
 * Create a game in lobby state with players.
 */
function createGameInLobby(
  env: TestEnv,
  hostUserId: string,
  players: Array<{ name: string; userId: string }>
): { game: Game; players: Player[] } {
  const game = env.gameService.createGame(hostUserId);
  const createdPlayers: Player[] = [];

  for (const p of players) {
    const player = env.gameService.addPlayer(game.id, p.userId, p.name);
    if (player) createdPlayers.push(player);
  }

  return { game: env.gameService.getGameById(game.id)!, players: createdPlayers };
}

/**
 * Start game and assign specific characters to players.
 */
function startGameWithCharacters(
  env: TestEnv,
  gameId: string,
  playerCharacters: Map<string, { character: CharacterName; team: Team }>
): Game {
  const players = env.gameService.getPlayers(gameId);
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const config = playerCharacters.get(player.user_id);
    if (config) {
      env.gameService.updatePlayer(player.id, {
        character: config.character,
        team: config.team,
        seat_order: i,
      });
    }
  }

  env.gameService.updateGame(gameId, {
    status: 'playing',
    phase: 'voting_for_leader',
    current_round: 1,
    crown_index: 0,
    rejection_count: 0,
    good_victories: 0,
    evil_victories: 0,
    selected_team: null,
  });

  return env.gameService.getGameById(gameId)!;
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
  actionRegistry.clear();
});

// =============================================================================
// E2E Tests: Player Reconnect
// =============================================================================

describe('E2E: Player Disconnect/Reconnect', () => {
  it('player can refresh browser during game and state is restored', async () => {
    // Setup initial game state
    const game = createTestGame({
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 2,
      good_victories: 1,
      evil_victories: 0,
    });
    const players = [
      createTestPlayer({ id: 'p1', display_name: 'Alice', character: 'Seer', team: 'good' }),
      createTestPlayer({ id: 'p2', display_name: 'Bob', character: 'Guardian', team: 'good', seat_order: 1 }),
      createTestPlayer({ id: 'p3', display_name: 'Carol', character: 'Assassin', team: 'evil', seat_order: 2 }),
    ];
    const actions = [
      createTestAction({ id: 'act-1', player_id: 'p1', action_type: 'vote_yes', round: 1 }),
      createTestAction({ id: 'act-2', player_id: 'p2', action_type: 'vote_yes', round: 1 }),
    ];

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

    // First render (initial page load)
    const { result, unmount } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify initial state loaded correctly
    expect(result.current.game?.status).toBe('playing');
    expect(result.current.game?.phase).toBe('voting_for_leader');
    expect(result.current.game?.current_round).toBe(2);
    expect(result.current.game?.good_victories).toBe(1);
    expect(result.current.players.length).toBe(3);
    expect(result.current.actions.length).toBe(2);

    // Simulate browser refresh (unmount component)
    unmount();

    // Verify cleanup happened
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(3); // 3 channels removed

    // Re-render (simulating page reload)
    mockChannels = [];
    const { result: result2 } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result2.current.isLoading).toBe(false);
    });

    // Verify state is fully restored after refresh
    expect(result2.current.game?.status).toBe('playing');
    expect(result2.current.game?.phase).toBe('voting_for_leader');
    expect(result2.current.game?.current_round).toBe(2);
    expect(result2.current.game?.good_victories).toBe(1);
    expect(result2.current.players.length).toBe(3);
    expect(result2.current.actions.length).toBe(2);
  });

  it('real-time subscriptions are re-established after reconnect', async () => {
    const game = createTestGame({ status: 'playing', phase: 'voting_for_leader' });
    const players = [createTestPlayer()];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder(players);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    // First render
    const { result, unmount } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    // Verify subscriptions were created
    expect(mockChannels.length).toBe(3); // games, players, actions
    const initialChannels = [...mockChannels];

    // Simulate disconnect (unmount)
    unmount();

    // Cleanup should remove channels
    expect(mockSupabaseClient.removeChannel).toHaveBeenCalledTimes(3);

    // Re-render (simulating reconnect)
    mockChannels = [];
    const { result: result2 } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result2.current.connectionStatus).toBe('connected');
    });

    // Verify new subscriptions were created
    expect(mockChannels.length).toBe(3);

    // New subscriptions should work - verify by triggering an event
    const updatedGame = { ...game, phase: 'selecting_team' };
    await act(async () => {
      mockChannels[0]._trigger('games', 'UPDATE', { new: updatedGame });
    });

    expect(result2.current.game?.phase).toBe('selecting_team');
  });

  it('no duplicate actions after reconnect', async () => {
    const game = createTestGame({ status: 'playing', phase: 'voting_for_leader' });
    const existingActions = [
      createTestAction({ id: 'act-1', player_id: 'p1', action_type: 'vote_yes' }),
      createTestAction({ id: 'act-2', player_id: 'p2', action_type: 'vote_no' }),
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(game);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([createTestPlayer()]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder(existingActions);
      }
      return createMockQueryBuilder(null);
    });

    // First render
    const { result, unmount } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.actions.length).toBe(2);

    // Simulate disconnect
    unmount();

    // Re-render (simulating reconnect)
    mockChannels = [];
    const { result: result2 } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result2.current.isLoading).toBe(false);
    });

    // Should have exactly 2 actions (no duplicates from reconnect)
    expect(result2.current.actions.length).toBe(2);
    expect(result2.current.actions[0].id).toBe('act-1');
    expect(result2.current.actions[1].id).toBe('act-2');
  });

  it('handles state changes that occurred during disconnect', async () => {
    // Initial state before disconnect
    const gameBeforeDisconnect = createTestGame({
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
      good_victories: 0,
    });
    
    const playersBeforeDisconnect = [
      createTestPlayer({ id: 'p1', display_name: 'Alice' }),
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(gameBeforeDisconnect);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder(playersBeforeDisconnect);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    // First render
    const { result, unmount } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.game?.current_round).toBe(1);
    });

    // Simulate disconnect
    unmount();

    // State changed while disconnected (simulating server-side changes)
    const gameAfterDisconnect = createTestGame({
      status: 'playing',
      phase: 'mission_voting',
      current_round: 2,
      good_victories: 1,
      selected_team: ['p1', 'p2'],
    });

    const actionsAfterDisconnect = [
      createTestAction({ id: 'act-1', round: 1 }),
      createTestAction({ id: 'act-2', round: 1 }),
      createTestAction({ id: 'act-3', round: 2 }),
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(gameAfterDisconnect);
      } else if (table === 'players') {
        return createMockArrayQueryBuilder(playersBeforeDisconnect);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder(actionsAfterDisconnect);
      }
      return createMockQueryBuilder(null);
    });

    // Re-render (simulating reconnect after game progressed)
    mockChannels = [];
    const { result: result2 } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result2.current.isLoading).toBe(false);
    });

    // Should have caught up to current state
    expect(result2.current.game?.current_round).toBe(2);
    expect(result2.current.game?.phase).toBe('mission_voting');
    expect(result2.current.game?.good_victories).toBe(1);
    expect(result2.current.game?.selected_team).toEqual(['p1', 'p2']);
    expect(result2.current.actions.length).toBe(3);
  });

  it('connectionStatus updates correctly through reconnection cycle', async () => {
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

    // Initial state is connecting
    expect(result.current.connectionStatus).toBe('connecting');

    // Wait for connection
    await waitFor(() => {
      expect(result.current.connectionStatus).toBe('connected');
    });

    // Simulate channel error (connection lost)
    await act(async () => {
      mockChannels[0]._triggerStatus('CHANNEL_ERROR');
    });

    // Should transition to disconnected first, then reconnecting as it attempts to reconnect
    // The hook sets 'disconnected' briefly before calling attemptReconnect() which sets 'reconnecting'
    await waitFor(() => {
      // Accept either disconnected or reconnecting as both are valid states after channel error
      expect(['disconnected', 'reconnecting']).toContain(result.current.connectionStatus);
    });
  });

  it('uses refresh to manually restore state', async () => {
    const initialGame = createTestGame({ status: 'playing', phase: 'voting_for_leader' });
    const updatedGame = createTestGame({ status: 'playing', phase: 'mission_voting' });

    let fetchCount = 0;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return createMockQueryBuilder(fetchCount === 0 ? initialGame : updatedGame);
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
      expect(result.current.game?.phase).toBe('voting_for_leader');
    });

    // Simulate user manually refreshing data
    await act(async () => {
      await result.current.refresh();
    });

    // Should have latest state
    expect(result.current.game?.phase).toBe('mission_voting');
  });

  it('handles rapid reconnection attempts gracefully', async () => {
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

    // Rapid mount/unmount cycles (simulating rapid refresh)
    for (let i = 0; i < 5; i++) {
      mockChannels = [];
      const { unmount } = renderHook(() => useGameSubscription('game-123'));
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 10));
      
      unmount();
    }

    // Final stable render
    mockChannels = [];
    const { result } = renderHook(() => useGameSubscription('game-123'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have stable state
    expect(result.current.game).not.toBeNull();
    expect(result.current.connectionStatus).toBe('connected');
  });

  it('cleanup prevents state updates after unmount', async () => {
    const game = createTestGame();

    // Use a slow response to test cleanup during pending fetch
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'games') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          single: vi.fn().mockReturnValue(
            new Promise(resolve => setTimeout(() => resolve({ data: game, error: null }), 100))
          ),
        };
      } else if (table === 'players') {
        return createMockArrayQueryBuilder([]);
      } else if (table === 'game_actions') {
        return createMockArrayQueryBuilder([]);
      }
      return createMockQueryBuilder(null);
    });

    const { unmount } = renderHook(() => useGameSubscription('game-123'));

    // Unmount before fetch completes
    unmount();

    // Wait for the pending request to complete
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should not throw - state updates should be prevented
    // If isMountedRef is working correctly, no errors should occur
  });
});

// =============================================================================
// E2E Tests: Reconnect with Game Service State
// =============================================================================

describe('E2E: Reconnect with Backend State', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = createTestEnv();
  });

  afterEach(() => {
    actionRegistry.clear();
    env.actionProcessor.clear();
  });

  it('game state in service persists through frontend reconnect', async () => {
    // Create game with service
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame, players: lobbyPlayers } = createGameInLobby(
      env,
      'user-alice',
      playerSetups
    );

    // Start game with characters
    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);

    // Verify service state
    const gameFromService = env.gameService.getGameById(game.id)!;
    expect(gameFromService.status).toBe('playing');
    expect(gameFromService.phase).toBe('voting_for_leader');

    // Simulate a vote
    const players = env.gameService.getPlayers(game.id);
    env.voteProcessor.submitLeaderVote(game.id, players[0].id, 'yes');
    env.voteProcessor.submitLeaderVote(game.id, players[1].id, 'yes');

    // Verify votes are stored
    const actions = env.voteProcessor.getActions(game.id);
    expect(actions.length).toBe(2);

    // Simulate frontend disconnect and reconnect
    // The service state should still be accessible
    const gameAfterReconnect = env.gameService.getGameById(game.id)!;
    expect(gameAfterReconnect.id).toBe(game.id);
    expect(gameAfterReconnect.status).toBe('playing');

    const playersAfterReconnect = env.gameService.getPlayers(game.id);
    expect(playersAfterReconnect.length).toBe(5);

    const actionsAfterReconnect = env.voteProcessor.getActions(game.id);
    expect(actionsAfterReconnect.length).toBe(2);
  });

  it('player actions are not duplicated when reconnecting mid-vote', async () => {
    // Setup game
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    const game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    // Player Alice votes
    const alice = players.find(p => p.user_id === 'user-alice')!;
    env.voteProcessor.submitLeaderVote(game.id, alice.id, 'yes');

    // Simulate reconnect - Alice tries to vote again
    const duplicateResult = env.voteProcessor.submitLeaderVote(game.id, alice.id, 'yes');

    // Should fail with duplicate vote error
    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.error?.toLowerCase()).toContain('already voted');

    // Only one vote should exist
    const actions = env.voteProcessor.getActions(game.id);
    const aliceVotes = actions.filter(a => a.player_id === alice.id);
    expect(aliceVotes.length).toBe(1);
  });

  it('game continues correctly after player reconnects mid-mission', async () => {
    // Setup game
    const playerSetups = [
      { name: 'Alice', userId: 'user-alice' },
      { name: 'Bob', userId: 'user-bob' },
      { name: 'Carol', userId: 'user-carol' },
      { name: 'Dave', userId: 'user-dave' },
      { name: 'Eve', userId: 'user-eve' },
    ];

    const { game: lobbyGame } = createGameInLobby(env, 'user-alice', playerSetups);

    const characterAssignments = new Map<string, { character: CharacterName; team: Team }>();
    characterAssignments.set('user-alice', { character: 'Seer', team: 'good' });
    characterAssignments.set('user-bob', { character: 'Guardian', team: 'good' });
    characterAssignments.set('user-carol', { character: 'Villager', team: 'good' });
    characterAssignments.set('user-dave', { character: 'Assassin', team: 'evil' });
    characterAssignments.set('user-eve', { character: 'Minion', team: 'evil' });

    let game = startGameWithCharacters(env, lobbyGame.id, characterAssignments);
    const players = env.gameService.getPlayers(game.id);

    // Complete leader voting
    for (const player of players) {
      env.voteProcessor.submitLeaderVote(game.id, player.id, 'yes');
    }

    // Setup team selection
    env.gameService.updateGame(game.id, { phase: 'selecting_team' });
    const goodPlayers = players.filter(p => p.team === 'good');
    env.gameService.updateGame(game.id, {
      selected_team: [goodPlayers[0].id, goodPlayers[1].id],
      phase: 'mission_voting',
    });

    game = env.gameService.getGameById(game.id)!;
    expect(game.phase).toBe('mission_voting');

    // First player votes on mission
    env.voteProcessor.submitMissionVote(game.id, goodPlayers[0].id, 'pass');

    // Simulate reconnect for second player - they should still be able to vote
    const voteResult = env.voteProcessor.submitMissionVote(game.id, goodPlayers[1].id, 'pass');
    expect(voteResult.success).toBe(true);
    expect(voteResult.allVotesIn).toBe(true);
    expect(voteResult.result).toBe('passed');
  });
});
