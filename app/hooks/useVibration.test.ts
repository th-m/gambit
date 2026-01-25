/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// =============================================================================
// Mocks
// =============================================================================

// Mock navigator.vibrate
const mockVibrate = vi.fn(() => true);
Object.defineProperty(navigator, 'vibrate', {
  value: mockVibrate,
  writable: true,
  configurable: true,
});

// Track channel subscriptions
type BroadcastHandler = (payload: { payload: unknown }) => void;
const channelHandlers = new Map<string, Map<string, BroadcastHandler>>();
let subscribeStatus: 'SUBSCRIBED' | 'CHANNEL_ERROR' = 'SUBSCRIBED';
let subscribeCallback: ((status: string) => void) | null = null;

const mockChannel = {
  on: vi.fn((type: string, options: { event: string }, handler: BroadcastHandler) => {
    const key = `${type}-${options.event}`;
    if (!channelHandlers.has('current')) {
      channelHandlers.set('current', new Map());
    }
    channelHandlers.get('current')!.set(key, handler);
    return mockChannel;
  }),
  subscribe: vi.fn((callback?: (status: string) => void) => {
    subscribeCallback = callback ?? null;
    if (callback) {
      // Simulate async subscription
      setTimeout(() => callback(subscribeStatus), 0);
    }
    return mockChannel;
  }),
  send: vi.fn(() => Promise.resolve()),
  _trigger: (event: string, payload: unknown) => {
    const handler = channelHandlers.get('current')?.get(`broadcast-${event}`);
    if (handler) {
      handler({ payload });
    }
  },
};

const mockRemoveChannel = vi.fn();

vi.mock('~/lib/supabase/client', () => ({
  createClient: () => ({
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel,
  }),
}));

// Import after mocks are set up
import { useVibration, broadcastVibration, type VibrationEvent } from './useVibration';

// =============================================================================
// Test Setup
// =============================================================================

describe('useVibration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelHandlers.clear();
    subscribeStatus = 'SUBSCRIBED';
    subscribeCallback = null;
    mockVibrate.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Basic Hook Behavior
  // ===========================================================================

  describe('initialization', () => {
    it('should return isSupported as true when vibration API is available', () => {
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));
      expect(result.current.isSupported).toBe(true);
    });

    it('should start with vibrationCount of 0', () => {
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));
      expect(result.current.vibrationCount).toBe(0);
    });

    it('should start with no error', () => {
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));
      expect(result.current.error).toBeNull();
    });

    it('should provide triggerVibration function', () => {
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));
      expect(typeof result.current.triggerVibration).toBe('function');
    });
  });

  // ===========================================================================
  // Channel Subscription
  // ===========================================================================

  describe('channel subscription', () => {
    it('should subscribe to vibration channel on mount', async () => {
      vi.useFakeTimers();
      renderHook(() => useVibration('game-1', 'player-1'));

      expect(mockChannel.on).toHaveBeenCalledWith(
        'broadcast',
        { event: 'vibration' },
        expect.any(Function)
      );
      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it('should set isSubscribed to true after successful subscription', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.isSubscribed).toBe(true);
    });

    it('should set error on channel subscription failure', async () => {
      subscribeStatus = 'CHANNEL_ERROR';
      vi.useFakeTimers();

      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(result.current.isSubscribed).toBe(false);
      expect(result.current.error).toBe('Failed to subscribe to vibration channel');
    });

    it('should unsubscribe on unmount', () => {
      const { unmount } = renderHook(() => useVibration('game-1', 'player-1'));

      unmount();

      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('should not subscribe when enabled is false', () => {
      vi.clearAllMocks();
      renderHook(() => useVibration('game-1', 'player-1', { enabled: false }));

      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });

    it('should not subscribe when gameId is empty', () => {
      vi.clearAllMocks();
      renderHook(() => useVibration('', 'player-1'));

      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });

    it('should not subscribe when playerId is empty', () => {
      vi.clearAllMocks();
      renderHook(() => useVibration('game-1', ''));

      expect(mockChannel.subscribe).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Vibration Events
  // ===========================================================================

  describe('vibration events', () => {
    it('should trigger vibration when current player is in targets', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1', 'player-2'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(mockVibrate).toHaveBeenCalled();
      expect(result.current.vibrationCount).toBe(1);
    });

    it('should not trigger vibration when current player is not in targets', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-2', 'player-3'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(mockVibrate).not.toHaveBeenCalled();
      expect(result.current.vibrationCount).toBe(0);
    });

    it('should not trigger vibration for different game', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-2', // Different game
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(mockVibrate).not.toHaveBeenCalled();
      expect(result.current.vibrationCount).toBe(0);
    });

    it('should call onVibration callback when vibration is triggered', async () => {
      vi.useFakeTimers();
      const onVibration = vi.fn();
      renderHook(() => useVibration('game-1', 'player-1', { onVibration }));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(onVibration).toHaveBeenCalledWith(event);
    });

    it('should increment vibrationCount for each vibration', async () => {
      vi.useFakeTimers();
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(result.current.vibrationCount).toBe(1);

      await act(async () => {
        mockChannel._trigger('vibration', { ...event, round: 2 });
      });

      expect(result.current.vibrationCount).toBe(2);
    });
  });

  // ===========================================================================
  // Custom Vibration Pattern
  // ===========================================================================

  describe('custom vibration pattern', () => {
    it('should use default pattern when not specified', async () => {
      vi.useFakeTimers();
      renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(mockVibrate).toHaveBeenCalledWith([200, 100, 200]);
    });

    it('should use custom pattern when specified', async () => {
      vi.useFakeTimers();
      const customPattern = [100, 50, 100, 50, 100];
      renderHook(() => useVibration('game-1', 'player-1', { pattern: customPattern }));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(mockVibrate).toHaveBeenCalledWith(customPattern);
    });

    it('should accept single number as pattern', async () => {
      vi.useFakeTimers();
      renderHook(() => useVibration('game-1', 'player-1', { pattern: 500 }));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      expect(mockVibrate).toHaveBeenCalledWith(500);
    });
  });

  // ===========================================================================
  // Manual Trigger
  // ===========================================================================

  describe('triggerVibration', () => {
    it('should trigger vibration manually', () => {
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      act(() => {
        result.current.triggerVibration();
      });

      expect(mockVibrate).toHaveBeenCalled();
      expect(result.current.vibrationCount).toBe(1);
    });

    it('should use custom pattern for manual trigger', () => {
      const customPattern = [300, 100, 300];
      const { result } = renderHook(() =>
        useVibration('game-1', 'player-1', { pattern: customPattern })
      );

      act(() => {
        result.current.triggerVibration();
      });

      expect(mockVibrate).toHaveBeenCalledWith(customPattern);
    });

    it('should increment count on multiple manual triggers', () => {
      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      act(() => {
        result.current.triggerVibration();
        result.current.triggerVibration();
        result.current.triggerVibration();
      });

      expect(result.current.vibrationCount).toBe(3);
    });
  });

  // ===========================================================================
  // Graceful Degradation
  // ===========================================================================

  describe('graceful degradation', () => {
    it('should not throw when vibrate returns false', async () => {
      mockVibrate.mockReturnValue(false);
      vi.useFakeTimers();

      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      // Should not throw
      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      // Count should not increment when vibration fails
      expect(result.current.vibrationCount).toBe(0);
    });

    it('should handle vibrate throwing an error', async () => {
      mockVibrate.mockImplementation(() => {
        throw new Error('Vibration not allowed');
      });
      vi.useFakeTimers();

      const { result } = renderHook(() => useVibration('game-1', 'player-1'));

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const event: VibrationEvent = {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 1,
        targetPlayerIds: ['player-1'],
      };

      // Should not throw
      await act(async () => {
        mockChannel._trigger('vibration', event);
      });

      // Count should not increment when vibration throws
      expect(result.current.vibrationCount).toBe(0);
    });
  });

  // ===========================================================================
  // Re-subscription on prop changes
  // ===========================================================================

  describe('re-subscription', () => {
    it('should re-subscribe when gameId changes', async () => {
      vi.useFakeTimers();
      const { rerender } = renderHook(
        ({ gameId, playerId }) => useVibration(gameId, playerId),
        { initialProps: { gameId: 'game-1', playerId: 'player-1' } }
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const initialSubscribeCount = mockChannel.subscribe.mock.calls.length;

      rerender({ gameId: 'game-2', playerId: 'player-1' });

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(mockChannel.subscribe.mock.calls.length).toBeGreaterThan(initialSubscribeCount);
      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    it('should re-subscribe when playerId changes', async () => {
      vi.useFakeTimers();
      const { rerender } = renderHook(
        ({ gameId, playerId }) => useVibration(gameId, playerId),
        { initialProps: { gameId: 'game-1', playerId: 'player-1' } }
      );

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      const initialSubscribeCount = mockChannel.subscribe.mock.calls.length;

      rerender({ gameId: 'game-1', playerId: 'player-2' });

      await act(async () => {
        vi.advanceTimersByTime(10);
      });

      expect(mockChannel.subscribe.mock.calls.length).toBeGreaterThan(initialSubscribeCount);
    });
  });
});

// =============================================================================
// broadcastVibration Helper Tests
// =============================================================================

describe('broadcastVibration', () => {
  it('should send broadcast to correct channel', async () => {
    const mockSend = vi.fn(() => Promise.resolve());
    const mockSupabase = {
      channel: vi.fn(() => ({
        send: mockSend,
      })),
    };

    await broadcastVibration(mockSupabase as any, 'game-1', 2, ['player-1', 'player-2']);

    expect(mockSupabase.channel).toHaveBeenCalledWith('vibration-game-1');
    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'vibration',
      payload: {
        type: 'beeper_triggered',
        gameId: 'game-1',
        round: 2,
        targetPlayerIds: ['player-1', 'player-2'],
      },
    });
  });

  it('should not send broadcast when targetPlayerIds is empty', async () => {
    const mockSend = vi.fn(() => Promise.resolve());
    const mockSupabase = {
      channel: vi.fn(() => ({
        send: mockSend,
      })),
    };

    await broadcastVibration(mockSupabase as any, 'game-1', 2, []);

    expect(mockSupabase.channel).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
