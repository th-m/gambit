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
  /** Whether the lobby data is still loading */
  isLoading?: boolean;
}

/**
 * Skeleton loader component for individual player slots.
 */
function PlayerSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-stone-700/30 border border-stone-700 animate-pulse">
      <div className="h-10 w-10 rounded-full bg-stone-600" aria-hidden="true" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-stone-600 rounded w-3/4" />
        <div className="h-3 bg-stone-600 rounded w-1/2" />
      </div>
    </div>
  );
}

/**
 * Skeleton loader for the full lobby.
 */
export function LobbySkeleton() {
  return (
    <div className="max-w-2xl mx-auto animate-pulse" role="status" aria-label="Loading lobby">
      {/* Header Skeleton */}
      <div className="text-center mb-8">
        <div className="h-8 bg-stone-700 rounded w-48 mx-auto mb-2" />
        <div className="h-4 bg-stone-700 rounded w-64 mx-auto" />
      </div>

      {/* Game Code Card Skeleton */}
      <div className="bg-stone-800 rounded-2xl p-6 mb-6 border border-stone-700">
        <div className="text-center">
          <div className="h-4 bg-stone-700 rounded w-40 mx-auto mb-3" />
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="h-10 bg-stone-600 rounded w-40" />
            <div className="h-10 w-10 bg-stone-600 rounded-lg" />
          </div>
          <div className="h-4 bg-stone-700 rounded w-24 mx-auto" />
        </div>
      </div>

      {/* Player List Skeleton */}
      <div className="bg-stone-800 rounded-2xl p-6 mb-6 border border-stone-700">
        <div className="flex items-center justify-between mb-4">
          <div className="h-6 bg-stone-700 rounded w-20" />
          <div className="h-6 bg-stone-700 rounded-full w-12" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <PlayerSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Action Button Skeleton */}
      <div className="h-14 bg-stone-700 rounded-xl" />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/**
 * Get a deterministic color for a player avatar based on their ID.
 */
function getAvatarColor(playerId: string, isHost: boolean): string {
  if (isHost) return 'bg-gradient-to-br from-blue-500 to-blue-700';
  
  const colors = [
    'bg-gradient-to-br from-purple-500 to-purple-700',
    'bg-gradient-to-br from-emerald-500 to-emerald-700',
    'bg-gradient-to-br from-amber-500 to-amber-700',
    'bg-gradient-to-br from-rose-500 to-rose-700',
    'bg-gradient-to-br from-cyan-500 to-cyan-700',
    'bg-gradient-to-br from-indigo-500 to-indigo-700',
    'bg-gradient-to-br from-pink-500 to-pink-700',
    'bg-gradient-to-br from-teal-500 to-teal-700',
  ];
  
  // Simple hash from player ID to pick color
  const hash = playerId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
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
 * - Skeleton loaders for initial loading
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
  isLoading = false,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);

  // Show skeleton loader while loading
  if (isLoading) {
    return <LobbySkeleton />;
  }

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
        <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
          Game Lobby
        </h1>
        <p className="text-gray-400 flex items-center justify-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Waiting for players to join...
        </p>
      </div>

      {/* Game Code Card */}
      <div className="bg-gradient-to-b from-stone-800 to-stone-800/80 rounded-2xl p-6 mb-6 border border-stone-700 shadow-lg shadow-black/20">
        <div className="text-center">
          <p className="text-gray-400 text-sm mb-2 uppercase tracking-wide font-medium">Share this code</p>
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="bg-stone-900/50 px-6 py-3 rounded-xl border border-stone-600">
              <span className="text-4xl font-mono font-bold tracking-[0.3em] bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                {game.game_key}
              </span>
            </div>
            <button
              onClick={copyGameCode}
              className="p-3 bg-stone-700 hover:bg-stone-600 active:scale-95 rounded-xl transition-all border border-stone-600 hover:border-stone-500"
              title="Copy game code"
              aria-label={copied ? 'Copied!' : 'Copy game code'}
            >
              {copied ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
          <button
            onClick={copyJoinLink}
            className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            {copied ? 'Copied!' : 'Copy join link'}
          </button>
        </div>
      </div>

      {/* Player List */}
      <div className="bg-gradient-to-b from-stone-800 to-stone-800/80 rounded-2xl p-6 mb-6 border border-stone-700 shadow-lg shadow-black/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Players
          </h2>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1.5 rounded-full text-sm font-bold tabular-nums ${
                playerCount >= 5 && playerCount <= 10
                  ? 'bg-gradient-to-r from-green-900/70 to-emerald-900/70 text-green-400 border border-green-600/50 shadow-sm shadow-green-900/50'
                  : 'bg-gradient-to-r from-yellow-900/70 to-amber-900/70 text-yellow-400 border border-yellow-600/50 shadow-sm shadow-yellow-900/50'
              }`}
              aria-label={`${playerCount} of 10 players`}
            >
              {playerCount}/10
            </span>
          </div>
        </div>

        {/* Player count requirement */}
        {playerCount < 5 && (
          <div className="mb-4 p-3 bg-gradient-to-r from-yellow-900/30 to-amber-900/20 border border-yellow-700/50 rounded-xl text-yellow-400 text-sm flex items-center gap-2" role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Need at least 5 players to start (currently {playerCount})
          </div>
        )}

        {/* Player grid */}
        <div className="grid grid-cols-2 gap-3">
          {players.map((player, index) => {
            const isPlayerHost = player.user_id === game.host_id;
            const isCurrentUser = player.user_id === currentUserId;
            return (
              <div
                key={player.id}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  isPlayerHost
                    ? 'bg-gradient-to-r from-blue-900/40 to-blue-800/30 border border-blue-600/50 shadow-sm shadow-blue-900/30'
                    : isCurrentUser
                      ? 'bg-gradient-to-r from-stone-700/60 to-stone-700/40 border border-stone-500/50'
                      : 'bg-stone-700/40 border border-stone-600/50 hover:bg-stone-700/60'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* Player avatar */}
                <div
                  className={`h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-md ${
                    getAvatarColor(player.id, isPlayerHost)
                  }`}
                  aria-hidden="true"
                >
                  {player.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${isCurrentUser ? 'text-white' : 'text-gray-200'}`}>
                    {player.display_name}
                    {isCurrentUser && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                  </p>
                  {isPlayerHost && (
                    <p className="text-xs text-blue-400 flex items-center gap-1 font-medium">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5z" />
                      </svg>
                      Host
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 5 - playerCount) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-stone-800/30 border-2 border-stone-700/50 border-dashed"
            >
              <div className="h-11 w-11 rounded-full bg-stone-700/30 flex items-center justify-center" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <p className="text-stone-500 text-sm italic">Waiting...</p>
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
              className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all active:scale-[0.98] ${
                canStart && !isStarting
                  ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg shadow-green-900/40 border border-green-500/30'
                  : 'bg-stone-700/80 text-stone-400 cursor-not-allowed border border-stone-600/50'
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
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Start Game
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Need {5 - playerCount} more player{5 - playerCount > 1 ? 's' : ''}
                </span>
              )}
            </button>
            {startError && (
              <div className="flex items-center justify-center gap-2 text-red-400 text-sm p-2 bg-red-900/20 rounded-lg border border-red-800/50" role="alert">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {startError}
              </div>
            )}
          </>
        ) : (
          <button
            onClick={onLeaveGame}
            disabled={isLeaving}
            className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-gradient-to-r from-red-900/40 to-rose-900/40 hover:from-red-900/60 hover:to-rose-900/60 text-red-400 border border-red-700/50 transition-all active:scale-[0.98]"
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
          <div className="flex items-center justify-center gap-2 text-red-400 text-sm p-2 bg-red-900/20 rounded-lg border border-red-800/50" role="alert">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {leaveError}
          </div>
        )}
      </div>
    </div>
  );
}

export default Lobby;
