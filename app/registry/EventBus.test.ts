import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus, eventBus } from './EventBus';
import type { EventHandler, EventMiddleware } from './EventBus';
import type { GameContext, Game, Player, GameEventType } from '../types/game';

/**
 * Helper to create a minimal Game object for testing.
 */
function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    game_key: 'ABC123',
    host_id: 'host-1',
    status: 'playing',
    phase: 'mission_voting',
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

/**
 * Helper to create a minimal Player object for testing.
 */
function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    game_id: 'game-1',
    user_id: 'user-1',
    display_name: 'Test Player',
    character: 'Assassin',
    team: 'evil',
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create a minimal GameContext for testing.
 */
function createTestContext(overrides: Partial<GameContext> = {}): GameContext {
  return {
    game: createTestGame(),
    players: [createTestPlayer()],
    currentPlayer: createTestPlayer(),
    modifiers: [],
    statuses: [],
    ...overrides,
  };
}

describe('EventBus', () => {
  let bus: EventBus;
  let ctx: GameContext;

  beforeEach(() => {
    bus = new EventBus();
    ctx = createTestContext();
    // Clear singleton for isolation
    eventBus.clear();
  });

  describe('on()', () => {
    it('should subscribe handler to event', () => {
      const handler = vi.fn();

      bus.on('game_start', handler);

      expect(bus.getHandlerCount('game_start')).toBe(1);
    });

    it('should allow multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.on('game_start', handler1);
      bus.on('game_start', handler2);
      bus.on('game_start', handler3);

      expect(bus.getHandlerCount('game_start')).toBe(3);
    });

    it('should allow same handler for different events', () => {
      const handler = vi.fn();

      bus.on('game_start', handler);
      bus.on('round_start', handler);

      expect(bus.getHandlerCount('game_start')).toBe(1);
      expect(bus.getHandlerCount('round_start')).toBe(1);
      expect(bus.getActiveEvents()).toContain('game_start');
      expect(bus.getActiveEvents()).toContain('round_start');
    });

    it('should not add duplicate handler for same event', () => {
      const handler = vi.fn();

      bus.on('game_start', handler);
      bus.on('game_start', handler);

      // Set automatically deduplicates
      expect(bus.getHandlerCount('game_start')).toBe(1);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();

      const unsubscribe = bus.on('game_start', handler);

      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('unsubscribe', () => {
    it('should remove handler when unsubscribe is called', () => {
      const handler = vi.fn();

      const unsubscribe = bus.on('game_start', handler);
      expect(bus.getHandlerCount('game_start')).toBe(1);

      unsubscribe();
      expect(bus.getHandlerCount('game_start')).toBe(0);
    });

    it('should remove event from active events when last handler unsubscribes', () => {
      const handler = vi.fn();

      const unsubscribe = bus.on('game_start', handler);
      expect(bus.getActiveEvents()).toContain('game_start');

      unsubscribe();
      expect(bus.getActiveEvents()).not.toContain('game_start');
    });

    it('should only remove specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = bus.on('game_start', handler1);
      bus.on('game_start', handler2);

      expect(bus.getHandlerCount('game_start')).toBe(2);

      unsubscribe1();
      expect(bus.getHandlerCount('game_start')).toBe(1);
    });

    it('should be idempotent (multiple calls do not error)', () => {
      const handler = vi.fn();

      const unsubscribe = bus.on('game_start', handler);
      unsubscribe();
      unsubscribe(); // Should not throw

      expect(bus.getHandlerCount('game_start')).toBe(0);
    });
  });

  describe('emit()', () => {
    it('should call subscribed handler with ctx and data', async () => {
      const handler = vi.fn();
      const eventData = { round: 1, leader: 'player-1' };

      bus.on('round_start', handler);
      await bus.emit('round_start', ctx, eventData);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(ctx, eventData);
    });

    it('should call all subscribed handlers for an event', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      bus.on('mission_success', handler1);
      bus.on('mission_success', handler2);
      bus.on('mission_success', handler3);

      await bus.emit('mission_success', ctx, { round: 2 });

      expect(handler1).toHaveBeenCalledOnce();
      expect(handler2).toHaveBeenCalledOnce();
      expect(handler3).toHaveBeenCalledOnce();
    });

    it('should not call handlers for other events', async () => {
      const startHandler = vi.fn();
      const endHandler = vi.fn();

      bus.on('game_start', startHandler);
      bus.on('round_end', endHandler);

      await bus.emit('game_start', ctx);

      expect(startHandler).toHaveBeenCalledOnce();
      expect(endHandler).not.toHaveBeenCalled();
    });

    it('should handle events with no subscribers', async () => {
      // Should not throw
      await bus.emit('game_start', ctx);
      await bus.emit('round_end', ctx, { round: 1 });
    });

    it('should handle async handlers', async () => {
      const callOrder: number[] = [];

      const asyncHandler: EventHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push(1);
      };
      const syncHandler: EventHandler = () => {
        callOrder.push(2);
      };

      bus.on('phase_change', asyncHandler);
      bus.on('phase_change', syncHandler);

      await bus.emit('phase_change', ctx, { from: 'lobby', to: 'voting_for_leader' });

      // Both handlers should have completed
      expect(callOrder).toContain(1);
      expect(callOrder).toContain(2);
    });

    it('should wait for all async handlers to complete', async () => {
      let completed = false;

      const slowHandler: EventHandler = async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        completed = true;
      };

      bus.on('good_wins', slowHandler);
      await bus.emit('good_wins', ctx, { reason: 'missions' });

      expect(completed).toBe(true);
    });

    it('should pass empty object when no data provided', async () => {
      const handler = vi.fn();

      bus.on('game_start', handler);
      await bus.emit('game_start', ctx);

      expect(handler).toHaveBeenCalledWith(ctx, {});
    });
  });

  describe('useMiddleware()', () => {
    it('should execute middleware before handlers', async () => {
      const callOrder: string[] = [];

      const middleware: EventMiddleware = async (_event, _ctx, _data, next) => {
        callOrder.push('middleware');
        await next();
      };

      const handler: EventHandler = () => {
        callOrder.push('handler');
      };

      bus.useMiddleware(middleware);
      bus.on('game_start', handler);

      await bus.emit('game_start', ctx);

      expect(callOrder).toEqual(['middleware', 'handler']);
    });

    it('should allow middleware to intercept and prevent event propagation', async () => {
      const handler = vi.fn();

      const blockingMiddleware: EventMiddleware = async () => {
        // Does not call next(), blocking the event
      };

      bus.useMiddleware(blockingMiddleware);
      bus.on('game_start', handler);

      await bus.emit('game_start', ctx);

      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow middleware to modify event data', async () => {
      const handler = vi.fn();

      const modifyingMiddleware: EventMiddleware = async (_event, _ctx, data, next) => {
        data.modified = true;
        data.extraInfo = 'added by middleware';
        await next();
      };

      bus.useMiddleware(modifyingMiddleware);
      bus.on('round_start', handler);

      await bus.emit('round_start', ctx, { round: 1 });

      expect(handler).toHaveBeenCalledWith(ctx, {
        round: 1,
        modified: true,
        extraInfo: 'added by middleware',
      });
    });

    it('should execute multiple middleware in order', async () => {
      const callOrder: string[] = [];

      const middleware1: EventMiddleware = async (_event, _ctx, _data, next) => {
        callOrder.push('m1-start');
        await next();
        callOrder.push('m1-end');
      };

      const middleware2: EventMiddleware = async (_event, _ctx, _data, next) => {
        callOrder.push('m2-start');
        await next();
        callOrder.push('m2-end');
      };

      const handler: EventHandler = () => {
        callOrder.push('handler');
      };

      bus.useMiddleware(middleware1);
      bus.useMiddleware(middleware2);
      bus.on('game_start', handler);

      await bus.emit('game_start', ctx);

      expect(callOrder).toEqual(['m1-start', 'm2-start', 'handler', 'm2-end', 'm1-end']);
    });

    it('should provide event type to middleware', async () => {
      const capturedEvent = vi.fn();

      const middleware: EventMiddleware = async (event, _ctx, _data, next) => {
        capturedEvent(event);
        await next();
      };

      bus.useMiddleware(middleware);
      bus.on('mission_fail', vi.fn());

      await bus.emit('mission_fail', ctx, { round: 3 });

      expect(capturedEvent).toHaveBeenCalledWith('mission_fail');
    });

    it('should provide context to middleware', async () => {
      const capturedCtx = vi.fn();

      const middleware: EventMiddleware = async (_event, ctx, _data, next) => {
        capturedCtx(ctx);
        await next();
      };

      bus.useMiddleware(middleware);
      bus.on('vote_submitted', vi.fn());

      await bus.emit('vote_submitted', ctx, { playerId: 'p1', vote: 'yes' });

      expect(capturedCtx).toHaveBeenCalledWith(ctx);
    });

    it('should work without middleware', async () => {
      const handler = vi.fn();

      bus.on('game_start', handler);
      await bus.emit('game_start', ctx);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('off()', () => {
    it('should remove all handlers for an event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on('game_start', handler1);
      bus.on('game_start', handler2);

      expect(bus.getHandlerCount('game_start')).toBe(2);

      bus.off('game_start');

      expect(bus.getHandlerCount('game_start')).toBe(0);
      expect(bus.getActiveEvents()).not.toContain('game_start');
    });

    it('should not affect other events', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on('game_start', handler1);
      bus.on('round_start', handler2);

      bus.off('game_start');

      expect(bus.getHandlerCount('game_start')).toBe(0);
      expect(bus.getHandlerCount('round_start')).toBe(1);
    });

    it('should handle off on event with no handlers', () => {
      // Should not throw
      bus.off('game_start');
      expect(bus.getHandlerCount('game_start')).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should remove all handlers', () => {
      bus.on('game_start', vi.fn());
      bus.on('round_start', vi.fn());
      bus.on('mission_success', vi.fn());

      expect(bus.getActiveEvents().length).toBe(3);

      bus.clear();

      expect(bus.getActiveEvents().length).toBe(0);
    });

    it('should remove all middleware', async () => {
      const callOrder: string[] = [];

      const middleware: EventMiddleware = async (_event, _ctx, _data, next) => {
        callOrder.push('middleware');
        await next();
      };

      const handler: EventHandler = () => {
        callOrder.push('handler');
      };

      bus.useMiddleware(middleware);
      bus.on('game_start', handler);

      bus.clear();

      // Re-add just handler
      bus.on('game_start', handler);
      await bus.emit('game_start', ctx);

      // Only handler should be called (middleware was cleared)
      expect(callOrder).toEqual(['handler']);
    });
  });

  describe('clearMiddleware()', () => {
    it('should remove middleware but keep handlers', async () => {
      const handler = vi.fn();
      const blockingMiddleware: EventMiddleware = async () => {
        // Does not call next()
      };

      bus.useMiddleware(blockingMiddleware);
      bus.on('game_start', handler);

      // With middleware, handler should not be called
      await bus.emit('game_start', ctx);
      expect(handler).not.toHaveBeenCalled();

      // Clear middleware
      bus.clearMiddleware();

      // Now handler should be called
      await bus.emit('game_start', ctx);
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  describe('getHandlerCount()', () => {
    it('should return 0 for event with no handlers', () => {
      expect(bus.getHandlerCount('game_start')).toBe(0);
    });

    it('should return correct count', () => {
      bus.on('game_start', vi.fn());
      bus.on('game_start', vi.fn());
      bus.on('round_start', vi.fn());

      expect(bus.getHandlerCount('game_start')).toBe(2);
      expect(bus.getHandlerCount('round_start')).toBe(1);
    });
  });

  describe('getActiveEvents()', () => {
    it('should return empty array when no handlers', () => {
      expect(bus.getActiveEvents()).toEqual([]);
    });

    it('should return all events with handlers', () => {
      bus.on('game_start', vi.fn());
      bus.on('round_start', vi.fn());
      bus.on('evil_wins', vi.fn());

      const events = bus.getActiveEvents();
      expect(events).toHaveLength(3);
      expect(events).toContain('game_start');
      expect(events).toContain('round_start');
      expect(events).toContain('evil_wins');
    });
  });

  describe('singleton instance', () => {
    it('should export singleton eventBus', () => {
      expect(eventBus).toBeInstanceOf(EventBus);
    });

    it('should persist state across references', () => {
      const handler = vi.fn();
      eventBus.on('game_start', handler);

      expect(eventBus.getHandlerCount('game_start')).toBe(1);
    });
  });

  describe('all supported events', () => {
    const allEvents: GameEventType[] = [
      'game_start',
      'round_start',
      'round_end',
      'phase_change',
      'leader_approved',
      'leader_rejected',
      'team_selected',
      'mission_success',
      'mission_fail',
      'vote_submitted',
      'player_eliminated',
      'good_wins',
      'evil_wins',
    ];

    it.each(allEvents)('should support %s event', async (eventType) => {
      const handler = vi.fn();

      bus.on(eventType, handler);
      await bus.emit(eventType, ctx, { test: true });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(ctx, { test: true });
    });
  });
});
