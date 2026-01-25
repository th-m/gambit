/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  filterPlayersForViewer,
  filterPlayerForViewer,
  filterVoteActions,
  getVoteTally,
  shouldRevealAllData,
  getFullPlayerDataForGameOver,
} from './dataPrivacy';
import type { Game, Player, GameAction, CharacterName, Team } from '~/types/game';
import { characterRegistry, registerAllCharacters } from '~/registry/CharacterRegistry';
import { effectRegistry } from '~/registry/EffectRegistry';
import { registerAllEffects } from '~/effects';

// =============================================================================
// Test Helpers
// =============================================================================

function createTestGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    game_key: 'TEST123',
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

function createTestPlayer(
  id: string,
  character: CharacterName | null,
  team: Team | null,
  overrides: Partial<Player> = {}
): Player {
  return {
    id,
    game_id: 'game-1',
    user_id: `user-${id}`,
    display_name: `Player ${id}`,
    character,
    team,
    is_alive: true,
    seat_order: parseInt(id.replace('player-', ''), 10) || 0,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function createTestAction(
  playerId: string,
  actionType: string,
  round: number,
  phase: string
): GameAction {
  return {
    id: `action-${Math.random()}`,
    game_id: 'game-1',
    player_id: playerId,
    action_type: actionType as GameAction['action_type'],
    target_ids: null,
    round,
    phase: phase as GameAction['phase'],
    created_at: new Date().toISOString(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('dataPrivacy', () => {
  beforeEach(() => {
    characterRegistry.clear();
    effectRegistry.clear();
    registerAllCharacters();
    registerAllEffects();
  });

  afterEach(() => {
    characterRegistry.clear();
    effectRegistry.clear();
  });

  // ===========================================================================
  // filterPlayersForViewer
  // ===========================================================================

  describe('filterPlayersForViewer', () => {
    describe('basic privacy', () => {
      it('hides all character/team info when no viewing player', () => {
        const game = createTestGame();
        const players = [
          createTestPlayer('player-1', 'Seer', 'good'),
          createTestPlayer('player-2', 'Assassin', 'evil'),
        ];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: null,
        });

        expect(result.players[0].character).toBeNull();
        expect(result.players[0].team).toBeNull();
        expect(result.players[1].character).toBeNull();
        expect(result.players[1].team).toBeNull();
      });

      it('always shows own character/team to viewing player', () => {
        const game = createTestGame();
        const seer = createTestPlayer('player-1', 'Seer', 'good');
        const assassin = createTestPlayer('player-2', 'Assassin', 'evil');
        const players = [seer, assassin];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: seer,
        });

        // Seer sees own info
        const seerData = result.players.find((p) => p.id === 'player-1');
        expect(seerData?.character).toBe('Seer');
        expect(seerData?.team).toBe('good');
      });

      it('hides other players character/team from regular good player', () => {
        const game = createTestGame();
        const villager = createTestPlayer('player-1', 'Villager', 'good');
        const assassin = createTestPlayer('player-2', 'Assassin', 'evil');
        const seer = createTestPlayer('player-3', 'Seer', 'good');
        const players = [villager, assassin, seer];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: villager,
        });

        // Villager sees own info
        const villagerData = result.players.find((p) => p.id === 'player-1');
        expect(villagerData?.character).toBe('Villager');
        expect(villagerData?.team).toBe('good');

        // Villager doesn't see others
        const assassinData = result.players.find((p) => p.id === 'player-2');
        expect(assassinData?.character).toBeNull();
        expect(assassinData?.team).toBeNull();

        const seerData = result.players.find((p) => p.id === 'player-3');
        expect(seerData?.character).toBeNull();
        expect(seerData?.team).toBeNull();
      });
    });

    describe('lobby phase', () => {
      it('shows no character/team during lobby (even for same player)', () => {
        const game = createTestGame({ status: 'lobby', phase: null });
        const player = createTestPlayer('player-1', null, null);
        const players = [player];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: player,
        });

        expect(result.players[0].character).toBeNull();
        expect(result.players[0].team).toBeNull();
      });
    });

    describe('Seer visibility', () => {
      it('Seer sees evil players team but not character', () => {
        const game = createTestGame();
        const seer = createTestPlayer('player-1', 'Seer', 'good');
        const assassin = createTestPlayer('player-2', 'Assassin', 'evil');
        const minion = createTestPlayer('player-3', 'Minion', 'evil');
        const players = [seer, assassin, minion];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: seer,
        });

        // Seer knows evil team
        expect(result.knownEvilPlayerIds).toContain('player-2');
        expect(result.knownEvilPlayerIds).toContain('player-3');

        // But doesn't see their specific characters
        const assassinData = result.players.find((p) => p.id === 'player-2');
        expect(assassinData?.team).toBe('evil');
        expect(assassinData?.character).toBeNull();
      });

      it('Seer cannot see Saboteur (appears_as_good effect)', () => {
        const game = createTestGame();
        const seer = createTestPlayer('player-1', 'Seer', 'good');
        const saboteur = createTestPlayer('player-2', 'Saboteur', 'evil');
        const assassin = createTestPlayer('player-3', 'Assassin', 'evil');
        const players = [seer, saboteur, assassin];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: seer,
        });

        // Seer sees Assassin but not Saboteur
        expect(result.knownEvilPlayerIds).toContain('player-3');
        expect(result.knownEvilPlayerIds).not.toContain('player-2');

        // Saboteur's data is fully hidden from Seer
        const saboteurData = result.players.find((p) => p.id === 'player-2');
        expect(saboteurData?.team).toBeNull();
        expect(saboteurData?.character).toBeNull();
      });
    });

    describe('Oracle visibility', () => {
      it('Oracle sees Seer candidates (real Seer)', () => {
        const game = createTestGame();
        const oracle = createTestPlayer('player-1', 'Oracle', 'good');
        const seer = createTestPlayer('player-2', 'Seer', 'good');
        const villager = createTestPlayer('player-3', 'Villager', 'good');
        const players = [oracle, seer, villager];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: oracle,
        });

        // Oracle knows Seer is a Seer candidate
        expect(result.seerCandidateIds).toContain('player-2');
        expect(result.seerCandidateIds).not.toContain('player-3');
      });

      it('Oracle sees Phantom as Seer candidate (appears_as_seer effect)', () => {
        const game = createTestGame();
        const oracle = createTestPlayer('player-1', 'Oracle', 'good');
        const seer = createTestPlayer('player-2', 'Seer', 'good');
        const phantom = createTestPlayer('player-3', 'Phantom', 'evil');
        const players = [oracle, seer, phantom];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: oracle,
        });

        // Oracle sees both as Seer candidates (can't tell which is real)
        expect(result.seerCandidateIds).toContain('player-2');
        expect(result.seerCandidateIds).toContain('player-3');

        // Oracle doesn't see their actual team/character
        const phantomData = result.players.find((p) => p.id === 'player-3');
        expect(phantomData?.character).toBeNull();
        expect(phantomData?.team).toBeNull();
      });
    });

    describe('Evil team visibility', () => {
      it('evil players see other evil players team', () => {
        const game = createTestGame();
        const assassin = createTestPlayer('player-1', 'Assassin', 'evil');
        const minion = createTestPlayer('player-2', 'Minion', 'evil');
        const seer = createTestPlayer('player-3', 'Seer', 'good');
        const players = [assassin, minion, seer];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: assassin,
        });

        // Assassin knows Minion is evil
        expect(result.knownEvilPlayerIds).toContain('player-1');
        expect(result.knownEvilPlayerIds).toContain('player-2');

        // But Assassin doesn't see Minion's specific character
        const minionData = result.players.find((p) => p.id === 'player-2');
        expect(minionData?.team).toBe('evil');
        expect(minionData?.character).toBeNull();

        // And doesn't know about good players
        const seerData = result.players.find((p) => p.id === 'player-3');
        expect(seerData?.team).toBeNull();
        expect(seerData?.character).toBeNull();
      });

      it('evil players see Saboteur as evil', () => {
        const game = createTestGame();
        const assassin = createTestPlayer('player-1', 'Assassin', 'evil');
        const saboteur = createTestPlayer('player-2', 'Saboteur', 'evil');
        const players = [assassin, saboteur];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: assassin,
        });

        // Evil team sees all evil members, including Saboteur
        expect(result.knownEvilPlayerIds).toContain('player-2');
        const saboteurData = result.players.find((p) => p.id === 'player-2');
        expect(saboteurData?.team).toBe('evil');
      });
    });

    describe('preserves non-sensitive data', () => {
      it('preserves id, display_name, is_alive, seat_order', () => {
        const game = createTestGame();
        const player = createTestPlayer('player-1', 'Assassin', 'evil', {
          display_name: 'Test Player',
          is_alive: false,
          seat_order: 5,
        });
        const viewer = createTestPlayer('player-2', 'Villager', 'good');
        const players = [player, viewer];

        const result = filterPlayersForViewer({
          game,
          players,
          viewingPlayer: viewer,
        });

        const filteredPlayer = result.players.find((p) => p.id === 'player-1');
        expect(filteredPlayer?.id).toBe('player-1');
        expect(filteredPlayer?.display_name).toBe('Test Player');
        expect(filteredPlayer?.is_alive).toBe(false);
        expect(filteredPlayer?.seat_order).toBe(5);
      });
    });
  });

  // ===========================================================================
  // filterPlayerForViewer
  // ===========================================================================

  describe('filterPlayerForViewer', () => {
    it('filters single player data correctly', () => {
      const game = createTestGame();
      const player = createTestPlayer('player-1', 'Assassin', 'evil');
      const viewer = createTestPlayer('player-2', 'Villager', 'good');

      const result = filterPlayerForViewer(player, viewer, game, [player, viewer]);

      expect(result.character).toBeNull();
      expect(result.team).toBeNull();
    });
  });

  // ===========================================================================
  // filterVoteActions
  // ===========================================================================

  describe('filterVoteActions', () => {
    it('removes player_id from mission votes always', () => {
      const actions = [
        createTestAction('player-1', 'vote_pass', 1, 'mission_voting'),
        createTestAction('player-2', 'vote_fail', 1, 'mission_voting'),
      ];

      const filtered = filterVoteActions(actions, 'mission_voting', true);

      expect(filtered[0]).not.toHaveProperty('player_id');
      expect(filtered[1]).not.toHaveProperty('player_id');
    });

    it('removes player_id from leader votes when not all votes in', () => {
      const actions = [
        createTestAction('player-1', 'vote_yes', 1, 'voting_for_leader'),
      ];

      const filtered = filterVoteActions(actions, 'voting_for_leader', false);

      expect(filtered[0]).not.toHaveProperty('player_id');
    });

    it('keeps player_id for leader votes when all votes are in', () => {
      const actions = [
        createTestAction('player-1', 'vote_yes', 1, 'voting_for_leader'),
        createTestAction('player-2', 'vote_no', 1, 'voting_for_leader'),
      ];

      const filtered = filterVoteActions(actions, 'voting_for_leader', true);

      // Leader votes keep attribution when revealed
      expect((filtered[0] as GameAction).player_id).toBe('player-1');
      expect((filtered[1] as GameAction).player_id).toBe('player-2');
    });

    it('preserves non-vote actions with player_id', () => {
      const actions = [
        createTestAction('player-1', 'assassinate', 1, 'assassination'),
      ];

      const filtered = filterVoteActions(actions, 'assassination', false);

      expect((filtered[0] as GameAction).player_id).toBe('player-1');
    });
  });

  // ===========================================================================
  // getVoteTally
  // ===========================================================================

  describe('getVoteTally', () => {
    it('calculates vote tallies correctly', () => {
      const actions = [
        createTestAction('player-1', 'vote_pass', 1, 'mission_voting'),
        createTestAction('player-2', 'vote_pass', 1, 'mission_voting'),
        createTestAction('player-3', 'vote_fail', 1, 'mission_voting'),
      ];

      const tally = getVoteTally(actions, 1, 'mission_voting');

      expect(tally.pass).toBe(2);
      expect(tally.fail).toBe(1);
      expect(tally.total).toBe(3);
    });

    it('filters by round and phase', () => {
      const actions = [
        createTestAction('player-1', 'vote_pass', 1, 'mission_voting'),
        createTestAction('player-2', 'vote_pass', 2, 'mission_voting'), // Different round
        createTestAction('player-3', 'vote_yes', 1, 'voting_for_leader'), // Different phase
      ];

      const tally = getVoteTally(actions, 1, 'mission_voting');

      expect(tally.pass).toBe(1);
      expect(tally.total).toBe(1);
    });

    it('calculates leader vote tallies', () => {
      const actions = [
        createTestAction('player-1', 'vote_yes', 1, 'voting_for_leader'),
        createTestAction('player-2', 'vote_yes', 1, 'voting_for_leader'),
        createTestAction('player-3', 'vote_no', 1, 'voting_for_leader'),
      ];

      const tally = getVoteTally(actions, 1, 'voting_for_leader');

      expect(tally.yes).toBe(2);
      expect(tally.no).toBe(1);
      expect(tally.total).toBe(3);
    });
  });

  // ===========================================================================
  // shouldRevealAllData
  // ===========================================================================

  describe('shouldRevealAllData', () => {
    it('returns true when game is finished', () => {
      const game = createTestGame({ status: 'finished' });
      expect(shouldRevealAllData(game)).toBe(true);
    });

    it('returns false when game is playing', () => {
      const game = createTestGame({ status: 'playing' });
      expect(shouldRevealAllData(game)).toBe(false);
    });

    it('returns false when game is in lobby', () => {
      const game = createTestGame({ status: 'lobby' });
      expect(shouldRevealAllData(game)).toBe(false);
    });
  });

  // ===========================================================================
  // getFullPlayerDataForGameOver
  // ===========================================================================

  describe('getFullPlayerDataForGameOver', () => {
    it('returns all player data unmodified', () => {
      const players = [
        createTestPlayer('player-1', 'Seer', 'good'),
        createTestPlayer('player-2', 'Assassin', 'evil'),
      ];

      const result = getFullPlayerDataForGameOver(players);

      expect(result[0].character).toBe('Seer');
      expect(result[0].team).toBe('good');
      expect(result[1].character).toBe('Assassin');
      expect(result[1].team).toBe('evil');
    });
  });
});
