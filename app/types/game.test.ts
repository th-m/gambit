import { describe, it, expect } from 'vitest';
import {
  isGamePhase,
  isLeaderVote,
  isMissionVote,
  isActionType,
  isActionId,
  isTeam,
  isGameStatus,
  GAME_PHASES,
  LEADER_VOTES,
  MISSION_VOTES,
  ACTION_TYPES,
  ACTION_IDS,
  GAME_STATUSES,
} from './game';

describe('Type Guards', () => {
  describe('isGamePhase', () => {
    it('should return true for all valid game phases', () => {
      for (const phase of GAME_PHASES) {
        expect(isGamePhase(phase)).toBe(true);
      }
    });

    it('should return true for specific valid phases', () => {
      expect(isGamePhase('lobby')).toBe(true);
      expect(isGamePhase('voting_for_leader')).toBe(true);
      expect(isGamePhase('selecting_team')).toBe(true);
      expect(isGamePhase('mission_voting')).toBe(true);
      expect(isGamePhase('resolution')).toBe(true);
      expect(isGamePhase('assassination')).toBe(true);
    });

    it('should return false for invalid phase strings', () => {
      expect(isGamePhase('invalid_phase')).toBe(false);
      expect(isGamePhase('LOBBY')).toBe(false);
      expect(isGamePhase('voting')).toBe(false);
      expect(isGamePhase('')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isGamePhase(null)).toBe(false);
      expect(isGamePhase(undefined)).toBe(false);
    });

    it('should return false for wrong types', () => {
      expect(isGamePhase(123)).toBe(false);
      expect(isGamePhase(true)).toBe(false);
      expect(isGamePhase({})).toBe(false);
      expect(isGamePhase([])).toBe(false);
      expect(isGamePhase(() => {})).toBe(false);
    });
  });

  describe('isLeaderVote', () => {
    it('should return true for all valid leader votes', () => {
      for (const vote of LEADER_VOTES) {
        expect(isLeaderVote(vote)).toBe(true);
      }
    });

    it('should return true for "yes" and "no"', () => {
      expect(isLeaderVote('yes')).toBe(true);
      expect(isLeaderVote('no')).toBe(true);
    });

    it('should return false for mission vote types', () => {
      expect(isLeaderVote('pass')).toBe(false);
      expect(isLeaderVote('fail')).toBe(false);
    });

    it('should return false for invalid strings', () => {
      expect(isLeaderVote('YES')).toBe(false);
      expect(isLeaderVote('No')).toBe(false);
      expect(isLeaderVote('approve')).toBe(false);
      expect(isLeaderVote('reject')).toBe(false);
      expect(isLeaderVote('')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isLeaderVote(null)).toBe(false);
      expect(isLeaderVote(undefined)).toBe(false);
    });

    it('should return false for wrong types', () => {
      expect(isLeaderVote(1)).toBe(false);
      expect(isLeaderVote(0)).toBe(false);
      expect(isLeaderVote(true)).toBe(false);
      expect(isLeaderVote(false)).toBe(false);
      expect(isLeaderVote({})).toBe(false);
      expect(isLeaderVote(['yes'])).toBe(false);
    });
  });

  describe('isMissionVote', () => {
    it('should return true for all valid mission votes', () => {
      for (const vote of MISSION_VOTES) {
        expect(isMissionVote(vote)).toBe(true);
      }
    });

    it('should return true for "pass" and "fail"', () => {
      expect(isMissionVote('pass')).toBe(true);
      expect(isMissionVote('fail')).toBe(true);
    });

    it('should return false for leader vote types', () => {
      expect(isMissionVote('yes')).toBe(false);
      expect(isMissionVote('no')).toBe(false);
    });

    it('should return false for invalid strings', () => {
      expect(isMissionVote('PASS')).toBe(false);
      expect(isMissionVote('Fail')).toBe(false);
      expect(isMissionVote('success')).toBe(false);
      expect(isMissionVote('failure')).toBe(false);
      expect(isMissionVote('')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isMissionVote(null)).toBe(false);
      expect(isMissionVote(undefined)).toBe(false);
    });

    it('should return false for wrong types', () => {
      expect(isMissionVote(1)).toBe(false);
      expect(isMissionVote(true)).toBe(false);
      expect(isMissionVote({})).toBe(false);
      expect(isMissionVote(['pass'])).toBe(false);
    });
  });

  describe('isActionType', () => {
    it('should return true for all valid action types', () => {
      for (const actionType of ACTION_TYPES) {
        expect(isActionType(actionType)).toBe(true);
      }
    });

    it('should return true for specific valid action types', () => {
      expect(isActionType('vote_yes')).toBe(true);
      expect(isActionType('vote_no')).toBe(true);
      expect(isActionType('vote_pass')).toBe(true);
      expect(isActionType('vote_fail')).toBe(true);
      expect(isActionType('assassinate')).toBe(true);
      expect(isActionType('rig_vote')).toBe(true);
      expect(isActionType('plant_beeper')).toBe(true);
      expect(isActionType('protect')).toBe(true);
      expect(isActionType('sabotage')).toBe(true);
      expect(isActionType('select_team')).toBe(true);
      expect(isActionType('start_game')).toBe(true);
    });

    it('should return false for invalid action types', () => {
      expect(isActionType('invalid_action')).toBe(false);
      expect(isActionType('ASSASSINATE')).toBe(false);
      expect(isActionType('vote')).toBe(false);
      expect(isActionType('')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isActionType(null)).toBe(false);
      expect(isActionType(undefined)).toBe(false);
    });

    it('should return false for wrong types', () => {
      expect(isActionType(42)).toBe(false);
      expect(isActionType(true)).toBe(false);
      expect(isActionType({})).toBe(false);
      expect(isActionType([])).toBe(false);
    });
  });

  describe('isActionId', () => {
    it('should return true for all valid action IDs', () => {
      for (const actionId of ACTION_IDS) {
        expect(isActionId(actionId)).toBe(true);
      }
    });

    it('should return true for specific valid action IDs', () => {
      expect(isActionId('assassinate')).toBe(true);
      expect(isActionId('rig_vote')).toBe(true);
      expect(isActionId('plant_beeper')).toBe(true);
      expect(isActionId('protect')).toBe(true);
      expect(isActionId('sabotage')).toBe(true);
    });

    it('should return false for action types that are not action IDs', () => {
      // These are ActionType but not ActionId
      expect(isActionId('vote_yes')).toBe(false);
      expect(isActionId('vote_no')).toBe(false);
      expect(isActionId('select_team')).toBe(false);
      expect(isActionId('start_game')).toBe(false);
    });

    it('should return false for invalid action IDs', () => {
      expect(isActionId('invalid')).toBe(false);
      expect(isActionId('ASSASSINATE')).toBe(false);
      expect(isActionId('')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isActionId(null)).toBe(false);
      expect(isActionId(undefined)).toBe(false);
    });

    it('should return false for wrong types', () => {
      expect(isActionId(1)).toBe(false);
      expect(isActionId(false)).toBe(false);
      expect(isActionId({})).toBe(false);
      expect(isActionId(['assassinate'])).toBe(false);
    });
  });

  describe('isTeam', () => {
    it('should return true for "good" and "evil"', () => {
      expect(isTeam('good')).toBe(true);
      expect(isTeam('evil')).toBe(true);
    });

    it('should return false for invalid team strings', () => {
      expect(isTeam('GOOD')).toBe(false);
      expect(isTeam('Evil')).toBe(false);
      expect(isTeam('neutral')).toBe(false);
      expect(isTeam('bad')).toBe(false);
      expect(isTeam('')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isTeam(null)).toBe(false);
      expect(isTeam(undefined)).toBe(false);
    });

    it('should return false for wrong types', () => {
      expect(isTeam(0)).toBe(false);
      expect(isTeam(1)).toBe(false);
      expect(isTeam(true)).toBe(false);
      expect(isTeam(false)).toBe(false);
      expect(isTeam({})).toBe(false);
      expect(isTeam(['good'])).toBe(false);
    });
  });

  describe('isGameStatus', () => {
    it('should return true for all valid game statuses', () => {
      for (const status of GAME_STATUSES) {
        expect(isGameStatus(status)).toBe(true);
      }
    });

    it('should return true for specific valid statuses', () => {
      expect(isGameStatus('lobby')).toBe(true);
      expect(isGameStatus('playing')).toBe(true);
      expect(isGameStatus('finished')).toBe(true);
    });

    it('should return false for invalid status strings', () => {
      expect(isGameStatus('LOBBY')).toBe(false);
      expect(isGameStatus('started')).toBe(false);
      expect(isGameStatus('ended')).toBe(false);
      expect(isGameStatus('in_progress')).toBe(false);
      expect(isGameStatus('')).toBe(false);
    });

    it('should return false for null and undefined', () => {
      expect(isGameStatus(null)).toBe(false);
      expect(isGameStatus(undefined)).toBe(false);
    });

    it('should return false for wrong types', () => {
      expect(isGameStatus(0)).toBe(false);
      expect(isGameStatus(true)).toBe(false);
      expect(isGameStatus({})).toBe(false);
      expect(isGameStatus([])).toBe(false);
    });
  });
});
