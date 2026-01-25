/**
 * GameBoard Component
 *
 * Main game board container that:
 * - Subscribes to real-time game updates via GameFlowContext
 * - Renders ScoreBoard with current standings
 * - Routes to correct phase component based on game.phase
 * - Renders CharacterInfoPanel in sidebar
 * - Renders ActionPanel when actions available
 * - Initializes vibration listener for beepered players
 * - Shows loading state during transitions
 *
 * Visual Design:
 * - Clear phase indicator with contextual colors and icons
 * - Score board with round progress visualization
 * - Player area showing all participants with status indicators
 * - Action panel positioned for easy access
 * - Character info panel in consistent sidebar location
 * - Responsive layout: mobile (stacked), tablet (2-col), desktop (3-col)
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useGameFlow } from '~/contexts/GameFlowContext';
import { ActionPanel } from '~/components/ActionPanel';
import { PlayerList } from '~/components/PlayerList';
import { characterRegistry } from '~/registry/CharacterRegistry';
import type {
  GamePhase,
  Player,
  Game,
  GameContext,
  GameModifier,
  PlayerStatus,
} from '~/types/game';

// =============================================================================
// Phase Configuration
// =============================================================================

interface PhaseConfig {
  name: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const PHASE_CONFIGS: Record<GamePhase, PhaseConfig> = {
  lobby: {
    name: 'Lobby',
    description: 'Waiting for players',
    icon: '👥',
    color: 'text-gray-300',
    bgColor: 'bg-stone-700',
    borderColor: 'border-stone-600',
  },
  voting_for_leader: {
    name: 'Leader Vote',
    description: 'Vote to approve or reject the current leader',
    icon: '👑',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30',
    borderColor: 'border-amber-700/50',
  },
  selecting_team: {
    name: 'Team Selection',
    description: 'Leader is selecting the mission team',
    icon: '🎯',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-900/30',
    borderColor: 'border-cyan-700/50',
  },
  mission_voting: {
    name: 'Mission Vote',
    description: 'Team members are voting on the mission',
    icon: '⚔️',
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/30',
    borderColor: 'border-purple-700/50',
  },
  resolution: {
    name: 'Resolution',
    description: 'Processing mission results',
    icon: '📜',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-900/30',
    borderColor: 'border-emerald-700/50',
  },
  assassination: {
    name: 'Assassination',
    description: 'The Assassin is choosing a target',
    icon: '🗡️',
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
    borderColor: 'border-red-700/50',
  },
};

// =============================================================================
// Score Board Component
// =============================================================================

interface ScoreBoardProps {
  game: Game;
}

export function ScoreBoard({ game }: ScoreBoardProps) {
  const rounds = [1, 2, 3, 4, 5];

  return (
    <div className="bg-gradient-to-br from-stone-800 to-stone-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-5 border border-stone-700/50 shadow-lg mb-3 sm:mb-4 lg:mb-6">
      {/* Main Score Display - compact on mobile */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 md:gap-4">
        {/* Good Team Score */}
        <div className="flex-1 text-center min-w-0">
          <div className="inline-flex flex-col items-center">
            <div className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/30 flex items-center justify-center mb-1 shadow-lg shadow-blue-500/10">
              <span className="text-xl sm:text-3xl md:text-4xl font-bold text-blue-400 tabular-nums">
                {game.good_victories ?? 0}
              </span>
            </div>
            <span className="text-[9px] sm:text-[10px] md:text-xs text-blue-400/80 uppercase tracking-wider font-medium">
              Good
            </span>
          </div>
        </div>

        {/* Round Indicators - smaller on mobile, scales up */}
        <div className="flex gap-0.5 sm:gap-1.5 md:gap-2 items-center shrink-0">
          {rounds.map((round) => {
            const isPast = round < (game.current_round ?? 1);
            const isCurrent = round === game.current_round;
            const isGoodWin = isPast && round <= (game.good_victories ?? 0);
            const isEvilWin = isPast && !isGoodWin;
            const isFuture = round > (game.current_round ?? 1);

            // Visual states - responsive sizing
            let containerClasses = 'w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-md sm:rounded-lg flex items-center justify-center font-semibold transition-all duration-300';
            let numberClasses = 'text-[10px] sm:text-xs md:text-sm';

            if (isCurrent) {
              containerClasses += ' bg-gradient-to-br from-white/10 to-white/5 border-2 border-white/40 shadow-lg shadow-white/5 ring-1 sm:ring-2 ring-white/20 ring-offset-1 sm:ring-offset-2 ring-offset-stone-800';
              numberClasses += ' text-white';
            } else if (isGoodWin) {
              containerClasses += ' bg-gradient-to-br from-blue-500/30 to-blue-600/20 border border-blue-500/50';
              numberClasses += ' text-blue-300';
            } else if (isEvilWin) {
              containerClasses += ' bg-gradient-to-br from-red-500/30 to-red-600/20 border border-red-500/50';
              numberClasses += ' text-red-300';
            } else if (isFuture) {
              containerClasses += ' bg-stone-700/50 border border-stone-600/50';
              numberClasses += ' text-stone-500';
            }

            return (
              <div
                key={round}
                className={containerClasses}
                aria-label={`Round ${round}${isCurrent ? ' (current)' : ''}${isGoodWin ? ' - Good won' : ''}${isEvilWin ? ' - Evil won' : ''}`}
              >
                <span className={numberClasses}>{round}</span>
              </div>
            );
          })}
        </div>

        {/* Evil Team Score */}
        <div className="flex-1 text-center min-w-0">
          <div className="inline-flex flex-col items-center">
            <div className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 flex items-center justify-center mb-1 shadow-lg shadow-red-500/10">
              <span className="text-xl sm:text-3xl md:text-4xl font-bold text-red-400 tabular-nums">
                {game.evil_victories ?? 0}
              </span>
            </div>
            <span className="text-[9px] sm:text-[10px] md:text-xs text-red-400/80 uppercase tracking-wider font-medium">
              Evil
            </span>
          </div>
        </div>
      </div>

      {/* Victory Progress Bars - hidden on very small screens for cleaner look */}
      <div className="mt-2 sm:mt-3 md:mt-4 flex gap-1.5 sm:gap-2 items-center">
        {/* Good progress */}
        <div className="flex-1 flex items-center gap-1 sm:gap-2">
          <div className="flex-1 h-1 sm:h-1.5 md:h-2 rounded-full bg-stone-700/80 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-700 ease-out rounded-full"
              style={{ width: `${((game.good_victories ?? 0) / 3) * 100}%` }}
            />
          </div>
          {(game.good_victories ?? 0) > 0 && (
            <span className="text-[9px] sm:text-[10px] text-blue-400/60 tabular-nums hidden sm:inline">
              {game.good_victories}/3
            </span>
          )}
        </div>

        {/* Divider */}
        <div className="w-px h-2 sm:h-3 bg-stone-600/50" />

        {/* Evil progress */}
        <div className="flex-1 flex items-center gap-1 sm:gap-2 flex-row-reverse">
          <div className="flex-1 h-1 sm:h-1.5 md:h-2 rounded-full bg-stone-700/80 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-red-500 to-red-400 transition-all duration-700 ease-out ml-auto rounded-full"
              style={{ width: `${((game.evil_victories ?? 0) / 3) * 100}%` }}
            />
          </div>
          {(game.evil_victories ?? 0) > 0 && (
            <span className="text-[9px] sm:text-[10px] text-red-400/60 tabular-nums hidden sm:inline">
              {game.evil_victories}/3
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Character Icons
// =============================================================================

/**
 * Character icon configurations with unique visual representations.
 * Each character has a distinctive icon and color scheme.
 */
interface CharacterIconConfig {
  icon: string;
  bgGradient: string;
  iconColor: string;
}

const CHARACTER_ICONS: Record<string, CharacterIconConfig> = {
  // Good Team
  Seer: {
    icon: '👁️',
    bgGradient: 'from-purple-600 to-indigo-700',
    iconColor: 'text-purple-200',
  },
  Oracle: {
    icon: '🔮',
    bgGradient: 'from-violet-600 to-purple-700',
    iconColor: 'text-violet-200',
  },
  Guardian: {
    icon: '🛡️',
    bgGradient: 'from-cyan-600 to-blue-700',
    iconColor: 'text-cyan-200',
  },
  Tracker: {
    icon: '📡',
    bgGradient: 'from-teal-600 to-emerald-700',
    iconColor: 'text-teal-200',
  },
  Villager: {
    icon: '🏘️',
    bgGradient: 'from-blue-600 to-sky-700',
    iconColor: 'text-blue-200',
  },
  Soldier: {
    icon: '⚔️',
    bgGradient: 'from-slate-600 to-blue-700',
    iconColor: 'text-slate-200',
  },
  // Evil Team
  Assassin: {
    icon: '🗡️',
    bgGradient: 'from-red-600 to-rose-800',
    iconColor: 'text-red-200',
  },
  Fixer: {
    icon: '🎭',
    bgGradient: 'from-orange-600 to-red-700',
    iconColor: 'text-orange-200',
  },
  Phantom: {
    icon: '👻',
    bgGradient: 'from-fuchsia-600 to-pink-700',
    iconColor: 'text-fuchsia-200',
  },
  Saboteur: {
    icon: '💣',
    bgGradient: 'from-amber-600 to-orange-700',
    iconColor: 'text-amber-200',
  },
  Minion: {
    icon: '🦇',
    bgGradient: 'from-rose-600 to-red-700',
    iconColor: 'text-rose-200',
  },
};

/**
 * Action display configurations with icons and descriptions.
 */
interface ActionDisplayConfig {
  icon: string;
  name: string;
  shortDesc: string;
  usageHint: string;
}

const ACTION_DISPLAYS: Record<string, ActionDisplayConfig> = {
  assassinate: {
    icon: '🎯',
    name: 'Assassinate',
    shortDesc: 'Eliminate a player',
    usageHint: 'Mission or Final Phase',
  },
  protect: {
    icon: '🛡️',
    name: 'Protect',
    shortDesc: 'Shield from assassination',
    usageHint: 'Mission Voting',
  },
  plant_beeper: {
    icon: '📡',
    name: 'Plant Beeper',
    shortDesc: 'Track vote alignment',
    usageHint: 'Team Selection',
  },
  rig_vote: {
    icon: '🎲',
    name: 'Rig Vote',
    shortDesc: 'Force mission pass',
    usageHint: 'Mission Voting',
  },
  sabotage: {
    icon: '💥',
    name: 'Sabotage',
    shortDesc: 'Add extra fail vote',
    usageHint: 'On Mission',
  },
};

/**
 * Effect display configurations.
 */
interface EffectDisplayConfig {
  icon: string;
  name: string;
  shortDesc: string;
}

const EFFECT_DISPLAYS: Record<string, EffectDisplayConfig> = {
  appears_as_seer: {
    icon: '🎭',
    name: 'False Seer',
    shortDesc: 'Appear as Seer to Oracle',
  },
  appears_as_good: {
    icon: '🕶️',
    name: 'Hidden Evil',
    shortDesc: 'Hidden from Seer',
  },
};

// =============================================================================
// Character Info Panel Component
// =============================================================================

interface CharacterInfoPanelProps {
  player: Player;
  players: Player[];
  game: Game;
  modifiers?: GameModifier[];
  statuses?: PlayerStatus[];
}

export function CharacterInfoPanel({
  player,
  players,
  game,
  modifiers = [],
  statuses = [],
}: CharacterInfoPanelProps) {
  const isGood = player.team === 'good';
  const teamGradient = isGood
    ? 'from-blue-500/10 via-blue-600/5 to-transparent'
    : 'from-red-500/10 via-red-600/5 to-transparent';
  const teamBorderColor = isGood ? 'border-blue-500/30' : 'border-red-500/30';
  const teamAccent = isGood ? 'text-blue-400' : 'text-red-400';
  const teamBadgeBg = isGood ? 'bg-blue-500/20' : 'bg-red-500/20';
  const teamGlow = isGood ? 'shadow-blue-500/20' : 'shadow-red-500/20';

  // Build game context for resolving character info with effects applied
  const ctx: GameContext = {
    game,
    players,
    currentPlayer: player,
    modifiers,
    statuses,
  };

  // Get character definition from registry
  const characterDef = player.character
    ? characterRegistry.get(player.character)
    : undefined;

  // Get character icon config
  const iconConfig = player.character
    ? CHARACTER_ICONS[player.character] || {
        icon: '❓',
        bgGradient: 'from-gray-600 to-gray-700',
        iconColor: 'text-gray-200',
      }
    : { icon: '❓', bgGradient: 'from-gray-600 to-gray-700', iconColor: 'text-gray-200' };

  // Resolve character info with effects applied (Seer sees evil except Saboteur, Oracle sees Seer candidates including Phantom)
  const resolvedInfo = characterRegistry.resolveInfo(ctx);

  // Check if info is unreliable (e.g., Oracle with multiple Seer candidates)
  const isUnreliable =
    resolvedInfo.knownPlayers &&
    resolvedInfo.knownPlayers.length > 1 &&
    resolvedInfo.knownPlayerLabels &&
    Object.values(resolvedInfo.knownPlayerLabels).some((label) =>
      label.includes('?')
    );

  // Get character's actions and effects for display
  const characterActions = characterDef?.actions || [];
  const characterEffects = characterDef?.effects || [];
  const hasAbilities = characterActions.length > 0 || characterEffects.length > 0;

  return (
    <div
      className={`rounded-xl sm:rounded-2xl border ${teamBorderColor} bg-gradient-to-br ${teamGradient} bg-stone-800/50 overflow-hidden shadow-lg ${teamGlow}`}
    >
      {/* Character Card Header with Icon */}
      <div className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start gap-2.5 sm:gap-3">
          {/* Character Icon/Artwork - responsive sizing */}
          <div
            className={`shrink-0 w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-lg sm:rounded-xl bg-gradient-to-br ${iconConfig.bgGradient} flex items-center justify-center shadow-lg ring-1 sm:ring-2 ring-white/10`}
            aria-hidden="true"
          >
            <span className="text-xl sm:text-2xl md:text-3xl">{iconConfig.icon}</span>
          </div>

          {/* Character Name and Team */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1.5 sm:gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
                  Your Role
                </p>
                <h3
                  className={`text-base sm:text-lg md:text-xl font-bold ${teamAccent} truncate`}
                >
                  {player.character ?? 'Unknown'}
                </h3>
              </div>
              <span
                className={`shrink-0 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[9px] sm:text-[10px] uppercase tracking-wider font-medium ${teamBadgeBg} ${teamAccent}`}
              >
                {player.team ?? 'Unknown'}
              </span>
            </div>
          </div>
        </div>

        {/* Character Description */}
        <p className="text-[11px] sm:text-xs md:text-sm text-gray-400 mt-2 sm:mt-3 leading-relaxed line-clamp-2 sm:line-clamp-none">
          {characterDef?.description ?? 'Unknown character abilities'}
        </p>
      </div>

      {/* Special Abilities Section */}
      {hasAbilities && (
        <div className="border-t border-stone-700/50 bg-stone-800/20 px-3 sm:px-4 py-2.5 sm:py-3">
          <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 sm:mb-2">
            Special Abilities
          </p>
          <div className="space-y-1.5 sm:space-y-2">
            {/* Actions */}
            {characterActions.map((actionId) => {
              const actionDisplay = ACTION_DISPLAYS[actionId];
              if (!actionDisplay) return null;

              return (
                <div
                  key={actionId}
                  className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-md sm:rounded-lg bg-stone-700/40 border border-stone-600/30"
                >
                  <span
                    className="shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center text-sm sm:text-base"
                    aria-hidden="true"
                  >
                    {actionDisplay.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-xs font-medium text-gray-200 truncate">
                      {actionDisplay.name}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-gray-500 truncate hidden sm:block">
                      {actionDisplay.shortDesc}
                    </p>
                  </div>
                  <span className="shrink-0 text-[8px] sm:text-[9px] text-amber-400/80 bg-amber-500/10 px-1 sm:px-1.5 py-0.5 rounded">
                    1x
                  </span>
                </div>
              );
            })}

            {/* Effects */}
            {characterEffects.map((effectId) => {
              const effectDisplay = EFFECT_DISPLAYS[effectId];
              if (!effectDisplay) return null;

              return (
                <div
                  key={effectId}
                  className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-2.5 py-1.5 sm:py-2 rounded-md sm:rounded-lg bg-purple-500/10 border border-purple-500/20"
                >
                  <span
                    className="shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-md sm:rounded-lg bg-gradient-to-br from-purple-500/20 to-fuchsia-500/20 flex items-center justify-center text-sm sm:text-base"
                    aria-hidden="true"
                  >
                    {effectDisplay.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-xs font-medium text-purple-200 truncate">
                      {effectDisplay.name}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-purple-400/70 truncate hidden sm:block">
                      {effectDisplay.shortDesc}
                    </p>
                  </div>
                  <span className="shrink-0 text-[8px] sm:text-[9px] text-purple-400/80 bg-purple-500/10 px-1 sm:px-1.5 py-0.5 rounded">
                    Passive
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Known Information Section */}
      {resolvedInfo.knownPlayers && resolvedInfo.knownPlayers.length > 0 && (
        <div className="border-t border-stone-700/50 bg-stone-800/30 p-3 sm:p-4">
          {/* Unreliable info warning */}
          {isUnreliable && (
            <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 px-2 py-1 sm:py-1.5 rounded-md sm:rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <span className="text-yellow-400 text-xs sm:text-sm">⚠️</span>
              <span className="text-[10px] sm:text-xs text-yellow-400/90">
                Information may be unreliable
              </span>
            </div>
          )}

          {/* Section header */}
          <p className="text-[9px] sm:text-[10px] uppercase tracking-wider text-gray-500 mb-1.5 sm:mb-2">
            {resolvedInfo.description || 'Known Information'}
          </p>

          {/* Known players grid - responsive wrapping */}
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {resolvedInfo.knownPlayers.map((playerId) => {
              const knownPlayer = players.find((p) => p.id === playerId);
              const label = resolvedInfo.knownPlayerLabels?.[playerId];
              const isEvil = label?.toLowerCase().includes('evil');
              const isSeer = label?.toLowerCase().includes('seer');

              let pillClasses =
                'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-[10px] sm:text-xs font-medium transition-colors';
              let iconEmoji = '👤';
              if (isEvil) {
                pillClasses +=
                  ' bg-red-500/20 text-red-300 border border-red-500/30';
                iconEmoji = '😈';
              } else if (isSeer) {
                pillClasses +=
                  ' bg-purple-500/20 text-purple-300 border border-purple-500/30';
                iconEmoji = '👁️';
              } else {
                pillClasses +=
                  ' bg-stone-700/50 text-gray-300 border border-stone-600/50';
              }

              return (
                <div key={playerId} className={pillClasses}>
                  <span className="text-xs sm:text-sm" aria-hidden="true">
                    {iconEmoji}
                  </span>
                  <span className="truncate max-w-[80px] sm:max-w-[100px]">
                    {knownPlayer?.display_name ?? 'Unknown'}
                  </span>
                  {label && (
                    <span className="opacity-60 text-[9px] sm:text-[10px] hidden sm:inline">{label}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ActionPanel is now imported from ~/components/ActionPanel

// =============================================================================
// Phase Indicator Component
// =============================================================================

interface PhaseIndicatorProps {
  phase: GamePhase | null;
  rejectionCount?: number;
}

function PhaseIndicator({ phase, rejectionCount = 0 }: PhaseIndicatorProps) {
  const config = phase ? PHASE_CONFIGS[phase] : null;

  if (!config) {
    return (
      <div className="text-center mb-3 sm:mb-4 lg:mb-6">
        <span className="inline-block px-4 py-2 bg-stone-700 rounded-xl text-sm text-gray-400">
          Unknown Phase
        </span>
      </div>
    );
  }

  return (
    <div className="mb-3 sm:mb-4 lg:mb-6">
      <div className={`rounded-lg sm:rounded-xl ${config.bgColor} border ${config.borderColor} p-2.5 sm:p-3 md:p-4 transition-all duration-300`}>
        <div className="flex items-center justify-between gap-2 sm:gap-3">
          {/* Phase info */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <span className="text-lg sm:text-xl md:text-2xl shrink-0" role="img" aria-hidden="true">
              {config.icon}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className={`text-sm sm:text-base md:text-lg font-bold ${config.color} truncate`}>
                {config.name}
              </h2>
              <p className="text-[10px] sm:text-xs md:text-sm text-gray-400 truncate">
                {config.description}
              </p>
            </div>
          </div>

          {/* Rejection counter (only during leader voting) */}
          {phase === 'voting_for_leader' && rejectionCount > 0 && (
            <div className="shrink-0 flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg bg-orange-500/20 border border-orange-500/30">
              <span className="text-orange-400 text-[10px] sm:text-xs md:text-sm font-medium tabular-nums">
                {rejectionCount}/3
              </span>
              <span className="text-orange-400/60 text-[9px] sm:text-[10px] md:text-xs hidden xs:inline">
                rejects
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// PlayerList is now imported from ~/components/PlayerList

// =============================================================================
// Loading Skeleton Component
// =============================================================================

function GameBoardSkeleton() {
  return (
    <div className="min-h-screen bg-stone-900 text-white p-4 sm:p-6 animate-pulse">
      <div className="max-w-6xl mx-auto">
        {/* ScoreBoard skeleton */}
        <div className="bg-stone-800/50 rounded-2xl p-5 mb-6 h-32" />

        {/* Phase indicator skeleton */}
        <div className="bg-stone-800/50 rounded-xl p-4 mb-6 h-20" />

        {/* Main grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Main content area */}
          <div className="md:col-span-2 lg:col-span-2">
            <div className="bg-stone-800/50 rounded-2xl h-80" />
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="bg-stone-800/50 rounded-2xl h-40" />
            <div className="bg-stone-800/50 rounded-2xl h-32" />
            <div className="bg-stone-800/50 rounded-2xl h-48" />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Sidebar Section Component (for consistent spacing and headers)
// =============================================================================

interface SidebarSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

function SidebarSection({ title, children, className = '' }: SidebarSectionProps) {
  return (
    <div className={className}>
      {title && (
        <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 px-1">
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

// =============================================================================
// GameBoard Props and Main Component
// =============================================================================

export interface GameBoardProps {
  /**
   * Render function for the main phase content.
   * Receives the current game phase and renders the appropriate component.
   */
  renderPhase?: (phase: GamePhase | null) => React.ReactNode;
}

export function GameBoard({ renderPhase }: GameBoardProps) {
  const { game, players, actions, ctx, currentPlayer, isLoading, error, executeAction } = useGameFlow();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Initialize vibration listener for beepered players
  // Note: useVibration hook will be implemented in hook-vibration story
  useEffect(() => {
    if (!game?.id || !currentPlayer?.id) return;

    // Placeholder for vibration listener initialization
    // When hook-vibration is implemented, this will use:
    // const { isSupported } = useVibration(game.id, currentPlayer.id);

    // For now, we just log that we would initialize vibration
    const hasBeeperStatus = false; // Would come from context: ctx.statuses.some(s => s.player_id === currentPlayer.id && s.status_type === 'beepered')

    if (hasBeeperStatus) {
      console.log('[GameBoard] Would initialize vibration listener for beepered player');
    }
  }, [game?.id, currentPlayer?.id]);

  // Loading state
  if (isLoading) {
    return <GameBoardSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-stone-900 text-white p-4 sm:p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
            <span className="text-2xl">⚠️</span>
          </div>
          <h2 className="text-xl font-bold text-red-400 mb-2">Something went wrong</h2>
          <p className="text-gray-400 mb-6" role="alert">
            {error}
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-xl text-gray-300 transition-colors"
          >
            <span>←</span>
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Game not found
  if (!game) {
    return (
      <div className="min-h-screen bg-stone-900 text-white p-4 sm:p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-stone-800 flex items-center justify-center">
            <span className="text-2xl">🎮</span>
          </div>
          <h2 className="text-xl font-bold text-gray-300 mb-2">Game not found</h2>
          <p className="text-gray-500 mb-6">
            This game may have ended or the link is incorrect.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-xl text-gray-300 transition-colors"
          >
            <span>←</span>
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Current player not found
  if (!currentPlayer) {
    return (
      <div className="min-h-screen bg-stone-900 text-white p-4 sm:p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-stone-800 flex items-center justify-center">
            <span className="text-2xl">👤</span>
          </div>
          <h2 className="text-xl font-bold text-gray-300 mb-2">Not in this game</h2>
          <p className="text-gray-500 mb-6">
            You're not a participant in this game.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-stone-800 hover:bg-stone-700 rounded-xl text-gray-300 transition-colors"
          >
            <span>←</span>
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Calculate leader
  const alivePlayers = players.filter((p) => p.is_alive).sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0));
  const leaderId = alivePlayers[(game.crown_index ?? 0) % alivePlayers.length]?.id;
  const leaderName = alivePlayers.find(p => p.id === leaderId)?.display_name;

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-900 via-stone-900 to-stone-950 text-white overflow-x-hidden">
      {/* Top header with game info - responsive padding and touch-friendly back button */}
      <header className="sticky top-0 z-10 bg-stone-900/95 backdrop-blur-sm border-b border-stone-800">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              to="/"
              className="shrink-0 p-2.5 -ml-1 rounded-xl text-gray-400 hover:text-white hover:bg-stone-800 active:bg-stone-700 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Back to home"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wide">Game</p>
              <p className="text-sm sm:text-base font-semibold text-gray-200 font-mono tracking-wide truncate">{game.game_key}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span className="text-[10px] sm:text-xs text-gray-500 hidden xs:inline">Playing as</span>
            <span className="text-sm font-medium text-gray-200 truncate max-w-[120px] sm:max-w-none">{currentPlayer.display_name}</span>
          </div>
        </div>
      </header>

      {/* Main content - responsive padding for all viewport sizes */}
      <main className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4 lg:py-6">
        {/* Score Board */}
        <ScoreBoard game={game} />

        {/* Phase Indicator with rejection count */}
        <PhaseIndicator phase={game.phase as GamePhase} rejectionCount={game.rejection_count ?? 0} />

        {/* Main Game Area - Responsive Grid
            Mobile (<768px): Single column, phase content first
            Tablet (768-1024px): 2 columns, main content takes 1.5 cols worth
            Desktop (>1024px): 3 columns, main content takes 2 cols
        */}
        <div className="grid grid-cols-1 md:grid-cols-5 lg:grid-cols-3 gap-4 sm:gap-5 lg:gap-6">
          {/* Main Phase Content - Full width mobile, 3/5 tablet, 2/3 desktop */}
          <div className="md:col-span-3 lg:col-span-2 order-1">
            <div className="bg-gradient-to-br from-stone-800 to-stone-800/80 rounded-2xl border border-stone-700/50 shadow-xl overflow-hidden">
              {/* Phase content header for mobile context */}
              <div className="md:hidden border-b border-stone-700/50 p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500 uppercase tracking-wider">Current Phase</span>
                {leaderName && (
                  <span className="text-xs text-amber-400">
                    👑 {leaderName}
                  </span>
                )}
              </div>
              <div className="p-4 sm:p-5 lg:p-6 min-h-[260px] sm:min-h-[300px] lg:min-h-[340px] flex items-center justify-center">
                {renderPhase ? (
                  renderPhase(game.phase as GamePhase | null)
                ) : (
                  <div className="text-center text-gray-400">
                    <p className="text-lg">Phase: {game.phase}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar - Below main on mobile, right side on tablet/desktop */}
          <div className="md:col-span-2 lg:col-span-1 order-2 space-y-4">
            {/* Mobile sidebar toggle - hidden on tablet and up */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="md:hidden w-full flex items-center justify-between px-4 py-3.5 min-h-[48px] bg-stone-800/50 rounded-xl border border-stone-700/50 text-sm text-gray-400 active:bg-stone-700/50 transition-colors"
              aria-expanded={!sidebarCollapsed}
              aria-controls="sidebar-content"
            >
              <span>{sidebarCollapsed ? 'Show' : 'Hide'} game info</span>
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${sidebarCollapsed ? '' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Sidebar content - collapsible on mobile only */}
            <div 
              id="sidebar-content"
              className={`space-y-4 ${sidebarCollapsed ? 'hidden md:block' : ''}`}
            >
              {/* Character Info */}
              <SidebarSection>
                <CharacterInfoPanel
                  player={currentPlayer}
                  players={players}
                  game={game}
                  modifiers={ctx?.modifiers}
                  statuses={ctx?.statuses}
                />
              </SidebarSection>

              {/* Action Panel - only show when actions available */}
              {ctx && (
                <SidebarSection>
                  <ActionPanel
                    player={currentPlayer}
                    game={game}
                    players={players}
                    actions={actions}
                    ctx={ctx}
                    onExecuteAction={executeAction}
                  />
                </SidebarSection>
              )}

              {/* Player List */}
              <SidebarSection title="Players">
                <PlayerList
                  players={players}
                  currentPlayerId={currentPlayer.id}
                  leaderId={leaderId}
                  selectedTeam={game.selected_team}
                />
              </SidebarSection>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default GameBoard;
