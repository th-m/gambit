/**
 * Core TypeScript types for the Gambit social deduction game.
 * Based on the database schema defined in technical-plan.md
 */

// =============================================================================
// Enums
// =============================================================================

/**
 * All possible phases in the game flow.
 */
export type GamePhase =
  | 'lobby'
  | 'voting_for_leader'
  | 'selecting_team'
  | 'mission_voting'
  | 'resolution'
  | 'assassination';

/**
 * Game status indicating overall state.
 */
export type GameStatus = 'lobby' | 'playing' | 'finished';

/**
 * Team alignments in the game.
 */
export type Team = 'good' | 'evil';

/**
 * Character names available in the game.
 */
export type CharacterName =
  // Good team
  | 'Seer'
  | 'Oracle'
  | 'Guardian'
  | 'Tracker'
  | 'Villager'
  // Evil team
  | 'Assassin'
  | 'Fixer'
  | 'Phantom'
  | 'Saboteur'
  | 'Minion';

/**
 * Vote types for leader approval.
 */
export type LeaderVote = 'yes' | 'no';

/**
 * Vote types for mission voting.
 */
export type MissionVote = 'pass' | 'fail';

/**
 * All possible action types in the audit log.
 */
export type ActionType =
  | 'vote_yes'
  | 'vote_no'
  | 'vote_pass'
  | 'vote_fail'
  | 'assassinate'
  | 'rig_vote'
  | 'plant_beeper'
  | 'protect'
  | 'sabotage'
  | 'select_team'
  | 'start_game';

/**
 * Types of game modifiers that can affect game state.
 */
export type ModifierType = 'force_pass' | 'extra_fail';

/**
 * Types of player statuses.
 */
export type StatusType = 'protected' | 'beepered';

/**
 * Win reasons for game end.
 */
export type EndReason =
  | 'Good completed 3 successful missions'
  | 'Evil sabotaged 3 missions'
  | 'Seer assassinated'
  | 'All evil players eliminated'
  | 'Evil has majority control'
  | '3 consecutive leader rejections';

// =============================================================================
// Core Entity Types
// =============================================================================

/**
 * Game entity - primary table storing game state.
 * Maps to the `games` table in the database.
 */
export interface Game {
  /** Unique game identifier (UUID) */
  id: string;
  /** Shareable join code (6-8 alphanumeric characters) */
  game_key: string;
  /** User ID of game creator */
  host_id: string;
  /** Overall game status */
  status: GameStatus;
  /** Current game phase */
  phase: GamePhase | null;
  /** Active round number (1-5) */
  current_round: number;
  /** Index of current leader in player order */
  crown_index: number;
  /** Consecutive leader rejections (resets after 3) */
  rejection_count: number;
  /** Missions won by good team */
  good_victories: number;
  /** Missions won by evil team */
  evil_victories: number;
  /** Player IDs selected for current mission */
  selected_team: string[] | null;
  /** Winning team when game is finished */
  winner: Team | null;
  /** Reason the game ended */
  end_reason: EndReason | null;
  /** Timestamp when game was created */
  created_at: string;
}

/**
 * Player entity - players participating in games.
 * Maps to the `players` table in the database.
 */
export interface Player {
  /** Unique player identifier (UUID) */
  id: string;
  /** Associated game ID (foreign key) */
  game_id: string;
  /** User ID of the player */
  user_id: string;
  /** Display name shown to other players */
  display_name: string;
  /** Assigned character name (null until game starts) */
  character: CharacterName | null;
  /** Team alignment (null until game starts) */
  team: Team | null;
  /** Whether player is still in the game */
  is_alive: boolean;
  /** Position in turn order (0 to N-1) */
  seat_order: number | null;
  /** Timestamp when player joined */
  created_at: string;
}

/**
 * GameAction entity - audit log of all player actions and votes.
 * Maps to the `game_actions` table in the database.
 */
export interface GameAction {
  /** Unique action identifier (UUID) */
  id: string;
  /** Associated game ID (foreign key) */
  game_id: string;
  /** Acting player ID (foreign key) */
  player_id: string;
  /** Type of action performed */
  action_type: ActionType;
  /** Target player IDs if applicable */
  target_ids: string[] | null;
  /** Round when action occurred */
  round: number | null;
  /** Phase when action occurred */
  phase: GamePhase | null;
  /** Timestamp when action was performed */
  created_at: string;
}

/**
 * GameModifier entity - temporary effects on game state.
 * Maps to the `game_modifiers` table in the database.
 */
export interface GameModifier {
  /** Unique modifier identifier (UUID) */
  id: string;
  /** Associated game ID (foreign key) */
  game_id: string;
  /** Round this modifier applies to */
  round: number;
  /** Type of modifier */
  modifier_type: ModifierType;
  /** Player who created the modifier (foreign key) */
  created_by: string;
  /** Additional data for the modifier */
  metadata: Record<string, unknown>;
  /** Timestamp when modifier was created */
  created_at: string;
}

/**
 * PlayerStatus entity - temporary statuses on players.
 * Maps to the `player_statuses` table in the database.
 */
export interface PlayerStatus {
  /** Unique status identifier (UUID) */
  id: string;
  /** Associated game ID (foreign key) */
  game_id: string;
  /** Player who has the status (foreign key) */
  player_id: string;
  /** Type of status */
  status_type: StatusType;
  /** Player who applied the status (foreign key) */
  created_by: string;
  /** Additional data for the status */
  metadata: Record<string, unknown>;
  /** Round when status expires (null = permanent until removed) */
  expires_at_round: number | null;
  /** Timestamp when status was created */
  created_at: string;
}

/**
 * GameLog entity - debug/analytics logging.
 * Maps to the `game_logs` table in the database.
 */
export interface GameLog {
  /** Unique log identifier (UUID) */
  id: string;
  /** Associated game ID (foreign key) */
  game_id: string;
  /** Event name */
  action: string;
  /** Phase when event occurred */
  phase: GamePhase | null;
  /** Round when event occurred */
  round: number | null;
  /** Processing time in milliseconds */
  duration_ms: number | null;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Timestamp when log was created */
  created_at: string;
}

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Partial types for creating new entities (excludes auto-generated fields).
 */
export type NewGame = Omit<Game, 'id' | 'created_at'>;
export type NewPlayer = Omit<Player, 'id' | 'created_at'>;
export type NewGameAction = Omit<GameAction, 'id' | 'created_at'>;
export type NewGameModifier = Omit<GameModifier, 'id' | 'created_at'>;
export type NewPlayerStatus = Omit<PlayerStatus, 'id' | 'created_at'>;
export type NewGameLog = Omit<GameLog, 'id' | 'created_at'>;

/**
 * Partial types for updating entities.
 */
export type GameUpdate = Partial<Omit<Game, 'id' | 'created_at'>>;
export type PlayerUpdate = Partial<Omit<Player, 'id' | 'created_at' | 'game_id' | 'user_id'>>;

// =============================================================================
// Constants
// =============================================================================

/**
 * All valid game phases for iteration and validation.
 */
export const GAME_PHASES: readonly GamePhase[] = [
  'lobby',
  'voting_for_leader',
  'selecting_team',
  'mission_voting',
  'resolution',
  'assassination',
] as const;

/**
 * All valid game statuses.
 */
export const GAME_STATUSES: readonly GameStatus[] = ['lobby', 'playing', 'finished'] as const;

/**
 * All character names.
 */
export const CHARACTER_NAMES: readonly CharacterName[] = [
  'Seer',
  'Oracle',
  'Guardian',
  'Tracker',
  'Villager',
  'Assassin',
  'Fixer',
  'Phantom',
  'Saboteur',
  'Minion',
] as const;

/**
 * Good team characters.
 */
export const GOOD_CHARACTERS: readonly CharacterName[] = [
  'Seer',
  'Oracle',
  'Guardian',
  'Tracker',
  'Villager',
] as const;

/**
 * Evil team characters.
 */
export const EVIL_CHARACTERS: readonly CharacterName[] = [
  'Assassin',
  'Fixer',
  'Phantom',
  'Saboteur',
  'Minion',
] as const;

// =============================================================================
// Action & Effect System Types
// =============================================================================

/**
 * Action IDs for character special abilities.
 */
export type ActionId = 'assassinate' | 'rig_vote' | 'plant_beeper' | 'protect' | 'sabotage';

/**
 * Effect IDs for passive character effects.
 */
export type EffectId = 'appears_as_seer' | 'appears_as_good';

/**
 * Event types that can trigger effect hooks.
 */
export type GameEventType =
  | 'game_start'
  | 'round_start'
  | 'round_end'
  | 'phase_change'
  | 'leader_approved'
  | 'leader_rejected'
  | 'team_selected'
  | 'mission_success'
  | 'mission_fail'
  | 'vote_submitted'
  | 'player_eliminated'
  | 'good_wins'
  | 'evil_wins';

/**
 * Context passed to actions and effects for game state access.
 */
export interface GameContext {
  /** Current game state */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** The player performing the action (if applicable) */
  currentPlayer: Player | null;
  /** Active modifiers for the current round */
  modifiers: GameModifier[];
  /** Active player statuses */
  statuses: PlayerStatus[];
}

/**
 * Result of validating an action or state change.
 */
export interface ValidationResult {
  /** Whether the validation passed */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Result of executing an action.
 */
export interface ActionResult {
  /** Whether the action succeeded */
  success: boolean;
  /** Human-readable message describing what happened */
  message: string;
  /** Whether the action ended the game */
  gameEnded?: boolean;
  /** Winning team if game ended */
  winner?: Team;
  /** Error message if action failed */
  error?: string;
}

/**
 * Result of processing votes.
 */
export interface VoteResult {
  /** Whether the vote was recorded successfully */
  success: boolean;
  /** Whether all expected votes are now in */
  allVotesIn: boolean;
  /** The outcome ('approved', 'rejected', 'passed', 'failed') if all votes are in */
  result?: 'approved' | 'rejected' | 'passed' | 'failed';
  /** Vote counts */
  tally?: {
    yes?: number;
    no?: number;
    pass?: number;
    fail?: number;
  };
  /** Error message if vote failed */
  error?: string;
}

/**
 * Target validation function signature.
 */
export type ValidateTargetsFn = (ctx: GameContext, targetIds: string[]) => ValidationResult;

/**
 * Action execution function signature.
 */
export type ExecuteActionFn = (ctx: GameContext, targetIds: string[]) => ActionResult | Promise<ActionResult>;

/**
 * Definition of a character action (special ability).
 */
export interface ActionDefinition {
  /** Unique identifier for this action */
  id: ActionId;
  /** Human-readable action name */
  name: string;
  /** Description of what the action does */
  description: string;
  /** Phases in which this action can be used */
  phases: GamePhase[];
  /** Maximum number of times this action can be used (per game) */
  maxUses: number;
  /** Whether the player must be on the current mission team to use this action */
  requiresOnTeam: boolean;
  /** Minimum number of targets required */
  minTargets: number;
  /** Maximum number of targets allowed */
  maxTargets: number;
  /** Validate that the targets are valid for this action */
  validateTargets: ValidateTargetsFn;
  /** Execute the action */
  execute: ExecuteActionFn;
}

/**
 * Modifier definitions that effects can apply.
 */
export interface EffectModifier {
  /** Type of perception modification */
  type: 'appears_as_seer' | 'appears_as_good';
  /** Description of what this modifier does */
  description: string;
}

/**
 * Event hook handler function signature.
 */
export type EventHookFn = (ctx: GameContext, eventData: Record<string, unknown>) => void | Promise<void>;

/**
 * Definition of a passive effect.
 */
export interface EffectDefinition {
  /** Unique identifier for this effect */
  id: EffectId;
  /** Human-readable effect name */
  name: string;
  /** Description of what the effect does */
  description: string;
  /** Events that trigger this effect's hooks */
  hooks: Partial<Record<GameEventType, EventHookFn>>;
  /** Modifiers this effect provides (for perception changes) */
  modifiers: EffectModifier[];
}

/**
 * Information a character knows based on their role.
 */
export interface CharacterInfo {
  /** Description of what this character knows */
  description: string;
  /** Player IDs this character knows about (e.g., evil players for Seer) */
  knownPlayers?: string[];
  /** Display labels for known players */
  knownPlayerLabels?: Record<string, string>;
}

/**
 * Info resolver function that computes character knowledge with effects applied.
 */
export type ResolveInfoFn = (ctx: GameContext) => CharacterInfo;

/**
 * Definition of a character.
 */
export interface CharacterDefinition {
  /** Character name/identifier */
  name: CharacterName;
  /** Team alignment */
  team: Team;
  /** Flavor description of the character */
  description: string;
  /** Function to resolve what information this character knows */
  info: ResolveInfoFn;
  /** Action IDs available to this character */
  actions: ActionId[];
  /** Effect IDs active for this character */
  effects: EffectId[];
}

// =============================================================================
// Action & Effect Constants
// =============================================================================

/**
 * All valid action IDs.
 */
export const ACTION_IDS: readonly ActionId[] = [
  'assassinate',
  'rig_vote',
  'plant_beeper',
  'protect',
  'sabotage',
] as const;

/**
 * All valid effect IDs.
 */
export const EFFECT_IDS: readonly EffectId[] = ['appears_as_seer', 'appears_as_good'] as const;

/**
 * All game event types.
 */
export const GAME_EVENT_TYPES: readonly GameEventType[] = [
  'game_start',
  'round_start',
  'round_end',
  'phase_change',
  'leader_approved',
  'leader_rejected',
  'team_selected',
  'mission_success',
  'mission_fail',
  'vote_submitted',
  'player_eliminated',
  'good_wins',
  'evil_wins',
] as const;

/**
 * All valid leader vote types.
 */
export const LEADER_VOTES: readonly LeaderVote[] = ['yes', 'no'] as const;

/**
 * All valid mission vote types.
 */
export const MISSION_VOTES: readonly MissionVote[] = ['pass', 'fail'] as const;

/**
 * All valid action types.
 */
export const ACTION_TYPES: readonly ActionType[] = [
  'vote_yes',
  'vote_no',
  'vote_pass',
  'vote_fail',
  'assassinate',
  'rig_vote',
  'plant_beeper',
  'protect',
  'sabotage',
  'select_team',
  'start_game',
] as const;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for GamePhase validation.
 * Returns true if the value is a valid GamePhase.
 */
export function isGamePhase(value: unknown): value is GamePhase {
  if (typeof value !== 'string') {
    return false;
  }
  return (GAME_PHASES as readonly string[]).includes(value);
}

/**
 * Type guard for LeaderVote validation.
 * Returns true if the value is a valid leader vote ('yes' or 'no').
 */
export function isLeaderVote(value: unknown): value is LeaderVote {
  if (typeof value !== 'string') {
    return false;
  }
  return (LEADER_VOTES as readonly string[]).includes(value);
}

/**
 * Type guard for MissionVote validation.
 * Returns true if the value is a valid mission vote ('pass' or 'fail').
 */
export function isMissionVote(value: unknown): value is MissionVote {
  if (typeof value !== 'string') {
    return false;
  }
  return (MISSION_VOTES as readonly string[]).includes(value);
}

/**
 * Type guard for ActionType validation.
 * Returns true if the value is a valid ActionType.
 */
export function isActionType(value: unknown): value is ActionType {
  if (typeof value !== 'string') {
    return false;
  }
  return (ACTION_TYPES as readonly string[]).includes(value);
}

/**
 * Type guard for ActionId validation.
 * Returns true if the value is a valid ActionId (character special ability).
 */
export function isActionId(value: unknown): value is ActionId {
  if (typeof value !== 'string') {
    return false;
  }
  return (ACTION_IDS as readonly string[]).includes(value);
}

/**
 * Type guard for Team validation.
 * Returns true if the value is 'good' or 'evil'.
 */
export function isTeam(value: unknown): value is Team {
  return value === 'good' || value === 'evil';
}

/**
 * Type guard for GameStatus validation.
 * Returns true if the value is a valid GameStatus.
 */
export function isGameStatus(value: unknown): value is GameStatus {
  if (typeof value !== 'string') {
    return false;
  }
  return (GAME_STATUSES as readonly string[]).includes(value);
}
