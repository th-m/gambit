import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CharacterRegistry,
  characterRegistry,
  registerAllCharacters,
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
} from './CharacterRegistry';
import { effectRegistry } from './EffectRegistry';
import type {
  CharacterDefinition,
  CharacterName,
  Game,
  Player,
  GameContext,
  EffectDefinition,
} from '../types/game';

/**
 * Helper to create a minimal Game object for testing.
 */
function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    game_key: 'ABC123',
    host_id: 'host-1',
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

/**
 * Helper to create a minimal Player object for testing.
 */
function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    game_id: 'game-1',
    user_id: 'user-1',
    display_name: 'Test Player',
    character: 'Seer',
    team: 'good',
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to create a minimal GameContext for testing.
 */
function createTestContext(overrides: Partial<GameContext> = {}): GameContext {
  return {
    game: createTestGame(),
    players: [createTestPlayer()],
    currentPlayer: createTestPlayer(),
    modifiers: [],
    statuses: [],
    ...overrides,
  };
}

/**
 * Helper to register standard perception effects needed for info resolution tests.
 */
function registerPerceptionEffects(): void {
  // Register appears_as_seer effect (Phantom)
  effectRegistry.register({
    id: 'appears_as_seer',
    name: 'Appears as Seer',
    description: 'This character appears as a Seer candidate to the Oracle',
    hooks: {},
    modifiers: [
      {
        type: 'appears_as_seer',
        description: 'Oracle sees this character as potential Seer',
      },
    ],
  } as EffectDefinition);

  // Register appears_as_good effect (Saboteur)
  effectRegistry.register({
    id: 'appears_as_good',
    name: 'Appears as Good',
    description: 'This character appears as good to the Seer',
    hooks: {},
    modifiers: [
      {
        type: 'appears_as_good',
        description: 'Seer does not see this character as evil',
      },
    ],
  } as EffectDefinition);
}

describe('CharacterRegistry', () => {
  let registry: CharacterRegistry;

  beforeEach(() => {
    registry = new CharacterRegistry();
    // Clear the singleton registries
    characterRegistry.clear();
    effectRegistry.clear();
  });

  afterEach(() => {
    registry.clear();
    characterRegistry.clear();
    effectRegistry.clear();
  });

  describe('register', () => {
    it('should add character to registry', () => {
      registry.register(seerDefinition);
      expect(registry.get('Seer')).toBe(seerDefinition);
    });

    it('should allow registering multiple characters', () => {
      registry.register(seerDefinition);
      registry.register(assassinDefinition);

      expect(registry.get('Seer')).toBe(seerDefinition);
      expect(registry.get('Assassin')).toBe(assassinDefinition);
    });

    it('should overwrite existing character with same name', () => {
      const originalSeer = { ...seerDefinition, description: 'Original' };
      const updatedSeer = { ...seerDefinition, description: 'Updated' };

      registry.register(originalSeer);
      registry.register(updatedSeer);

      expect(registry.get('Seer')?.description).toBe('Updated');
    });
  });

  describe('get', () => {
    it('should return correct character by name', () => {
      registry.register(oracleDefinition);
      const result = registry.get('Oracle');

      expect(result).toBe(oracleDefinition);
      expect(result?.name).toBe('Oracle');
    });

    it('should return undefined for non-existent character', () => {
      expect(registry.get('Seer')).toBeUndefined();
      expect(registry.get('NonExistent' as CharacterName)).toBeUndefined();
    });
  });

  describe('getAll', () => {
    it('should return empty array when no characters registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('should return all registered characters', () => {
      registry.register(seerDefinition);
      registry.register(assassinDefinition);
      registry.register(villagerDefinition);

      const result = registry.getAll();
      expect(result).toHaveLength(3);
      expect(result).toContain(seerDefinition);
      expect(result).toContain(assassinDefinition);
      expect(result).toContain(villagerDefinition);
    });
  });

  describe('clear', () => {
    it('should remove all registered characters', () => {
      registry.register(seerDefinition);
      registry.register(assassinDefinition);

      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(registry.get('Seer')).toBeUndefined();
    });
  });

  describe('registerAllCharacters', () => {
    it('should register all 11 characters', () => {
      registerAllCharacters();

      const allCharacters = characterRegistry.getAll();
      expect(allCharacters).toHaveLength(11);

      // Verify all character names
      const characterNames = allCharacters.map((c) => c.name);
      expect(characterNames).toContain('Seer');
      expect(characterNames).toContain('Oracle');
      expect(characterNames).toContain('Guardian');
      expect(characterNames).toContain('Tracker');
      expect(characterNames).toContain('Villager');
      expect(characterNames).toContain('Soldier');
      expect(characterNames).toContain('Assassin');
      expect(characterNames).toContain('Fixer');
      expect(characterNames).toContain('Phantom');
      expect(characterNames).toContain('Saboteur');
      expect(characterNames).toContain('Minion');
    });

    it('should register characters with correct teams', () => {
      registerAllCharacters();

      // Good team characters
      expect(characterRegistry.get('Seer')?.team).toBe('good');
      expect(characterRegistry.get('Oracle')?.team).toBe('good');
      expect(characterRegistry.get('Guardian')?.team).toBe('good');
      expect(characterRegistry.get('Tracker')?.team).toBe('good');
      expect(characterRegistry.get('Villager')?.team).toBe('good');
      expect(characterRegistry.get('Soldier')?.team).toBe('good');

      // Evil team characters
      expect(characterRegistry.get('Assassin')?.team).toBe('evil');
      expect(characterRegistry.get('Fixer')?.team).toBe('evil');
      expect(characterRegistry.get('Phantom')?.team).toBe('evil');
      expect(characterRegistry.get('Saboteur')?.team).toBe('evil');
      expect(characterRegistry.get('Minion')?.team).toBe('evil');
    });

    it('should register characters with correct actions', () => {
      registerAllCharacters();

      expect(characterRegistry.get('Guardian')?.actions).toContain('protect');
      expect(characterRegistry.get('Tracker')?.actions).toContain('plant_beeper');
      expect(characterRegistry.get('Assassin')?.actions).toContain('assassinate');
      expect(characterRegistry.get('Fixer')?.actions).toContain('rig_vote');
      expect(characterRegistry.get('Saboteur')?.actions).toContain('sabotage');

      // Characters without special actions
      expect(characterRegistry.get('Seer')?.actions).toHaveLength(0);
      expect(characterRegistry.get('Oracle')?.actions).toHaveLength(0);
      expect(characterRegistry.get('Villager')?.actions).toHaveLength(0);
      expect(characterRegistry.get('Minion')?.actions).toHaveLength(0);
    });

    it('should register characters with correct effects', () => {
      registerAllCharacters();

      expect(characterRegistry.get('Phantom')?.effects).toContain('appears_as_seer');
      expect(characterRegistry.get('Saboteur')?.effects).toContain('appears_as_good');

      // Characters without special effects
      expect(characterRegistry.get('Seer')?.effects).toHaveLength(0);
      expect(characterRegistry.get('Oracle')?.effects).toHaveLength(0);
      expect(characterRegistry.get('Guardian')?.effects).toHaveLength(0);
      expect(characterRegistry.get('Tracker')?.effects).toHaveLength(0);
      expect(characterRegistry.get('Villager')?.effects).toHaveLength(0);
      expect(characterRegistry.get('Assassin')?.effects).toHaveLength(0);
      expect(characterRegistry.get('Fixer')?.effects).toHaveLength(0);
      expect(characterRegistry.get('Minion')?.effects).toHaveLength(0);
    });
  });

  describe('getByTeam', () => {
    beforeEach(() => {
      registerAllCharacters();
    });

    it('should return correct characters for good team', () => {
      const goodCharacters = characterRegistry.getByTeam('good');

      expect(goodCharacters).toHaveLength(6);

      const names = goodCharacters.map((c) => c.name);
      expect(names).toContain('Seer');
      expect(names).toContain('Oracle');
      expect(names).toContain('Guardian');
      expect(names).toContain('Tracker');
      expect(names).toContain('Villager');
      expect(names).toContain('Soldier');

      // Verify all are good team
      goodCharacters.forEach((char) => {
        expect(char.team).toBe('good');
      });
    });

    it('should return correct characters for evil team', () => {
      const evilCharacters = characterRegistry.getByTeam('evil');

      expect(evilCharacters).toHaveLength(5);

      const names = evilCharacters.map((c) => c.name);
      expect(names).toContain('Assassin');
      expect(names).toContain('Fixer');
      expect(names).toContain('Phantom');
      expect(names).toContain('Saboteur');
      expect(names).toContain('Minion');

      // Verify all are evil team
      evilCharacters.forEach((char) => {
        expect(char.team).toBe('evil');
      });
    });

    it('should not mix teams in results', () => {
      const goodCharacters = characterRegistry.getByTeam('good');
      const evilCharacters = characterRegistry.getByTeam('evil');

      // No evil characters in good list
      const goodNames = goodCharacters.map((c) => c.name);
      expect(goodNames).not.toContain('Assassin');
      expect(goodNames).not.toContain('Fixer');
      expect(goodNames).not.toContain('Phantom');
      expect(goodNames).not.toContain('Saboteur');
      expect(goodNames).not.toContain('Minion');

      // No good characters in evil list
      const evilNames = evilCharacters.map((c) => c.name);
      expect(evilNames).not.toContain('Seer');
      expect(evilNames).not.toContain('Oracle');
      expect(evilNames).not.toContain('Guardian');
      expect(evilNames).not.toContain('Tracker');
      expect(evilNames).not.toContain('Villager');
    });

    it('should return empty array when no characters of team exist', () => {
      // Use a fresh registry with only good characters
      registry.register(seerDefinition);
      registry.register(oracleDefinition);

      const evilCharacters = registry.getByTeam('evil');
      expect(evilCharacters).toEqual([]);
    });
  });

  describe('resolveInfo', () => {
    beforeEach(() => {
      // Register all characters in singleton
      registerAllCharacters();
      // Register perception effects
      registerPerceptionEffects();
    });

    it('should return unknown for player without character', () => {
      const ctx = createTestContext({
        currentPlayer: createTestPlayer({ character: null }),
      });

      const info = characterRegistry.resolveInfo(ctx);
      expect(info.description).toBe('Unknown character');
    });

    it('should return unknown for unregistered character', () => {
      const ctx = createTestContext({
        currentPlayer: createTestPlayer({ character: 'NonExistent' as CharacterName }),
      });

      const info = characterRegistry.resolveInfo(ctx);
      expect(info.description).toBe('Unknown character');
    });

    describe('Seer info resolution', () => {
      it('should return correct info for Seer (knows evil)', () => {
        const evilPlayer1 = createTestPlayer({
          id: 'evil-1',
          user_id: 'user-evil-1',
          display_name: 'Evil Player 1',
          character: 'Assassin',
          team: 'evil',
        });
        const evilPlayer2 = createTestPlayer({
          id: 'evil-2',
          user_id: 'user-evil-2',
          display_name: 'Evil Player 2',
          character: 'Minion',
          team: 'evil',
        });
        const seerPlayer = createTestPlayer({
          id: 'seer-1',
          user_id: 'user-seer',
          display_name: 'Seer',
          character: 'Seer',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [seerPlayer, evilPlayer1, evilPlayer2],
          currentPlayer: seerPlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);

        expect(info.description).toBe('You can see the evil players');
        expect(info.knownPlayers).toContain('evil-1');
        expect(info.knownPlayers).toContain('evil-2');
        expect(info.knownPlayers).toHaveLength(2);
        expect(info.knownPlayerLabels?.['evil-1']).toBe('Evil');
        expect(info.knownPlayerLabels?.['evil-2']).toBe('Evil');
      });

      it('should exclude Saboteur from evil list for Seer', () => {
        const assassinPlayer = createTestPlayer({
          id: 'assassin-1',
          user_id: 'user-assassin',
          display_name: 'Assassin',
          character: 'Assassin',
          team: 'evil',
        });
        const saboteurPlayer = createTestPlayer({
          id: 'saboteur-1',
          user_id: 'user-saboteur',
          display_name: 'Saboteur',
          character: 'Saboteur',
          team: 'evil',
        });
        const minionPlayer = createTestPlayer({
          id: 'minion-1',
          user_id: 'user-minion',
          display_name: 'Minion',
          character: 'Minion',
          team: 'evil',
        });
        const seerPlayer = createTestPlayer({
          id: 'seer-1',
          user_id: 'user-seer',
          display_name: 'Seer',
          character: 'Seer',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [seerPlayer, assassinPlayer, saboteurPlayer, minionPlayer],
          currentPlayer: seerPlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);

        // Seer sees Assassin and Minion but NOT Saboteur
        expect(info.knownPlayers).toContain('assassin-1');
        expect(info.knownPlayers).toContain('minion-1');
        expect(info.knownPlayers).not.toContain('saboteur-1');
        expect(info.knownPlayers).toHaveLength(2);
      });

      it('should not show good players in Seer evil list', () => {
        const evilPlayer = createTestPlayer({
          id: 'evil-1',
          character: 'Assassin',
          team: 'evil',
        });
        const goodPlayer = createTestPlayer({
          id: 'good-1',
          character: 'Guardian',
          team: 'good',
        });
        const seerPlayer = createTestPlayer({
          id: 'seer-1',
          character: 'Seer',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [seerPlayer, evilPlayer, goodPlayer],
          currentPlayer: seerPlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);

        expect(info.knownPlayers).toContain('evil-1');
        expect(info.knownPlayers).not.toContain('good-1');
        expect(info.knownPlayers).not.toContain('seer-1');
      });
    });

    describe('Oracle info resolution', () => {
      it('should show Seer to Oracle', () => {
        const seerPlayer = createTestPlayer({
          id: 'seer-1',
          user_id: 'user-seer',
          display_name: 'Real Seer',
          character: 'Seer',
          team: 'good',
        });
        const oraclePlayer = createTestPlayer({
          id: 'oracle-1',
          user_id: 'user-oracle',
          display_name: 'Oracle',
          character: 'Oracle',
          team: 'good',
        });
        const villagerPlayer = createTestPlayer({
          id: 'villager-1',
          character: 'Villager',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [oraclePlayer, seerPlayer, villagerPlayer],
          currentPlayer: oraclePlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);

        expect(info.description).toBe('You know who the Seer is');
        expect(info.knownPlayers).toContain('seer-1');
        expect(info.knownPlayers).toHaveLength(1);
        expect(info.knownPlayerLabels?.['seer-1']).toBe('Seer');
      });

      it('should show Phantom as Seer candidate to Oracle', () => {
        const seerPlayer = createTestPlayer({
          id: 'seer-1',
          user_id: 'user-seer',
          display_name: 'Real Seer',
          character: 'Seer',
          team: 'good',
        });
        const phantomPlayer = createTestPlayer({
          id: 'phantom-1',
          user_id: 'user-phantom',
          display_name: 'Phantom',
          character: 'Phantom',
          team: 'evil',
        });
        const oraclePlayer = createTestPlayer({
          id: 'oracle-1',
          user_id: 'user-oracle',
          display_name: 'Oracle',
          character: 'Oracle',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [oraclePlayer, seerPlayer, phantomPlayer],
          currentPlayer: oraclePlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);

        // Oracle sees both real Seer AND Phantom
        expect(info.knownPlayers).toContain('seer-1');
        expect(info.knownPlayers).toContain('phantom-1');
        expect(info.knownPlayers).toHaveLength(2);

        // Description indicates uncertainty
        expect(info.description).toBe('One of these players is the Seer');

        // Labels show uncertainty
        expect(info.knownPlayerLabels?.['seer-1']).toBe('Seer?');
        expect(info.knownPlayerLabels?.['phantom-1']).toBe('Seer?');
      });

      it('should not show other evil players to Oracle', () => {
        const seerPlayer = createTestPlayer({
          id: 'seer-1',
          character: 'Seer',
          team: 'good',
        });
        const assassinPlayer = createTestPlayer({
          id: 'assassin-1',
          character: 'Assassin',
          team: 'evil',
        });
        const oraclePlayer = createTestPlayer({
          id: 'oracle-1',
          character: 'Oracle',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [oraclePlayer, seerPlayer, assassinPlayer],
          currentPlayer: oraclePlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);

        // Oracle only sees Seer candidates, not evil players
        expect(info.knownPlayers).toContain('seer-1');
        expect(info.knownPlayers).not.toContain('assassin-1');
      });
    });

    describe('Evil team info resolution', () => {
      it('should show other evil players to Assassin', () => {
        const assassinPlayer = createTestPlayer({
          id: 'assassin-1',
          user_id: 'user-assassin',
          display_name: 'Assassin',
          character: 'Assassin',
          team: 'evil',
        });
        const fixerPlayer = createTestPlayer({
          id: 'fixer-1',
          user_id: 'user-fixer',
          display_name: 'Fixer',
          character: 'Fixer',
          team: 'evil',
        });
        const seerPlayer = createTestPlayer({
          id: 'seer-1',
          character: 'Seer',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [assassinPlayer, fixerPlayer, seerPlayer],
          currentPlayer: assassinPlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);

        expect(info.description).toBe('You know the other evil players');
        expect(info.knownPlayers).toContain('fixer-1');
        expect(info.knownPlayers).not.toContain('assassin-1'); // Not themselves
        expect(info.knownPlayers).not.toContain('seer-1'); // Not good players
      });

      it('should show other evil players to all evil characters', () => {
        const players = [
          createTestPlayer({
            id: 'assassin-1',
            character: 'Assassin',
            team: 'evil',
          }),
          createTestPlayer({
            id: 'fixer-1',
            character: 'Fixer',
            team: 'evil',
          }),
          createTestPlayer({
            id: 'phantom-1',
            character: 'Phantom',
            team: 'evil',
          }),
          createTestPlayer({
            id: 'saboteur-1',
            character: 'Saboteur',
            team: 'evil',
          }),
          createTestPlayer({
            id: 'minion-1',
            character: 'Minion',
            team: 'evil',
          }),
          createTestPlayer({
            id: 'seer-1',
            character: 'Seer',
            team: 'good',
          }),
        ];

        // Test each evil character
        const evilCharacters: CharacterName[] = [
          'Assassin',
          'Fixer',
          'Phantom',
          'Saboteur',
          'Minion',
        ];
        const evilPlayerIds = ['assassin-1', 'fixer-1', 'phantom-1', 'saboteur-1', 'minion-1'];

        for (const char of evilCharacters) {
          const currentPlayer = players.find((p) => p.character === char)!;
          const ctx = createTestContext({
            players,
            currentPlayer,
          });

          const info = characterRegistry.resolveInfo(ctx);

          expect(info.description).toBe('You know the other evil players');

          // Should see all evil players except themselves
          const expectedOthers = evilPlayerIds.filter((id) => id !== currentPlayer.id);
          expectedOthers.forEach((id) => {
            expect(info.knownPlayers).toContain(id);
          });
          expect(info.knownPlayers).not.toContain(currentPlayer.id);
          expect(info.knownPlayers).not.toContain('seer-1');
        }
      });
    });

    describe('Characters with no special knowledge', () => {
      it('should return no special knowledge for Guardian', () => {
        const guardianPlayer = createTestPlayer({
          id: 'guardian-1',
          character: 'Guardian',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [guardianPlayer],
          currentPlayer: guardianPlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);
        expect(info.description).toBe('You have no special knowledge');
        expect(info.knownPlayers).toBeUndefined();
      });

      it('should return no special knowledge for Tracker', () => {
        const trackerPlayer = createTestPlayer({
          id: 'tracker-1',
          character: 'Tracker',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [trackerPlayer],
          currentPlayer: trackerPlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);
        expect(info.description).toBe('You have no special knowledge');
        expect(info.knownPlayers).toBeUndefined();
      });

      it('should return no special knowledge for Villager', () => {
        const villagerPlayer = createTestPlayer({
          id: 'villager-1',
          character: 'Villager',
          team: 'good',
        });

        const ctx = createTestContext({
          players: [villagerPlayer],
          currentPlayer: villagerPlayer,
        });

        const info = characterRegistry.resolveInfo(ctx);
        expect(info.description).toBe('You have no special knowledge');
        expect(info.knownPlayers).toBeUndefined();
      });
    });
  });

  describe('Character Definitions', () => {
    it('should have correct definition for Seer', () => {
      expect(seerDefinition.name).toBe('Seer');
      expect(seerDefinition.team).toBe('good');
      expect(seerDefinition.description).toContain('evil players');
      expect(seerDefinition.actions).toEqual([]);
      expect(seerDefinition.effects).toEqual([]);
    });

    it('should have correct definition for Oracle', () => {
      expect(oracleDefinition.name).toBe('Oracle');
      expect(oracleDefinition.team).toBe('good');
      expect(oracleDefinition.description).toContain('Seer');
      expect(oracleDefinition.actions).toEqual([]);
      expect(oracleDefinition.effects).toEqual([]);
    });

    it('should have correct definition for Guardian', () => {
      expect(guardianDefinition.name).toBe('Guardian');
      expect(guardianDefinition.team).toBe('good');
      expect(guardianDefinition.description).toContain('protect');
      expect(guardianDefinition.actions).toContain('protect');
      expect(guardianDefinition.effects).toEqual([]);
    });

    it('should have correct definition for Tracker', () => {
      expect(trackerDefinition.name).toBe('Tracker');
      expect(trackerDefinition.team).toBe('good');
      expect(trackerDefinition.description).toContain('beeper');
      expect(trackerDefinition.actions).toContain('plant_beeper');
      expect(trackerDefinition.effects).toEqual([]);
    });

    it('should have correct definition for Villager', () => {
      expect(villagerDefinition.name).toBe('Villager');
      expect(villagerDefinition.team).toBe('good');
      expect(villagerDefinition.description).toContain('loyal');
      expect(villagerDefinition.actions).toEqual([]);
      expect(villagerDefinition.effects).toEqual([]);
    });

    it('should have correct definition for Assassin', () => {
      expect(assassinDefinition.name).toBe('Assassin');
      expect(assassinDefinition.team).toBe('evil');
      expect(assassinDefinition.description).toContain('assassinate');
      expect(assassinDefinition.actions).toContain('assassinate');
      expect(assassinDefinition.effects).toEqual([]);
    });

    it('should have correct definition for Fixer', () => {
      expect(fixerDefinition.name).toBe('Fixer');
      expect(fixerDefinition.team).toBe('evil');
      expect(fixerDefinition.description).toContain('rig');
      expect(fixerDefinition.actions).toContain('rig_vote');
      expect(fixerDefinition.effects).toEqual([]);
    });

    it('should have correct definition for Phantom', () => {
      expect(phantomDefinition.name).toBe('Phantom');
      expect(phantomDefinition.team).toBe('evil');
      expect(phantomDefinition.description).toContain('Seer');
      expect(phantomDefinition.actions).toEqual([]);
      expect(phantomDefinition.effects).toContain('appears_as_seer');
    });

    it('should have correct definition for Saboteur', () => {
      expect(saboteurDefinition.name).toBe('Saboteur');
      expect(saboteurDefinition.team).toBe('evil');
      expect(saboteurDefinition.description).toContain('good');
      expect(saboteurDefinition.actions).toContain('sabotage');
      expect(saboteurDefinition.effects).toContain('appears_as_good');
    });

    it('should have correct definition for Minion', () => {
      expect(minionDefinition.name).toBe('Minion');
      expect(minionDefinition.team).toBe('evil');
      expect(minionDefinition.description).toContain('loyal');
      expect(minionDefinition.actions).toEqual([]);
      expect(minionDefinition.effects).toEqual([]);
    });
  });
});
