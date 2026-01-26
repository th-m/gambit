/**
 * Game Play Page - /games/:gameId/play
 *
 * Main game page container that wraps content in GameFlowProvider
 * and renders the GameBoard component with phase-appropriate content.
 *
 * Uses React.lazy() for code splitting of heavy game components.
 */

import { useParams, useNavigate, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { GameFlowProvider, useGameFlow } from '~/contexts/GameFlowContext';
import { GameLoadingSkeleton, LoadingSpinner } from '~/components/RouteLoadingIndicator';
import type { Game, Player, GamePhase } from '~/types/game';

// =============================================================================
// Lazy-loaded Game Components (Code Splitting)
// =============================================================================

const GameBoard = lazy(() => import('~/components/GameBoard').then(m => ({ default: m.GameBoard })));
const LeaderVoting = lazy(() => import('~/components/LeaderVoting').then(m => ({ default: m.LeaderVoting })));
const TeamSelection = lazy(() => import('~/components/TeamSelection').then(m => ({ default: m.TeamSelection })));
const MissionVoting = lazy(() => import('~/components/MissionVoting').then(m => ({ default: m.MissionVoting })));
const AssassinationPhase = lazy(() => import('~/components/AssassinationPhase').then(m => ({ default: m.AssassinationPhase })));
const GameOver = lazy(() => import('~/components/GameOver').then(m => ({ default: m.GameOver })));

// =============================================================================
// Types
// =============================================================================

interface LoaderData {
  game: Game | null;
  players: Player[];
  currentUserId: string | null;
  error?: string;
}

// =============================================================================
// Loader
// =============================================================================

export async function loader({ params, request }: LoaderFunctionArgs) {
  const gameId = params.game;
  const { supabase } = createClient(request);

  if (!gameId) {
    return { game: null, players: [], currentUserId: null, error: 'Game ID is required' };
  }

  // Get current user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { game: null, players: [], currentUserId: null, error: 'Authentication required' };
  }

  // Get game from Supabase
  const { data: game, error: gameError } = await supabase
    .from('gambit_games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    return { game: null, players: [], currentUserId: user.id, error: 'Game not found' };
  }

  // Get players from Supabase
  const { data: players } = await supabase
    .from('gambit_game_players')
    .select('*')
    .eq('game_id', gameId)
    .order('seat_order', { ascending: true, nullsFirst: false });

  // Check if user is in the game
  const isInGame = (players ?? []).some((p) => p.user_id === user.id);
  if (!isInGame) {
    return { game: null, players: [], currentUserId: user.id, error: 'You are not in this game' };
  }

  return {
    game,
    players: players ?? [],
    currentUserId: user.id,
  };
}

// =============================================================================
// Meta
// =============================================================================

export function meta() {
  return [
    { title: 'Gambit - Playing' },
    { name: 'description', content: 'Social deduction game in progress' },
  ];
}

// =============================================================================
// Phase Loading Fallback
// =============================================================================

function PhaseLoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-4">
      <LoadingSpinner size="lg" />
      <p className="text-stone-400 text-sm">Loading phase...</p>
    </div>
  );
}

// =============================================================================
// Phase Components (with Suspense boundaries)
// =============================================================================

function LeaderVotingPhase() {
  const { game, players, submitLeaderVote, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  return (
    <Suspense fallback={<PhaseLoadingFallback />}>
      <LeaderVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={submitLeaderVote}
      />
    </Suspense>
  );
}

function TeamSelectionPhase() {
  const { game, players, selectTeam, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  return (
    <Suspense fallback={<PhaseLoadingFallback />}>
      <TeamSelection
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onSelectTeam={selectTeam}
      />
    </Suspense>
  );
}

function MissionVotingPhase() {
  const { game, players, submitMissionVote, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  return (
    <Suspense fallback={<PhaseLoadingFallback />}>
      <MissionVoting
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onVote={submitMissionVote}
      />
    </Suspense>
  );
}

function ResolutionPhase() {
  const { game } = useGameFlow();

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2">Resolution</h2>
      <p className="text-gray-400">Processing results...</p>
      {/* Resolution UI will be implemented in component-vote-results story */}
    </div>
  );
}

function AssassinationPhaseWrapper() {
  const { game, players, executeAction, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  return (
    <Suspense fallback={<PhaseLoadingFallback />}>
      <AssassinationPhase
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onExecuteAction={executeAction}
      />
    </Suspense>
  );
}

// =============================================================================
// Game Over Screen - Uses GameOver component with lazy loading
// =============================================================================

function GameOverScreen() {
  const { game, players, currentPlayer } = useGameFlow();

  if (!game) return null;

  // Handler for "Play Again" - creates a new game and returns the gameId
  const handlePlayAgain = async () => {
    if (!currentPlayer) return null;
    
    try {
      const response = await fetch('/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ displayName: currentPlayer.display_name }),
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      return { gameId: data.game?.id || data.gameId };
    } catch {
      return null;
    }
  };

  return (
    <Suspense fallback={<PhaseLoadingFallback />}>
      <GameOver
        game={game}
        players={players}
        currentPlayer={currentPlayer}
        onPlayAgain={handlePlayAgain}
      />
    </Suspense>
  );
}

// =============================================================================
// Phase Router - Routes to correct phase component
// =============================================================================

function renderPhaseContent(phase: GamePhase | null): React.ReactNode {
  // Handle game over via separate check in GameBoardWithPhases

  switch (phase) {
    case 'voting_for_leader':
      return <LeaderVotingPhase />;
    case 'selecting_team':
      return <TeamSelectionPhase />;
    case 'mission_voting':
      return <MissionVotingPhase />;
    case 'resolution':
      return <ResolutionPhase />;
    case 'assassination':
      return <AssassinationPhaseWrapper />;
    default:
      return (
        <div className="text-center py-12">
          <p className="text-gray-400">Unknown phase: {phase}</p>
        </div>
      );
  }
}

// =============================================================================
// Game Board with Phase Content (uses Suspense for lazy loading)
// =============================================================================

function GameBoardWithPhases() {
  const { game } = useGameFlow();

  // Show game over screen if finished
  if (game?.status === 'finished') {
    return (
      <div className="min-h-screen bg-stone-900 text-white">
        <GameOverScreen />
      </div>
    );
  }

  return (
    <Suspense fallback={<GameLoadingSkeleton />}>
      <GameBoard renderPhase={renderPhaseContent} />
    </Suspense>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export default function GamePlayPage() {
  const { game: initialGame, players: initialPlayers, currentUserId, error: loaderError } = useLoaderData<LoaderData>();
  const { game: gameId } = useParams();
  const navigate = useNavigate();

  // Redirect to lobby if game not started
  useEffect(() => {
    if (initialGame && initialGame.status === 'lobby') {
      navigate(`/games/${gameId}`);
    }
  }, [initialGame, gameId, navigate]);

  // Error state - not authenticated
  if (!currentUserId) {
    return (
      <div className="min-h-screen bg-stone-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-gray-400 mb-6">Please sign in to play.</p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg transition-colors"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Error state - game not found or not in game
  if (loaderError || !initialGame) {
    return (
      <div className="min-h-screen bg-stone-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Unable to Join Game</h1>
          <p className="text-gray-400 mb-6">{loaderError || "The game you're looking for doesn't exist."}</p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Wrap in GameFlowProvider with GameBoard component
  return (
    <GameFlowProvider
      gameId={initialGame.id}
      userId={currentUserId}
      initialGame={initialGame}
      initialPlayers={initialPlayers}
    >
      <GameBoardWithPhases />
    </GameFlowProvider>
  );
}
