/**
 * Unit tests for Character Assignment utility
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TEAM_COUNTS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  REQUIRED_GOOD,
  REQUIRED_EVIL,
  shuffleArray,
  selectCharacters,
  isValidPlayerCount,
  getTeamCounts,
  assignCharacters,
  type CharacterAssignmentResult,
} from './characterAssignment';
import type { Player, CharacterName, Team } from '../types/game';
import { GOOD_CHARACTERS, EVIL_CHARACTERS, CHARACTER_NAMES } from '../types/game';

/**
 * Helper to create a test player
 */
function createTestPlayer(id: string, gameId: string = 'game-1'): Player {
  return {
    id,
    game_id: gameId,
    user_id: `user-${id}`,
    display_name: `Player ${id}`,
    character: null,
    team: null,
    is_alive: true,
    seat_order: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Helper to create N test players
 */
function createTestPlayers(count: number, gameId: string = 'game-1'): Player[] {
  return Array.from({ length: count }, (_, i) => createTestPlayer(`p${i + 1}`, gameId));
}

describe('characterAssignment', () => {
  describe('TEAM_COUNTS constant', () => {
    it('should have entries for all valid player counts (5-10)', () => {
      for (let count = 5; count <= 10; count++) {
        expect(TEAM_COUNTS[count]).toBeDefined();
        expect(TEAM_COUNTS[count].good).toBeGreaterThan(0);
        expect(TEAM_COUNTS[count].evil).toBeGreaterThan(0);
      }
    });

    it('should have correct team balance for 5 players (3 good, 2 evil)', () => {
      expect(TEAM_COUNTS[5]).toEqual({ good: 3, evil: 2 });
    });

    it('should have correct team balance for 6 players (4 good, 2 evil)', () => {
      expect(TEAM_COUNTS[6]).toEqual({ good: 4, evil: 2 });
    });

    it('should have correct team balance for 7 players (4 good, 3 evil)', () => {
      expect(TEAM_COUNTS[7]).toEqual({ good: 4, evil: 3 });
    });

    it('should have correct team balance for 8 players (5 good, 3 evil)', () => {
      expect(TEAM_COUNTS[8]).toEqual({ good: 5, evil: 3 });
    });

    it('should have correct team balance for 9 players (6 good, 3 evil)', () => {
      expect(TEAM_COUNTS[9]).toEqual({ good: 6, evil: 3 });
    });

    it('should have correct team balance for 10 players (6 good, 4 evil)', () => {
      expect(TEAM_COUNTS[10]).toEqual({ good: 6, evil: 4 });
    });

    it('should have good + evil equal player count for all entries', () => {
      for (let count = 5; count <= 10; count++) {
        const { good, evil } = TEAM_COUNTS[count];
        expect(good + evil).toBe(count);
      }
    });
  });

  describe('shuffleArray', () => {
    it('should return array of same length', () => {
      const input = [1, 2, 3, 4, 5];
      const result = shuffleArray(input);
      expect(result.length).toBe(input.length);
    });

    it('should contain all original elements', () => {
      const input = ['a', 'b', 'c', 'd', 'e'];
      const result = shuffleArray(input);
      expect(result.sort()).toEqual(input.sort());
    });

    it('should not modify original array', () => {
      const input = [1, 2, 3, 4, 5];
      const inputCopy = [...input];
      shuffleArray(input);
      expect(input).toEqual(inputCopy);
    });

    it('should produce different results over multiple calls (statistical test)', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = new Set<string>();

      // Run 50 shuffles and count unique results
      for (let i = 0; i < 50; i++) {
        results.add(JSON.stringify(shuffleArray(input)));
      }

      // With 10 elements, probability of getting same result twice is ~1/3.6M
      // So we should have many unique results
      expect(results.size).toBeGreaterThan(40);
    });

    it('should handle empty array', () => {
      const result = shuffleArray([]);
      expect(result).toEqual([]);
    });

    it('should handle single element array', () => {
      const result = shuffleArray([42]);
      expect(result).toEqual([42]);
    });
  });

  describe('selectCharacters', () => {
    it('should include required character in selection', () => {
      const result = selectCharacters(3, 'Seer', GOOD_CHARACTERS);
      expect(result).toContain('Seer');
    });

    it('should return correct count of characters', () => {
      const result = selectCharacters(4, 'Seer', GOOD_CHARACTERS);
      expect(result.length).toBe(4);
    });

    it('should return empty array for count of 0', () => {
      const result = selectCharacters(0, 'Seer', GOOD_CHARACTERS);
      expect(result).toEqual([]);
    });

    it('should return only required character for count of 1', () => {
      const result = selectCharacters(1, 'Assassin', EVIL_CHARACTERS);
      expect(result).toEqual(['Assassin']);
    });

    it('should only include characters from available list', () => {
      const result = selectCharacters(5, 'Seer', GOOD_CHARACTERS);
      for (const char of result) {
        expect(GOOD_CHARACTERS).toContain(char);
      }
    });

    it('should produce different selections over multiple calls (statistical test)', () => {
      const results = new Set<string>();

      for (let i = 0; i < 30; i++) {
        const selection = selectCharacters(4, 'Seer', GOOD_CHARACTERS);
        results.add(JSON.stringify(selection.sort()));
      }

      // Should have multiple unique combinations
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe('isValidPlayerCount', () => {
    it('should return true for minimum player count (5)', () => {
      expect(isValidPlayerCount(5)).toBe(true);
    });

    it('should return true for maximum player count (10)', () => {
      expect(isValidPlayerCount(10)).toBe(true);
    });

    it('should return true for all valid counts (5-10)', () => {
      for (let count = 5; count <= 10; count++) {
        expect(isValidPlayerCount(count)).toBe(true);
      }
    });

    it('should return false for count below minimum (4)', () => {
      expect(isValidPlayerCount(4)).toBe(false);
    });

    it('should return false for count above maximum (11)', () => {
      expect(isValidPlayerCount(11)).toBe(false);
    });

    it('should return false for 0 players', () => {
      expect(isValidPlayerCount(0)).toBe(false);
    });

    it('should return false for negative player count', () => {
      expect(isValidPlayerCount(-1)).toBe(false);
    });
  });

  describe('getTeamCounts', () => {
    it('should return correct counts for valid player counts', () => {
      expect(getTeamCounts(5)).toEqual({ good: 3, evil: 2 });
      expect(getTeamCounts(6)).toEqual({ good: 4, evil: 2 });
      expect(getTeamCounts(7)).toEqual({ good: 4, evil: 3 });
      expect(getTeamCounts(8)).toEqual({ good: 5, evil: 3 });
      expect(getTeamCounts(9)).toEqual({ good: 6, evil: 3 });
      expect(getTeamCounts(10)).toEqual({ good: 6, evil: 4 });
    });

    it('should return null for invalid player count', () => {
      expect(getTeamCounts(4)).toBeNull();
      expect(getTeamCounts(11)).toBeNull();
      expect(getTeamCounts(0)).toBeNull();
    });
  });

  describe('assignCharacters', () => {
    describe('player count validation', () => {
      it('should throw error for fewer than 5 players', () => {
        const players = createTestPlayers(4);
        expect(() => assignCharacters(players)).toThrow(
          'Invalid player count: 4. Must be between 5 and 10.'
        );
      });

      it('should throw error for more than 10 players', () => {
        const players = createTestPlayers(11);
        expect(() => assignCharacters(players)).toThrow(
          'Invalid player count: 11. Must be between 5 and 10.'
        );
      });

      it('should throw error for empty players array', () => {
        expect(() => assignCharacters([])).toThrow(
          'Invalid player count: 0. Must be between 5 and 10.'
        );
      });

      it('should succeed for valid player counts (5-10)', () => {
        for (let count = 5; count <= 10; count++) {
          const players = createTestPlayers(count);
          expect(() => assignCharacters(players)).not.toThrow();
        }
      });
    });

    describe('team balance', () => {
      it.each([
        [5, 3, 2],
        [6, 4, 2],
        [7, 4, 3],
        [8, 5, 3],
        [9, 6, 3],
        [10, 6, 4],
      ])('should assign correct team balance for %i players (%i good, %i evil)', (playerCount, expectedGood, expectedEvil) => {
        const players = createTestPlayers(playerCount);
        const result = assignCharacters(players);

        let goodCount = 0;
        let evilCount = 0;

        for (const { update } of result.playerUpdates) {
          if (update.team === 'good') goodCount++;
          if (update.team === 'evil') evilCount++;
        }

        expect(goodCount).toBe(expectedGood);
        expect(evilCount).toBe(expectedEvil);
      });
    });

    describe('required characters', () => {
      it('should always assign Seer (good)', () => {
        // Run multiple times to ensure Seer is always assigned
        for (let i = 0; i < 10; i++) {
          const players = createTestPlayers(5);
          const result = assignCharacters(players);

          const characters = result.playerUpdates.map((p) => p.update.character);
          expect(characters).toContain('Seer');
        }
      });

      it('should always assign Assassin (evil)', () => {
        // Run multiple times to ensure Assassin is always assigned
        for (let i = 0; i < 10; i++) {
          const players = createTestPlayers(5);
          const result = assignCharacters(players);

          const characters = result.playerUpdates.map((p) => p.update.character);
          expect(characters).toContain('Assassin');
        }
      });

      it('should assign Seer to good team', () => {
        const players = createTestPlayers(5);
        const result = assignCharacters(players);

        const seerUpdate = result.playerUpdates.find((p) => p.update.character === 'Seer');
        expect(seerUpdate).toBeDefined();
        expect(seerUpdate!.update.team).toBe('good');
      });

      it('should assign Assassin to evil team', () => {
        const players = createTestPlayers(5);
        const result = assignCharacters(players);

        const assassinUpdate = result.playerUpdates.find((p) => p.update.character === 'Assassin');
        expect(assassinUpdate).toBeDefined();
        expect(assassinUpdate!.update.team).toBe('evil');
      });
    });

    describe('unique characters', () => {
      it('should assign unique characters to all players', () => {
        for (let count = 5; count <= 10; count++) {
          const players = createTestPlayers(count);
          const result = assignCharacters(players);

          const characters = result.playerUpdates.map((p) => p.update.character);
          const uniqueCharacters = new Set(characters);

          expect(uniqueCharacters.size).toBe(count);
        }
      });

      it('should only assign valid character names', () => {
        const players = createTestPlayers(10); // Max players to test all characters
        const result = assignCharacters(players);

        for (const { update } of result.playerUpdates) {
          expect(CHARACTER_NAMES).toContain(update.character);
        }
      });

      it('should assign good characters from GOOD_CHARACTERS', () => {
        const players = createTestPlayers(10);
        const result = assignCharacters(players);

        for (const { update } of result.playerUpdates) {
          if (update.team === 'good') {
            expect(GOOD_CHARACTERS).toContain(update.character);
          }
        }
      });

      it('should assign evil characters from EVIL_CHARACTERS', () => {
        const players = createTestPlayers(10);
        const result = assignCharacters(players);

        for (const { update } of result.playerUpdates) {
          if (update.team === 'evil') {
            expect(EVIL_CHARACTERS).toContain(update.character);
          }
        }
      });
    });

    describe('seat order', () => {
      it('should assign seat_order from 0 to N-1', () => {
        const players = createTestPlayers(7);
        const result = assignCharacters(players);

        const seatOrders = result.playerUpdates.map((p) => p.update.seat_order).sort((a, b) => a! - b!);
        expect(seatOrders).toEqual([0, 1, 2, 3, 4, 5, 6]);
      });

      it('should assign unique seat_order to each player', () => {
        const players = createTestPlayers(10);
        const result = assignCharacters(players);

        const seatOrders = result.playerUpdates.map((p) => p.update.seat_order);
        const uniqueSeatOrders = new Set(seatOrders);

        expect(uniqueSeatOrders.size).toBe(10);
      });

      it('should match player updates count to input players count', () => {
        for (let count = 5; count <= 10; count++) {
          const players = createTestPlayers(count);
          const result = assignCharacters(players);

          expect(result.playerUpdates.length).toBe(count);
        }
      });
    });

    describe('crown index', () => {
      it('should assign crown_index between 0 and N-1', () => {
        const players = createTestPlayers(6);
        const result = assignCharacters(players);

        expect(result.crownIndex).toBeGreaterThanOrEqual(0);
        expect(result.crownIndex).toBeLessThan(6);
      });

      it('should produce varying crown_index values (statistical test)', () => {
        const crownIndexes = new Set<number>();
        const players = createTestPlayers(10);

        // Run many times to collect different crown indexes
        for (let i = 0; i < 50; i++) {
          const result = assignCharacters(players);
          crownIndexes.add(result.crownIndex);
        }

        // Should hit multiple different indexes
        expect(crownIndexes.size).toBeGreaterThan(1);
      });
    });

    describe('randomization', () => {
      it('should produce different character assignments (statistical test)', () => {
        const results = new Set<string>();
        const players = createTestPlayers(5);

        for (let i = 0; i < 30; i++) {
          const result = assignCharacters(players);
          // Create a signature of player->character mapping
          const signature = result.playerUpdates
            .map((p) => `${p.playerId}:${p.update.character}`)
            .sort()
            .join(',');
          results.add(signature);
        }

        // Should have multiple unique assignments
        expect(results.size).toBeGreaterThan(1);
      });

      it('should produce different seat orders (statistical test)', () => {
        const results = new Set<string>();
        const players = createTestPlayers(5);

        for (let i = 0; i < 30; i++) {
          const result = assignCharacters(players);
          // Create a signature of player->seat_order mapping
          const signature = result.playerUpdates
            .map((p) => `${p.playerId}:${p.update.seat_order}`)
            .sort()
            .join(',');
          results.add(signature);
        }

        // Should have multiple unique seat orders
        expect(results.size).toBeGreaterThan(1);
      });

      it('should return all original player IDs in updates', () => {
        const players = createTestPlayers(7);
        const playerIds = players.map((p) => p.id);
        const result = assignCharacters(players);

        const returnedIds = result.playerUpdates.map((p) => p.playerId).sort();
        expect(returnedIds).toEqual(playerIds.sort());
      });
    });

    describe('PlayerUpdate structure', () => {
      it('should return updates with character, team, and seat_order fields', () => {
        const players = createTestPlayers(5);
        const result = assignCharacters(players);

        for (const { update } of result.playerUpdates) {
          expect(update.character).toBeDefined();
          expect(update.team).toBeDefined();
          expect(update.seat_order).toBeDefined();
          expect(typeof update.character).toBe('string');
          expect(['good', 'evil']).toContain(update.team);
          expect(typeof update.seat_order).toBe('number');
        }
      });
    });
  });

  describe('constants', () => {
    it('should export MIN_PLAYERS as 5', () => {
      expect(MIN_PLAYERS).toBe(5);
    });

    it('should export MAX_PLAYERS as 10', () => {
      expect(MAX_PLAYERS).toBe(10);
    });

    it('should export REQUIRED_GOOD as Seer', () => {
      expect(REQUIRED_GOOD).toBe('Seer');
    });

    it('should export REQUIRED_EVIL as Assassin', () => {
      expect(REQUIRED_EVIL).toBe('Assassin');
    });
  });
});
