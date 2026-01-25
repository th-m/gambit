/**
 * EventBus - Pub/sub system for game events.
 *
 * Provides subscription, emission, and middleware support for game events.
 * All game event types from GameEventType are supported.
 */

import type { GameContext, GameEventType } from '../types/game';

/**
 * Event handler function signature.
 */
export type EventHandler = (
  ctx: GameContext,
  eventData: Record<string, unknown>
) => void | Promise<void>;

/**
 * Unsubscribe function returned by on().
 */
export type Unsubscribe = () => void;

/**
 * Middleware function signature.
 * Middleware can modify eventData or prevent event propagation by not calling next().
 */
export type EventMiddleware = (
  event: GameEventType,
  ctx: GameContext,
  eventData: Record<string, unknown>,
  next: () => Promise<void>
) => void | Promise<void>;

/**
 * EventBus class for game event pub/sub.
 * Can be used as a singleton or instantiated for testing.
 */
export class EventBus {
  private handlers: Map<GameEventType, Set<EventHandler>> = new Map();
  private middlewares: EventMiddleware[] = [];

  /**
   * Subscribe to a game event.
   * @param event - The game event type to subscribe to
   * @param handler - The handler function to call when the event is emitted
   * @returns An unsubscribe function that removes the handler
   */
  on(event: GameEventType, handler: EventHandler): Unsubscribe {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }

    const handlers = this.handlers.get(event)!;
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      handlers.delete(handler);
      // Clean up empty handler sets
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  /**
   * Add middleware to intercept events before they reach handlers.
   * Middleware is executed in the order it was added.
   * @param middleware - The middleware function
   */
  useMiddleware(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Emit a game event to all subscribers.
   * Middleware is executed first, then all handlers are called.
   * @param event - The game event type to emit
   * @param ctx - Current game context
   * @param data - Additional event data
   */
  async emit(
    event: GameEventType,
    ctx: GameContext,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    // Build middleware chain
    const executeHandlers = async () => {
      const handlers = this.handlers.get(event);
      if (!handlers || handlers.size === 0) {
        return;
      }

      const handlerPromises: Promise<void>[] = [];

      for (const handler of handlers) {
        const result = handler(ctx, data);
        if (result instanceof Promise) {
          handlerPromises.push(result);
        }
      }

      // Wait for all async handlers to complete
      if (handlerPromises.length > 0) {
        await Promise.all(handlerPromises);
      }
    };

    // If no middleware, execute handlers directly
    if (this.middlewares.length === 0) {
      await executeHandlers();
      return;
    }

    // Build middleware chain from end to beginning
    let chain = executeHandlers;

    for (let i = this.middlewares.length - 1; i >= 0; i--) {
      const middleware = this.middlewares[i];
      const next = chain;
      chain = async () => {
        await middleware(event, ctx, data, next);
      };
    }

    // Execute the middleware chain
    await chain();
  }

  /**
   * Get the number of handlers for a specific event.
   * @param event - The game event type
   * @returns The number of handlers subscribed to this event
   */
  getHandlerCount(event: GameEventType): number {
    const handlers = this.handlers.get(event);
    return handlers ? handlers.size : 0;
  }

  /**
   * Get all events that have handlers.
   * @returns Array of event types that have at least one handler
   */
  getActiveEvents(): GameEventType[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Remove all handlers for a specific event.
   * @param event - The game event type to clear handlers for
   */
  off(event: GameEventType): void {
    this.handlers.delete(event);
  }

  /**
   * Clear all handlers and middleware.
   * Useful for testing.
   */
  clear(): void {
    this.handlers.clear();
    this.middlewares = [];
  }

  /**
   * Clear only middleware (keep handlers).
   * Useful for testing.
   */
  clearMiddleware(): void {
    this.middlewares = [];
  }
}

/**
 * Singleton instance for global use.
 * Import this for production code.
 */
export const eventBus = new EventBus();
