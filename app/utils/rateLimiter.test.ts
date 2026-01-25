import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RateLimiter,
  RATE_LIMIT_CONFIGS,
  createRateLimitKey,
  createRateLimitResponse,
  checkRateLimit,
  gameCreationLimiter,
  voteSubmissionLimiter,
  actionExecutionLimiter,
} from './rateLimiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
  });

  afterEach(() => {
    limiter.stopCleanup();
    vi.useRealTimers();
  });

  describe('check', () => {
    it('allows requests within the limit', () => {
      const result1 = limiter.check('user1');
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = limiter.check('user1');
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = limiter.check('user1');
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('blocks requests exceeding the limit', () => {
      // Use up the limit
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');

      // Fourth request should be blocked
      const result = limiter.check('user1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('tracks different keys independently', () => {
      // User 1 uses up their limit
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');

      // User 2 should still be allowed
      const result = limiter.check('user2');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('resets after the window expires', () => {
      // Use up the limit
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');

      // Blocked initially
      expect(limiter.check('user1').allowed).toBe(false);

      // Advance time past the window
      vi.advanceTimersByTime(1001);

      // Should be allowed again
      const result = limiter.check('user1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('uses sliding window (partial expiration)', () => {
      // Make 3 requests
      limiter.check('user1'); // t=0
      vi.advanceTimersByTime(500);
      limiter.check('user1'); // t=500
      limiter.check('user1'); // t=500

      // Blocked now
      expect(limiter.check('user1').allowed).toBe(false);

      // Advance time so first request expires
      vi.advanceTimersByTime(501); // t=1001

      // Should have room for 1 more request
      const result = limiter.check('user1');
      expect(result.allowed).toBe(true);
    });

    it('calculates retryAfterMs correctly', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');

      const result = limiter.check('user1');
      expect(result.allowed).toBe(false);
      // retryAfterMs should be approximately 1000ms (the window duration)
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(1000);
    });

    it('provides resetAt timestamp', () => {
      const now = Date.now();
      limiter.check('user1');

      const result = limiter.check('user1');
      // resetAt should be about 1000ms from the first request
      expect(result.resetAt).toBeGreaterThanOrEqual(now);
      expect(result.resetAt).toBeLessThanOrEqual(now + 1000);
    });
  });

  describe('reset', () => {
    it('clears rate limit for a specific key', () => {
      limiter.check('user1');
      limiter.check('user1');
      limiter.check('user1');
      expect(limiter.check('user1').allowed).toBe(false);

      limiter.reset('user1');

      const result = limiter.check('user1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('does not affect other keys', () => {
      limiter.check('user1');
      limiter.check('user2');

      limiter.reset('user1');

      // user2 should still have their request recorded
      const result = limiter.check('user2');
      expect(result.remaining).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all entries', () => {
      limiter.check('user1');
      limiter.check('user2');
      limiter.check('user3');

      limiter.clear();

      expect(limiter.getEntryCount()).toBe(0);
    });
  });

  describe('getEntryCount', () => {
    it('returns the number of tracked keys', () => {
      expect(limiter.getEntryCount()).toBe(0);

      limiter.check('user1');
      expect(limiter.getEntryCount()).toBe(1);

      limiter.check('user2');
      expect(limiter.getEntryCount()).toBe(2);
    });
  });
});

describe('RATE_LIMIT_CONFIGS', () => {
  it('has game creation config', () => {
    expect(RATE_LIMIT_CONFIGS.gameCreation).toEqual({
      maxRequests: 5,
      windowMs: 60000,
    });
  });

  it('has vote submission config', () => {
    expect(RATE_LIMIT_CONFIGS.voteSubmission).toEqual({
      maxRequests: 10,
      windowMs: 10000,
    });
  });

  it('has action execution config', () => {
    expect(RATE_LIMIT_CONFIGS.actionExecution).toEqual({
      maxRequests: 5,
      windowMs: 10000,
    });
  });

  it('has general config', () => {
    expect(RATE_LIMIT_CONFIGS.general).toEqual({
      maxRequests: 60,
      windowMs: 60000,
    });
  });
});

describe('createRateLimitKey', () => {
  it('creates key with user ID only', () => {
    expect(createRateLimitKey('user123')).toBe('user123');
  });

  it('creates key with user ID and endpoint', () => {
    expect(createRateLimitKey('user123', 'create')).toBe('user123:create');
  });

  it('handles empty endpoint as undefined', () => {
    expect(createRateLimitKey('user123', undefined)).toBe('user123');
  });
});

describe('createRateLimitResponse', () => {
  it('creates 429 response', async () => {
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 5000,
      retryAfterMs: 5000,
    };

    const response = createRateLimitResponse(result);

    expect(response.status).toBe(429);
    expect(response.headers.get('Content-Type')).toBe('application/json');
    expect(response.headers.get('Retry-After')).toBe('5');
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('includes error message in body', async () => {
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 3000,
      retryAfterMs: 3000,
    };

    const response = createRateLimitResponse(result);
    const body = await response.json();

    expect(body.error).toBe('Too many requests. Please try again later.');
    expect(body.retryAfter).toBe(3);
    expect(body.remaining).toBe(0);
  });

  it('rounds retryAfter up to nearest second', async () => {
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1500,
      retryAfterMs: 1500,
    };

    const response = createRateLimitResponse(result);
    expect(response.headers.get('Retry-After')).toBe('2');
  });
});

describe('checkRateLimit', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000 });
  });

  afterEach(() => {
    limiter.stopCleanup();
    vi.useRealTimers();
  });

  it('returns null when request is allowed', () => {
    const response = checkRateLimit(limiter, 'user1');
    expect(response).toBeNull();
  });

  it('returns Response when rate limited', () => {
    limiter.check('user1');
    limiter.check('user1');

    const response = checkRateLimit(limiter, 'user1');
    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
  });
});

describe('Pre-configured limiters', () => {
  beforeEach(() => {
    // Clear state between tests
    gameCreationLimiter.clear();
    voteSubmissionLimiter.clear();
    actionExecutionLimiter.clear();
  });

  it('gameCreationLimiter allows 5 requests per minute', () => {
    for (let i = 0; i < 5; i++) {
      expect(gameCreationLimiter.check('user1').allowed).toBe(true);
    }
    expect(gameCreationLimiter.check('user1').allowed).toBe(false);
  });

  it('voteSubmissionLimiter allows 10 requests per 10 seconds', () => {
    for (let i = 0; i < 10; i++) {
      expect(voteSubmissionLimiter.check('user1').allowed).toBe(true);
    }
    expect(voteSubmissionLimiter.check('user1').allowed).toBe(false);
  });

  it('actionExecutionLimiter allows 5 requests per 10 seconds', () => {
    for (let i = 0; i < 5; i++) {
      expect(actionExecutionLimiter.check('user1').allowed).toBe(true);
    }
    expect(actionExecutionLimiter.check('user1').allowed).toBe(false);
  });
});

describe('Edge cases', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    limiter = new RateLimiter({ maxRequests: 1, windowMs: 100 });
  });

  afterEach(() => {
    limiter.stopCleanup();
    vi.useRealTimers();
  });

  it('handles very short windows', () => {
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user1').allowed).toBe(false);

    vi.advanceTimersByTime(101);
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('handles rapid sequential requests', () => {
    const limiter2 = new RateLimiter({ maxRequests: 100, windowMs: 10000 });

    for (let i = 0; i < 100; i++) {
      expect(limiter2.check('user1').allowed).toBe(true);
    }
    expect(limiter2.check('user1').allowed).toBe(false);

    limiter2.stopCleanup();
  });

  it('handles non-existent key reset gracefully', () => {
    expect(() => limiter.reset('nonexistent')).not.toThrow();
  });

  it('handles empty string key', () => {
    const result = limiter.check('');
    expect(result.allowed).toBe(true);
  });
});
