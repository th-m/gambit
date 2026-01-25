/**
 * Game Lobby Page - /games/:gameId
 * 
 * Displays the lobby for a game before it starts.
 * Shows player list, game code, and start button for host.
 * Redirects to game when status changes to 'playing'.
 *
 * Uses React.lazy() for code splitting of lobby component.
 */

import { useParams, useNavigate, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { createClient as createBrowserClient } from '~/lib/supabase/client';
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { gameService } from '~/services/GameService';
import { useGameApi } from '~/hooks/useGameApi';
import { LobbyLoadingSkeleton } from '~/components/RouteLoadingIndicator';
import type { Game, Player } from '~/types/game';

// Lazy load the Lobby component
const Lobby = lazy(() => import('~/components/Lobby').then(m => ({ default: m.Lobby })));

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

export default function GameLobbyPage() {
  const { game: initialGame, players: initialPlayers, currentUserId, error: loaderError } = useLoaderData<LoaderData>();
  const { game: gameId } = useParams();
  const navigate = useNavigate();
  const { startGame, isLoading, error: apiError, clearError } = useGameApi();
  
  const [game, setGame] = useState<Game | null>(initialGame);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  /**
   * Handle starting the game.
   */
  const handleStartGame = useCallback(async () => {
    if (!gameId) return;
    
    clearError();
    const result = await startGame(gameId);
    if (result) {
      // Game started - will redirect via subscription or navigate manually
      navigate(`/games/${gameId}/play`);
    }
  }, [gameId, clearError, startGame, navigate]);

  /**
   * Handle leaving the game.
   */
  const handleLeaveGame = useCallback(async () => {
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
  }, [gameId, isLeaving, navigate]);

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
      <Suspense fallback={<LobbyLoadingSkeleton />}>
        <Lobby
          game={game}
          players={players}
          currentUserId={currentUserId}
          onStartGame={handleStartGame}
          onLeaveGame={handleLeaveGame}
          isStarting={isLoading}
          isLeaving={isLeaving}
          startError={apiError}
          leaveError={leaveError}
        />
      </Suspense>

      {/* Back link */}
      <div className="mt-6 text-center">
        <Link to="/" className="text-gray-400 hover:text-white transition-colors">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
