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
 */

import { useEffect } from 'react';
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
// Score Board Component
// =============================================================================

interface ScoreBoardProps {
  game: Game;
}

export function ScoreBoard({ game }: ScoreBoardProps) {
  const rounds = [1, 2, 3, 4, 5];

  return (
    <div className="bg-stone-800 rounded-xl p-4 border border-stone-700 mb-6">
      <div className="flex items-center justify-between">
        {/* Good victories */}
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Good</p>
          <p className="text-3xl font-bold text-blue-400">{game.good_victories}</p>
        </div>

        {/* Round indicators */}
        <div className="flex gap-2">
          {rounds.map((round) => {
            const isPast = round < (game.current_round ?? 1);
            const isCurrent = round === game.current_round;
            // Show first good_victories completed rounds as good wins
            const isGoodWin = isPast && round <= (game.good_victories ?? 0);
            // Remaining past rounds are evil wins (since past = good + evil victories)
            const isEvilWin = isPast && !isGoodWin;

            let bgColor = 'bg-stone-700';
            let borderColor = 'border-stone-600';
            let textColor = 'text-gray-400';

            if (isCurrent) {
              bgColor = 'bg-stone-600';
              borderColor = 'border-blue-400';
              textColor = 'text-white';
            } else if (isPast) {
              // Show mission results for completed rounds
              if (isGoodWin) {
                bgColor = 'bg-blue-900/50';
                borderColor = 'border-blue-700';
                textColor = 'text-blue-400';
              } else if (isEvilWin) {
                bgColor = 'bg-red-900/50';
                borderColor = 'border-red-700';
                textColor = 'text-red-400';
              }
            }

            return (
              <div
                key={round}
                className={`w-10 h-10 rounded-lg ${bgColor} border-2 ${borderColor} flex items-center justify-center ${textColor} font-semibold transition-colors`}
              >
                {round}
              </div>
            );
          })}
        </div>

        {/* Evil victories */}
        <div className="text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Evil</p>
          <p className="text-3xl font-bold text-red-400">{game.evil_victories}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 flex gap-1">
        <div className="flex-1 h-1 rounded-full bg-stone-700 overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-500"
            style={{ width: `${((game.good_victories ?? 0) / 3) * 100}%` }}
          />
        </div>
        <div className="flex-1 h-1 rounded-full bg-stone-700 overflow-hidden">
          <div
            className="h-full bg-red-500 transition-all duration-500 ml-auto"
            style={{ width: `${((game.evil_victories ?? 0) / 3) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

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
  const teamColor = player.team === 'good' ? 'text-blue-400' : 'text-red-400';
  const teamBgColor = player.team === 'good' ? 'bg-blue-900/20' : 'bg-red-900/20';
  const teamBorderColor = player.team === 'good' ? 'border-blue-700' : 'border-red-700';

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

  return (
    <div className={`rounded-xl p-4 border ${teamBgColor} ${teamBorderColor}`}>
      {/* Character name and team */}
      <h3 className="font-semibold mb-2 text-gray-300">Your Role</h3>
      <p className={`text-xl font-bold ${teamColor}`}>{player.character}</p>
      <p className="text-sm text-gray-400 capitalize mb-3">{player.team} Team</p>

      {/* Character description from registry */}
      <p className="text-sm text-gray-400">
        {characterDef?.description ?? 'Unknown character'}
      </p>

      {/* Resolved information with effects applied */}
      {resolvedInfo.knownPlayers && resolvedInfo.knownPlayers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-stone-700">
          {/* Unreliable info warning for uncertain knowledge (e.g., Oracle with Phantom) */}
          {isUnreliable && (
            <div className="flex items-center gap-1 mb-2">
              <span className="text-yellow-500 text-xs">⚠</span>
              <span className="text-xs text-yellow-500/80">
                Information may be unreliable
              </span>
            </div>
          )}

          {/* Description of what they know */}
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
            {resolvedInfo.description}
          </p>

          {/* Known players with labels */}
          <div className="flex flex-wrap gap-2">
            {resolvedInfo.knownPlayers.map((playerId) => {
              const knownPlayer = players.find((p) => p.id === playerId);
              const label = resolvedInfo.knownPlayerLabels?.[playerId];
              const isEvil = label?.toLowerCase().includes('evil');
              const isSeer = label?.toLowerCase().includes('seer');
              const labelColor = isEvil
                ? 'text-red-400 bg-red-900/30 border-red-700'
                : isSeer
                  ? 'text-purple-400 bg-purple-900/30 border-purple-700'
                  : 'text-gray-400 bg-stone-700/30 border-stone-600';

              return (
                <div
                  key={playerId}
                  className={`flex items-center gap-1 px-2 py-1 rounded border text-sm ${labelColor}`}
                >
                  <span>{knownPlayer?.display_name ?? 'Unknown'}</span>
                  {label && (
                    <span className="text-xs opacity-75">({label})</span>
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
}

function PhaseIndicator({ phase }: PhaseIndicatorProps) {
  const phaseNames: Record<GamePhase, string> = {
    lobby: 'Lobby',
    voting_for_leader: 'Leader Vote',
    selecting_team: 'Team Selection',
    mission_voting: 'Mission Vote',
    resolution: 'Resolution',
    assassination: 'Assassination',
  };

  const phaseName = phase ? phaseNames[phase] : 'Unknown';

  return (
    <div className="text-center mb-4">
      <span className="inline-block px-4 py-1 bg-stone-700 rounded-full text-sm text-gray-300">
        {phaseName}
      </span>
    </div>
  );
}

// PlayerList is now imported from ~/components/PlayerList

// =============================================================================
// Loading Spinner Component
// =============================================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <svg
        className="animate-spin h-8 w-8 text-blue-400"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
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
    return (
      <div className="min-h-screen bg-stone-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-stone-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-red-400" role="alert">
              {error}
            </p>
            <Link
              to="/"
              className="mt-4 inline-block text-gray-400 hover:text-white transition-colors"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Game not found
  if (!game) {
    return (
      <div className="min-h-screen bg-stone-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-400">Game not found</p>
            <Link
              to="/"
              className="mt-4 inline-block text-gray-400 hover:text-white transition-colors"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Current player not found
  if (!currentPlayer) {
    return (
      <div className="min-h-screen bg-stone-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-400">Player not found in game</p>
            <Link
              to="/"
              className="mt-4 inline-block text-gray-400 hover:text-white transition-colors"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Calculate leader
  const alivePlayers = players.filter((p) => p.is_alive).sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0));
  const leaderId = alivePlayers[game.crown_index % alivePlayers.length]?.id;

  return (
    <div className="min-h-screen bg-stone-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Score Board */}
        <ScoreBoard game={game} />

        {/* Phase Indicator */}
        <PhaseIndicator phase={game.phase as GamePhase} />

        {/* Main Game Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Phase Content */}
          <div className="lg:col-span-2">
            <div className="bg-stone-800 rounded-2xl p-6 border border-stone-700 min-h-[300px] flex items-center justify-center">
              {renderPhase ? (
                renderPhase(game.phase as GamePhase | null)
              ) : (
                <div className="text-center text-gray-400">
                  <p>Phase: {game.phase}</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <CharacterInfoPanel
              player={currentPlayer}
              players={players}
              game={game}
              modifiers={ctx?.modifiers}
              statuses={ctx?.statuses}
            />
            {ctx && (
              <ActionPanel
                player={currentPlayer}
                game={game}
                players={players}
                actions={actions}
                ctx={ctx}
                onExecuteAction={executeAction}
              />
            )}
            <PlayerList
              players={players}
              currentPlayerId={currentPlayer.id}
              leaderId={leaderId}
              selectedTeam={game.selected_team}
            />
          </div>
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link to="/" className="text-gray-400 hover:text-white transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default GameBoard;
