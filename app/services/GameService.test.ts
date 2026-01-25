import { describe, it, expect, beforeEach } from 'vitest';
import { GameService, generateGameKey } from './GameService';

describe('GameService', () => {
  let service: GameService;

  beforeEach(() => {
    service = new GameService();
  });

  // ===========================================================================
  // generateGameKey Tests
  // ===========================================================================

  describe('generateGameKey', () => {
    it('generates keys of length 6-8 characters', () => {
      for (let i = 0; i < 100; i++) {
        const key = generateGameKey();
        expect(key.length).toBeGreaterThanOrEqual(6);
        expect(key.length).toBeLessThanOrEqual(8);
      }
    });

    it('generates keys with only uppercase alphanumeric characters', () => {
      const validChars = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/;
      for (let i = 0; i < 100; i++) {
        const key = generateGameKey();
        expect(key).toMatch(validChars);
      }
    });

    it('excludes ambiguous characters (I, O, 0, 1)', () => {
      for (let i = 0; i < 100; i++) {
        const key = generateGameKey();
        expect(key).not.toContain('I');
        expect(key).not.toContain('O');
        expect(key).not.toContain('0');
        expect(key).not.toContain('1');
      }
    });

    it('generates unique keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(generateGameKey());
      }
      // With 6-8 char keys from 30+ chars, collision in 100 is extremely unlikely
      expect(keys.size).toBeGreaterThanOrEqual(95);
    });
  });

  // ===========================================================================
  // createGame Tests
  // ===========================================================================

  describe('createGame', () => {
    it('creates a game with unique game keys', () => {
      const game1 = service.createGame('host-1');
      const game2 = service.createGame('host-2');
      const game3 = service.createGame('host-3');

      expect(game1.game_key).not.toBe(game2.game_key);
      expect(game2.game_key).not.toBe(game3.game_key);
      expect(game1.game_key).not.toBe(game3.game_key);
    });

    it('sets correct initial state', () => {
      const game = service.createGame('host-1');

      expect(game.id).toBeDefined();
      expect(game.game_key).toBeDefined();
      expect(game.host_id).toBe('host-1');
      expect(game.status).toBe('lobby');
      expect(game.phase).toBeNull();
      expect(game.current_round).toBe(1);
      expect(game.crown_index).toBe(0);
      expect(game.rejection_count).toBe(0);
      expect(game.good_victories).toBe(0);
      expect(game.evil_victories).toBe(0);
      expect(game.selected_team).toBeNull();
      expect(game.winner).toBeNull();
      expect(game.end_reason).toBeNull();
      expect(game.created_at).toBeDefined();
    });

    it('generates valid UUID for game id', () => {
      const game = service.createGame('host-1');
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(game.id).toMatch(uuidPattern);
    });

    it('stores game retrievable by id', () => {
      const game = service.createGame('host-1');
      const retrieved = service.getGameById(game.id);
      expect(retrieved).toEqual(game);
    });

    it('stores game retrievable by game key', () => {
      const game = service.createGame('host-1');
      const retrieved = service.getGameByKey(game.game_key);
      expect(retrieved).toEqual(game);
    });
  });

  // ===========================================================================
  // getGameByKey Tests
  // ===========================================================================

  describe('getGameByKey', () => {
    it('returns correct game for valid key', () => {
      const game = service.createGame('host-1');
      const retrieved = service.getGameByKey(game.game_key);
      
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(game.id);
      expect(retrieved!.host_id).toBe('host-1');
    });

    it('returns null for invalid key', () => {
      service.createGame('host-1');
      const retrieved = service.getGameByKey('INVALID');
      expect(retrieved).toBeNull();
    });

    it('handles case-insensitive lookup', () => {
      const game = service.createGame('host-1');
      const lowerKey = game.game_key.toLowerCase();
      const retrieved = service.getGameByKey(lowerKey);
      expect(retrieved).toEqual(game);
    });

    it('returns null for empty string', () => {
      service.createGame('host-1');
      const retrieved = service.getGameByKey('');
      expect(retrieved).toBeNull();
    });
  });

  // ===========================================================================
  // getGameById Tests
  // ===========================================================================

  describe('getGameById', () => {
    it('returns correct game for valid id', () => {
      const game = service.createGame('host-1');
      const retrieved = service.getGameById(game.id);
      expect(retrieved).toEqual(game);
    });

    it('returns null for invalid id', () => {
      service.createGame('host-1');
      const retrieved = service.getGameById('invalid-id');
      expect(retrieved).toBeNull();
    });
  });

  // ===========================================================================
  // addPlayer Tests
  // ===========================================================================

  describe('addPlayer', () => {
    it('correctly adds player to game', () => {
      const game = service.createGame('host-1');
      const player = service.addPlayer(game.id, 'user-1', 'Alice');

      expect(player.id).toBeDefined();
      expect(player.game_id).toBe(game.id);
      expect(player.user_id).toBe('user-1');
      expect(player.display_name).toBe('Alice');
      expect(player.character).toBeNull();
      expect(player.team).toBeNull();
      expect(player.is_alive).toBe(true);
      expect(player.seat_order).toBeNull();
      expect(player.created_at).toBeDefined();
    });

    it('adds multiple players to same game', () => {
      const game = service.createGame('host-1');
      service.addPlayer(game.id, 'user-1', 'Alice');
      service.addPlayer(game.id, 'user-2', 'Bob');
      service.addPlayer(game.id, 'user-3', 'Charlie');

      const players = service.getPlayers(game.id);
      expect(players).toHaveLength(3);
    });

    it('handles duplicate join gracefully by returning existing player', () => {
      const game = service.createGame('host-1');
      const player1 = service.addPlayer(game.id, 'user-1', 'Alice');
      const player2 = service.addPlayer(game.id, 'user-1', 'Alice Again');

      expect(player2.id).toBe(player1.id);
      expect(player2.display_name).toBe('Alice'); // Original name preserved
      
      const players = service.getPlayers(game.id);
      expect(players).toHaveLength(1);
    });

    it('throws error for non-existent game', () => {
      expect(() => {
        service.addPlayer('non-existent-game', 'user-1', 'Alice');
      }).toThrow('Game not found');
    });

    it('throws error when game has already started', () => {
      const game = service.createGame('host-1');
      service.updateGame(game.id, { status: 'playing' });

      expect(() => {
        service.addPlayer(game.id, 'user-1', 'Alice');
      }).toThrow('Game has already started');
    });

    it('throws error when game is full (10 players)', () => {
      const game = service.createGame('host-1');
      
      // Add 10 players
      for (let i = 0; i < 10; i++) {
        service.addPlayer(game.id, `user-${i}`, `Player ${i}`);
      }

      expect(() => {
        service.addPlayer(game.id, 'user-extra', 'Extra Player');
      }).toThrow('Game is full');
    });

    it('player is retrievable after adding', () => {
      const game = service.createGame('host-1');
      const player = service.addPlayer(game.id, 'user-1', 'Alice');

      const retrieved = service.getPlayer(game.id, 'user-1');
      expect(retrieved).toEqual(player);
    });
  });

  // ===========================================================================
  // getPlayers Tests
  // ===========================================================================

  describe('getPlayers', () => {
    it('returns empty array for game with no players', () => {
      const game = service.createGame('host-1');
      const players = service.getPlayers(game.id);
      expect(players).toEqual([]);
    });

    it('returns all players in a game', () => {
      const game = service.createGame('host-1');
      service.addPlayer(game.id, 'user-1', 'Alice');
      service.addPlayer(game.id, 'user-2', 'Bob');

      const players = service.getPlayers(game.id);
      expect(players).toHaveLength(2);
      expect(players.map(p => p.display_name)).toContain('Alice');
      expect(players.map(p => p.display_name)).toContain('Bob');
    });

    it('sorts players by seat_order', () => {
      const game = service.createGame('host-1');
      const p1 = service.addPlayer(game.id, 'user-1', 'Alice');
      const p2 = service.addPlayer(game.id, 'user-2', 'Bob');
      const p3 = service.addPlayer(game.id, 'user-3', 'Charlie');

      // Assign seat orders in reverse
      service.updatePlayer(p1.id, { seat_order: 2 });
      service.updatePlayer(p2.id, { seat_order: 0 });
      service.updatePlayer(p3.id, { seat_order: 1 });

      const players = service.getPlayers(game.id);
      expect(players[0].display_name).toBe('Bob');
      expect(players[1].display_name).toBe('Charlie');
      expect(players[2].display_name).toBe('Alice');
    });

    it('sorts players with null seat_order to end', () => {
      const game = service.createGame('host-1');
      const p1 = service.addPlayer(game.id, 'user-1', 'Alice');
      const p2 = service.addPlayer(game.id, 'user-2', 'Bob');
      const p3 = service.addPlayer(game.id, 'user-3', 'Charlie');

      service.updatePlayer(p1.id, { seat_order: null });
      service.updatePlayer(p2.id, { seat_order: 0 });
      service.updatePlayer(p3.id, { seat_order: null });

      const players = service.getPlayers(game.id);
      expect(players[0].display_name).toBe('Bob');
      // Null seat_order players are at the end
      expect(players[1].seat_order).toBeNull();
      expect(players[2].seat_order).toBeNull();
    });

    it('returns empty array for non-existent game', () => {
      const players = service.getPlayers('non-existent-game');
      expect(players).toEqual([]);
    });
  });

  // ===========================================================================
  // getPlayer Tests
  // ===========================================================================

  describe('getPlayer', () => {
    it('returns correct player', () => {
      const game = service.createGame('host-1');
      service.addPlayer(game.id, 'user-1', 'Alice');
      service.addPlayer(game.id, 'user-2', 'Bob');

      const player = service.getPlayer(game.id, 'user-2');
      expect(player).not.toBeNull();
      expect(player!.display_name).toBe('Bob');
    });

    it('returns null for non-existent player', () => {
      const game = service.createGame('host-1');
      service.addPlayer(game.id, 'user-1', 'Alice');

      const player = service.getPlayer(game.id, 'user-999');
      expect(player).toBeNull();
    });

    it('returns null for wrong game id', () => {
      const game1 = service.createGame('host-1');
      const game2 = service.createGame('host-2');
      service.addPlayer(game1.id, 'user-1', 'Alice');

      const player = service.getPlayer(game2.id, 'user-1');
      expect(player).toBeNull();
    });
  });

  // ===========================================================================
  // removePlayer Tests
  // ===========================================================================

  describe('removePlayer', () => {
    it('correctly removes player from game', () => {
      const game = service.createGame('host-1');
      service.addPlayer(game.id, 'user-1', 'Alice');
      service.addPlayer(game.id, 'user-2', 'Bob');

      const removed = service.removePlayer(game.id, 'user-1');
      expect(removed).toBe(true);

      const players = service.getPlayers(game.id);
      expect(players).toHaveLength(1);
      expect(players[0].display_name).toBe('Bob');
    });

    it('returns false for non-existent player', () => {
      const game = service.createGame('host-1');
      service.addPlayer(game.id, 'user-1', 'Alice');

      const removed = service.removePlayer(game.id, 'user-999');
      expect(removed).toBe(false);
    });

    it('player not retrievable after removal', () => {
      const game = service.createGame('host-1');
      service.addPlayer(game.id, 'user-1', 'Alice');
      service.removePlayer(game.id, 'user-1');

      const player = service.getPlayer(game.id, 'user-1');
      expect(player).toBeNull();
    });
  });

  // ===========================================================================
  // updateGame Tests
  // ===========================================================================

  describe('updateGame', () => {
    it('returns updated entity', () => {
      const game = service.createGame('host-1');
      const updated = service.updateGame(game.id, {
        status: 'playing',
        phase: 'voting_for_leader',
      });

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('playing');
      expect(updated!.phase).toBe('voting_for_leader');
    });

    it('preserves unchanged fields', () => {
      const game = service.createGame('host-1');
      const updated = service.updateGame(game.id, { status: 'playing' });

      expect(updated!.host_id).toBe('host-1');
      expect(updated!.game_key).toBe(game.game_key);
      expect(updated!.current_round).toBe(1);
    });

    it('returns null for non-existent game', () => {
      const updated = service.updateGame('non-existent', { status: 'playing' });
      expect(updated).toBeNull();
    });

    it('updates are persisted', () => {
      const game = service.createGame('host-1');
      service.updateGame(game.id, { status: 'playing', phase: 'mission_voting' });

      const retrieved = service.getGameById(game.id);
      expect(retrieved!.status).toBe('playing');
      expect(retrieved!.phase).toBe('mission_voting');
    });

    it('updates game_key and indexes correctly', () => {
      const game = service.createGame('host-1');
      const oldKey = game.game_key;
      
      service.updateGame(game.id, { game_key: 'NEWKEY' });

      // Old key should not work
      expect(service.getGameByKey(oldKey)).toBeNull();
      // New key should work
      expect(service.getGameByKey('NEWKEY')).not.toBeNull();
    });

    it('updates multiple fields at once', () => {
      const game = service.createGame('host-1');
      const updated = service.updateGame(game.id, {
        status: 'playing',
        phase: 'selecting_team',
        current_round: 3,
        crown_index: 2,
        rejection_count: 1,
        good_victories: 2,
        evil_victories: 1,
        selected_team: ['p1', 'p2'],
      });

      expect(updated!.status).toBe('playing');
      expect(updated!.phase).toBe('selecting_team');
      expect(updated!.current_round).toBe(3);
      expect(updated!.crown_index).toBe(2);
      expect(updated!.rejection_count).toBe(1);
      expect(updated!.good_victories).toBe(2);
      expect(updated!.evil_victories).toBe(1);
      expect(updated!.selected_team).toEqual(['p1', 'p2']);
    });
  });

  // ===========================================================================
  // updatePlayer Tests
  // ===========================================================================

  describe('updatePlayer', () => {
    it('returns updated entity', () => {
      const game = service.createGame('host-1');
      const player = service.addPlayer(game.id, 'user-1', 'Alice');
      
      const updated = service.updatePlayer(player.id, {
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      expect(updated).not.toBeNull();
      expect(updated!.character).toBe('Seer');
      expect(updated!.team).toBe('good');
      expect(updated!.seat_order).toBe(0);
    });

    it('preserves unchanged fields', () => {
      const game = service.createGame('host-1');
      const player = service.addPlayer(game.id, 'user-1', 'Alice');
      
      const updated = service.updatePlayer(player.id, { character: 'Assassin' });

      expect(updated!.display_name).toBe('Alice');
      expect(updated!.game_id).toBe(game.id);
      expect(updated!.user_id).toBe('user-1');
      expect(updated!.is_alive).toBe(true);
    });

    it('returns null for non-existent player', () => {
      const updated = service.updatePlayer('non-existent', { character: 'Seer' });
      expect(updated).toBeNull();
    });

    it('updates are persisted', () => {
      const game = service.createGame('host-1');
      const player = service.addPlayer(game.id, 'user-1', 'Alice');
      
      service.updatePlayer(player.id, { character: 'Guardian', is_alive: false });

      const retrieved = service.getPlayer(game.id, 'user-1');
      expect(retrieved!.character).toBe('Guardian');
      expect(retrieved!.is_alive).toBe(false);
    });

    it('updates display_name', () => {
      const game = service.createGame('host-1');
      const player = service.addPlayer(game.id, 'user-1', 'Alice');
      
      const updated = service.updatePlayer(player.id, { display_name: 'Alice the Great' });
      expect(updated!.display_name).toBe('Alice the Great');
    });
  });

  // ===========================================================================
  // getPlayerById Tests
  // ===========================================================================

  describe('getPlayerById', () => {
    it('returns correct player', () => {
      const game = service.createGame('host-1');
      const player = service.addPlayer(game.id, 'user-1', 'Alice');

      const retrieved = service.getPlayerById(player.id);
      expect(retrieved).toEqual(player);
    });

    it('returns null for non-existent player', () => {
      const retrieved = service.getPlayerById('non-existent');
      expect(retrieved).toBeNull();
    });
  });

  // ===========================================================================
  // clear Tests
  // ===========================================================================

  describe('clear', () => {
    it('removes all games and players', () => {
      const game1 = service.createGame('host-1');
      const game2 = service.createGame('host-2');
      service.addPlayer(game1.id, 'user-1', 'Alice');
      service.addPlayer(game2.id, 'user-2', 'Bob');

      service.clear();

      expect(service.getGameById(game1.id)).toBeNull();
      expect(service.getGameById(game2.id)).toBeNull();
      expect(service.getGameByKey(game1.game_key)).toBeNull();
      expect(service.getPlayers(game1.id)).toEqual([]);
    });
  });
});
