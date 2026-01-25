/**
 * Tests for appears_as_good effect (Saboteur's passive ability)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { effectRegistry } from '../registry/EffectRegistry';
import { characterRegistry, registerAllCharacters } from '../registry/CharacterRegistry';
import { appearsAsGoodEffect, registerAppearsAsGoodEffect } from './appearsAsGood';
import { registerAppearsAsSeerEffect } from './appearsAsSeer';
import type { GameContext, Player, Game, EffectId } from '../types/game';

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
    character: 'Seer',
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

describe('appearsAsGoodEffect', () => {
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
      expect(appearsAsGoodEffect.id).toBe('appears_as_good');
    });

    it('should have correct name', () => {
      expect(appearsAsGoodEffect.name).toBe('Appears as Good');
    });

    it('should have description', () => {
      expect(appearsAsGoodEffect.description).toBeTruthy();
      expect(appearsAsGoodEffect.description).toContain('good');
    });

    it('should have appears_as_good modifier', () => {
      expect(appearsAsGoodEffect.modifiers).toHaveLength(1);
      expect(appearsAsGoodEffect.modifiers[0].type).toBe('appears_as_good');
    });

    it('should have no hooks (passive effect)', () => {
      expect(Object.keys(appearsAsGoodEffect.hooks)).toHaveLength(0);
    });
  });

  describe('registerAppearsAsGoodEffect', () => {
    it('should register effect in EffectRegistry', () => {
      expect(effectRegistry.get('appears_as_good')).toBeUndefined();

      registerAppearsAsGoodEffect();

      expect(effectRegistry.get('appears_as_good')).toBe(appearsAsGoodEffect);
    });

    it('should be retrievable by id after registration', () => {
      registerAppearsAsGoodEffect();

      const effect = effectRegistry.get('appears_as_good');
      expect(effect).toBeDefined();
      expect(effect?.name).toBe('Appears as Good');
    });
  });

  describe('modifier queries', () => {
    beforeEach(() => {
      registerAppearsAsGoodEffect();
    });

    it('should return appears_as_good modifier via getModifiers', () => {
      const modifiers = effectRegistry.getModifiers('appears_as_good');

      expect(modifiers).toHaveLength(1);
      expect(modifiers[0].type).toBe('appears_as_good');
    });

    it('should detect modifier via hasModifier', () => {
      const activeEffects: EffectId[] = ['appears_as_good'];

      expect(effectRegistry.hasModifier(activeEffects, 'appears_as_good')).toBe(true);
    });

    it('should not detect appears_as_seer modifier', () => {
      const activeEffects: EffectId[] = ['appears_as_good'];

      expect(effectRegistry.hasModifier(activeEffects, 'appears_as_seer')).toBe(false);
    });

    it('should include modifier in getAllModifiers', () => {
      const activeEffects: EffectId[] = ['appears_as_good'];
      const allModifiers = effectRegistry.getAllModifiers(activeEffects);

      expect(allModifiers).toHaveLength(1);
      expect(allModifiers[0].type).toBe('appears_as_good');
    });
  });

  describe('integration with CharacterRegistry', () => {
    beforeEach(() => {
      registerAppearsAsGoodEffect();
      registerAppearsAsSeerEffect();
      registerAllCharacters();
    });

    it('should be listed in Saboteur character effects', () => {
      const saboteur = characterRegistry.get('Saboteur');

      expect(saboteur).toBeDefined();
      expect(saboteur?.effects).toContain('appears_as_good');
    });

    it('should hide Saboteur from Seer', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const saboteurPlayer = createTestPlayer({
        id: 'player-saboteur',
        display_name: 'Saboteur',
        character: 'Saboteur',
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
        players: [seerPlayer, saboteurPlayer, assassinPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Seer should see Assassin but NOT Saboteur
      expect(info.knownPlayers).toContain('player-assassin');
      expect(info.knownPlayers).not.toContain('player-saboteur');
    });

    it('should still show other evil players to Seer', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const saboteurPlayer = createTestPlayer({
        id: 'player-saboteur',
        display_name: 'Saboteur',
        character: 'Saboteur',
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

      const phantomPlayer = createTestPlayer({
        id: 'player-phantom',
        display_name: 'Phantom',
        character: 'Phantom',
        team: 'evil',
        seat_order: 3,
      });

      const ctx = createTestContext({
        currentPlayer: seerPlayer,
        players: [seerPlayer, saboteurPlayer, assassinPlayer, phantomPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Seer should see all evil except Saboteur
      expect(info.knownPlayers).toContain('player-assassin');
      expect(info.knownPlayers).toContain('player-phantom');
      expect(info.knownPlayers).not.toContain('player-saboteur');
      expect(info.knownPlayers).toHaveLength(2);
    });

    it('should not affect other evil players knowledge of Saboteur', () => {
      const assassinPlayer = createTestPlayer({
        id: 'player-assassin',
        display_name: 'Assassin',
        character: 'Assassin',
        team: 'evil',
        seat_order: 0,
      });

      const saboteurPlayer = createTestPlayer({
        id: 'player-saboteur',
        display_name: 'Saboteur',
        character: 'Saboteur',
        team: 'evil',
        seat_order: 1,
      });

      const ctx = createTestContext({
        currentPlayer: assassinPlayer,
        players: [assassinPlayer, saboteurPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Assassin should still see Saboteur as evil teammate
      expect(info.knownPlayers).toContain('player-saboteur');
      expect(info.knownPlayerLabels?.['player-saboteur']).toBe('Evil');
    });

    it('should not affect Oracle perception', () => {
      const oraclePlayer = createTestPlayer({
        id: 'player-oracle',
        display_name: 'Oracle',
        character: 'Oracle',
        team: 'good',
        seat_order: 0,
      });

      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 1,
      });

      const saboteurPlayer = createTestPlayer({
        id: 'player-saboteur',
        display_name: 'Saboteur',
        character: 'Saboteur',
        team: 'evil',
        seat_order: 2,
      });

      const ctx = createTestContext({
        currentPlayer: oraclePlayer,
        players: [oraclePlayer, seerPlayer, saboteurPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Oracle should only see Seer, not Saboteur
      expect(info.knownPlayers).toContain('player-seer');
      expect(info.knownPlayers).not.toContain('player-saboteur');
    });

    it('should not make Saboteur visible to other good players', () => {
      const guardianPlayer = createTestPlayer({
        id: 'player-guardian',
        display_name: 'Guardian',
        character: 'Guardian',
        team: 'good',
        seat_order: 0,
      });

      const saboteurPlayer = createTestPlayer({
        id: 'player-saboteur',
        display_name: 'Saboteur',
        character: 'Saboteur',
        team: 'evil',
        seat_order: 1,
      });

      const ctx = createTestContext({
        currentPlayer: guardianPlayer,
        players: [guardianPlayer, saboteurPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Guardian has no special knowledge, so shouldn't see anyone
      expect(info.knownPlayers).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      registerAppearsAsGoodEffect();
      registerAppearsAsSeerEffect();
      registerAllCharacters();
    });

    it('should handle Seer seeing only Saboteur (no other evil)', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const saboteurPlayer = createTestPlayer({
        id: 'player-saboteur',
        display_name: 'Saboteur',
        character: 'Saboteur',
        team: 'evil',
        seat_order: 1,
      });

      const ctx = createTestContext({
        currentPlayer: seerPlayer,
        players: [seerPlayer, saboteurPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Seer sees no evil players (only Saboteur, who is hidden)
      expect(info.knownPlayers).toHaveLength(0);
    });

    it('should handle game with multiple hidden evil characters', () => {
      // Theoretically if we had more appears_as_good characters
      // For now, only Saboteur has this effect
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Seer',
        character: 'Seer',
        team: 'good',
        seat_order: 0,
      });

      const saboteur1 = createTestPlayer({
        id: 'player-saboteur-1',
        display_name: 'Saboteur 1',
        character: 'Saboteur',
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
        players: [seerPlayer, saboteur1, assassinPlayer],
      });

      const info = characterRegistry.resolveInfo(ctx);

      // Seer should only see Assassin
      expect(info.knownPlayers).toContain('player-assassin');
      expect(info.knownPlayers).not.toContain('player-saboteur-1');
      expect(info.knownPlayers).toHaveLength(1);
    });

    it('should work correctly when both perception effects are active in same game', () => {
      const seerPlayer = createTestPlayer({
        id: 'player-seer',
        display_name: 'Seer',
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

      const saboteurPlayer = createTestPlayer({
        id: 'player-saboteur',
        display_name: 'Saboteur',
        character: 'Saboteur',
        team: 'evil',
        seat_order: 2,
      });

      const phantomPlayer = createTestPlayer({
        id: 'player-phantom',
        display_name: 'Phantom',
        character: 'Phantom',
        team: 'evil',
        seat_order: 3,
      });

      const assassinPlayer = createTestPlayer({
        id: 'player-assassin',
        display_name: 'Assassin',
        character: 'Assassin',
        team: 'evil',
        seat_order: 4,
      });

      const players = [seerPlayer, oraclePlayer, saboteurPlayer, phantomPlayer, assassinPlayer];

      // Test Seer's view
      const seerCtx = createTestContext({
        currentPlayer: seerPlayer,
        players,
      });
      const seerInfo = characterRegistry.resolveInfo(seerCtx);

      // Seer sees Phantom and Assassin, but NOT Saboteur
      expect(seerInfo.knownPlayers).toContain('player-phantom');
      expect(seerInfo.knownPlayers).toContain('player-assassin');
      expect(seerInfo.knownPlayers).not.toContain('player-saboteur');

      // Test Oracle's view
      const oracleCtx = createTestContext({
        currentPlayer: oraclePlayer,
        players,
      });
      const oracleInfo = characterRegistry.resolveInfo(oracleCtx);

      // Oracle sees Seer and Phantom (as Seer candidates)
      expect(oracleInfo.knownPlayers).toContain('player-seer');
      expect(oracleInfo.knownPlayers).toContain('player-phantom');
      // Oracle does NOT see Saboteur or Assassin
      expect(oracleInfo.knownPlayers).not.toContain('player-saboteur');
      expect(oracleInfo.knownPlayers).not.toContain('player-assassin');
    });
  });
});
