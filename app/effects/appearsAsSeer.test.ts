/**
 * Tests for appears_as_seer effect (Phantom's passive ability)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectRegistry } from '../registry/EffectRegistry';
import { characterRegistry, registerAllCharacters } from '../registry/CharacterRegistry';
import { appearsAsSeerEffect, registerAppearsAsSeerEffect } from './appearsAsSeer';
import type { GameContext, Player, Game, EffectId } from '../types/game';

/**
 * Helper to register the appears_as_good effect for integration tests.
 * This is needed because CharacterRegistry uses both perception effects.
 * The full implementation will be in a separate story (effect-appears-as-good).
 */
function registerAppearsAsGoodEffectForTests(): void {
  effectRegistry.register({
    id: 'appears_as_good' as EffectId,
    name: 'Appears as Good',
    description: 'This character appears as good to the Seer.',
    hooks: {},
    modifiers: [
      {
        type: 'appears_as_good',
        description: 'Seer does not see this player as evil',
      },
    ],
  });
}

// Helper to create test game context
function createTestContext(overrides: Partial<GameContext> = {}): GameContext {
  const defaultGame: Game = {
    id: 'test-game-1',
    game_key: 'ABC123',
    host_id: 'host-user',
    status: 'playing',
    phase: 'voting_for_leader',
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

  const defaultPlayers: Player[] = [];
  const defaultCurrentPlayer: Player = {
    id: 'player-1',
    game_id: 'test-game-1',
    user_id: 'user-1',
    display_name: 'Player 1',
    character: 'Oracle',
    team: 'good',
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
  };

  return {
    game: defaultGame,
    players: defaultPlayers,
    currentPlayer: defaultCurrentPlayer,
    modifiers: [],
    statuses: [],
    ...overrides,
  };
}

// Helper to create test players
function createTestPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    game_id: 'test-game-1',
    user_id: 'user-1',
    display_name: 'Player 1',
    character: null,
    team: null,
    is_alive: true,
    seat_order: 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('appearsAsSeerEffect', () => {
  beforeEach(() => {
    effectRegistry.clear();
    characterRegistry.clear();
  });

  afterEach(() => {
    effectRegistry.clear();
    characterRegistry.clear();
  });

  describe('effect definition', () => {
    it('should have correct id', () => {
      expect(appearsAsSeerEffect.id).toBe('appears_as_seer');
    });

    it('should have correct name', () => {
      expect(appearsAsSeerEffect.name).toBe('Appears as Seer');
    });

    it('should have description', () => {
      expect(appearsAsSeerEffect.description).toBeTruthy();
      expect(appearsAsSeerEffect.description).toContain('Seer');
    });

    it('should have appears_as_seer modifier', () => {
      expect(appearsAsSeerEffect.modifiers).toHaveLength(1);
      expect(appearsAsSeerEffect.modifiers[0].type).toBe('appears_as_seer');
    });

    it('should have no hooks (passive effect)', () => {
      expect(Object.keys(appearsAsSeerEffect.hooks)).toHaveLength(0);
    });
  });

  describe('registerAppearsAsSeerEffect', () => {
    it('should register effect in EffectRegistry', () => {
      expect(effectRegistry.get('appears_as_seer')).toBeUndefined();

      registerAppearsAsSeerEffect();

      expect(effectRegistry.get('appears_as_seer')).toBe(appearsAsSeerEffect);
    });

    it('should be retrievable by id after registration', () => {
      registerAppearsAsSeerEffect();

      const effect = effectRegistry.get('appears_as_seer');
      expect(effect).toBeDefined();
      expect(effect?.name).toBe('Appears as Seer');
    });
  });

  describe('modifier queries', () => {
    beforeEach(() => {
      registerAppearsAsSeerEffect();
    });

    it('should return appears_as_seer modifier via getModifiers', () => {
      const modifiers = effectRegistry.getModifiers('appears_as_seer');

      expect(modifiers).toHaveLength(1);
      expect(modifiers[0].type).toBe('appears_as_seer');
    });

    it('should detect modifier via hasModifier', () => {
      const activeEffects: EffectId[] = ['appears_as_seer'];

      expect(effectRegistry.hasModifier(activeEffects, 'appears_as_seer')).toBe(true);
    });

    it('should not detect appears_as_good modifier', () => {
      const activeEffects: EffectId[] = ['appears_as_seer'];

      expect(effectRegistry.hasModifier(activeEffects, 'appears_as_good')).toBe(false);
    });

    it('should include modifier in getAllModifiers', () => {
      const activeEffects: EffectId[] = ['appears_as_seer'];
      const allModifiers = effectRegistry.getAllModifiers(activeEffects);

      expect(allModifiers).toHaveLength(1);
      expect(allModifiers[0].type).toBe('appears_as_seer');
    });
  });

  describe('integration with CharacterRegistry', () => {
    beforeEach(() => {
      registerAppearsAsSeerEffect();
      registerAppearsAsGoodEffectForTests();
      registerAllCharacters();
    });

    it('should be listed in Phantom character effects', () => {
      const phantom = characterRegistry.get('Phantom');

      expect(phantom).toBeDefined();
      expect(phantom?.effects).toContain('appears_as_seer');
    });

    it('should make Oracle see Phantom as Seer candidate', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Real Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const phantomPlayer = createTestPlayer({
        id: 'player-phantom',
        display_name: 'Phantom',
        character: 'Phantom',
        team: 'evil',
        seat_order: 1,
      });

      const oraclePlayer = createTestPlayer({
        id: 'player-oracle',
        display_name: 'Oracle',
        character: 'Oracle',
        team: 'good',
        seat_order: 2,
      });

      const ctx = createTestContext({
        currentPlayer: oraclePlayer,
        players: [seerPlayer, phantomPlayer, oraclePlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Oracle should see both Seer and Phantom as candidates
      expect(info.knownPlayers).toBeDefined();
      expect(info.knownPlayers).toContain('player-seer');
      expect(info.knownPlayers).toContain('player-phantom');
      expect(info.knownPlayers).toHaveLength(2);
    });

    it('should show uncertainty when both Seer and Phantom present', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Real Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const phantomPlayer = createTestPlayer({
        id: 'player-phantom',
        display_name: 'Phantom',
        character: 'Phantom',
        team: 'evil',
        seat_order: 1,
      });

      const oraclePlayer = createTestPlayer({
        id: 'player-oracle',
        display_name: 'Oracle',
        character: 'Oracle',
        team: 'good',
        seat_order: 2,
      });

      const ctx = createTestContext({
        currentPlayer: oraclePlayer,
        players: [seerPlayer, phantomPlayer, oraclePlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Labels should indicate uncertainty with "Seer?"
      expect(info.knownPlayerLabels?.['player-seer']).toBe('Seer?');
      expect(info.knownPlayerLabels?.['player-phantom']).toBe('Seer?');
    });

    it('should not affect actual Seer perception of evil players', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Real Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const phantomPlayer = createTestPlayer({
        id: 'player-phantom',
        display_name: 'Phantom',
        character: 'Phantom',
        team: 'evil',
        seat_order: 1,
      });

      const assassinPlayer = createTestPlayer({
        id: 'player-assassin',
        display_name: 'Assassin',
        character: 'Assassin',
        team: 'evil',
        seat_order: 2,
      });

      const ctx = createTestContext({
        currentPlayer: seerPlayer,
        players: [seerPlayer, phantomPlayer, assassinPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Seer should see evil players normally
      expect(info.knownPlayers).toContain('player-phantom');
      expect(info.knownPlayers).toContain('player-assassin');
      // Seer should NOT see themselves
      expect(info.knownPlayers).not.toContain('player-seer');
    });

    it('should not make Seer appear as Seer candidate to Oracle', () => {
      // This tests that the actual Seer doesn't have the appears_as_seer effect
      const seer = characterRegistry.get('Seer');

      expect(seer?.effects).not.toContain('appears_as_seer');
    });

    it('should not affect other evil characters perception', () => {
      const assassinPlayer = createTestPlayer({
        id: 'player-assassin',
        display_name: 'Assassin',
        character: 'Assassin',
        team: 'evil',
        seat_order: 0,
      });

      const phantomPlayer = createTestPlayer({
        id: 'player-phantom',
        display_name: 'Phantom',
        character: 'Phantom',
        team: 'evil',
        seat_order: 1,
      });

      const ctx = createTestContext({
        currentPlayer: assassinPlayer,
        players: [assassinPlayer, phantomPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Assassin should see Phantom as evil teammate, not as Seer candidate
      expect(info.knownPlayers).toContain('player-phantom');
      expect(info.knownPlayerLabels?.['player-phantom']).toBe('Evil');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      registerAppearsAsSeerEffect();
      registerAppearsAsGoodEffectForTests();
      registerAllCharacters();
    });

    it('should handle Oracle seeing only Phantom (no real Seer)', () => {
      // Edge case: Seer was eliminated
      const phantomPlayer = createTestPlayer({
        id: 'player-phantom',
        display_name: 'Phantom',
        character: 'Phantom',
        team: 'evil',
        seat_order: 0,
      });

      const oraclePlayer = createTestPlayer({
        id: 'player-oracle',
        display_name: 'Oracle',
        character: 'Oracle',
        team: 'good',
        seat_order: 1,
      });

      const ctx = createTestContext({
        currentPlayer: oraclePlayer,
        players: [phantomPlayer, oraclePlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Oracle sees only Phantom as candidate
      expect(info.knownPlayers).toContain('player-phantom');
      expect(info.knownPlayers).toHaveLength(1);
      // Single candidate should show "Seer" not "Seer?"
      expect(info.knownPlayerLabels?.['player-phantom']).toBe('Seer');
    });

    it('should handle Oracle seeing only real Seer (no Phantom)', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Real Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const oraclePlayer = createTestPlayer({
        id: 'player-oracle',
        display_name: 'Oracle',
        character: 'Oracle',
        team: 'good',
        seat_order: 1,
      });

      const ctx = createTestContext({
        currentPlayer: oraclePlayer,
        players: [seerPlayer, oraclePlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Oracle sees only real Seer
      expect(info.knownPlayers).toContain('player-seer');
      expect(info.knownPlayers).toHaveLength(1);
      // Single candidate should show "Seer" not "Seer?"
      expect(info.knownPlayerLabels?.['player-seer']).toBe('Seer');
    });
  });
});
