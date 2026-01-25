/**
 * VoteProcessor - Handles vote submission and resolution logic.
 * Processes leader approval votes and mission votes, updates game state,
 * and handles win condition checks.
 */

import type {
  Game,
  Player,
  GameAction,
  GameModifier,
  PlayerStatus,
  VoteResult,
  LeaderVote,
  MissionVote,
  GamePhase,
  Team,
  EndReason,
} from '~/types/game';
import { GameService, gameService as defaultGameService } from './GameService';

// =============================================================================
// Helper Functions
// =============================================================================

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

/**
 * Mission sizes for each player count and round.
 * Format: missionSizes[playerCount][roundNumber] = teamSize
 */
const MISSION_SIZES: Record<number, Record<number, number>> = {
  5: { 1: 2, 2: 3, 3: 2, 4: 3, 5: 3 },
  6: { 1: 2, 2: 3, 3: 4, 4: 3, 5: 4 },
  7: { 1: 2, 2: 3, 3: 3, 4: 4, 5: 4 },
  8: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
  9: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
  10: { 1: 3, 2: 4, 3: 4, 4: 5, 5: 5 },
};

/**
 * Get mission team size for given player count and round.
 */
export function getMissionSize(playerCount: number, round: number): number {
  return MISSION_SIZES[playerCount]?.[round] ?? 3;
}

/**
 * Get required fail votes for a mission to fail.
 * Round 4 with 7+ players requires 2 fail votes.
 */
export function getRequiredFailVotes(playerCount: number, round: number): number {
  if (round === 4 && playerCount >= 7) {
    return 2;
  }
  return 1;
}

// =============================================================================
// VoteProcessor Class
// =============================================================================

export class VoteProcessor {
  private gameService: GameService;
  private actions: Map<string, GameAction> = new Map();
  private modifiers: Map<string, GameModifier> = new Map();
  private statuses: Map<string, PlayerStatus> = new Map();

  constructor(gameService: GameService = defaultGameService) {
    this.gameService = gameService;
  }

  // ===========================================================================
  // Action Storage Methods
  // ===========================================================================

  /**
   * Record a game action.
   */
  private recordAction(
    gameId: string,
    playerId: string,
    actionType: GameAction['action_type'],
    round: number | null,
    phase: GamePhase | null,
    targetIds?: string[]
  ): GameAction {
    const action: GameAction = {
      id: generateUUID(),
      game_id: gameId,
      player_id: playerId,
      action_type: actionType,
      target_ids: targetIds ?? null,
      round,
      phase,
      created_at: new Date().toISOString(),
    };
    this.actions.set(action.id, action);
    return action;
  }

  /**
   * Get all actions for a game.
   */
  getActions(gameId: string): GameAction[] {
    const result: GameAction[] = [];
    for (const action of this.actions.values()) {
      if (action.game_id === gameId) {
        result.push(action);
      }
    }
    return result;
  }

  /**
   * Get actions for a specific round and phase.
   */
  getActionsForRoundPhase(gameId: string, round: number, phase: GamePhase): GameAction[] {
    return this.getActions(gameId).filter(
      (a) => a.round === round && a.phase === phase
    );
  }

  // ===========================================================================
  // Modifier Storage Methods
  // ===========================================================================

  /**
   * Add a game modifier.
   */
  addModifier(
    gameId: string,
    round: number,
    modifierType: GameModifier['modifier_type'],
    createdBy: string,
    metadata: Record<string, unknown> = {}
  ): GameModifier {
    const modifier: GameModifier = {
      id: generateUUID(),
      game_id: gameId,
      round,
      modifier_type: modifierType,
      created_by: createdBy,
      metadata,
      created_at: new Date().toISOString(),
    };
    this.modifiers.set(modifier.id, modifier);
    return modifier;
  }

  /**
   * Get modifiers for a specific game and round.
   */
  getModifiersForRound(gameId: string, round: number): GameModifier[] {
    const result: GameModifier[] = [];
    for (const modifier of this.modifiers.values()) {
      if (modifier.game_id === gameId && modifier.round === round) {
        result.push(modifier);
      }
    }
    return result;
  }

  /**
   * Check if a specific modifier type is active for a round.
   */
  hasModifier(gameId: string, round: number, modifierType: GameModifier['modifier_type']): boolean {
    return this.getModifiersForRound(gameId, round).some(
      (m) => m.modifier_type === modifierType
    );
  }

  // ===========================================================================
  // Status Storage Methods
  // ===========================================================================

  /**
   * Add a player status.
   */
  addStatus(
    gameId: string,
    playerId: string,
    statusType: PlayerStatus['status_type'],
    createdBy: string,
    expiresAtRound: number | null = null,
    metadata: Record<string, unknown> = {}
  ): PlayerStatus {
    const status: PlayerStatus = {
      id: generateUUID(),
      game_id: gameId,
      player_id: playerId,
      status_type: statusType,
      created_by: createdBy,
      metadata,
      expires_at_round: expiresAtRound,
      created_at: new Date().toISOString(),
    };
    this.statuses.set(status.id, status);
    return status;
  }

  /**
   * Get active statuses for a player.
   */
  getPlayerStatuses(gameId: string, playerId: string, currentRound: number): PlayerStatus[] {
    const result: PlayerStatus[] = [];
    for (const status of this.statuses.values()) {
      if (
        status.game_id === gameId &&
        status.player_id === playerId &&
        (status.expires_at_round === null || status.expires_at_round >= currentRound)
      ) {
        result.push(status);
      }
    }
    return result;
  }

  /**
   * Check if a player has a specific status.
   */
  hasStatus(gameId: string, playerId: string, statusType: PlayerStatus['status_type'], currentRound: number): boolean {
    return this.getPlayerStatuses(gameId, playerId, currentRound).some(
      (s) => s.status_type === statusType
    );
  }

  /**
   * Get all players with a specific status type in a game.
   */
  getPlayersWithStatus(gameId: string, statusType: PlayerStatus['status_type'], currentRound: number): string[] {
    const playerIds: Set<string> = new Set();
    for (const status of this.statuses.values()) {
      if (
        status.game_id === gameId &&
        status.status_type === statusType &&
        (status.expires_at_round === null || status.expires_at_round >= currentRound)
      ) {
        playerIds.add(status.player_id);
      }
    }
    return Array.from(playerIds);
  }

  // ===========================================================================
  // Leader Vote Methods
  // ===========================================================================

  /**
   * Submit a leader approval vote.
   */
  submitLeaderVote(gameId: string, playerId: string, vote: LeaderVote): VoteResult {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return { success: false, allVotesIn: false, error: 'Game not found' };
    }

    if (game.phase !== 'voting_for_leader') {
      return { success: false, allVotesIn: false, error: 'Not in leader voting phase' };
    }

    const player = this.gameService.getPlayerById(playerId);
    if (!player || player.game_id !== gameId) {
      return { success: false, allVotesIn: false, error: 'Player not in game' };
    }

    // Check for duplicate vote
    const existingVotes = this.getActionsForRoundPhase(gameId, game.current_round, 'voting_for_leader');
    const hasVoted = existingVotes.some((a) => a.player_id === playerId);
    if (hasVoted) {
      return { success: false, allVotesIn: false, error: 'Already voted' };
    }

    // Record the vote
    const actionType = vote === 'yes' ? 'vote_yes' : 'vote_no';
    this.recordAction(gameId, playerId, actionType, game.current_round, 'voting_for_leader');

    // Check if all votes are in
    return this.checkLeaderVoteCompletion(gameId);
  }

  /**
   * Check if all leader votes are in and process result.
   */
  private checkLeaderVoteCompletion(gameId: string): VoteResult {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return { success: true, allVotesIn: false };
    }

    const players = this.gameService.getPlayers(gameId).filter((p) => p.is_alive);
    const votes = this.getActionsForRoundPhase(gameId, game.current_round, 'voting_for_leader');

    const yesVotes = votes.filter((v) => v.action_type === 'vote_yes').length;
    const noVotes = votes.filter((v) => v.action_type === 'vote_no').length;

    const tally = { yes: yesVotes, no: noVotes };

    if (votes.length < players.length) {
      return { success: true, allVotesIn: false, tally };
    }

    // All votes are in - process result
    const approved = yesVotes > noVotes;
    const result = approved ? 'approved' : 'rejected';

    this.processLeaderVoteResult(gameId, approved);

    return { success: true, allVotesIn: true, result, tally };
  }

  /**
   * Process the result of a leader vote.
   */
  private processLeaderVoteResult(gameId: string, approved: boolean): void {
    const game = this.gameService.getGameById(gameId);
    if (!game) return;

    const players = this.gameService.getPlayers(gameId).filter((p) => p.is_alive);

    if (approved) {
      // Leader approved - move to team selection
      this.gameService.updateGame(gameId, {
        phase: 'selecting_team',
        rejection_count: 0,
      });
    } else {
      // Leader rejected
      const newRejectionCount = game.rejection_count + 1;

      if (newRejectionCount >= 3) {
        // 3 consecutive rejections - evil automatically wins the round
        this.handleThreeRejections(gameId);
      } else {
        // Move crown to next player
        const newCrownIndex = (game.crown_index + 1) % players.length;
        this.gameService.updateGame(gameId, {
          crown_index: newCrownIndex,
          rejection_count: newRejectionCount,
        });
      }
    }
  }

  /**
   * Handle the 3-rejection auto-fail rule.
   */
  private handleThreeRejections(gameId: string): void {
    const game = this.gameService.getGameById(gameId);
    if (!game) return;

    const newEvilVictories = game.evil_victories + 1;

    // Check if evil wins
    if (newEvilVictories >= 3) {
      this.gameService.updateGame(gameId, {
        evil_victories: newEvilVictories,
        status: 'finished',
        winner: 'evil',
        end_reason: '3 consecutive leader rejections',
        phase: null,
      });
      return;
    }

    const players = this.gameService.getPlayers(gameId).filter((p) => p.is_alive);
    const newCrownIndex = (game.crown_index + 1) % players.length;

    // Move to next round
    this.gameService.updateGame(gameId, {
      evil_victories: newEvilVictories,
      current_round: game.current_round + 1,
      crown_index: newCrownIndex,
      rejection_count: 0,
      phase: 'voting_for_leader',
      selected_team: null,
    });

    // Cleanup expired statuses/modifiers
    this.cleanupRound(gameId, game.current_round);
  }

  // ===========================================================================
  // Mission Vote Methods
  // ===========================================================================

  /**
   * Submit a mission vote.
   */
  submitMissionVote(gameId: string, playerId: string, vote: MissionVote): VoteResult {
    const game = this.gameService.getGameById(gameId);
    if (!game) {
      return { success: false, allVotesIn: false, error: 'Game not found' };
    }

    if (game.phase !== 'mission_voting') {
      return { success: false, allVotesIn: false, error: 'Not in mission voting phase' };
    }

    const player = this.gameService.getPlayerById(playerId);
    if (!player || player.game_id !== gameId) {
      return { success: false, allVotesIn: false, error: 'Player not in game' };
    }

    // Check player is on the mission team
    if (!game.selected_team?.includes(playerId)) {
      return { success: false, allVotesIn: false, error: 'Not on mission team' };
    }

    // Check for duplicate vote
    const existingVotes = this.getActionsForRoundPhase(gameId, game.current_round, 'mission_voting');
    const hasVoted = existingVotes.some((a) => 
      a.player_id === playerId && 
      (a.action_type === 'vote_pass' || a.action_type === 'vote_fail')
    );
    if (hasVoted) {
      return { success: false, allVotesIn: false, error: 'Already voted' };
    }

    // Good players cannot vote fail
    if (vote === 'fail' && player.team === 'good') {
      return { success: false, allVotesIn: false, error: 'Good players cannot vote fail' };
    }

    // Record the vote
    const actionType = vote === 'pass' ? 'vote_pass' : 'vote_fail';
    this.recordAction(gameId, playerId, actionType, game.current_round, 'mission_voting');

    // Check if all votes are in
    return this.checkMissionVoteCompletion(gameId);
  }

  /**
   * Check if all mission votes are in and process result.
   */
  private checkMissionVoteCompletion(gameId: string): VoteResult {
    const game = this.gameService.getGameById(gameId);
    if (!game || !game.selected_team) {
      return { success: true, allVotesIn: false };
    }

    const teamSize = game.selected_team.length;
    const votes = this.getActionsForRoundPhase(gameId, game.current_round, 'mission_voting').filter(
      (a) => a.action_type === 'vote_pass' || a.action_type === 'vote_fail'
    );

    const passVotes = votes.filter((v) => v.action_type === 'vote_pass').length;
    const failVotes = votes.filter((v) => v.action_type === 'vote_fail').length;

    const tally = { pass: passVotes, fail: failVotes };

    if (votes.length < teamSize) {
      return { success: true, allVotesIn: false, tally };
    }

    // All votes are in - process result
    const missionResult = this.processMissionResult(gameId);

    return { 
      success: true, 
      allVotesIn: true, 
      result: missionResult, 
      tally 
    };
  }

  /**
   * Process the result of a mission vote.
   */
  private processMissionResult(gameId: string): 'passed' | 'failed' {
    const game = this.gameService.getGameById(gameId);
    if (!game || !game.selected_team) {
      return 'failed';
    }

    const players = this.gameService.getPlayers(gameId);
    const playerCount = players.filter((p) => p.is_alive).length;

    const votes = this.getActionsForRoundPhase(gameId, game.current_round, 'mission_voting').filter(
      (a) => a.action_type === 'vote_pass' || a.action_type === 'vote_fail'
    );

    let failVotes = votes.filter((v) => v.action_type === 'vote_fail').length;

    // Check for sabotage modifier (adds extra fail vote)
    if (this.hasModifier(gameId, game.current_round, 'extra_fail')) {
      failVotes += 1;
    }

    // Check for rig_vote modifier (forces mission pass)
    if (this.hasModifier(gameId, game.current_round, 'force_pass')) {
      failVotes = 0;
    }

    const requiredFails = getRequiredFailVotes(playerCount, game.current_round);
    const missionPassed = failVotes < requiredFails;

    // Trigger beeper vibration before updating state
    this.triggerBeeperVibration(gameId, game.current_round);

    if (missionPassed) {
      this.handleMissionSuccess(gameId);
      return 'passed';
    } else {
      this.handleMissionFailure(gameId);
      return 'failed';
    }
  }

  /**
   * Handle a successful mission.
   */
  private handleMissionSuccess(gameId: string): void {
    const game = this.gameService.getGameById(gameId);
    if (!game) return;

    const newGoodVictories = game.good_victories + 1;

    // Check if good wins (need 3 missions)
    if (newGoodVictories >= 3) {
      // Check if Assassin is alive - if so, go to assassination phase
      const players = this.gameService.getPlayers(gameId);
      const assassin = players.find((p) => p.character === 'Assassin' && p.is_alive);

      if (assassin) {
        this.gameService.updateGame(gameId, {
          good_victories: newGoodVictories,
          phase: 'assassination',
        });
      } else {
        // No Assassin - good wins immediately
        this.gameService.updateGame(gameId, {
          good_victories: newGoodVictories,
          status: 'finished',
          winner: 'good',
          end_reason: 'Good completed 3 successful missions',
          phase: null,
        });
      }
      return;
    }

    // Move to next round
    this.advanceToNextRound(gameId, newGoodVictories, game.evil_victories);
  }

  /**
   * Handle a failed mission.
   */
  private handleMissionFailure(gameId: string): void {
    const game = this.gameService.getGameById(gameId);
    if (!game) return;

    const newEvilVictories = game.evil_victories + 1;

    // Check if evil wins (need 3 missions)
    if (newEvilVictories >= 3) {
      this.gameService.updateGame(gameId, {
        evil_victories: newEvilVictories,
        status: 'finished',
        winner: 'evil',
        end_reason: 'Evil sabotaged 3 missions',
        phase: null,
      });
      return;
    }

    // Move to next round
    this.advanceToNextRound(gameId, game.good_victories, newEvilVictories);
  }

  /**
   * Advance to the next round.
   */
  private advanceToNextRound(gameId: string, goodVictories: number, evilVictories: number): void {
    const game = this.gameService.getGameById(gameId);
    if (!game) return;

    const players = this.gameService.getPlayers(gameId).filter((p) => p.is_alive);
    const newCrownIndex = (game.crown_index + 1) % players.length;

    // Cleanup expired statuses/modifiers from the current round
    this.cleanupRound(gameId, game.current_round);

    this.gameService.updateGame(gameId, {
      good_victories: goodVictories,
      evil_victories: evilVictories,
      current_round: game.current_round + 1,
      crown_index: newCrownIndex,
      rejection_count: 0,
      phase: 'voting_for_leader',
      selected_team: null,
    });
  }

  // ===========================================================================
  // Beeper & Cleanup Methods
  // ===========================================================================

  /**
   * Trigger vibration for players with beeper status.
   * In production, this would send a real-time broadcast.
   */
  triggerBeeperVibration(gameId: string, currentRound: number): string[] {
    const beeperedPlayers = this.getPlayersWithStatus(gameId, 'beepered', currentRound);
    // In production: send broadcast via Supabase real-time channel
    // For now, just return the list of players who should vibrate
    return beeperedPlayers;
  }

  /**
   * Clean up expired statuses and modifiers from previous rounds.
   */
  cleanupRound(gameId: string, completedRound: number): void {
    // Remove expired statuses
    for (const [id, status] of this.statuses.entries()) {
      if (
        status.game_id === gameId &&
        status.expires_at_round !== null &&
        status.expires_at_round <= completedRound
      ) {
        this.statuses.delete(id);
      }
    }

    // Modifiers are round-specific, remove those for completed round
    for (const [id, modifier] of this.modifiers.entries()) {
      if (modifier.game_id === gameId && modifier.round <= completedRound) {
        this.modifiers.delete(id);
      }
    }
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Clear all data (for testing).
   */
  clear(): void {
    this.actions.clear();
    this.modifiers.clear();
    this.statuses.clear();
  }
}

// Export singleton instance for production use
export const voteProcessor = new VoteProcessor();
