/**
 * Lobby Component
 * 
 * Reusable lobby UI component for displaying game code, player list,
 * and start/leave actions before a game begins.
 */

import { useState, useCallback } from 'react';
import type { Game, Player } from '~/types/game';

export interface LobbyProps {
  /** The game being displayed */
  game: Game;
  /** List of players in the game */
  players: Player[];
  /** Current authenticated user's ID */
  currentUserId: string | null;
  /** Callback when host clicks start game */
  onStartGame: () => Promise<void>;
  /** Callback when non-host clicks leave game */
  onLeaveGame: () => Promise<void>;
  /** Whether the start game action is in progress */
  isStarting?: boolean;
  /** Whether the leave game action is in progress */
  isLeaving?: boolean;
  /** Error message from start game action */
  startError?: string | null;
  /** Error message from leave game action */
  leaveError?: string | null;
  /** Base URL for building join links (defaults to window.location.origin) */
  baseUrl?: string;
}

/**
 * Lobby component for pre-game gathering.
 * 
 * Features:
 * - Displays game code prominently with copy functionality
 * - Renders player list with host indicator
 * - Shows player count X/10 with color coding
 * - Start button for host (enabled when 5-10 players)
 * - Leave button for non-host players
 * - Loading states for all actions
 */
export function Lobby({
  game,
  players,
  currentUserId,
  onStartGame,
  onLeaveGame,
  isStarting = false,
  isLeaving = false,
  startError = null,
  leaveError = null,
  baseUrl,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);

  // Determine if current user is the host
  const isHost = currentUserId && game.host_id === currentUserId;
  const playerCount = players.length;
  const canStart = playerCount >= 5 && playerCount <= 10;

  // Build the join URL
  const joinUrl = baseUrl 
    ? `${baseUrl}/games/${game.id}`
    : typeof window !== 'undefined'
      ? `${window.location.origin}/games/${game.id}`
      : '';

  /**
   * Copy game code to clipboard with success feedback.
   */
  const copyGameCode = useCallback(async () => {
    if (!game.game_key) return;

    try {
      await navigator.clipboard.writeText(game.game_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: copy the join URL
      try {
        await navigator.clipboard.writeText(joinUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Silent failure
      }
    }
  }, [game.game_key, joinUrl]);

  /**
   * Copy full join link to clipboard with success feedback.
   */
  const copyJoinLink = useCallback(async () => {
    if (!joinUrl) return;

    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent failure
    }
  }, [joinUrl]);

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Game Lobby</h1>
        <p className="text-gray-400">Waiting for players to join...</p>
      </div>

      {/* Game Code Card */}
      <div className="bg-stone-800 rounded-2xl p-6 mb-6 border border-stone-700">
        <div className="text-center">
          <p className="text-gray-400 text-sm mb-2">Share this code with friends</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-4xl font-mono font-bold tracking-widest text-blue-400">
              {game.game_key}
            </span>
            <button
              onClick={copyGameCode}
              className="p-2 bg-stone-700 hover:bg-stone-600 rounded-lg transition-colors"
              title="Copy game code"
              aria-label={copied ? 'Copied!' : 'Copy game code'}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={copyJoinLink}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            {copied ? 'Copied!' : 'Copy join link'}
          </button>
        </div>
      </div>

      {/* Player List */}
      <div className="bg-stone-800 rounded-2xl p-6 mb-6 border border-stone-700">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Players</h2>
          <span
            className={`px-3 py-1 rounded-full text-sm font-medium ${
              playerCount >= 5 && playerCount <= 10
                ? 'bg-green-900/50 text-green-400 border border-green-700'
                : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
            }`}
            aria-label={`${playerCount} of 10 players`}
          >
            {playerCount}/10
          </span>
        </div>

        {/* Player count requirement */}
        {playerCount < 5 && (
          <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg text-yellow-400 text-sm" role="alert">
            Need at least 5 players to start (currently {playerCount})
          </div>
        )}

        {/* Player grid */}
        <div className="grid grid-cols-2 gap-3">
          {players.map((player) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 p-3 rounded-lg ${
                player.user_id === game.host_id
                  ? 'bg-blue-900/30 border border-blue-700'
                  : 'bg-stone-700/50 border border-stone-600'
              }`}
            >
              {/* Player avatar */}
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${
                  player.user_id === game.host_id ? 'bg-blue-600' : 'bg-stone-600'
                }`}
                aria-hidden="true"
              >
                {player.display_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{player.display_name}</p>
                {player.user_id === game.host_id && (
                  <p className="text-xs text-blue-400 flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                    </svg>
                    Host
                  </p>
                )}
              </div>
            </div>
          ))}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 5 - playerCount) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-stone-700/20 border border-stone-700 border-dashed"
            >
              <div className="h-10 w-10 rounded-full bg-stone-700/50 flex items-center justify-center" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-stone-500 text-sm">Waiting...</p>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        {isHost ? (
          <>
            <button
              onClick={onStartGame}
              disabled={!canStart || isStarting}
              className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
                canStart && !isStarting
                  ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30'
                  : 'bg-stone-700 text-stone-400 cursor-not-allowed'
              }`}
              aria-busy={isStarting}
            >
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Starting Game...
                </span>
              ) : canStart ? (
                <span className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Start Game
                </span>
              ) : (
                `Need ${5 - playerCount} more player${5 - playerCount > 1 ? 's' : ''}`
              )}
            </button>
            {startError && (
              <p className="text-red-400 text-sm text-center" role="alert">{startError}</p>
            )}
          </>
        ) : (
          <button
            onClick={onLeaveGame}
            disabled={isLeaving}
            className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 transition-all"
            aria-busy={isLeaving}
          >
            {isLeaving ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Leaving...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Leave Game
              </span>
            )}
          </button>
        )}
        {leaveError && (
          <p className="text-red-400 text-sm text-center" role="alert">{leaveError}</p>
        )}
      </div>
    </div>
  );
}

export default Lobby;
