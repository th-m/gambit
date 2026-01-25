/**
 * GameService - CRUD operations for games and players.
 * Provides in-memory storage for development; can be swapped for Supabase in production.
 */

import type {
  Game,
  Player,
  GameUpdate,
  PlayerUpdate,
} from '~/types/game';

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate a unique game key (6-8 alphanumeric characters).
 */
export function generateGameKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: I, O, 0, 1
  const length = 6 + Math.floor(Math.random() * 3); // 6, 7, or 8 chars
  let key = '';
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

/**
 * Generate a UUID v4.
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// =============================================================================
// GameService Class
// =============================================================================

export class GameService {
  private games: Map<string, Game> = new Map();
  private players: Map<string, Player> = new Map();
  private gameKeyIndex: Map<string, string> = new Map(); // gameKey -> gameId

  /**
   * Create a new game with the given host.
   * @param hostId - User ID of the game creator
   * @returns The created Game object
   */
  createGame(hostId: string): Game {
    const id = generateUUID();
    let gameKey = generateGameKey();
    
    // Ensure uniqueness of game key
    while (this.gameKeyIndex.has(gameKey)) {
      gameKey = generateGameKey();
    }

    const game: Game = {
      id,
      game_key: gameKey,
      host_id: hostId,
      status: 'lobby',
      phase: null,
      current_round: 1,
      crown_index: 0,
      rejection_count: 0,
      good_victories: 0,
      evil_victories: 0,
      selected_team: null,
      winner: null,
      end_reason: null,
      created_at: new Date().toISOString(),
    };

    this.games.set(id, game);
    this.gameKeyIndex.set(gameKey, id);
    return game;
  }

  /**
   * Find a game by its shareable code.
   * @param gameKey - The shareable game code
   * @returns The Game or null if not found
   */
  getGameByKey(gameKey: string): Game | null {
    const gameId = this.gameKeyIndex.get(gameKey.toUpperCase());
    if (!gameId) return null;
    return this.games.get(gameId) ?? null;
  }

  /**
   * Find a game by its UUID.
   * @param gameId - The game UUID
   * @returns The Game or null if not found
   */
  getGameById(gameId: string): Game | null {
    return this.games.get(gameId) ?? null;
  }

  /**
   * Get all players in a game.
   * @param gameId - The game UUID
   * @returns Array of Player objects
   */
  getPlayers(gameId: string): Player[] {
    const players: Player[] = [];
    for (const player of this.players.values()) {
      if (player.game_id === gameId) {
        players.push(player);
      }
    }
    // Sort by seat_order for consistent ordering
    return players.sort((a, b) => {
      if (a.seat_order === null) return 1;
      if (b.seat_order === null) return -1;
      return a.seat_order - b.seat_order;
    });
  }

  /**
   * Get a specific player in a game by their user ID.
   * @param gameId - The game UUID
   * @param userId - The user UUID
   * @returns The Player or null if not found
   */
  getPlayer(gameId: string, userId: string): Player | null {
    for (const player of this.players.values()) {
      if (player.game_id === gameId && player.user_id === userId) {
        return player;
      }
    }
    return null;
  }

  /**
   * Add a player to a game.
   * @param gameId - The game UUID
   * @param userId - The user UUID
   * @param displayName - Display name for the player
   * @returns The created Player object
   * @throws Error if game not found, game not in lobby, or user already in game
   */
  addPlayer(gameId: string, userId: string, displayName: string): Player {
    const game = this.getGameById(gameId);
    if (!game) {
      throw new Error('Game not found');
    }
    
    if (game.status !== 'lobby') {
      throw new Error('Game has already started');
    }

    // Check if user already in game
    const existingPlayer = this.getPlayer(gameId, userId);
    if (existingPlayer) {
      // Return existing player instead of throwing error (graceful handling)
      return existingPlayer;
    }

    // Check player count
    const currentPlayers = this.getPlayers(gameId);
    if (currentPlayers.length >= 10) {
      throw new Error('Game is full');
    }

    const id = generateUUID();
    const player: Player = {
      id,
      game_id: gameId,
      user_id: userId,
      display_name: displayName,
      character: null,
      team: null,
      is_alive: true,
      seat_order: null, // Assigned when game starts
      created_at: new Date().toISOString(),
    };

    this.players.set(id, player);
    return player;
  }

  /**
   * Remove a player from a game.
   * @param gameId - The game UUID
   * @param userId - The user UUID
   * @returns true if player was removed, false if not found
   */
  removePlayer(gameId: string, userId: string): boolean {
    const player = this.getPlayer(gameId, userId);
    if (!player) {
      return false;
    }
    this.players.delete(player.id);
    return true;
  }

  /**
   * Update a game's state.
   * @param gameId - The game UUID
   * @param updates - Partial game updates
   * @returns The updated Game or null if not found
   */
  updateGame(gameId: string, updates: GameUpdate): Game | null {
    const game = this.getGameById(gameId);
    if (!game) {
      return null;
    }

    const updatedGame: Game = {
      ...game,
      ...updates,
    };

    // If game_key changed, update the index
    if (updates.game_key && updates.game_key !== game.game_key) {
      this.gameKeyIndex.delete(game.game_key);
      this.gameKeyIndex.set(updates.game_key, gameId);
    }

    this.games.set(gameId, updatedGame);
    return updatedGame;
  }

  /**
   * Update a player's state.
   * @param playerId - The player UUID
   * @param updates - Partial player updates
   * @returns The updated Player or null if not found
   */
  updatePlayer(playerId: string, updates: PlayerUpdate): Player | null {
    const player = this.players.get(playerId);
    if (!player) {
      return null;
    }

    const updatedPlayer: Player = {
      ...player,
      ...updates,
    };

    this.players.set(playerId, updatedPlayer);
    return updatedPlayer;
  }

  /**
   * Get a player by their player ID.
   * @param playerId - The player UUID
   * @returns The Player or null if not found
   */
  getPlayerById(playerId: string): Player | null {
    return this.players.get(playerId) ?? null;
  }

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.games.clear();
    this.players.clear();
    this.gameKeyIndex.clear();
  }
}

// Export singleton instance for production use
export const gameService = new GameService();
