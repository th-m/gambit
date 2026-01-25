/**
 * Character Assignment Utility
 *
 * Handles assigning characters to players when a game starts.
 * Ensures correct team balance, required characters, and randomization.
 */

import type { CharacterName, Player, PlayerUpdate, Team } from '../types/game';
import { GOOD_CHARACTERS, EVIL_CHARACTERS } from '../types/game';

/**
 * Team composition by player count.
 * Format: { good, evil }
 */
export const TEAM_COUNTS: Record<number, { good: number; evil: number }> = {
  5: { good: 3, evil: 2 },
  6: { good: 4, evil: 2 },
  7: { good: 4, evil: 3 },
  8: { good: 5, evil: 3 },
  9: { good: 6, evil: 3 },
  10: { good: 6, evil: 4 },
};

/**
 * Minimum and maximum player counts for a valid game.
 */
export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

/**
 * Required characters that must always be assigned.
 */
export const REQUIRED_GOOD: CharacterName = 'Seer';
export const REQUIRED_EVIL: CharacterName = 'Assassin';

/**
 * Result of character assignment containing player updates and crown index.
 */
export interface CharacterAssignmentResult {
  /** Player updates with character, team, and seat_order assigned */
  playerUpdates: { playerId: string; update: PlayerUpdate }[];
  /** Randomly selected initial leader index */
  crownIndex: number;
}

/**
 * Fisher-Yates shuffle algorithm for randomizing arrays.
 * Creates a new shuffled array without modifying the original.
 *
 * @param array - Array to shuffle
 * @returns New shuffled array
 */
export function shuffleArray<T>(array: readonly T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Select characters for a team.
 * Ensures required character is included, then fills with random others.
 *
 * @param count - Number of characters needed
 * @param required - Required character that must be included
 * @param available - All available characters for this team
 * @returns Array of selected character names
 */
export function selectCharacters(
  count: number,
  required: CharacterName,
  available: readonly CharacterName[]
): CharacterName[] {
  if (count <= 0) {
    return [];
  }

  // Start with the required character
  const selected: CharacterName[] = [required];

  // Get optional characters (excluding required)
  const optional = available.filter((char) => char !== required);

  // Shuffle optional characters and take what we need
  const shuffled = shuffleArray(optional);
  const needed = count - 1; // We already have the required character

  for (let i = 0; i < needed && i < shuffled.length; i++) {
    selected.push(shuffled[i]);
  }

  // Shuffle the final selection so required isn't always first
  return shuffleArray(selected);
}

/**
 * Validate player count for game start.
 *
 * @param playerCount - Number of players
 * @returns True if player count is valid (5-10)
 */
export function isValidPlayerCount(playerCount: number): boolean {
  return playerCount >= MIN_PLAYERS && playerCount <= MAX_PLAYERS;
}

/**
 * Get team counts for a given player count.
 *
 * @param playerCount - Number of players (5-10)
 * @returns Object with good and evil counts, or null if invalid
 */
export function getTeamCounts(playerCount: number): { good: number; evil: number } | null {
  return TEAM_COUNTS[playerCount] ?? null;
}

/**
 * Assign characters to players when starting a game.
 *
 * This function:
 * 1. Validates player count (5-10)
 * 2. Determines team composition based on player count
 * 3. Always includes Seer (good) and Assassin (evil)
 * 4. Randomly selects remaining characters from each team
 * 5. Shuffles players to assign random seat_order (0 to N-1)
 * 6. Randomly assigns crown_index for initial leader
 *
 * @param players - Array of players to assign characters to
 * @returns CharacterAssignmentResult with player updates and crown index
 * @throws Error if player count is invalid
 */
export function assignCharacters(players: Player[]): CharacterAssignmentResult {
  const playerCount = players.length;

  // Validate player count
  if (!isValidPlayerCount(playerCount)) {
    throw new Error(
      `Invalid player count: ${playerCount}. Must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}.`
    );
  }

  // Get team composition
  const teamCounts = getTeamCounts(playerCount)!;

  // Select characters for each team
  const goodCharacters = selectCharacters(
    teamCounts.good,
    REQUIRED_GOOD,
    GOOD_CHARACTERS
  );
  const evilCharacters = selectCharacters(
    teamCounts.evil,
    REQUIRED_EVIL,
    EVIL_CHARACTERS
  );

  // Combine all selected characters
  const allCharacters = [...goodCharacters, ...evilCharacters];

  // Shuffle characters for random assignment
  const shuffledCharacters = shuffleArray(allCharacters);

  // Shuffle players for random seat order
  const shuffledPlayerIds = shuffleArray(players.map((p) => p.id));

  // Create player updates with character, team, and seat_order
  const playerUpdates: { playerId: string; update: PlayerUpdate }[] = [];

  for (let i = 0; i < shuffledPlayerIds.length; i++) {
    const playerId = shuffledPlayerIds[i];
    const character = shuffledCharacters[i];
    const team: Team = goodCharacters.includes(character) ? 'good' : 'evil';

    playerUpdates.push({
      playerId,
      update: {
        character,
        team,
        seat_order: i,
      },
    });
  }

  // Randomly assign crown_index (0 to N-1)
  const crownIndex = Math.floor(Math.random() * playerCount);

  return {
    playerUpdates,
    crownIndex,
  };
}
