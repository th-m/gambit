/**
 * Rate Limiter Utility
 * 
 * Provides in-memory rate limiting for API endpoints.
 * Uses a sliding window algorithm for accurate rate limiting.
 */

/**
 * Configuration for a rate limit rule.
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Timestamp when the rate limit resets (ms since epoch) */
  resetAt: number;
  /** Time until reset in milliseconds */
  retryAfterMs: number;
}

/**
 * Internal tracking for request timestamps.
 */
interface RateLimitEntry {
  timestamps: number[];
}

/**
 * Default rate limit configurations for different endpoint types.
 */
export const RATE_LIMIT_CONFIGS = {
  /** Game creation: 5 games per minute per user */
  gameCreation: {
    maxRequests: 5,
    windowMs: 60 * 1000, // 1 minute
  },
  /** Vote submission: 10 votes per 10 seconds per user */
  voteSubmission: {
    maxRequests: 10,
    windowMs: 10 * 1000, // 10 seconds
  },
  /** Action execution: 5 actions per 10 seconds per user */
  actionExecution: {
    maxRequests: 5,
    windowMs: 10 * 1000, // 10 seconds
  },
  /** General API: 60 requests per minute per user */
  general: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 1 minute
  },
} as const;

/**
 * Rate limiter class that tracks requests per key using sliding window.
 */
export class RateLimiter {
  private entries: Map<string, RateLimitEntry> = new Map();
  private config: RateLimitConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    // Periodically clean up old entries
    this.startCleanup();
  }

  /**
   * Check if a request is allowed for the given key.
   * @param key - Unique identifier for rate limiting (e.g., user ID + endpoint)
   * @returns Rate limit result with status and metadata
   */
  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let entry = this.entries.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.entries.set(key, entry);
    }

    // Filter out timestamps outside the current window
    entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);

    const requestCount = entry.timestamps.length;
    const allowed = requestCount < this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - requestCount - (allowed ? 1 : 0));

    // Calculate reset time based on oldest request in window
    const oldestTimestamp = entry.timestamps[0] || now;
    const resetAt = oldestTimestamp + this.config.windowMs;
    const retryAfterMs = Math.max(0, resetAt - now);

    if (allowed) {
      entry.timestamps.push(now);
    }

    return {
      allowed,
      remaining,
      resetAt,
      retryAfterMs,
    };
  }

  /**
   * Reset the rate limit for a specific key.
   * @param key - The key to reset
   */
  reset(key: string): void {
    this.entries.delete(key);
  }

  /**
   * Clear all rate limit entries.
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * Get current entry count for monitoring.
   */
  getEntryCount(): number {
    return this.entries.size;
  }

  /**
   * Start periodic cleanup of old entries.
   */
  private startCleanup(): void {
    if (this.cleanupInterval) return;
    
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const windowStart = now - this.config.windowMs;

      for (const [key, entry] of this.entries) {
        entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
        if (entry.timestamps.length === 0) {
          this.entries.delete(key);
        }
      }
    }, 60 * 1000);
  }

  /**
   * Stop the cleanup interval (for testing).
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

/**
 * Pre-configured rate limiters for different endpoint types.
 */
export const gameCreationLimiter = new RateLimiter(RATE_LIMIT_CONFIGS.gameCreation);
export const voteSubmissionLimiter = new RateLimiter(RATE_LIMIT_CONFIGS.voteSubmission);
export const actionExecutionLimiter = new RateLimiter(RATE_LIMIT_CONFIGS.actionExecution);
export const generalLimiter = new RateLimiter(RATE_LIMIT_CONFIGS.general);

/**
 * Create a rate limit key for a user + optional endpoint.
 * @param userId - User's unique identifier
 * @param endpoint - Optional endpoint name for more granular limiting
 */
export function createRateLimitKey(userId: string, endpoint?: string): string {
  return endpoint ? `${userId}:${endpoint}` : userId;
}

/**
 * Create a rate limit error response.
 * @param result - The rate limit result
 * @returns Response object with 429 status
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSeconds = Math.ceil(result.retryAfterMs / 1000);
  
  return new Response(
    JSON.stringify({
      error: 'Too many requests. Please try again later.',
      retryAfter: retryAfterSeconds,
      remaining: result.remaining,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
      },
    }
  );
}

/**
 * Check rate limit and return error response if exceeded.
 * @param limiter - The rate limiter to use
 * @param key - The rate limit key
 * @returns null if allowed, Response if rate limited
 */
export function checkRateLimit(
  limiter: RateLimiter,
  key: string
): Response | null {
  const result = limiter.check(key);
  if (!result.allowed) {
    return createRateLimitResponse(result);
  }
  return null;
}
