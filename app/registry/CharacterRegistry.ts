/**
 * CharacterRegistry - Manages character definitions.
 *
 * Provides registration, retrieval, and info resolution for all game characters.
 * Characters have teams, descriptions, actions, effects, and info resolvers
 * that compute what information each character knows.
 */

import type {
  CharacterDefinition,
  CharacterInfo,
  CharacterName,
  GameContext,
  Team,
  EffectId,
  ActionId,
} from '../types/game';
import { effectRegistry } from './EffectRegistry';

/**
 * Registry class for managing character definitions.
 * Can be used as a singleton or instantiated for testing.
 */
export class CharacterRegistry {
  private characters: Map<CharacterName, CharacterDefinition> = new Map();

  /**
   * Register a character definition.
   * @param character - The character definition to register
   */
  register(character: CharacterDefinition): void {
    this.characters.set(character.name, character);
  }

  /**
   * Get a single character by name.
   * @param name - The character name to look up
   * @returns The character definition or undefined if not found
   */
  get(name: CharacterName): CharacterDefinition | undefined {
    return this.characters.get(name);
  }

  /**
   * Get all registered characters.
   * @returns Array of all character definitions
   */
  getAll(): CharacterDefinition[] {
    return Array.from(this.characters.values());
  }

  /**
   * Get characters filtered by team.
   * @param team - 'good' or 'evil'
   * @returns Array of character definitions for that team
   */
  getByTeam(team: Team): CharacterDefinition[] {
    return this.getAll().filter((char) => char.team === team);
  }

  /**
   * Resolve what information the current player's character knows.
   * Applies effect modifiers (appears_as_seer, appears_as_good) to perception.
   *
   * @param ctx - Current game context
   * @returns CharacterInfo with description and known players
   */
  resolveInfo(ctx: GameContext): CharacterInfo {
    const { currentPlayer, players } = ctx;

    if (!currentPlayer?.character) {
      return { description: 'Unknown character' };
    }

    const characterDef = this.characters.get(currentPlayer.character);
    if (!characterDef) {
      return { description: 'Unknown character' };
    }

    // Use the character's info resolver
    return characterDef.info(ctx);
  }

  /**
   * Clear all registered characters.
   * Useful for testing.
   */
  clear(): void {
    this.characters.clear();
  }
}

/**
 * Singleton instance for global use.
 * Import this for production code.
 */
export const characterRegistry = new CharacterRegistry();

// =============================================================================
// Character Definitions
// =============================================================================

/**
 * Helper to get all evil players visible to Seer.
 * Excludes players with 'appears_as_good' effect (Saboteur).
 */
function getVisibleEvilPlayers(ctx: GameContext): string[] {
  const { players } = ctx;
  const evilPlayers: string[] = [];

  for (const player of players) {
    if (player.team !== 'evil' || !player.character) continue;

    // Check if this player has the appears_as_good effect
    const charDef = characterRegistry.get(player.character);
    if (charDef) {
      const hasAppearsAsGood = effectRegistry.hasModifier(
        charDef.effects,
        'appears_as_good'
      );
      if (!hasAppearsAsGood) {
        evilPlayers.push(player.id);
      }
    } else {
      // No character def found, include them
      evilPlayers.push(player.id);
    }
  }

  return evilPlayers;
}

/**
 * Helper to get Seer candidates visible to Oracle.
 * Includes real Seer AND players with 'appears_as_seer' effect (Phantom).
 */
function getSeerCandidates(ctx: GameContext): string[] {
  const { players } = ctx;
  const candidates: string[] = [];

  for (const player of players) {
    if (!player.character) continue;

    // Real Seer is always a candidate
    if (player.character === 'Seer') {
      candidates.push(player.id);
      continue;
    }

    // Check if this player has the appears_as_seer effect
    const charDef = characterRegistry.get(player.character);
    if (charDef) {
      const hasAppearsAsSeer = effectRegistry.hasModifier(
        charDef.effects,
        'appears_as_seer'
      );
      if (hasAppearsAsSeer) {
        candidates.push(player.id);
      }
    }
  }

  return candidates;
}

/**
 * Helper to get other evil players (for evil team knowledge).
 */
function getOtherEvilPlayers(ctx: GameContext): string[] {
  const { currentPlayer, players } = ctx;
  return players
    .filter((p) => p.team === 'evil' && p.id !== currentPlayer?.id)
    .map((p) => p.id);
}

/**
 * Helper to build player labels for display.
 */
function buildPlayerLabels(
  playerIds: string[],
  players: { id: string; display_name: string }[],
  label: string
): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const id of playerIds) {
    const player = players.find((p) => p.id === id);
    if (player) {
      labels[id] = label;
    }
  }
  return labels;
}

// =============================================================================
// Good Team Characters
// =============================================================================

const seerDefinition: CharacterDefinition = {
  name: 'Seer',
  team: 'good',
  description: 'You know who the evil players are (except those hidden from you).',
  info: (ctx: GameContext): CharacterInfo => {
    const evilPlayers = getVisibleEvilPlayers(ctx);
    return {
      description: 'You can see the evil players',
      knownPlayers: evilPlayers,
      knownPlayerLabels: buildPlayerLabels(evilPlayers, ctx.players, 'Evil'),
    };
  },
  actions: [] as ActionId[],
  effects: [] as EffectId[],
};

const oracleDefinition: CharacterDefinition = {
  name: 'Oracle',
  team: 'good',
  description: 'You know who the Seer is (but beware of imposters).',
  info: (ctx: GameContext): CharacterInfo => {
    const candidates = getSeerCandidates(ctx);
    const labelText = candidates.length > 1 ? 'Seer?' : 'Seer';
    return {
      description: candidates.length > 1
        ? 'One of these players is the Seer'
        : 'You know who the Seer is',
      knownPlayers: candidates,
      knownPlayerLabels: buildPlayerLabels(candidates, ctx.players, labelText),
    };
  },
  actions: [] as ActionId[],
  effects: [] as EffectId[],
};

const guardianDefinition: CharacterDefinition = {
  name: 'Guardian',
  team: 'good',
  description: 'You can protect one player from assassination during a mission.',
  info: (): CharacterInfo => ({
    description: 'You have no special knowledge',
  }),
  actions: ['protect'] as ActionId[],
  effects: [] as EffectId[],
};

const trackerDefinition: CharacterDefinition = {
  name: 'Tracker',
  team: 'good',
  description: 'You can plant a beeper on two players to learn if they voted differently.',
  info: (): CharacterInfo => ({
    description: 'You have no special knowledge',
  }),
  actions: ['plant_beeper'] as ActionId[],
  effects: [] as EffectId[],
};

const villagerDefinition: CharacterDefinition = {
  name: 'Villager',
  team: 'good',
  description: 'A loyal member of the good team with no special abilities.',
  info: (): CharacterInfo => ({
    description: 'You have no special knowledge',
  }),
  actions: [] as ActionId[],
  effects: [] as EffectId[],
};

// =============================================================================
// Evil Team Characters
// =============================================================================

const assassinDefinition: CharacterDefinition = {
  name: 'Assassin',
  team: 'evil',
  description: 'You can assassinate a player. If you kill the Seer, evil wins immediately.',
  info: (ctx: GameContext): CharacterInfo => {
    const evilPlayers = getOtherEvilPlayers(ctx);
    return {
      description: 'You know the other evil players',
      knownPlayers: evilPlayers,
      knownPlayerLabels: buildPlayerLabels(evilPlayers, ctx.players, 'Evil'),
    };
  },
  actions: ['assassinate'] as ActionId[],
  effects: [] as EffectId[],
};

const fixerDefinition: CharacterDefinition = {
  name: 'Fixer',
  team: 'evil',
  description: 'You can rig a mission vote to force it to pass.',
  info: (ctx: GameContext): CharacterInfo => {
    const evilPlayers = getOtherEvilPlayers(ctx);
    return {
      description: 'You know the other evil players',
      knownPlayers: evilPlayers,
      knownPlayerLabels: buildPlayerLabels(evilPlayers, ctx.players, 'Evil'),
    };
  },
  actions: ['rig_vote'] as ActionId[],
  effects: [] as EffectId[],
};

const phantomDefinition: CharacterDefinition = {
  name: 'Phantom',
  team: 'evil',
  description: 'You appear as the Seer to the Oracle.',
  info: (ctx: GameContext): CharacterInfo => {
    const evilPlayers = getOtherEvilPlayers(ctx);
    return {
      description: 'You know the other evil players',
      knownPlayers: evilPlayers,
      knownPlayerLabels: buildPlayerLabels(evilPlayers, ctx.players, 'Evil'),
    };
  },
  actions: [] as ActionId[],
  effects: ['appears_as_seer'] as EffectId[],
};

const saboteurDefinition: CharacterDefinition = {
  name: 'Saboteur',
  team: 'evil',
  description: 'You appear as good to the Seer. You can add an extra fail vote to missions.',
  info: (ctx: GameContext): CharacterInfo => {
    const evilPlayers = getOtherEvilPlayers(ctx);
    return {
      description: 'You know the other evil players',
      knownPlayers: evilPlayers,
      knownPlayerLabels: buildPlayerLabels(evilPlayers, ctx.players, 'Evil'),
    };
  },
  actions: ['sabotage'] as ActionId[],
  effects: ['appears_as_good'] as EffectId[],
};

const minionDefinition: CharacterDefinition = {
  name: 'Minion',
  team: 'evil',
  description: 'A loyal member of the evil team with no special abilities.',
  info: (ctx: GameContext): CharacterInfo => {
    const evilPlayers = getOtherEvilPlayers(ctx);
    return {
      description: 'You know the other evil players',
      knownPlayers: evilPlayers,
      knownPlayerLabels: buildPlayerLabels(evilPlayers, ctx.players, 'Evil'),
    };
  },
  actions: [] as ActionId[],
  effects: [] as EffectId[],
};

// =============================================================================
// Register All Characters
// =============================================================================

/**
 * Register all character definitions with the singleton registry.
 * Call this during app initialization.
 */
export function registerAllCharacters(): void {
  // Good team
  characterRegistry.register(seerDefinition);
  characterRegistry.register(oracleDefinition);
  characterRegistry.register(guardianDefinition);
  characterRegistry.register(trackerDefinition);
  characterRegistry.register(villagerDefinition);

  // Evil team
  characterRegistry.register(assassinDefinition);
  characterRegistry.register(fixerDefinition);
  characterRegistry.register(phantomDefinition);
  characterRegistry.register(saboteurDefinition);
  characterRegistry.register(minionDefinition);
}

// Export individual definitions for testing
export {
  seerDefinition,
  oracleDefinition,
  guardianDefinition,
  trackerDefinition,
  villagerDefinition,
  assassinDefinition,
  fixerDefinition,
  phantomDefinition,
  saboteurDefinition,
  minionDefinition,
};
