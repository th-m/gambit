/**
 * Data Privacy Utilities
 *
 * Provides functions to filter sensitive game data based on the requesting player's role.
 * Ensures that character/team info is only visible to players who should see it.
 */

import type { Player, Game, CharacterName, Team, GameAction, EffectId } from '~/types/game';
import { characterRegistry } from '~/registry/CharacterRegistry';

// =============================================================================
// Types
// =============================================================================

/**
 * Public player data with sensitive fields potentially hidden.
 * When character/team is null, it means the data is hidden from the viewer.
 */
export interface PublicPlayer {
  id: string;
  game_id: string;
  user_id: string;
  display_name: string;
  character: CharacterName | null;
  team: Team | null;
  is_alive: boolean;
  seat_order: number | null;
  created_at: string;
}

/**
 * Options for filtering player data.
 */
export interface FilterOptions {
  /** The game being played */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** The player requesting the data (viewer) */
  viewingPlayer: Player | null;
}

/**
 * Result of filtering player data for a specific viewer.
 */
export interface FilteredPlayersResult {
  /** Players with appropriate data hidden */
  players: PublicPlayer[];
  /** IDs of players whose team is known to the viewer (for special abilities) */
  knownEvilPlayerIds: string[];
  /** IDs of players who appear as Seer candidates (for Oracle) */
  seerCandidateIds: string[];
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a player has a specific effect.
 */
function playerHasEffect(player: Player, effectId: EffectId): boolean {
  if (!player.character) return false;
  const character = characterRegistry.get(player.character);
  return character?.effects?.includes(effectId) ?? false;
}

/**
 * Get evil players visible to a Seer (excludes Saboteur with appears_as_good).
 */
function getVisibleEvilPlayers(players: Player[]): Player[] {
  return players.filter((p) => {
    if (p.team !== 'evil') return false;
    // Saboteur has appears_as_good effect, so Seer can't see them
    if (playerHasEffect(p, 'appears_as_good')) return false;
    return true;
  });
}

/**
 * Get Seer candidates for Oracle (includes Phantom with appears_as_seer).
 */
function getSeerCandidates(players: Player[]): Player[] {
  return players.filter((p) => {
    // The actual Seer
    if (p.character === 'Seer') return true;
    // Phantom has appears_as_seer effect
    if (playerHasEffect(p, 'appears_as_seer')) return true;
    return false;
  });
}

/**
 * Get all evil players in the game.
 */
function getEvilPlayers(players: Player[]): Player[] {
  return players.filter((p) => p.team === 'evil');
}

// =============================================================================
// Main Filtering Functions
// =============================================================================

/**
 * Filter player data based on who is viewing it.
 *
 * Rules:
 * - Players always see their own character/team
 * - During lobby (before game starts), no one sees character/team
 * - Seer sees which players are evil (except Saboteur)
 * - Oracle sees Seer candidates (including Phantom)
 * - Evil team members see each other
 * - Other players don't see character/team of others
 */
export function filterPlayersForViewer(options: FilterOptions): FilteredPlayersResult {
  const { game, players, viewingPlayer } = options;

  // If no viewing player, hide all sensitive data
  if (!viewingPlayer) {
    return {
      players: players.map((p) => ({
        ...p,
        character: null,
        team: null,
      })),
      knownEvilPlayerIds: [],
      seerCandidateIds: [],
    };
  }

  // During lobby, no character/team info is assigned yet
  if (game.status === 'lobby') {
    return {
      players: players.map((p) => ({
        ...p,
        // character and team should already be null in lobby
      })),
      knownEvilPlayerIds: [],
      seerCandidateIds: [],
    };
  }

  // Determine what extra info the viewing player can see
  const knownEvilPlayerIds: string[] = [];
  const seerCandidateIds: string[] = [];

  // Seer: knows evil players (except Saboteur)
  if (viewingPlayer.character === 'Seer') {
    const visibleEvil = getVisibleEvilPlayers(players);
    knownEvilPlayerIds.push(...visibleEvil.map((p) => p.id));
  }

  // Oracle: knows Seer candidates (including Phantom)
  if (viewingPlayer.character === 'Oracle') {
    const candidates = getSeerCandidates(players);
    seerCandidateIds.push(...candidates.map((p) => p.id));
  }

  // Evil team members: know each other
  if (viewingPlayer.team === 'evil') {
    const evilPlayers = getEvilPlayers(players);
    knownEvilPlayerIds.push(...evilPlayers.map((p) => p.id));
  }

  // Filter each player's data
  const filteredPlayers = players.map((player): PublicPlayer => {
    // Always show your own info
    if (player.id === viewingPlayer.id) {
      return { ...player };
    }

    // Check if viewer has special knowledge of this player
    const knowsTeam =
      knownEvilPlayerIds.includes(player.id) || seerCandidateIds.includes(player.id);

    // For players with special knowledge, show team but not character
    // (Seer knows who is evil, not their specific character)
    if (knowsTeam && knownEvilPlayerIds.includes(player.id)) {
      return {
        ...player,
        character: null, // Don't reveal specific character
        team: 'evil', // But reveal they are evil
      };
    }

    if (seerCandidateIds.includes(player.id)) {
      return {
        ...player,
        character: null, // Don't reveal if they're real Seer or Phantom
        team: null, // Don't reveal team
      };
    }

    // Default: hide character and team from other players
    return {
      ...player,
      character: null,
      team: null,
    };
  });

  return {
    players: filteredPlayers,
    knownEvilPlayerIds,
    seerCandidateIds,
  };
}

/**
 * Filter a single player's data for a viewer.
 */
export function filterPlayerForViewer(
  player: Player,
  viewingPlayer: Player | null,
  game: Game,
  allPlayers: Player[]
): PublicPlayer {
  const result = filterPlayersForViewer({
    game,
    players: [player],
    viewingPlayer,
  });
  return result.players[0];
}

// =============================================================================
// Vote Privacy Functions
// =============================================================================

/**
 * Filter vote actions to remove attribution for mission votes.
 * Mission votes should never show which player voted what.
 * Leader votes can show attribution after all votes are in.
 */
export function filterVoteActions(
  actions: GameAction[],
  phase: string,
  allVotesIn: boolean
): Omit<GameAction, 'player_id'>[] {
  return actions.map((action) => {
    const isMissionVote = action.action_type === 'vote_pass' || action.action_type === 'vote_fail';
    const isLeaderVote = action.action_type === 'vote_yes' || action.action_type === 'vote_no';

    // Mission votes never show attribution
    if (isMissionVote) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { player_id, ...rest } = action;
      return rest as Omit<GameAction, 'player_id'>;
    }

    // Leader votes show attribution only after all votes are in
    if (isLeaderVote && !allVotesIn) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { player_id, ...rest } = action;
      return rest as Omit<GameAction, 'player_id'>;
    }

    return action;
  });
}

/**
 * Get vote counts without player attribution.
 * Returns only the totals, not who voted what.
 */
export interface VoteTally {
  pass: number;
  fail: number;
  yes: number;
  no: number;
  total: number;
}

export function getVoteTally(actions: GameAction[], round: number, phase: string): VoteTally {
  const roundActions = actions.filter(
    (a) => a.round === round && a.phase === phase
  );

  return {
    pass: roundActions.filter((a) => a.action_type === 'vote_pass').length,
    fail: roundActions.filter((a) => a.action_type === 'vote_fail').length,
    yes: roundActions.filter((a) => a.action_type === 'vote_yes').length,
    no: roundActions.filter((a) => a.action_type === 'vote_no').length,
    total: roundActions.filter(
      (a) =>
        a.action_type === 'vote_pass' ||
        a.action_type === 'vote_fail' ||
        a.action_type === 'vote_yes' ||
        a.action_type === 'vote_no'
    ).length,
  };
}

// =============================================================================
// Game Over Data
// =============================================================================

/**
 * When game is finished, reveal all player data.
 * This is appropriate because the game is over.
 */
export function getFullPlayerDataForGameOver(players: Player[]): Player[] {
  // At game end, all data is revealed
  return players;
}

/**
 * Check if full player data should be revealed (game over).
 */
export function shouldRevealAllData(game: Game): boolean {
  return game.status === 'finished';
}
