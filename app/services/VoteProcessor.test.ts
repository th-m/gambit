import { describe, it, expect, beforeEach } from 'vitest';
import { VoteProcessor, getMissionSize, getRequiredFailVotes } from './VoteProcessor';
import { GameService } from './GameService';
import type { CharacterName, Team } from '~/types/game';

describe('VoteProcessor', () => {
  let processor: VoteProcessor;
  let gameService: GameService;

  beforeEach(() => {
    gameService = new GameService();
    processor = new VoteProcessor(gameService);
  });

  // ===========================================================================
  // Helper Functions
  // ===========================================================================

  function setupGameWithPlayers(
    playerCount: number,
    phase: 'voting_for_leader' | 'mission_voting' = 'voting_for_leader'
  ) {
    const game = gameService.createGame('host-1');

    // Add players first (while game is in lobby status)
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const player = gameService.addPlayer(game.id, `user-${i}`, `Player ${i}`);
      // Assign alternating teams
      const team: Team = i % 3 === 0 ? 'evil' : 'good';
      const character: CharacterName = team === 'evil' ? 'Assassin' : 'Seer';
      gameService.updatePlayer(player.id, {
        team,
        character,
        seat_order: i,
      });
      players.push(gameService.getPlayerById(player.id)!);
    }

    // Update game status after adding players
    gameService.updateGame(game.id, {
      status: 'playing',
      phase,
      current_round: 1,
    });

    return { game: gameService.getGameById(game.id)!, players };
  }

  function setupMissionGame(playerCount: number) {
    const { game, players } = setupGameWithPlayers(playerCount, 'mission_voting');
    
    // Set up a team of the first N players based on mission size
    const missionSize = getMissionSize(playerCount, 1);
    const team = players.slice(0, missionSize).map((p) => p.id);
    gameService.updateGame(game.id, { selected_team: team });

    return {
      game: gameService.getGameById(game.id)!,
      players,
      teamPlayers: players.slice(0, missionSize),
    };
  }

  // ===========================================================================
  // getMissionSize Tests
  // ===========================================================================

  describe('getMissionSize', () => {
    it('returns correct size for 5 players', () => {
      expect(getMissionSize(5, 1)).toBe(2);
      expect(getMissionSize(5, 2)).toBe(3);
      expect(getMissionSize(5, 3)).toBe(2);
      expect(getMissionSize(5, 4)).toBe(3);
      expect(getMissionSize(5, 5)).toBe(3);
    });

    it('returns correct size for 7 players', () => {
      expect(getMissionSize(7, 1)).toBe(2);
      expect(getMissionSize(7, 2)).toBe(3);
      expect(getMissionSize(7, 3)).toBe(3);
      expect(getMissionSize(7, 4)).toBe(4);
      expect(getMissionSize(7, 5)).toBe(4);
    });

    it('returns correct size for 10 players', () => {
      expect(getMissionSize(10, 1)).toBe(3);
      expect(getMissionSize(10, 2)).toBe(4);
      expect(getMissionSize(10, 3)).toBe(4);
      expect(getMissionSize(10, 4)).toBe(5);
      expect(getMissionSize(10, 5)).toBe(5);
    });

    it('returns default 3 for invalid player count', () => {
      expect(getMissionSize(4, 1)).toBe(3);
      expect(getMissionSize(11, 1)).toBe(3);
    });
  });

  // ===========================================================================
  // getRequiredFailVotes Tests
  // ===========================================================================

  describe('getRequiredFailVotes', () => {
    it('returns 1 for most rounds', () => {
      expect(getRequiredFailVotes(5, 1)).toBe(1);
      expect(getRequiredFailVotes(5, 2)).toBe(1);
      expect(getRequiredFailVotes(5, 3)).toBe(1);
      expect(getRequiredFailVotes(5, 4)).toBe(1);
      expect(getRequiredFailVotes(5, 5)).toBe(1);
      expect(getRequiredFailVotes(6, 4)).toBe(1);
    });

    it('returns 2 for round 4 with 7+ players', () => {
      expect(getRequiredFailVotes(7, 4)).toBe(2);
      expect(getRequiredFailVotes(8, 4)).toBe(2);
      expect(getRequiredFailVotes(9, 4)).toBe(2);
      expect(getRequiredFailVotes(10, 4)).toBe(2);
    });

    it('returns 1 for round 4 with fewer than 7 players', () => {
      expect(getRequiredFailVotes(5, 4)).toBe(1);
      expect(getRequiredFailVotes(6, 4)).toBe(1);
    });
  });

  // ===========================================================================
  // submitLeaderVote Tests - Duplicate Vote Prevention
  // ===========================================================================

  describe('submitLeaderVote - duplicate prevention', () => {
    it('prevents duplicate voting', () => {
      const { game, players } = setupGameWithPlayers(5);

      const result1 = processor.submitLeaderVote(game.id, players[0].id, 'yes');
      expect(result1.success).toBe(true);

      const result2 = processor.submitLeaderVote(game.id, players[0].id, 'no');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Already voted');
    });

    it('allows different players to vote', () => {
      const { game, players } = setupGameWithPlayers(5);

      const result1 = processor.submitLeaderVote(game.id, players[0].id, 'yes');
      const result2 = processor.submitLeaderVote(game.id, players[1].id, 'no');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  // ===========================================================================
  // submitLeaderVote Tests - Phase Validation
  // ===========================================================================

  describe('submitLeaderVote - phase validation', () => {
    it('rejects vote in wrong phase', () => {
      const { game, players } = setupGameWithPlayers(5);
      gameService.updateGame(game.id, { phase: 'mission_voting' });

      const result = processor.submitLeaderVote(game.id, players[0].id, 'yes');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not in leader voting phase');
    });

    it('rejects vote when game not found', () => {
      const result = processor.submitLeaderVote('non-existent', 'player-id', 'yes');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Game not found');
    });

    it('rejects vote from non-game player', () => {
      const { game } = setupGameWithPlayers(5);

      const result = processor.submitLeaderVote(game.id, 'non-existent-player', 'yes');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Player not in game');
    });
  });

  // ===========================================================================
  // submitLeaderVote Tests - Vote Tallying & Majority
  // ===========================================================================

  describe('submitLeaderVote - vote tallying and majority', () => {
    it('calculates majority correctly - approval', () => {
      const { game, players } = setupGameWithPlayers(5);

      // 3 yes, 2 no = approved (majority)
      processor.submitLeaderVote(game.id, players[0].id, 'yes');
      processor.submitLeaderVote(game.id, players[1].id, 'yes');
      processor.submitLeaderVote(game.id, players[2].id, 'yes');
      processor.submitLeaderVote(game.id, players[3].id, 'no');
      const result = processor.submitLeaderVote(game.id, players[4].id, 'no');

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('approved');
      expect(result.tally).toEqual({ yes: 3, no: 2 });
    });

    it('calculates majority correctly - rejection', () => {
      const { game, players } = setupGameWithPlayers(5);

      // 2 yes, 3 no = rejected
      processor.submitLeaderVote(game.id, players[0].id, 'yes');
      processor.submitLeaderVote(game.id, players[1].id, 'yes');
      processor.submitLeaderVote(game.id, players[2].id, 'no');
      processor.submitLeaderVote(game.id, players[3].id, 'no');
      const result = processor.submitLeaderVote(game.id, players[4].id, 'no');

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('rejected');
      expect(result.tally).toEqual({ yes: 2, no: 3 });
    });

    it('tie goes to rejection (requires strict majority)', () => {
      const { game, players } = setupGameWithPlayers(6);

      // 3 yes, 3 no = rejected (no strict majority)
      processor.submitLeaderVote(game.id, players[0].id, 'yes');
      processor.submitLeaderVote(game.id, players[1].id, 'yes');
      processor.submitLeaderVote(game.id, players[2].id, 'yes');
      processor.submitLeaderVote(game.id, players[3].id, 'no');
      processor.submitLeaderVote(game.id, players[4].id, 'no');
      const result = processor.submitLeaderVote(game.id, players[5].id, 'no');

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('rejected');
    });

    it('returns partial tally before all votes in', () => {
      const { game, players } = setupGameWithPlayers(5);

      processor.submitLeaderVote(game.id, players[0].id, 'yes');
      const result = processor.submitLeaderVote(game.id, players[1].id, 'no');

      expect(result.success).toBe(true);
      expect(result.allVotesIn).toBe(false);
      expect(result.tally).toEqual({ yes: 1, no: 1 });
    });
  });

  // ===========================================================================
  // submitLeaderVote Tests - Leader Approval/Rejection Processing
  // ===========================================================================

  describe('submitLeaderVote - leader approval processing', () => {
    it('moves to selecting_team phase on approval', () => {
      const { game, players } = setupGameWithPlayers(5);

      // All vote yes
      for (const player of players) {
        processor.submitLeaderVote(game.id, player.id, 'yes');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.phase).toBe('selecting_team');
      expect(updatedGame.rejection_count).toBe(0);
    });

    it('increments rejection count on rejection', () => {
      const { game, players } = setupGameWithPlayers(5);

      // All vote no
      for (const player of players) {
        processor.submitLeaderVote(game.id, player.id, 'no');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.rejection_count).toBe(1);
      expect(updatedGame.crown_index).toBe(1); // Crown moved to next player
    });

    it('moves crown to next player on rejection', () => {
      const { game, players } = setupGameWithPlayers(5);
      expect(game.crown_index).toBe(0);

      // All vote no
      for (const player of players) {
        processor.submitLeaderVote(game.id, player.id, 'no');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.crown_index).toBe(1);
    });
  });

  // ===========================================================================
  // submitLeaderVote Tests - 3-Rejection Auto-Fail
  // ===========================================================================

  describe('submitLeaderVote - 3-rejection auto-fail', () => {
    it('handles 3 consecutive rejections - gives evil a point', () => {
      const { game, players } = setupGameWithPlayers(5);

      // Set rejection count to 2 (third rejection will trigger auto-fail)
      gameService.updateGame(game.id, { rejection_count: 2 });

      // All vote no
      for (const player of players) {
        processor.submitLeaderVote(game.id, player.id, 'no');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.evil_victories).toBe(1);
      expect(updatedGame.rejection_count).toBe(0); // Reset
      expect(updatedGame.current_round).toBe(2); // Advanced
      expect(updatedGame.phase).toBe('voting_for_leader');
    });

    it('3-rejection causes evil victory when they have 2 points', () => {
      const { game, players } = setupGameWithPlayers(5);

      // Evil already has 2 victories
      gameService.updateGame(game.id, { rejection_count: 2, evil_victories: 2 });

      // All vote no
      for (const player of players) {
        processor.submitLeaderVote(game.id, player.id, 'no');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.evil_victories).toBe(3);
      expect(updatedGame.status).toBe('finished');
      expect(updatedGame.winner).toBe('evil');
      expect(updatedGame.end_reason).toBe('3 consecutive leader rejections');
    });
  });

  // ===========================================================================
  // submitMissionVote Tests - Basic Validation
  // ===========================================================================

  describe('submitMissionVote - basic validation', () => {
    it('rejects vote from non-team member', () => {
      const { game, players, teamPlayers } = setupMissionGame(5);

      // Find a player not on the team
      const nonTeamPlayer = players.find((p) => !teamPlayers.includes(p))!;

      const result = processor.submitMissionVote(game.id, nonTeamPlayer.id, 'pass');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not on mission team');
    });

    it('allows team member to vote', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      const result = processor.submitMissionVote(game.id, teamPlayers[0].id, 'pass');
      expect(result.success).toBe(true);
    });

    it('rejects vote in wrong phase', () => {
      const { game, players } = setupGameWithPlayers(5, 'voting_for_leader');

      const result = processor.submitMissionVote(game.id, players[0].id, 'pass');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Not in mission voting phase');
    });

    it('prevents duplicate mission votes', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      const result1 = processor.submitMissionVote(game.id, teamPlayers[0].id, 'pass');
      expect(result1.success).toBe(true);

      const result2 = processor.submitMissionVote(game.id, teamPlayers[0].id, 'pass');
      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Already voted');
    });
  });

  // ===========================================================================
  // submitMissionVote Tests - Good Players Cannot Vote Fail
  // ===========================================================================

  describe('submitMissionVote - good players cannot vote fail', () => {
    it('good player cannot vote fail', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Find a good player on the team
      const goodPlayer = teamPlayers.find((p) => p.team === 'good');
      if (!goodPlayer) {
        // If no good player on team, add one
        const goodPlayer = teamPlayers[1];
        gameService.updatePlayer(goodPlayer.id, { team: 'good' });
      }
      
      const targetPlayer = teamPlayers.find((p) => 
        gameService.getPlayerById(p.id)?.team === 'good'
      ) || teamPlayers[1];
      
      // Force this player to be good for the test
      gameService.updatePlayer(targetPlayer.id, { team: 'good' });

      const result = processor.submitMissionVote(game.id, targetPlayer.id, 'fail');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Good players cannot vote fail');
    });

    it('evil player can vote fail', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Find or make an evil player on the team
      const evilPlayer = teamPlayers[0];
      gameService.updatePlayer(evilPlayer.id, { team: 'evil' });

      const result = processor.submitMissionVote(game.id, evilPlayer.id, 'fail');
      expect(result.success).toBe(true);
    });

    it('good player can vote pass', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Ensure first player is good
      gameService.updatePlayer(teamPlayers[0].id, { team: 'good' });

      const result = processor.submitMissionVote(game.id, teamPlayers[0].id, 'pass');
      expect(result.success).toBe(true);
    });
  });

  // ===========================================================================
  // submitMissionVote Tests - Mission Pass/Fail Determination
  // ===========================================================================

  describe('submitMissionVote - mission result determination', () => {
    it('mission passes with all pass votes', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Make all team players vote pass (make them all good to simplify)
      for (const player of teamPlayers) {
        gameService.updatePlayer(player.id, { team: 'good' });
      }

      for (let i = 0; i < teamPlayers.length - 1; i++) {
        processor.submitMissionVote(game.id, teamPlayers[i].id, 'pass');
      }
      const result = processor.submitMissionVote(
        game.id,
        teamPlayers[teamPlayers.length - 1].id,
        'pass'
      );

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('passed');
    });

    it('mission fails with 1 fail vote (standard rounds)', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Make first player evil so they can vote fail
      gameService.updatePlayer(teamPlayers[0].id, { team: 'evil' });
      
      // Make rest good
      for (let i = 1; i < teamPlayers.length; i++) {
        gameService.updatePlayer(teamPlayers[i].id, { team: 'good' });
      }

      // First player votes fail
      processor.submitMissionVote(game.id, teamPlayers[0].id, 'fail');
      
      // Rest vote pass
      for (let i = 1; i < teamPlayers.length - 1; i++) {
        processor.submitMissionVote(game.id, teamPlayers[i].id, 'pass');
      }
      const result = processor.submitMissionVote(
        game.id,
        teamPlayers[teamPlayers.length - 1].id,
        'pass'
      );

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('failed');
    });

    it('returns correct tally in result', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Make first player evil, rest good
      gameService.updatePlayer(teamPlayers[0].id, { team: 'evil' });
      for (let i = 1; i < teamPlayers.length; i++) {
        gameService.updatePlayer(teamPlayers[i].id, { team: 'good' });
      }

      processor.submitMissionVote(game.id, teamPlayers[0].id, 'fail');
      const result = processor.submitMissionVote(game.id, teamPlayers[1].id, 'pass');

      expect(result.tally).toEqual({ pass: 1, fail: 1 });
    });
  });

  // ===========================================================================
  // submitMissionVote Tests - 2-Fail Requirement for Round 4 with 7+ Players
  // ===========================================================================

  describe('submitMissionVote - 2-fail requirement for round 4 with 7+ players', () => {
    it('mission passes with 1 fail vote on round 4 with 7 players', () => {
      // Create game with 7 players
      const game = gameService.createGame('host-1');

      // Add players first (while game is in lobby status)
      const players = [];
      for (let i = 0; i < 7; i++) {
        const player = gameService.addPlayer(game.id, `user-${i}`, `Player ${i}`);
        const team: Team = i === 0 ? 'evil' : 'good';
        gameService.updatePlayer(player.id, { team, seat_order: i });
        players.push(gameService.getPlayerById(player.id)!);
      }

      // Update game status after adding players
      gameService.updateGame(game.id, {
        status: 'playing',
        phase: 'mission_voting',
        current_round: 4,
      });

      // Team of 4 for round 4 with 7 players
      const teamIds = players.slice(0, 4).map((p) => p.id);
      gameService.updateGame(game.id, { selected_team: teamIds });

      // First player (evil) votes fail, rest vote pass
      processor.submitMissionVote(game.id, players[0].id, 'fail');
      processor.submitMissionVote(game.id, players[1].id, 'pass');
      processor.submitMissionVote(game.id, players[2].id, 'pass');
      const result = processor.submitMissionVote(game.id, players[3].id, 'pass');

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('passed'); // Only 1 fail, need 2 for round 4 with 7+ players
    });

    it('mission fails with 2 fail votes on round 4 with 7 players', () => {
      const game = gameService.createGame('host-1');

      // Add players first (while game is in lobby status)
      const players = [];
      for (let i = 0; i < 7; i++) {
        const player = gameService.addPlayer(game.id, `user-${i}`, `Player ${i}`);
        // Make first two evil
        const team: Team = i < 2 ? 'evil' : 'good';
        gameService.updatePlayer(player.id, { team, seat_order: i });
        players.push(gameService.getPlayerById(player.id)!);
      }

      // Update game status after adding players
      gameService.updateGame(game.id, {
        status: 'playing',
        phase: 'mission_voting',
        current_round: 4,
      });

      const teamIds = players.slice(0, 4).map((p) => p.id);
      gameService.updateGame(game.id, { selected_team: teamIds });

      // Two evil players vote fail
      processor.submitMissionVote(game.id, players[0].id, 'fail');
      processor.submitMissionVote(game.id, players[1].id, 'fail');
      processor.submitMissionVote(game.id, players[2].id, 'pass');
      const result = processor.submitMissionVote(game.id, players[3].id, 'pass');

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('failed'); // 2 fails = mission failed
    });
  });

  // ===========================================================================
  // submitMissionVote Tests - rig_vote (force_pass) Modifier
  // ===========================================================================

  describe('submitMissionVote - rig_vote modifier (force_pass)', () => {
    it('force_pass modifier makes mission pass despite fail votes', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Add force_pass modifier
      processor.addModifier(game.id, 1, 'force_pass', 'fixer-player-id');

      // Make first player evil, rest good
      gameService.updatePlayer(teamPlayers[0].id, { team: 'evil' });
      for (let i = 1; i < teamPlayers.length; i++) {
        gameService.updatePlayer(teamPlayers[i].id, { team: 'good' });
      }

      // Evil player votes fail
      processor.submitMissionVote(game.id, teamPlayers[0].id, 'fail');
      const result = processor.submitMissionVote(game.id, teamPlayers[1].id, 'pass');

      // Let all team members vote
      for (let i = 2; i < teamPlayers.length; i++) {
        processor.submitMissionVote(game.id, teamPlayers[i].id, 'pass');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.good_victories).toBe(1); // Mission passed despite fail vote
    });
  });

  // ===========================================================================
  // submitMissionVote Tests - extra_fail (sabotage) Modifier
  // ===========================================================================

  describe('submitMissionVote - extra_fail modifier (sabotage)', () => {
    it('extra_fail modifier adds one fail vote to tally', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Add extra_fail modifier
      processor.addModifier(game.id, 1, 'extra_fail', 'saboteur-player-id');

      // Make all team players good (so they all vote pass)
      for (const player of teamPlayers) {
        gameService.updatePlayer(player.id, { team: 'good' });
      }

      // All vote pass
      for (let i = 0; i < teamPlayers.length - 1; i++) {
        processor.submitMissionVote(game.id, teamPlayers[i].id, 'pass');
      }
      const result = processor.submitMissionVote(
        game.id,
        teamPlayers[teamPlayers.length - 1].id,
        'pass'
      );

      expect(result.allVotesIn).toBe(true);
      expect(result.result).toBe('failed'); // Extra fail vote causes failure
    });
  });

  // ===========================================================================
  // Mission Win Condition Tests
  // ===========================================================================

  describe('mission win conditions', () => {
    it('triggers assassination phase when good wins 3 and Assassin is alive', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Set good to have 2 victories already
      gameService.updateGame(game.id, { good_victories: 2 });

      // Make sure there's an Assassin alive
      const assassinPlayer = gameService.getPlayers(game.id).find((p) => p.character === 'Assassin');
      if (assassinPlayer) {
        gameService.updatePlayer(assassinPlayer.id, { is_alive: true });
      }

      // Make all team players good so they vote pass
      for (const player of teamPlayers) {
        gameService.updatePlayer(player.id, { team: 'good' });
      }

      // All vote pass
      for (const player of teamPlayers) {
        processor.submitMissionVote(game.id, player.id, 'pass');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.good_victories).toBe(3);
      expect(updatedGame.phase).toBe('assassination');
      expect(updatedGame.status).toBe('playing'); // Game not finished yet
    });

    it('good wins immediately if 3 missions pass and Assassin is dead', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Set good to have 2 victories already
      gameService.updateGame(game.id, { good_victories: 2 });

      // Kill ALL Assassins (there may be more than one with the setup)
      const assassinPlayers = gameService.getPlayers(game.id).filter((p) => p.character === 'Assassin');
      for (const assassin of assassinPlayers) {
        gameService.updatePlayer(assassin.id, { is_alive: false });
      }

      // Make all team players good
      for (const player of teamPlayers) {
        gameService.updatePlayer(player.id, { team: 'good' });
      }

      // All vote pass
      for (const player of teamPlayers) {
        processor.submitMissionVote(game.id, player.id, 'pass');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.good_victories).toBe(3);
      expect(updatedGame.status).toBe('finished');
      expect(updatedGame.winner).toBe('good');
      expect(updatedGame.end_reason).toBe('Good completed 3 successful missions');
    });

    it('evil wins when 3 missions fail', () => {
      const { game, teamPlayers } = setupMissionGame(5);

      // Set evil to have 2 victories already
      gameService.updateGame(game.id, { evil_victories: 2 });

      // Make first player evil so they can vote fail
      gameService.updatePlayer(teamPlayers[0].id, { team: 'evil' });
      for (let i = 1; i < teamPlayers.length; i++) {
        gameService.updatePlayer(teamPlayers[i].id, { team: 'good' });
      }

      // Evil player votes fail
      processor.submitMissionVote(game.id, teamPlayers[0].id, 'fail');
      
      // Rest vote pass
      for (let i = 1; i < teamPlayers.length; i++) {
        processor.submitMissionVote(game.id, teamPlayers[i].id, 'pass');
      }

      const updatedGame = gameService.getGameById(game.id)!;
      expect(updatedGame.evil_victories).toBe(3);
      expect(updatedGame.status).toBe('finished');
      expect(updatedGame.winner).toBe('evil');
      expect(updatedGame.end_reason).toBe('Evil sabotaged 3 missions');
    });
  });

  // ===========================================================================
  // Beeper Vibration Tests
  // ===========================================================================

  describe('beeper vibration', () => {
    it('triggerBeeperVibration returns players with beeper status', () => {
      const { game, players } = setupMissionGame(5);

      // Add beeper status to some players
      processor.addStatus(game.id, players[0].id, 'beepered', 'tracker-id', 2);
      processor.addStatus(game.id, players[2].id, 'beepered', 'tracker-id', 2);

      const beeperedPlayers = processor.triggerBeeperVibration(game.id, 1);

      expect(beeperedPlayers).toHaveLength(2);
      expect(beeperedPlayers).toContain(players[0].id);
      expect(beeperedPlayers).toContain(players[2].id);
    });

    it('does not include expired beeper statuses', () => {
      const { game, players } = setupMissionGame(5);

      // Add beeper status that expires at round 1
      processor.addStatus(game.id, players[0].id, 'beepered', 'tracker-id', 1);

      // Check at round 2
      const beeperedPlayers = processor.triggerBeeperVibration(game.id, 2);

      expect(beeperedPlayers).toHaveLength(0);
    });
  });

  // ===========================================================================
  // Cleanup Round Tests
  // ===========================================================================

  describe('cleanupRound', () => {
    it('removes expired statuses', () => {
      const { game, players } = setupMissionGame(5);

      // Add status expiring at round 1
      processor.addStatus(game.id, players[0].id, 'protected', 'guardian-id', 1);
      
      expect(processor.hasStatus(game.id, players[0].id, 'protected', 1)).toBe(true);

      processor.cleanupRound(game.id, 1);

      expect(processor.hasStatus(game.id, players[0].id, 'protected', 2)).toBe(false);
    });

    it('removes modifiers from completed round', () => {
      const { game } = setupMissionGame(5);

      processor.addModifier(game.id, 1, 'force_pass', 'fixer-id');
      expect(processor.hasModifier(game.id, 1, 'force_pass')).toBe(true);

      processor.cleanupRound(game.id, 1);

      expect(processor.hasModifier(game.id, 1, 'force_pass')).toBe(false);
    });

    it('preserves statuses that have not expired', () => {
      const { game, players } = setupMissionGame(5);

      // Add status expiring at round 3
      processor.addStatus(game.id, players[0].id, 'beepered', 'tracker-id', 3);

      processor.cleanupRound(game.id, 1);

      expect(processor.hasStatus(game.id, players[0].id, 'beepered', 2)).toBe(true);
    });
  });

  // ===========================================================================
  // Modifier Storage Tests
  // ===========================================================================

  describe('modifier storage', () => {
    it('addModifier creates modifier correctly', () => {
      const game = gameService.createGame('host-1');
      
      const modifier = processor.addModifier(game.id, 1, 'force_pass', 'fixer-id', { test: true });

      expect(modifier.id).toBeDefined();
      expect(modifier.game_id).toBe(game.id);
      expect(modifier.round).toBe(1);
      expect(modifier.modifier_type).toBe('force_pass');
      expect(modifier.created_by).toBe('fixer-id');
      expect(modifier.metadata).toEqual({ test: true });
    });

    it('getModifiersForRound returns correct modifiers', () => {
      const game = gameService.createGame('host-1');

      processor.addModifier(game.id, 1, 'force_pass', 'fixer-id');
      processor.addModifier(game.id, 1, 'extra_fail', 'saboteur-id');
      processor.addModifier(game.id, 2, 'force_pass', 'fixer-id');

      const round1Modifiers = processor.getModifiersForRound(game.id, 1);
      expect(round1Modifiers).toHaveLength(2);

      const round2Modifiers = processor.getModifiersForRound(game.id, 2);
      expect(round2Modifiers).toHaveLength(1);
    });
  });

  // ===========================================================================
  // Status Storage Tests
  // ===========================================================================

  describe('status storage', () => {
    it('addStatus creates status correctly', () => {
      const { game, players } = setupMissionGame(5);

      const status = processor.addStatus(
        game.id,
        players[0].id,
        'protected',
        'guardian-id',
        2,
        { extra: 'data' }
      );

      expect(status.id).toBeDefined();
      expect(status.game_id).toBe(game.id);
      expect(status.player_id).toBe(players[0].id);
      expect(status.status_type).toBe('protected');
      expect(status.created_by).toBe('guardian-id');
      expect(status.expires_at_round).toBe(2);
      expect(status.metadata).toEqual({ extra: 'data' });
    });

    it('getPlayerStatuses returns active statuses only', () => {
      const { game, players } = setupMissionGame(5);

      processor.addStatus(game.id, players[0].id, 'protected', 'guardian-id', 1);
      processor.addStatus(game.id, players[0].id, 'beepered', 'tracker-id', 3);

      // At round 1, both should be active
      const round1Statuses = processor.getPlayerStatuses(game.id, players[0].id, 1);
      expect(round1Statuses).toHaveLength(2);

      // At round 2, only beepered should be active (protected expired at round 1)
      const round2Statuses = processor.getPlayerStatuses(game.id, players[0].id, 2);
      expect(round2Statuses).toHaveLength(1);
      expect(round2Statuses[0].status_type).toBe('beepered');
    });
  });

  // ===========================================================================
  // Clear Method Tests
  // ===========================================================================

  describe('clear', () => {
    it('clears all actions, modifiers, and statuses', () => {
      const { game, players, teamPlayers } = setupMissionGame(5);

      // Add some data
      processor.submitLeaderVote(game.id, players[0].id, 'yes');
      processor.addModifier(game.id, 1, 'force_pass', 'fixer-id');
      processor.addStatus(game.id, players[0].id, 'protected', 'guardian-id', 2);

      processor.clear();

      expect(processor.getActions(game.id)).toHaveLength(0);
      expect(processor.getModifiersForRound(game.id, 1)).toHaveLength(0);
      expect(processor.getPlayerStatuses(game.id, players[0].id, 1)).toHaveLength(0);
    });
  });
});
