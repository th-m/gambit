/**
 * GameOver Component
 *
 * Displays the game over screen with:
 * - Winning team prominently displayed
 * - End reason (assassination, missions, etc.)
 * - All player roles revealed
 * - 'Play Again' button (creates new game)
 * - 'Return Home' button
 * - Celebration/defeat animation based on outcome
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import type { Game, Player, Team, EndReason } from '~/types/game';

// =============================================================================
// Types
// =============================================================================

export interface GameOverProps {
  /** The finished game */
  game: Game;
  /** All players in the game */
  players: Player[];
  /** Current user's player (for determining win/loss perspective) */
  currentPlayer?: Player | null;
  /** Callback to create a new game */
  onPlayAgain?: () => Promise<{ gameId: string } | null>;
  /** Callback to navigate home */
  onReturnHome?: () => void;
}

// =============================================================================
// Animation Constants
// =============================================================================

const REVEAL_DELAY_MS = 300;
const TITLE_DELAY_MS = 500;
const ROLES_DELAY_MS = 1000;
const BUTTONS_DELAY_MS = 1500;
const CONFETTI_COUNT = 50;
const PARTICLE_COUNT = 30;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get display-friendly end reason text
 */
function formatEndReason(reason: EndReason | null): string {
  if (!reason) return '';
  
  const reasonMap: Record<EndReason, string> = {
    'Good completed 3 successful missions': 'The forces of good successfully completed 3 missions!',
    'Evil sabotaged 3 missions': 'The forces of evil sabotaged 3 missions!',
    'Seer assassinated': 'The Assassin successfully identified and eliminated the Seer!',
    'Assassin failed to identify the Seer': 'The Assassin failed to find the Seer!',
    'All evil players eliminated': 'All evil players have been eliminated!',
    'Evil has majority control': 'Evil has gained majority control!',
    '3 consecutive leader rejections': 'Three consecutive leader rejections caused chaos!',
  };
  
  return reasonMap[reason] || reason;
}

/**
 * Get team-sorted players (good first, then evil)
 */
function sortPlayersByTeam(players: Player[]): Player[] {
  return [...players].sort((a, b) => {
    if (a.team === b.team) return 0;
    return a.team === 'good' ? -1 : 1;
  });
}

// =============================================================================
// Confetti Animation Component (for Good team victory)
// =============================================================================

interface ConfettiPieceProps {
  index: number;
  color: string;
}

function ConfettiPiece({ index, color }: ConfettiPieceProps) {
  const left = Math.random() * 100;
  const delay = Math.random() * 2;
  const duration = 3 + Math.random() * 2;
  const rotation = Math.random() * 360;
  
  return (
    <div
      className="absolute w-3 h-3 opacity-80"
      style={{
        left: `${left}%`,
        top: '-20px',
        backgroundColor: color,
        animation: `confetti-fall ${duration}s ease-out ${delay}s forwards`,
        transform: `rotate(${rotation}deg)`,
      }}
      aria-hidden="true"
    />
  );
}

function ConfettiAnimation() {
  const colors = ['#3B82F6', '#60A5FA', '#93C5FD', '#10B981', '#34D399'];
  
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
        <ConfettiPiece
          key={i}
          index={i}
          color={colors[i % colors.length]}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Dark Particles Animation Component (for Evil team victory)
// =============================================================================

interface DarkParticleProps {
  index: number;
}

function DarkParticle({ index }: DarkParticleProps) {
  const left = Math.random() * 100;
  const delay = Math.random() * 1.5;
  const duration = 2 + Math.random() * 2;
  const size = 4 + Math.random() * 8;
  
  return (
    <div
      className="absolute rounded-full bg-red-900/60"
      style={{
        left: `${left}%`,
        bottom: '-20px',
        width: `${size}px`,
        height: `${size}px`,
        animation: `dark-rise ${duration}s ease-out ${delay}s forwards`,
        boxShadow: '0 0 10px rgba(185, 28, 28, 0.5)',
      }}
      aria-hidden="true"
    />
  );
}

function DarkParticlesAnimation() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <style>{`
        @keyframes dark-rise {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0.8;
          }
          100% {
            transform: translateY(-100vh) scale(0.5);
            opacity: 0;
          }
        }
      `}</style>
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <DarkParticle key={i} index={i} />
      ))}
    </div>
  );
}

// =============================================================================
// Sub-Components
// =============================================================================

interface WinnerBannerProps {
  winner: Team;
  revealed: boolean;
}

function WinnerBanner({ winner, revealed }: WinnerBannerProps) {
  const isGood = winner === 'good';
  
  return (
    <div
      className={`
        transform transition-all duration-700 ease-out
        ${revealed ? 'scale-100 opacity-100 translate-y-0' : 'scale-50 opacity-0 -translate-y-8'}
      `}
    >
      <div
        className={`
          inline-block px-8 py-4 rounded-2xl mb-2
          ${isGood 
            ? 'bg-gradient-to-r from-blue-600/30 to-cyan-600/30 border-2 border-blue-500' 
            : 'bg-gradient-to-r from-red-600/30 to-orange-600/30 border-2 border-red-500'}
        `}
      >
        <h1
          className={`
            text-5xl md:text-6xl font-bold
            ${isGood ? 'text-blue-400' : 'text-red-400'}
          `}
          role="alert"
          aria-live="polite"
        >
          {isGood ? 'Good Wins!' : 'Evil Wins!'}
        </h1>
      </div>
      
      {/* Victory icon */}
      <div
        className={`
          text-6xl mt-4 transform transition-all duration-500 delay-300
          ${revealed ? 'scale-100 opacity-100' : 'scale-0 opacity-0'}
        `}
      >
        {isGood ? '🛡️' : '🗡️'}
      </div>
    </div>
  );
}

interface EndReasonDisplayProps {
  reason: EndReason | null;
  revealed: boolean;
}

function EndReasonDisplay({ reason, revealed }: EndReasonDisplayProps) {
  if (!reason) return null;
  
  return (
    <p
      className={`
        text-lg text-gray-300 max-w-md mx-auto mt-6
        transform transition-all duration-500
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      {formatEndReason(reason)}
    </p>
  );
}

interface PlayerRoleCardProps {
  player: Player;
  index: number;
  revealed: boolean;
}

function PlayerRoleCard({ player, index, revealed }: PlayerRoleCardProps) {
  const isGood = player.team === 'good';
  const isEliminated = !player.is_alive;
  
  return (
    <div
      className={`
        p-4 rounded-xl border-2 transform transition-all duration-500 ease-out
        ${revealed ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-4'}
        ${isGood 
          ? 'bg-blue-900/30 border-blue-600/50' 
          : 'bg-red-900/30 border-red-600/50'}
        ${isEliminated ? 'opacity-50' : ''}
      `}
      style={{
        transitionDelay: revealed ? `${index * 100}ms` : '0ms',
      }}
    >
      <div className="flex items-center gap-3">
        {/* Team indicator */}
        <div
          className={`
            w-10 h-10 rounded-full flex items-center justify-center text-lg
            ${isGood ? 'bg-blue-600' : 'bg-red-600'}
          `}
        >
          {isGood ? '😇' : '😈'}
        </div>
        
        {/* Player info */}
        <div className="flex-1 text-left">
          <p className={`font-semibold ${isEliminated ? 'line-through text-gray-500' : 'text-white'}`}>
            {player.display_name}
          </p>
          <p className={`text-sm ${isGood ? 'text-blue-400' : 'text-red-400'}`}>
            {player.character}
          </p>
        </div>
        
        {/* Status indicators */}
        {isEliminated && (
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
            Eliminated
          </span>
        )}
      </div>
    </div>
  );
}

interface RolesRevealProps {
  players: Player[];
  revealed: boolean;
}

function RolesReveal({ players, revealed }: RolesRevealProps) {
  const sortedPlayers = sortPlayersByTeam(players);
  const goodPlayers = sortedPlayers.filter(p => p.team === 'good');
  const evilPlayers = sortedPlayers.filter(p => p.team === 'evil');
  
  return (
    <div
      className={`
        mt-8 transform transition-all duration-500
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
      `}
    >
      <h3 className="text-xl font-semibold text-gray-300 mb-6">
        All Roles Revealed
      </h3>
      
      <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto">
        {/* Good team */}
        <div>
          <h4 className="text-blue-400 font-semibold mb-3 flex items-center gap-2">
            <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
            Good Team
          </h4>
          <div className="space-y-3">
            {goodPlayers.map((player, index) => (
              <PlayerRoleCard
                key={player.id}
                player={player}
                index={index}
                revealed={revealed}
              />
            ))}
          </div>
        </div>
        
        {/* Evil team */}
        <div>
          <h4 className="text-red-400 font-semibold mb-3 flex items-center gap-2">
            <span className="w-3 h-3 bg-red-500 rounded-full"></span>
            Evil Team
          </h4>
          <div className="space-y-3">
            {evilPlayers.map((player, index) => (
              <PlayerRoleCard
                key={player.id}
                player={player}
                index={index + goodPlayers.length}
                revealed={revealed}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ActionButtonsProps {
  onPlayAgain: () => void;
  onReturnHome: () => void;
  isLoading: boolean;
  revealed: boolean;
}

function ActionButtons({ onPlayAgain, onReturnHome, isLoading, revealed }: ActionButtonsProps) {
  return (
    <div
      className={`
        mt-10 flex flex-col sm:flex-row gap-4 justify-center
        transform transition-all duration-500
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      <button
        onClick={onPlayAgain}
        disabled={isLoading}
        className={`
          px-8 py-4 rounded-xl font-semibold text-lg transition-all
          bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transform hover:scale-105 active:scale-95
        `}
        aria-label="Play again - create a new game"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Creating...
          </span>
        ) : (
          '🎮 Play Again'
        )}
      </button>
      
      <button
        onClick={onReturnHome}
        className={`
          px-8 py-4 rounded-xl font-semibold text-lg transition-all
          bg-stone-700 hover:bg-stone-600
          transform hover:scale-105 active:scale-95
        `}
        aria-label="Return to home page"
      >
        🏠 Return Home
      </button>
    </div>
  );
}

interface PersonalResultProps {
  currentPlayer: Player;
  winner: Team;
  revealed: boolean;
}

function PersonalResult({ currentPlayer, winner, revealed }: PersonalResultProps) {
  const isWinner = currentPlayer.team === winner;
  
  return (
    <div
      className={`
        mt-4 text-lg transform transition-all duration-500 delay-200
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
    >
      {isWinner ? (
        <span className="text-green-400">You were on the winning team!</span>
      ) : (
        <span className="text-gray-400">Better luck next time!</span>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function GameOver({
  game,
  players,
  currentPlayer,
  onPlayAgain,
  onReturnHome,
}: GameOverProps) {
  const navigate = useNavigate();
  const [titleRevealed, setTitleRevealed] = useState(false);
  const [rolesRevealed, setRolesRevealed] = useState(false);
  const [buttonsRevealed, setButtonsRevealed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  // Animation sequence
  useEffect(() => {
    const timer1 = setTimeout(() => setTitleRevealed(true), TITLE_DELAY_MS);
    const timer2 = setTimeout(() => setRolesRevealed(true), ROLES_DELAY_MS);
    const timer3 = setTimeout(() => setButtonsRevealed(true), BUTTONS_DELAY_MS);
    
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, []);
  
  const handlePlayAgain = useCallback(async () => {
    if (onPlayAgain) {
      setIsLoading(true);
      try {
        const result = await onPlayAgain();
        if (result?.gameId) {
          navigate(`/games/${result.gameId}`);
        }
      } finally {
        setIsLoading(false);
      }
    } else {
      // Default: navigate to home to create new game
      navigate('/');
    }
  }, [onPlayAgain, navigate]);
  
  const handleReturnHome = useCallback(() => {
    if (onReturnHome) {
      onReturnHome();
    } else {
      navigate('/');
    }
  }, [onReturnHome, navigate]);
  
  const winner = game.winner;
  if (!winner) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Game has not ended yet.</p>
      </div>
    );
  }
  
  const isGoodWin = winner === 'good';
  
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background animation based on winner */}
      {isGoodWin ? <ConfettiAnimation /> : <DarkParticlesAnimation />}
      
      {/* Main content */}
      <div className="relative z-10 py-12 px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Winner banner */}
          <WinnerBanner winner={winner} revealed={titleRevealed} />
          
          {/* End reason */}
          <EndReasonDisplay reason={game.end_reason} revealed={titleRevealed} />
          
          {/* Personal result */}
          {currentPlayer && (
            <PersonalResult
              currentPlayer={currentPlayer}
              winner={winner}
              revealed={titleRevealed}
            />
          )}
          
          {/* Player roles reveal */}
          <RolesReveal players={players} revealed={rolesRevealed} />
          
          {/* Action buttons */}
          <ActionButtons
            onPlayAgain={handlePlayAgain}
            onReturnHome={handleReturnHome}
            isLoading={isLoading}
            revealed={buttonsRevealed}
          />
          
          {/* Game stats footer */}
          <div
            className={`
              mt-12 pt-6 border-t border-stone-700 text-sm text-gray-500
              transform transition-all duration-500
              ${buttonsRevealed ? 'opacity-100' : 'opacity-0'}
            `}
          >
            <p>
              Game completed after {game.current_round} round{game.current_round !== 1 ? 's' : ''}
            </p>
            <p className="mt-1">
              Final Score: Good {game.good_victories} - {game.evil_victories} Evil
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameOver;
