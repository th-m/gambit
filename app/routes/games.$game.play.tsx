/**
 * Game Play Page - /games/:gameId/play
 *
 * Main game page container that wraps content in GameFlowProvider
 * and renders the GameBoard component with phase-appropriate content.
 */

import { useParams, useNavigate, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { gameService } from '~/services/GameService';
import { GameFlowProvider, useGameFlow } from '~/contexts/GameFlowContext';
import { GameBoard } from '~/components/GameBoard';
import { LeaderVoting } from '~/components/LeaderVoting';
import { TeamSelection } from '~/components/TeamSelection';
import { MissionVoting } from '~/components/MissionVoting';
import { AssassinationPhase } from '~/components/AssassinationPhase';
import type { Game, Player, GamePhase } from '~/types/game';

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

  // Get game from GameService
  const game = gameService.getGameById(gameId);
  if (!game) {
    return { game: null, players: [], currentUserId: user.id, error: 'Game not found' };
  }

  const players = gameService.getPlayers(gameId);

  // Check if user is in the game
  const isInGame = players.some((p) => p.user_id === user.id);
  if (!isInGame) {
    return { game: null, players: [], currentUserId: user.id, error: 'You are not in this game' };
  }

  return {
    game,
    players,
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
// Phase Components (Placeholders - will be separate stories)
// =============================================================================

function LeaderVotingPhase() {
  const { game, players, submitLeaderVote, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  return (
    <LeaderVoting
      game={game}
      players={players}
      currentPlayer={currentPlayer}
      onVote={submitLeaderVote}
    />
  );
}

function TeamSelectionPhase() {
  const { game, players, selectTeam, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  return (
    <TeamSelection
      game={game}
      players={players}
      currentPlayer={currentPlayer}
      onSelectTeam={selectTeam}
    />
  );
}

function MissionVotingPhase() {
  const { game, players, submitMissionVote, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  return (
    <MissionVoting
      game={game}
      players={players}
      currentPlayer={currentPlayer}
      onVote={submitMissionVote}
    />
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
    <AssassinationPhase
      game={game}
      players={players}
      currentPlayer={currentPlayer}
      onExecuteAction={executeAction}
    />
  );
}

// =============================================================================
// Game Over Screen (Placeholder)
// =============================================================================

function GameOverScreen() {
  const { game, players } = useGameFlow();

  if (!game) return null;

  const winnerColor = game.winner === 'good' ? 'text-blue-400' : 'text-red-400';
  const winnerLabel = game.winner === 'good' ? 'Good Team Wins!' : 'Evil Team Wins!';

  return (
    <div className="text-center py-12">
      <h1 className={`text-4xl font-bold mb-4 ${winnerColor}`}>{winnerLabel}</h1>
      {game.end_reason && <p className="text-gray-400 mb-8">{game.end_reason}</p>}

      <div className="mb-8">
        <h3 className="font-semibold mb-4 text-gray-300">Players</h3>
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          {players.map((player) => (
            <div
              key={player.id}
              className={`p-3 rounded-lg ${
                player.team === 'good'
                  ? 'bg-blue-900/30 border border-blue-700'
                  : 'bg-red-900/30 border border-red-700'
              }`}
            >
              <p className="font-medium">{player.display_name}</p>
              <p className={`text-sm ${player.team === 'good' ? 'text-blue-400' : 'text-red-400'}`}>
                {player.character}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-4 justify-center">
        <Link
          to="/"
          className="px-6 py-3 bg-stone-700 hover:bg-stone-600 rounded-xl font-semibold transition-colors"
        >
          Return Home
        </Link>
      </div>
    </div>
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
// Game Board with Phase Content
// =============================================================================

function GameBoardWithPhases() {
  const { game } = useGameFlow();

  // Show game over screen if finished
  if (game?.status === 'finished') {
    return (
      <div className="min-h-screen bg-stone-900 text-white p-6">
        <div className="max-w-4xl mx-auto">
          <GameOverScreen />
        </div>
      </div>
    );
  }

  return <GameBoard renderPhase={renderPhaseContent} />;
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
