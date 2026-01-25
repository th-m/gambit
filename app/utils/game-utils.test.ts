/**
 * Tests for game utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  generateGameKey,
  formatJoinLink,
  getMissionSize,
  getRequiredFailVotes,
  checkWinCondition,
  checkAssassinationFailed,
  checkAssassinationSucceeded,
  checkRejectionWin,
  MISSION_SIZES,
} from './game-utils';
import type { Game } from '~/types/game';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-123',
    game_key: 'ABC123',
    host_id: 'user-1',
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

// =============================================================================
// generateGameKey Tests
// =============================================================================

describe('generateGameKey', () => {
  it('generates a key between 6-8 characters', () => {
    for (let i = 0; i < 100; i++) {
      const key = generateGameKey();
      expect(key.length).toBeGreaterThanOrEqual(6);
      expect(key.length).toBeLessThanOrEqual(8);
    }
  });

  it('generates only alphanumeric characters', () => {
    for (let i = 0; i < 100; i++) {
      const key = generateGameKey();
      expect(key).toMatch(/^[A-Z0-9]+$/);
    }
  });

  it('excludes ambiguous characters (I, O, 0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const key = generateGameKey();
      expect(key).not.toMatch(/[IO01]/);
    }
  });

  it('generates different keys on subsequent calls', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      keys.add(generateGameKey());
    }
    // Should have at least 45 unique keys (allowing for very rare collisions)
    expect(keys.size).toBeGreaterThanOrEqual(45);
  });

  it('generates uppercase characters only', () => {
    for (let i = 0; i < 100; i++) {
      const key = generateGameKey();
      expect(key).toBe(key.toUpperCase());
    }
  });
});

// =============================================================================
// formatJoinLink Tests
// =============================================================================

describe('formatJoinLink', () => {
  it('creates URL with game key', () => {
    const link = formatJoinLink('ABC123');
    expect(link).toContain('/join/ABC123');
  });

  it('uses provided base URL', () => {
    const link = formatJoinLink('XYZ789', 'https://gambit.example.com');
    expect(link).toBe('https://gambit.example.com/join/XYZ789');
  });

  it('uses default base URL when not provided', () => {
    const link = formatJoinLink('ABC123');
    expect(link).toContain('/join/ABC123');
  });

  it('handles game keys of different lengths', () => {
    expect(formatJoinLink('ABCDEF', 'https://example.com')).toBe('https://example.com/join/ABCDEF');
    expect(formatJoinLink('ABCDEFGH', 'https://example.com')).toBe('https://example.com/join/ABCDEFGH');
  });

  it('preserves case of game key', () => {
    const link = formatJoinLink('AbC123', 'https://example.com');
    expect(link).toBe('https://example.com/join/AbC123');
  });
});

// =============================================================================
// getMissionSize Tests
// =============================================================================

describe('getMissionSize', () => {
  describe('5 players', () => {
    it.each([
      [1, 2],
      [2, 3],
      [3, 2],
      [4, 3],
      [5, 3],
    ])('round %i returns size %i', (round, expected) => {
      expect(getMissionSize(5, round)).toBe(expected);
    });
  });

  describe('6 players', () => {
    it.each([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 3],
      [5, 4],
    ])('round %i returns size %i', (round, expected) => {
      expect(getMissionSize(6, round)).toBe(expected);
    });
  });

  describe('7 players', () => {
    it.each([
      [1, 2],
      [2, 3],
      [3, 3],
      [4, 4],
      [5, 4],
    ])('round %i returns size %i', (round, expected) => {
      expect(getMissionSize(7, round)).toBe(expected);
    });
  });

  describe('8 players', () => {
    it.each([
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
      [5, 5],
    ])('round %i returns size %i', (round, expected) => {
      expect(getMissionSize(8, round)).toBe(expected);
    });
  });

  describe('9 players', () => {
    it.each([
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
      [5, 5],
    ])('round %i returns size %i', (round, expected) => {
      expect(getMissionSize(9, round)).toBe(expected);
    });
  });

  describe('10 players', () => {
    it.each([
      [1, 3],
      [2, 4],
      [3, 4],
      [4, 5],
      [5, 5],
    ])('round %i returns size %i', (round, expected) => {
      expect(getMissionSize(10, round)).toBe(expected);
    });
  });

  it('returns default size 3 for invalid player count', () => {
    expect(getMissionSize(4, 1)).toBe(3);
    expect(getMissionSize(11, 1)).toBe(3);
  });

  it('returns default size 3 for invalid round', () => {
    expect(getMissionSize(5, 0)).toBe(3);
    expect(getMissionSize(5, 6)).toBe(3);
  });
});

// =============================================================================
// getRequiredFailVotes Tests
// =============================================================================

describe('getRequiredFailVotes', () => {
  it('returns 1 for most rounds', () => {
    expect(getRequiredFailVotes(5, 1)).toBe(1);
    expect(getRequiredFailVotes(5, 2)).toBe(1);
    expect(getRequiredFailVotes(5, 3)).toBe(1);
    expect(getRequiredFailVotes(5, 4)).toBe(1);
    expect(getRequiredFailVotes(5, 5)).toBe(1);
    expect(getRequiredFailVotes(6, 4)).toBe(1);
  });

  it('returns 2 for round 4 with 7+ players', () => {
    expect(getRequiredFailVotes(7, 4)).toBe(2);
    expect(getRequiredFailVotes(8, 4)).toBe(2);
    expect(getRequiredFailVotes(9, 4)).toBe(2);
    expect(getRequiredFailVotes(10, 4)).toBe(2);
  });

  it('returns 1 for round 4 with fewer than 7 players', () => {
    expect(getRequiredFailVotes(5, 4)).toBe(1);
    expect(getRequiredFailVotes(6, 4)).toBe(1);
  });

  it('returns 1 for non-round-4 even with 7+ players', () => {
    expect(getRequiredFailVotes(7, 1)).toBe(1);
    expect(getRequiredFailVotes(8, 2)).toBe(1);
    expect(getRequiredFailVotes(9, 3)).toBe(1);
    expect(getRequiredFailVotes(10, 5)).toBe(1);
  });
});

// =============================================================================
// MISSION_SIZES Constant Tests
// =============================================================================

describe('MISSION_SIZES constant', () => {
  it('has entries for player counts 5-10', () => {
    expect(Object.keys(MISSION_SIZES).map(Number).sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
  });

  it('has entries for rounds 1-5 for each player count', () => {
    for (const playerCount of [5, 6, 7, 8, 9, 10]) {
      expect(Object.keys(MISSION_SIZES[playerCount]).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });
});

// =============================================================================
// checkWinCondition Tests
// =============================================================================

describe('checkWinCondition', () => {
  describe('no winner scenarios', () => {
    it('returns no winner when game just started', () => {
      const game = createTestGame();
      const result = checkWinCondition(game);
      expect(result.hasWinner).toBe(false);
      expect(result.winner).toBeNull();
    });

    it('returns no winner with partial good victories', () => {
      const game = createTestGame({ good_victories: 2 });
      const result = checkWinCondition(game);
      expect(result.hasWinner).toBe(false);
    });

    it('returns no winner with partial evil victories', () => {
      const game = createTestGame({ evil_victories: 2 });
      const result = checkWinCondition(game);
      expect(result.hasWinner).toBe(false);
    });
  });

  describe('evil victory via missions', () => {
    it('returns evil winner with 3 failed missions', () => {
      const game = createTestGame({ evil_victories: 3 });
      const result = checkWinCondition(game);
      expect(result.hasWinner).toBe(true);
      expect(result.winner).toBe('evil');
      expect(result.endReason).toBe('Evil sabotaged 3 missions');
    });

    it('returns evil winner with more than 3 failed missions', () => {
      const game = createTestGame({ evil_victories: 4 });
      const result = checkWinCondition(game);
      expect(result.hasWinner).toBe(true);
      expect(result.winner).toBe('evil');
    });
  });

  describe('good victory via missions', () => {
    it('triggers assassination when good has 3 victories and Assassin alive', () => {
      const game = createTestGame({ good_victories: 3 });
      const result = checkWinCondition(game, true); // assassinAlive = true
      expect(result.hasWinner).toBe(false);
      expect(result.triggerAssassination).toBe(true);
    });

    it('returns good winner when good has 3 victories and no Assassin', () => {
      const game = createTestGame({ good_victories: 3 });
      const result = checkWinCondition(game, false); // assassinAlive = false
      expect(result.hasWinner).toBe(true);
      expect(result.winner).toBe('good');
      expect(result.endReason).toBe('Good completed 3 successful missions');
    });
  });

  describe('game already finished', () => {
    it('returns existing winner for finished game', () => {
      const game = createTestGame({
        status: 'finished',
        winner: 'good',
        end_reason: 'Assassin failed to identify the Seer',
      });
      const result = checkWinCondition(game);
      expect(result.hasWinner).toBe(true);
      expect(result.winner).toBe('good');
      expect(result.endReason).toBe('Assassin failed to identify the Seer');
    });
  });

  describe('priority of win conditions', () => {
    it('evil victory takes priority when both teams have 3+ victories', () => {
      const game = createTestGame({ good_victories: 3, evil_victories: 3 });
      const result = checkWinCondition(game, false);
      expect(result.hasWinner).toBe(true);
      expect(result.winner).toBe('evil');
    });
  });
});

// =============================================================================
// checkAssassinationFailed Tests
// =============================================================================

describe('checkAssassinationFailed', () => {
  it('returns good winner in assassination phase with 3+ good victories', () => {
    const game = createTestGame({ phase: 'assassination', good_victories: 3 });
    const result = checkAssassinationFailed(game);
    expect(result.hasWinner).toBe(true);
    expect(result.winner).toBe('good');
    expect(result.endReason).toBe('Assassin failed to identify the Seer');
  });

  it('returns no winner if not in assassination phase', () => {
    const game = createTestGame({ phase: 'mission_voting', good_victories: 3 });
    const result = checkAssassinationFailed(game);
    expect(result.hasWinner).toBe(false);
  });

  it('returns no winner if good victories less than 3', () => {
    const game = createTestGame({ phase: 'assassination', good_victories: 2 });
    const result = checkAssassinationFailed(game);
    expect(result.hasWinner).toBe(false);
  });
});

// =============================================================================
// checkAssassinationSucceeded Tests
// =============================================================================

describe('checkAssassinationSucceeded', () => {
  it('returns evil winner in assassination phase with 3+ good victories', () => {
    const game = createTestGame({ phase: 'assassination', good_victories: 3 });
    const result = checkAssassinationSucceeded(game);
    expect(result.hasWinner).toBe(true);
    expect(result.winner).toBe('evil');
    expect(result.endReason).toBe('Seer assassinated');
  });

  it('returns no winner if not in assassination phase', () => {
    const game = createTestGame({ phase: 'mission_voting', good_victories: 3 });
    const result = checkAssassinationSucceeded(game);
    expect(result.hasWinner).toBe(false);
  });

  it('returns no winner if good victories less than 3', () => {
    const game = createTestGame({ phase: 'assassination', good_victories: 2 });
    const result = checkAssassinationSucceeded(game);
    expect(result.hasWinner).toBe(false);
  });
});

// =============================================================================
// checkRejectionWin Tests
// =============================================================================

describe('checkRejectionWin', () => {
  it('returns no winner with fewer than 3 rejections', () => {
    const game = createTestGame({ rejection_count: 2 });
    const result = checkRejectionWin(game);
    expect(result.hasWinner).toBe(false);
  });

  it('returns no winner when 3 rejections but evil would have less than 3 victories', () => {
    const game = createTestGame({ rejection_count: 3, evil_victories: 1 });
    const result = checkRejectionWin(game);
    expect(result.hasWinner).toBe(false);
  });

  it('returns evil winner when 3 rejections would give evil 3 victories', () => {
    const game = createTestGame({ rejection_count: 3, evil_victories: 2 });
    const result = checkRejectionWin(game);
    expect(result.hasWinner).toBe(true);
    expect(result.winner).toBe('evil');
    expect(result.endReason).toBe('3 consecutive leader rejections');
  });

  it('returns evil winner when 3 rejections and evil already has 3+ victories', () => {
    const game = createTestGame({ rejection_count: 3, evil_victories: 3 });
    const result = checkRejectionWin(game);
    expect(result.hasWinner).toBe(true);
    expect(result.winner).toBe('evil');
  });
});
