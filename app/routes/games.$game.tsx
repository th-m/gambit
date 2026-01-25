/**
 * Game Lobby Page - /games/:gameId
 * 
 * Displays the lobby for a game before it starts.
 * Shows player list, game code, and start button for host.
 * Redirects to game when status changes to 'playing'.
 */

import { useParams, useNavigate, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { createClient as createBrowserClient } from '~/lib/supabase/client';
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router';
import { gameService } from '~/services/GameService';
import { useGameApi } from '~/hooks/useGameApi';
import type { Game, Player } from '~/types/game';

interface LoaderData {
  game: Game | null;
  players: Player[];
  currentUserId: string | null;
  error?: string;
}

export async function loader({ params, request }: LoaderFunctionArgs) {
  const gameId = params.game;
  const { supabase } = createClient(request);
  
  if (!gameId) {
    return { game: null, players: [], currentUserId: null, error: 'Game ID is required' };
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  
  // Get game from GameService
  const game = gameService.getGameById(gameId);
  if (!game) {
    return { game: null, players: [], currentUserId: user?.id ?? null, error: 'Game not found' };
  }

  const players = gameService.getPlayers(gameId);

  return { 
    game, 
    players,
    currentUserId: user?.id ?? null,
  };
}

export function meta({ params }: { params: { game: string } }) {
  return [
    { title: 'Gambit - Game Lobby' },
    { name: 'description', content: 'Waiting for players to join the game' },
  ];
}

export default function GameLobby() {
  const { game: initialGame, players: initialPlayers, currentUserId, error: loaderError } = useLoaderData<LoaderData>();
  const { game: gameId } = useParams();
  const navigate = useNavigate();
  const { startGame, isLoading, error: apiError, clearError } = useGameApi();
  
  const [game, setGame] = useState<Game | null>(initialGame);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [copied, setCopied] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  
  // Determine if current user is the host
  const isHost = currentUserId && game?.host_id === currentUserId;
  const playerCount = players.length;
  const canStart = playerCount >= 5 && playerCount <= 10;
  
  // Build the join URL
  const joinUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/games/${gameId}`
    : '';

  /**
   * Copy game code to clipboard.
   */
  const copyGameCode = useCallback(async () => {
    if (!game?.game_key) return;
    
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
  }, [game?.game_key, joinUrl]);

  /**
   * Copy full join link to clipboard.
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

  /**
   * Handle starting the game.
   */
  const handleStartGame = async () => {
    if (!gameId || !canStart) return;
    
    clearError();
    const result = await startGame(gameId);
    if (result) {
      // Game started - will redirect via subscription or navigate manually
      navigate(`/games/${gameId}/play`);
    }
  };

  /**
   * Handle leaving the game.
   */
  const handleLeaveGame = async () => {
    if (!gameId || isLeaving) return;
    
    setIsLeaving(true);
    setLeaveError(null);
    
    try {
      const response = await fetch(`/api/games/${gameId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setLeaveError(data.error || 'Failed to leave game');
        return;
      }
      
      // Successfully left - redirect to home
      navigate('/');
    } catch {
      setLeaveError('Failed to leave game');
    } finally {
      setIsLeaving(false);
    }
  };

  // Real-time subscriptions for game and player updates
  useEffect(() => {
    if (!gameId) return;

    // Initialize browser client for real-time subscriptions
    const supabase = createBrowserClient();
    
    // Subscribe to game changes
    const gameChannel = supabase
      .channel(`lobby-game-${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`
      }, (payload) => {
        const newGame = payload.new as Game;
        setGame(newGame);
        
        // Redirect if game started
        if (newGame.status === 'playing') {
          navigate(`/games/${gameId}/play`);
        }
      })
      .subscribe();
      
    // Subscribe to player changes
    const playersChannel = supabase
      .channel(`lobby-players-${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `game_id=eq.${gameId}`
      }, () => {
        // Refetch players to get updated list with correct sorting
        const updatedPlayers = gameService.getPlayers(gameId);
        setPlayers(updatedPlayers);
      })
      .subscribe();
    
    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(gameChannel);
      supabase.removeChannel(playersChannel);
    };
  }, [gameId, navigate]);

  // Redirect if game is already playing
  useEffect(() => {
    if (game?.status === 'playing') {
      navigate(`/games/${gameId}/play`);
    }
  }, [game?.status, gameId, navigate]);

  // Error state
  if (loaderError || !game) {
    return (
      <div className="min-h-screen bg-stone-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Game Not Found</h1>
          <p className="text-gray-400 mb-6">{loaderError || 'The game you\'re looking for doesn\'t exist.'}</p>
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-900 text-white p-6">
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
              >
                {copied ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              playerCount >= 5 && playerCount <= 10
                ? 'bg-green-900/50 text-green-400 border border-green-700'
                : 'bg-yellow-900/50 text-yellow-400 border border-yellow-700'
            }`}>
              {playerCount}/10
            </span>
          </div>

          {/* Player count requirement */}
          {playerCount < 5 && (
            <div className="mb-4 p-3 bg-yellow-900/20 border border-yellow-800 rounded-lg text-yellow-400 text-sm">
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
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${
                  player.user_id === game.host_id ? 'bg-blue-600' : 'bg-stone-600'
                }`}>
                  {player.display_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{player.display_name}</p>
                  {player.user_id === game.host_id && (
                    <p className="text-xs text-blue-400 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
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
                <div className="h-10 w-10 rounded-full bg-stone-700/50 flex items-center justify-center">
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
                onClick={handleStartGame}
                disabled={!canStart || isLoading}
                className={`w-full py-4 px-6 rounded-xl font-semibold text-lg transition-all ${
                  canStart && !isLoading
                    ? 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/30'
                    : 'bg-stone-700 text-stone-400 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Starting Game...
                  </span>
                ) : canStart ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Start Game
                  </span>
                ) : (
                  `Need ${5 - playerCount} more player${5 - playerCount > 1 ? 's' : ''}`
                )}
              </button>
              {apiError && (
                <p className="text-red-400 text-sm text-center">{apiError}</p>
              )}
            </>
          ) : (
            <button
              onClick={handleLeaveGame}
              disabled={isLeaving}
              className="w-full py-4 px-6 rounded-xl font-semibold text-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 transition-all"
            >
              {isLeaving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Leaving...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Leave Game
                </span>
              )}
            </button>
          )}
          {leaveError && (
            <p className="text-red-400 text-sm text-center">{leaveError}</p>
          )}
        </div>

        {/* Back link */}
        <div className="mt-6 text-center">
          <Link to="/" className="text-gray-400 hover:text-white transition-colors">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
