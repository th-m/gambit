/**
 * Unit tests for useGameApi hook
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useGameApi,
  type VoteType,
  type Vote,
  type CreateGameResponse,
  type JoinGameResponse,
  type StartGameResponse,
  type TeamSelectionResponse,
} from './useGameApi';
import type { Game, Player, VoteResult, ActionResult } from '~/types/game';

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

function createVoteResult(overrides: Partial<VoteResult> = {}): VoteResult {
  return {
    success: true,
    allVotesIn: false,
    result: undefined,
    tally: { yes: 1, no: 0 },
    error: undefined,
    ...overrides,
  };
}

function createActionResult(overrides: Partial<ActionResult> = {}): ActionResult {
  return {
    success: true,
    message: 'Action executed successfully',
    gameEnded: false,
    winner: undefined,
    error: undefined,
    ...overrides,
  };
}

// Mock fetch
let mockFetch: ReturnType<typeof vi.fn>;

// =============================================================================
// Setup/Teardown
// =============================================================================

beforeEach(() => {
  mockFetch = vi.fn();
  global.fetch = mockFetch as typeof fetch;
});

afterEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Tests: Initial State
// =============================================================================

describe('useGameApi - Initial State', () => {
  it('returns initial state with no loading or error', () => {
    const { result } = renderHook(() => useGameApi());

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('provides all expected methods', () => {
    const { result } = renderHook(() => useGameApi());

    expect(typeof result.current.submitVote).toBe('function');
    expect(typeof result.current.selectTeam).toBe('function');
    expect(typeof result.current.executeAction).toBe('function');
    expect(typeof result.current.startGame).toBe('function');
    expect(typeof result.current.createGame).toBe('function');
    expect(typeof result.current.joinGame).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });
});

// =============================================================================
// Tests: submitVote
// =============================================================================

describe('useGameApi - submitVote', () => {
  it('submits leader vote successfully', async () => {
    const voteResult = createVoteResult({ tally: { yes: 3, no: 2 } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => voteResult,
    });

    const { result } = renderHook(() => useGameApi());

    let response: VoteResult | null = null;
    await act(async () => {
      response = await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(response).toEqual(voteResult);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/game-123/vote',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ voteType: 'leader', vote: 'yes' }),
      })
    );
  });

  it('submits mission vote successfully', async () => {
    const voteResult = createVoteResult({ tally: { pass: 2, fail: 1 } });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => voteResult,
    });

    const { result } = renderHook(() => useGameApi());

    let response: VoteResult | null = null;
    await act(async () => {
      response = await result.current.submitVote('game-123', 'mission', 'fail');
    });

    expect(response).toEqual(voteResult);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/game-123/vote',
      expect.objectContaining({
        body: JSON.stringify({ voteType: 'mission', vote: 'fail' }),
      })
    );
  });

  it('sets loading state during vote submission', async () => {
    let resolvePromise: (value: Response) => void;
    const promise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });
    mockFetch.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useGameApi());

    let votePromise: Promise<VoteResult | null>;
    act(() => {
      votePromise = result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: async () => createVoteResult(),
      } as Response);
      await votePromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('handles vote submission error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid vote type' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: VoteResult | null = null;
    await act(async () => {
      response = await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Invalid vote type');
    expect(result.current.isLoading).toBe(false);
  });
});

// =============================================================================
// Tests: selectTeam
// =============================================================================

describe('useGameApi - selectTeam', () => {
  it('selects team successfully', async () => {
    const game = createTestGame({ selected_team: ['p1', 'p2'], phase: 'mission_voting' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ game }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: TeamSelectionResponse | null = null;
    await act(async () => {
      response = await result.current.selectTeam('game-123', ['p1', 'p2']);
    });

    expect((response as TeamSelectionResponse | null)?.game.selected_team).toEqual(['p1', 'p2']);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/game-123/team',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ teamIds: ['p1', 'p2'] }),
      })
    );
  });

  it('handles team selection error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Only the current leader can select the team' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: TeamSelectionResponse | null = null;
    await act(async () => {
      response = await result.current.selectTeam('game-123', ['p1', 'p2']);
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Only the current leader can select the team');
  });

  it('sets loading state during team selection', async () => {
    let resolvePromise: (value: Response) => void;
    const promise = new Promise<Response>((resolve) => {
      resolvePromise = resolve;
    });
    mockFetch.mockReturnValueOnce(promise);

    const { result } = renderHook(() => useGameApi());

    let teamPromise: Promise<TeamSelectionResponse | null>;
    act(() => {
      teamPromise = result.current.selectTeam('game-123', ['p1', 'p2']);
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolvePromise!({
        ok: true,
        json: async () => ({ game: createTestGame() }),
      } as Response);
      await teamPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });
});

// =============================================================================
// Tests: executeAction
// =============================================================================

describe('useGameApi - executeAction', () => {
  it('executes action successfully', async () => {
    const actionResult = createActionResult({ message: 'Target has been assassinated' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => actionResult,
    });

    const { result } = renderHook(() => useGameApi());

    let response: ActionResult | null = null;
    await act(async () => {
      response = await result.current.executeAction('game-123', 'assassinate', ['target-1']);
    });

    expect(response).toEqual(actionResult);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/game-123/action',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ actionId: 'assassinate', targetIds: ['target-1'] }),
      })
    );
  });

  it('executes action with no targets', async () => {
    const actionResult = createActionResult({ message: 'Vote has been rigged' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => actionResult,
    });

    const { result } = renderHook(() => useGameApi());

    let response: ActionResult | null = null;
    await act(async () => {
      response = await result.current.executeAction('game-123', 'rig_vote', []);
    });

    expect(response).toEqual(actionResult);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/game-123/action',
      expect.objectContaining({
        body: JSON.stringify({ actionId: 'rig_vote', targetIds: [] }),
      })
    );
  });

  it('handles action execution error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Action has already been used' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: ActionResult | null = null;
    await act(async () => {
      response = await result.current.executeAction('game-123', 'assassinate', ['target-1']);
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Action has already been used');
  });

  it('handles game-ending action', async () => {
    const actionResult = createActionResult({
      message: 'Seer has been assassinated! Evil wins!',
      gameEnded: true,
      winner: 'evil',
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => actionResult,
    });

    const { result } = renderHook(() => useGameApi());

    let response: ActionResult | null = null;
    await act(async () => {
      response = await result.current.executeAction('game-123', 'assassinate', ['seer-1']);
    });

    expect((response as ActionResult | null)?.gameEnded).toBe(true);
    expect((response as ActionResult | null)?.winner).toBe('evil');
  });
});

// =============================================================================
// Tests: startGame
// =============================================================================

describe('useGameApi - startGame', () => {
  it('starts game successfully', async () => {
    const game = createTestGame({
      status: 'playing',
      phase: 'voting_for_leader',
      current_round: 1,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ game }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: StartGameResponse | null = null;
    await act(async () => {
      response = await result.current.startGame('game-123');
    });

    expect((response as StartGameResponse | null)?.game.status).toBe('playing');
    expect((response as StartGameResponse | null)?.game.phase).toBe('voting_for_leader');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/game-123/start',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
  });

  it('handles start game error - not host', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'Only the host can start the game' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: StartGameResponse | null = null;
    await act(async () => {
      response = await result.current.startGame('game-123');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Only the host can start the game');
  });

  it('handles start game error - not enough players', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Need at least 5 players to start' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: StartGameResponse | null = null;
    await act(async () => {
      response = await result.current.startGame('game-123');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Need at least 5 players to start');
  });
});

// =============================================================================
// Tests: createGame
// =============================================================================

describe('useGameApi - createGame', () => {
  it('creates game successfully', async () => {
    const game = createTestGame({ status: 'lobby', phase: 'lobby' });
    const player = createTestPlayer();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ game, player, gameKey: 'ABC123' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: CreateGameResponse | null = null;
    await act(async () => {
      response = await result.current.createGame('TestPlayer');
    });

    expect((response as CreateGameResponse | null)?.game).toEqual(game);
    expect((response as CreateGameResponse | null)?.player).toEqual(player);
    expect((response as CreateGameResponse | null)?.gameKey).toBe('ABC123');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/create',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ displayName: 'TestPlayer' }),
      })
    );
  });

  it('handles create game error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: CreateGameResponse | null = null;
    await act(async () => {
      response = await result.current.createGame('TestPlayer');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Unauthorized');
  });
});

// =============================================================================
// Tests: joinGame
// =============================================================================

describe('useGameApi - joinGame', () => {
  it('joins game successfully', async () => {
    const player = createTestPlayer({ display_name: 'NewPlayer' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ player }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: JoinGameResponse | null = null;
    await act(async () => {
      response = await result.current.joinGame('game-123', 'NewPlayer');
    });

    expect((response as JoinGameResponse | null)?.player).toEqual(player);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/games/game-123/join',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ displayName: 'NewPlayer' }),
      })
    );
  });

  it('handles join game error - game full', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Game is full' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: JoinGameResponse | null = null;
    await act(async () => {
      response = await result.current.joinGame('game-123', 'NewPlayer');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Game is full');
  });

  it('handles join game error - game not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Game not found' }),
    });

    const { result } = renderHook(() => useGameApi());

    let response: JoinGameResponse | null = null;
    await act(async () => {
      response = await result.current.joinGame('invalid-id', 'NewPlayer');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Game not found');
  });
});

// =============================================================================
// Tests: Error Handling
// =============================================================================

describe('useGameApi - Error Handling', () => {
  it('clears error when clearError is called', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Some error' }),
    });

    const { result } = renderHook(() => useGameApi());

    await act(async () => {
      await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(result.current.error).toBe('Some error');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('clears previous error on new successful request', async () => {
    // First request fails
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'First error' }),
    });

    const { result } = renderHook(() => useGameApi());

    await act(async () => {
      await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(result.current.error).toBe('First error');

    // Second request succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createVoteResult(),
    });

    await act(async () => {
      await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(result.current.error).toBeNull();
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useGameApi());

    let response: VoteResult | null = null;
    await act(async () => {
      response = await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Network error');
    expect(result.current.isLoading).toBe(false);
  });

  it('handles non-Error throws gracefully', async () => {
    mockFetch.mockRejectedValueOnce('Unknown error');

    const { result } = renderHook(() => useGameApi());

    let response: VoteResult | null = null;
    await act(async () => {
      response = await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('An unexpected error occurred');
  });

  it('provides fallback error when no error message in response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useGameApi());

    let response: VoteResult | null = null;
    await act(async () => {
      response = await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(response).toBeNull();
    expect(result.current.error).toBe('Request failed with status 500');
  });
});

// =============================================================================
// Tests: Loading State Management
// =============================================================================

describe('useGameApi - Loading State', () => {
  it('only allows one operation at a time', async () => {
    let resolveFirst: (value: Response) => void;
    let resolveSecond: (value: Response) => void;
    
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondPromise = new Promise<Response>((resolve) => {
      resolveSecond = resolve;
    });
    
    mockFetch
      .mockReturnValueOnce(firstPromise)
      .mockReturnValueOnce(secondPromise);

    const { result } = renderHook(() => useGameApi());

    // Start first request
    let firstResult: VoteResult | null = null;
    let secondResult: VoteResult | null = null;
    
    act(() => {
      result.current.submitVote('game-123', 'leader', 'yes').then((r) => {
        firstResult = r;
      });
    });

    expect(result.current.isLoading).toBe(true);

    // Start second request while first is pending
    act(() => {
      result.current.startGame('game-123').then((r) => {
        secondResult = r as any;
      });
    });

    // Second call starts its own loading state
    expect(result.current.isLoading).toBe(true);

    // Complete both
    await act(async () => {
      resolveFirst!({
        ok: true,
        json: async () => createVoteResult(),
      } as Response);
      resolveSecond!({
        ok: true,
        json: async () => ({ game: createTestGame() }),
      } as Response);
    });
  });

  it('resets loading state even when request fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    });

    const { result } = renderHook(() => useGameApi());

    await act(async () => {
      await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Server error');
  });
});

// =============================================================================
// Tests: Request Format
// =============================================================================

describe('useGameApi - Request Format', () => {
  it('includes credentials in requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createVoteResult(),
    });

    const { result } = renderHook(() => useGameApi());

    await act(async () => {
      await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credentials: 'include',
      })
    );
  });

  it('sets correct content-type header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => createVoteResult(),
    });

    const { result } = renderHook(() => useGameApi());

    await act(async () => {
      await result.current.submitVote('game-123', 'leader', 'yes');
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );
  });

  it('uses POST method for all API calls', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() => useGameApi());

    // Test each method
    await act(async () => {
      await result.current.submitVote('g', 'leader', 'yes');
      await result.current.selectTeam('g', []);
      await result.current.executeAction('g', 'assassinate', []);
      await result.current.startGame('g');
      await result.current.createGame('name');
      await result.current.joinGame('g', 'name');
    });

    // All calls should use POST
    expect(mockFetch).toHaveBeenCalledTimes(6);
    for (let i = 0; i < 6; i++) {
      expect(mockFetch.mock.calls[i][1]).toMatchObject({ method: 'POST' });
    }
  });
});
