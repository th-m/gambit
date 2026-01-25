/**
 * Game Play Page - /games/:gameId/play
 *
 * Main game page container that wraps content in GameFlowProvider
 * and renders phase-appropriate components.
 */

import { useParams, useNavigate, useLoaderData } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { createClient } from '~/lib/supabase/server';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { gameService } from '~/services/GameService';
import { GameFlowProvider, useGameFlow } from '~/contexts/GameFlowContext';
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

  // Find current leader
  const alivePlayers = players.filter((p) => p.is_alive).sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0));
  const leader = alivePlayers[game.crown_index % alivePlayers.length];

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2">Vote for Leader</h2>
      <p className="text-gray-400 mb-6">
        <span className="text-blue-400 font-semibold">{leader?.display_name}</span> is the proposed leader
      </p>
      <p className="text-sm text-gray-500 mb-4">Rejections: {game.rejection_count}/3</p>

      <div className="flex gap-4 justify-center">
        <button
          onClick={() => submitLeaderVote(true)}
          className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-semibold transition-colors"
        >
          Approve
        </button>
        <button
          onClick={() => submitLeaderVote(false)}
          className="px-8 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-semibold transition-colors"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

function TeamSelectionPhase() {
  const { game, players, selectTeam, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  // Find current leader
  const alivePlayers = players.filter((p) => p.is_alive).sort((a, b) => (a.seat_order ?? 0) - (b.seat_order ?? 0));
  const leader = alivePlayers[game.crown_index % alivePlayers.length];
  const isLeader = currentPlayer.id === leader?.id;

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2">Team Selection</h2>
      {isLeader ? (
        <p className="text-gray-400 mb-6">Select players for the mission</p>
      ) : (
        <p className="text-gray-400 mb-6">
          Waiting for <span className="text-blue-400">{leader?.display_name}</span> to select the team...
        </p>
      )}
      {/* Team selection UI will be implemented in component-team-selection story */}
      <p className="text-stone-500 text-sm">(Team selection interface coming soon)</p>
    </div>
  );
}

function MissionVotingPhase() {
  const { game, players, submitMissionVote, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  const isOnTeam = game.selected_team?.includes(currentPlayer.id);
  const isEvil = currentPlayer.team === 'evil';

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2">Mission Vote</h2>
      {isOnTeam ? (
        <>
          <p className="text-gray-400 mb-6">You are on the mission team. Cast your vote.</p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => submitMissionVote('pass')}
              className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-semibold transition-colors"
            >
              Pass
            </button>
            {isEvil && (
              <button
                onClick={() => submitMissionVote('fail')}
                className="px-8 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-semibold transition-colors"
              >
                Fail
              </button>
            )}
          </div>
        </>
      ) : (
        <p className="text-gray-400">Waiting for team members to vote...</p>
      )}
    </div>
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

function AssassinationPhase() {
  const { game, players, executeAction, currentPlayer } = useGameFlow();

  if (!game || !currentPlayer) return null;

  const isAssassin = currentPlayer.character === 'Assassin';

  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold mb-2 text-red-400">Assassination Phase</h2>
      {isAssassin ? (
        <>
          <p className="text-gray-400 mb-6">Choose a player to assassinate. If you find the Seer, Evil wins!</p>
          {/* Target selection will be implemented in component-assassination story */}
          <p className="text-stone-500 text-sm">(Target selection interface coming soon)</p>
        </>
      ) : (
        <p className="text-gray-400">Waiting for the Assassin to make their choice...</p>
      )}
    </div>
  );
}

// =============================================================================
// Character Info Panel (Placeholder)
// =============================================================================

function CharacterInfoPanel() {
  const { currentPlayer, players } = useGameFlow();

  if (!currentPlayer) return null;

  const teamColor = currentPlayer.team === 'good' ? 'text-blue-400' : 'text-red-400';

  return (
    <div className="bg-stone-800 rounded-xl p-4 border border-stone-700">
      <h3 className="font-semibold mb-2">Your Role</h3>
      <p className={`text-xl font-bold ${teamColor}`}>{currentPlayer.character}</p>
      <p className="text-sm text-gray-400 capitalize">{currentPlayer.team} Team</p>
      {/* Full character info will be implemented in component-character-info story */}
    </div>
  );
}

// =============================================================================
// Action Panel (Placeholder)
// =============================================================================

function ActionPanel() {
  const { currentPlayer, game } = useGameFlow();

  if (!currentPlayer || !game) return null;

  // Only show for characters with actions
  const hasActions =
    currentPlayer.character === 'Assassin' ||
    currentPlayer.character === 'Guardian' ||
    currentPlayer.character === 'Fixer' ||
    currentPlayer.character === 'Tracker' ||
    currentPlayer.character === 'Saboteur';

  if (!hasActions) return null;

  return (
    <div className="bg-stone-800 rounded-xl p-4 border border-stone-700">
      <h3 className="font-semibold mb-2">Special Actions</h3>
      <p className="text-sm text-gray-400">(Actions panel coming soon)</p>
      {/* Full action panel will be implemented in component-action-panel story */}
    </div>
  );
}

// =============================================================================
// Score Board (Placeholder)
// =============================================================================

function ScoreBoard() {
  const { game } = useGameFlow();

  if (!game) return null;

  return (
    <div className="flex items-center justify-center gap-6 mb-6">
      <div className="text-center">
        <p className="text-sm text-gray-400">Good</p>
        <p className="text-2xl font-bold text-blue-400">{game.good_victories}</p>
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-400">Round</p>
        <p className="text-2xl font-bold text-white">{game.current_round}</p>
      </div>
      <div className="text-center">
        <p className="text-sm text-gray-400">Evil</p>
        <p className="text-2xl font-bold text-red-400">{game.evil_victories}</p>
      </div>
    </div>
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
// Phase Router
// =============================================================================

function PhaseRouter() {
  const { game, isLoading, error } = useGameFlow();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <svg
          className="animate-spin h-8 w-8 text-blue-400"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Game not found</p>
      </div>
    );
  }

  // Show game over screen if finished
  if (game.status === 'finished') {
    return <GameOverScreen />;
  }

  // Route to phase-appropriate component
  const phase = game.phase as GamePhase;

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
      return <AssassinationPhase />;
    default:
      return (
        <div className="text-center py-12">
          <p className="text-gray-400">Unknown phase: {phase}</p>
        </div>
      );
  }
}

// =============================================================================
// Game Board Container
// =============================================================================

function GameBoard() {
  return (
    <div className="min-h-screen bg-stone-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Score Board */}
        <ScoreBoard />

        {/* Main Game Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Phase Content */}
          <div className="lg:col-span-2">
            <div className="bg-stone-800 rounded-2xl p-6 border border-stone-700 min-h-[300px] flex items-center justify-center">
              <PhaseRouter />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <CharacterInfoPanel />
            <ActionPanel />
          </div>
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

  // Wrap in GameFlowProvider
  return (
    <GameFlowProvider
      gameId={initialGame.id}
      userId={currentUserId}
      initialGame={initialGame}
      initialPlayers={initialPlayers}
    >
      <GameBoard />
    </GameFlowProvider>
  );
}
