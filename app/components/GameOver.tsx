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
import type { Game, Player, Team, EndReason, CharacterName } from '~/types/game';

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

const TITLE_DELAY_MS = 500;
const ROLES_DELAY_MS = 1000;
const BUTTONS_DELAY_MS = 1500;
const CONFETTI_COUNT = 60;
const PARTICLE_COUNT = 40;

// =============================================================================
// Character Icons Configuration
// =============================================================================

const CHARACTER_ICONS: Record<CharacterName, { icon: string; description: string }> = {
  Seer: { icon: '👁️', description: 'Sees evil' },
  Oracle: { icon: '🔮', description: 'Sees the Seer' },
  Guardian: { icon: '🛡️', description: 'Protects allies' },
  Tracker: { icon: '📍', description: 'Tracks players' },
  Villager: { icon: '🏠', description: 'Pure of heart' },
  Soldier: { icon: '⚔️', description: 'Fights for good' },
  Assassin: { icon: '🗡️', description: 'Hunts the Seer' },
  Fixer: { icon: '🔧', description: 'Rigs the system' },
  Phantom: { icon: '👻', description: 'Appears as Seer' },
  Saboteur: { icon: '💣', description: 'Hidden evil' },
  Minion: { icon: '🦇', description: 'Servant of evil' },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get display-friendly end reason text with icon
 */
function formatEndReason(reason: EndReason | null): { text: string; icon: string } {
  if (!reason) return { text: '', icon: '' };
  
  const reasonMap: Record<EndReason, { text: string; icon: string }> = {
    'Good completed 3 successful missions': { 
      text: 'The forces of good successfully completed 3 missions!',
      icon: '🏆'
    },
    'Evil sabotaged 3 missions': { 
      text: 'The forces of evil sabotaged 3 missions!',
      icon: '💀'
    },
    'Seer assassinated': { 
      text: 'The Assassin successfully identified and eliminated the Seer!',
      icon: '🗡️'
    },
    'Assassin failed to identify the Seer': { 
      text: 'The Assassin failed to find the Seer!',
      icon: '👁️'
    },
    'All evil players eliminated': { 
      text: 'All evil players have been eliminated!',
      icon: '⚔️'
    },
    'Evil has majority control': { 
      text: 'Evil has gained majority control!',
      icon: '👑'
    },
    '3 consecutive leader rejections': { 
      text: 'Three consecutive leader rejections caused chaos!',
      icon: '🔥'
    },
  };
  
  return reasonMap[reason] || { text: reason, icon: '📜' };
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

/**
 * Get character icon for a player
 */
function getCharacterIcon(character: CharacterName | null): string {
  if (!character) return '❓';
  return CHARACTER_ICONS[character]?.icon || '❓';
}

// =============================================================================
// Confetti Animation Component (for Good team victory)
// =============================================================================

interface ConfettiPieceProps {
  index: number;
  color: string;
  shape: 'square' | 'circle' | 'star';
}

function ConfettiPiece({ index, color, shape }: ConfettiPieceProps) {
  const left = Math.random() * 100;
  const delay = Math.random() * 3;
  const duration = 4 + Math.random() * 3;
  const rotation = Math.random() * 360;
  const size = 6 + Math.random() * 8;
  const swayAmount = 20 + Math.random() * 40;
  
  const shapeStyles: Record<string, string> = {
    square: 'rounded-sm',
    circle: 'rounded-full',
    star: 'clip-path-star',
  };
  
  return (
    <div
      className={`absolute ${shapeStyles[shape]} opacity-90`}
      style={{
        left: `${left}%`,
        top: '-30px',
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: color,
        animation: `confetti-fall-${index % 3} ${duration}s ease-out ${delay}s infinite`,
        transform: `rotate(${rotation}deg)`,
        boxShadow: `0 0 ${size / 2}px ${color}40`,
      }}
      aria-hidden="true"
    />
  );
}

function ConfettiAnimation() {
  const colors = ['#3B82F6', '#60A5FA', '#93C5FD', '#10B981', '#34D399', '#FCD34D', '#A78BFA'];
  const shapes: Array<'square' | 'circle' | 'star'> = ['square', 'circle', 'star'];
  
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <style>{`
        @keyframes confetti-fall-0 {
          0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(30px) rotate(720deg); opacity: 0; }
        }
        @keyframes confetti-fall-1 {
          0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(-30px) rotate(-720deg); opacity: 0; }
        }
        @keyframes confetti-fall-2 {
          0% { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(50px) rotate(540deg); opacity: 0; }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
      `}</style>
      {/* Ambient glow overlay */}
      <div 
        className="absolute inset-0 bg-gradient-to-b from-blue-500/10 via-transparent to-transparent"
        style={{ animation: 'pulse-glow 3s ease-in-out infinite' }}
      />
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
        <ConfettiPiece
          key={i}
          index={i}
          color={colors[i % colors.length]}
          shape={shapes[i % shapes.length]}
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
  const delay = Math.random() * 2;
  const duration = 3 + Math.random() * 3;
  const size = 6 + Math.random() * 12;
  const drift = (Math.random() - 0.5) * 60;
  
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: `${left}%`,
        bottom: '-30px',
        width: `${size}px`,
        height: `${size}px`,
        background: `radial-gradient(circle, rgba(185, 28, 28, 0.8) 0%, rgba(127, 29, 29, 0.4) 50%, transparent 100%)`,
        animation: `dark-rise-${index % 3} ${duration}s ease-out ${delay}s infinite`,
        boxShadow: '0 0 20px rgba(185, 28, 28, 0.6), 0 0 40px rgba(127, 29, 29, 0.3)',
      }}
      aria-hidden="true"
    />
  );
}

function DarkParticlesAnimation() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-50">
      <style>{`
        @keyframes dark-rise-0 {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.8; }
          100% { transform: translateY(-100vh) translateX(20px) scale(0.3); opacity: 0; }
        }
        @keyframes dark-rise-1 {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.8; }
          100% { transform: translateY(-100vh) translateX(-30px) scale(0.4); opacity: 0; }
        }
        @keyframes dark-rise-2 {
          0% { transform: translateY(0) translateX(0) scale(1); opacity: 0.8; }
          100% { transform: translateY(-100vh) translateX(10px) scale(0.2); opacity: 0; }
        }
        @keyframes flicker {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 0.4; }
        }
      `}</style>
      {/* Ominous red overlay */}
      <div 
        className="absolute inset-0 bg-gradient-to-t from-red-900/20 via-transparent to-transparent"
        style={{ animation: 'flicker 2s ease-in-out infinite' }}
      />
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
        transform transition-all duration-1000 ease-out
        ${revealed ? 'scale-100 opacity-100 translate-y-0' : 'scale-50 opacity-0 -translate-y-12'}
      `}
    >
      {/* Glow effect behind banner */}
      <div
        className={`
          absolute inset-0 blur-3xl opacity-50 -z-10
          ${isGood ? 'bg-blue-500' : 'bg-red-500'}
        `}
        style={{
          transform: 'scale(1.5)',
          animation: revealed ? 'pulse-glow 3s ease-in-out infinite' : 'none',
        }}
      />
      
      {/* Main banner */}
      <div
        className={`
          relative inline-block px-10 py-6 rounded-3xl mb-4
          ${isGood 
            ? 'bg-gradient-to-br from-blue-600/40 via-cyan-600/30 to-blue-700/40 border-2 border-blue-400/60 shadow-[0_0_60px_rgba(59,130,246,0.4)]' 
            : 'bg-gradient-to-br from-red-600/40 via-orange-600/30 to-red-700/40 border-2 border-red-400/60 shadow-[0_0_60px_rgba(239,68,68,0.4)]'}
        `}
      >
        {/* Trophy/Crown icon above title */}
        <div
          className={`
            text-5xl mb-2 transform transition-all duration-700 delay-300
            ${revealed ? 'scale-100 opacity-100 translate-y-0' : 'scale-0 opacity-0 -translate-y-4'}
          `}
        >
          {isGood ? '👑' : '💀'}
        </div>
        
        <h1
          className={`
            text-5xl md:text-7xl font-black tracking-tight
            ${isGood 
              ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-cyan-200 to-blue-300' 
              : 'text-transparent bg-clip-text bg-gradient-to-r from-red-300 via-orange-200 to-red-300'}
          `}
          style={{
            textShadow: isGood 
              ? '0 0 40px rgba(59, 130, 246, 0.8), 0 0 80px rgba(59, 130, 246, 0.4)' 
              : '0 0 40px rgba(239, 68, 68, 0.8), 0 0 80px rgba(239, 68, 68, 0.4)',
          }}
          role="alert"
          aria-live="polite"
        >
          {isGood ? 'GOOD WINS!' : 'EVIL WINS!'}
        </h1>
        
        {/* Subtitle */}
        <p
          className={`
            mt-2 text-lg font-medium tracking-wide
            ${isGood ? 'text-blue-200/80' : 'text-red-200/80'}
          `}
        >
          {isGood ? 'Justice has prevailed!' : 'Darkness consumes all!'}
        </p>
      </div>
      
      {/* Animated victory icon below */}
      <div
        className={`
          text-7xl mt-6 transform transition-all duration-700 delay-500
          ${revealed ? 'scale-100 opacity-100 rotate-0' : 'scale-0 opacity-0 rotate-180'}
        `}
        style={{
          animation: revealed ? 'bounce-subtle 2s ease-in-out infinite' : 'none',
        }}
      >
        {isGood ? '🛡️' : '🗡️'}
      </div>
      
      <style>{`
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-8px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}

interface EndReasonDisplayProps {
  reason: EndReason | null;
  revealed: boolean;
}

function EndReasonDisplay({ reason, revealed }: EndReasonDisplayProps) {
  if (!reason) return null;
  
  const { text, icon } = formatEndReason(reason);
  
  return (
    <div
      className={`
        mt-8 transform transition-all duration-700 delay-200
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
      `}
    >
      <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl bg-stone-800/60 border border-stone-600/40 backdrop-blur-sm">
        <span className="text-2xl">{icon}</span>
        <p className="text-lg text-gray-200 font-medium">
          {text}
        </p>
      </div>
    </div>
  );
}

interface PlayerRoleCardProps {
  player: Player;
  index: number;
  revealed: boolean;
  isCurrentPlayer?: boolean;
}

function PlayerRoleCard({ player, index, revealed, isCurrentPlayer = false }: PlayerRoleCardProps) {
  const isGood = player.team === 'good';
  const isEliminated = !player.is_alive;
  const characterIcon = getCharacterIcon(player.character);
  const characterInfo = player.character ? CHARACTER_ICONS[player.character] : null;
  
  return (
    <div
      className={`
        relative p-4 rounded-2xl border-2 transform transition-all duration-600 ease-out
        ${revealed ? 'scale-100 opacity-100 translate-y-0 translate-x-0' : 'scale-90 opacity-0 translate-y-4 translate-x-2'}
        ${isGood 
          ? 'bg-gradient-to-br from-blue-900/50 to-blue-950/60 border-blue-500/60 shadow-[0_4px_20px_rgba(59,130,246,0.2)]' 
          : 'bg-gradient-to-br from-red-900/50 to-red-950/60 border-red-500/60 shadow-[0_4px_20px_rgba(239,68,68,0.2)]'}
        ${isEliminated ? 'opacity-60 grayscale-[30%]' : ''}
        ${isCurrentPlayer ? 'ring-2 ring-yellow-400/60 ring-offset-2 ring-offset-stone-900' : ''}
        hover:scale-[1.02] hover:shadow-lg
      `}
      style={{
        transitionDelay: revealed ? `${index * 120}ms` : '0ms',
      }}
    >
      {/* Current player badge */}
      {isCurrentPlayer && (
        <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-bold bg-yellow-500 text-yellow-900 rounded-full">
          YOU
        </span>
      )}
      
      <div className="flex items-center gap-4">
        {/* Character icon with gradient background */}
        <div
          className={`
            relative w-14 h-14 rounded-xl flex items-center justify-center text-2xl
            ${isGood 
              ? 'bg-gradient-to-br from-blue-500 to-blue-700 shadow-[0_2px_12px_rgba(59,130,246,0.4)]' 
              : 'bg-gradient-to-br from-red-500 to-red-700 shadow-[0_2px_12px_rgba(239,68,68,0.4)]'}
            ${isEliminated ? 'grayscale' : ''}
          `}
        >
          {characterIcon}
          {isEliminated && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
              <span className="text-xl">💀</span>
            </div>
          )}
        </div>
        
        {/* Player info */}
        <div className="flex-1 text-left">
          <p 
            className={`
              font-bold text-lg
              ${isEliminated ? 'line-through text-gray-500' : 'text-white'}
            `}
          >
            {player.display_name}
          </p>
          <div className="flex items-center gap-2">
            <p 
              className={`
                text-sm font-semibold
                ${isGood ? 'text-blue-300' : 'text-red-300'}
              `}
            >
              {player.character}
            </p>
            {characterInfo && (
              <span className="text-xs text-gray-400">
                • {characterInfo.description}
              </span>
            )}
          </div>
        </div>
        
        {/* Team badge */}
        <div
          className={`
            px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider
            ${isGood 
              ? 'bg-blue-500/30 text-blue-200 border border-blue-400/30' 
              : 'bg-red-500/30 text-red-200 border border-red-400/30'}
          `}
        >
          {isGood ? 'Good' : 'Evil'}
        </div>
      </div>
    </div>
  );
}

interface RolesRevealProps {
  players: Player[];
  revealed: boolean;
  currentPlayerId?: string;
}

function RolesReveal({ players, revealed, currentPlayerId }: RolesRevealProps) {
  const sortedPlayers = sortPlayersByTeam(players);
  const goodPlayers = sortedPlayers.filter(p => p.team === 'good');
  const evilPlayers = sortedPlayers.filter(p => p.team === 'evil');
  
  return (
    <div
      className={`
        mt-10 transform transition-all duration-700
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
      `}
    >
      {/* Section header with dramatic styling */}
      <div className="mb-8">
        <div className="flex items-center justify-center gap-4 mb-2">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-stone-500" />
          <h3 className="text-2xl font-bold text-white tracking-wide">
            🎭 Roles Revealed
          </h3>
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-stone-500" />
        </div>
        <p className="text-sm text-gray-400">The truth is finally known...</p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        {/* Good team section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4 pb-2 border-b border-blue-500/30">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-lg shadow-lg shadow-blue-500/30">
              🛡️
            </div>
            <h4 className="text-xl font-bold text-blue-300">Forces of Good</h4>
            <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-blue-500/20 text-blue-300 rounded-full">
              {goodPlayers.length} players
            </span>
          </div>
          <div className="space-y-3">
            {goodPlayers.map((player, index) => (
              <PlayerRoleCard
                key={player.id}
                player={player}
                index={index}
                revealed={revealed}
                isCurrentPlayer={player.id === currentPlayerId}
              />
            ))}
          </div>
        </div>
        
        {/* Evil team section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-4 pb-2 border-b border-red-500/30">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center text-lg shadow-lg shadow-red-500/30">
              🗡️
            </div>
            <h4 className="text-xl font-bold text-red-300">Forces of Evil</h4>
            <span className="ml-auto px-2 py-0.5 text-xs font-semibold bg-red-500/20 text-red-300 rounded-full">
              {evilPlayers.length} players
            </span>
          </div>
          <div className="space-y-3">
            {evilPlayers.map((player, index) => (
              <PlayerRoleCard
                key={player.id}
                player={player}
                index={index + goodPlayers.length}
                revealed={revealed}
                isCurrentPlayer={player.id === currentPlayerId}
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
        mt-12 flex flex-col sm:flex-row gap-4 justify-center
        transform transition-all duration-700
        ${revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}
      `}
    >
      <button
        onClick={onPlayAgain}
        disabled={isLoading}
        className={`
          group relative px-10 py-4 rounded-2xl font-bold text-lg transition-all duration-300
          bg-gradient-to-br from-blue-500 via-cyan-500 to-blue-600 
          hover:from-blue-400 hover:via-cyan-400 hover:to-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed
          transform hover:scale-105 hover:-translate-y-1 active:scale-95
          shadow-[0_8px_30px_rgba(59,130,246,0.4)]
          hover:shadow-[0_12px_40px_rgba(59,130,246,0.5)]
        `}
        aria-label="Play again - create a new game"
      >
        <span className="relative z-10 flex items-center gap-3">
          {isLoading ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating...
            </>
          ) : (
            <>
              <span className="text-xl group-hover:animate-bounce">🎮</span>
              Play Again
            </>
          )}
        </span>
      </button>
      
      <button
        onClick={onReturnHome}
        className={`
          group px-10 py-4 rounded-2xl font-bold text-lg transition-all duration-300
          bg-stone-700/80 hover:bg-stone-600/90 border border-stone-500/40
          transform hover:scale-105 hover:-translate-y-1 active:scale-95
          shadow-lg hover:shadow-xl
        `}
        aria-label="Return to home page"
      >
        <span className="flex items-center gap-3">
          <span className="text-xl group-hover:scale-110 transition-transform">🏠</span>
          Return Home
        </span>
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
  const characterIcon = getCharacterIcon(currentPlayer.character);
  
  return (
    <div
      className={`
        mt-6 transform transition-all duration-700 delay-300
        ${revealed ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-95'}
      `}
    >
      <div
        className={`
          inline-flex items-center gap-4 px-8 py-4 rounded-2xl border-2
          ${isWinner 
            ? 'bg-gradient-to-r from-emerald-900/40 to-green-900/40 border-emerald-400/60 shadow-[0_4px_20px_rgba(16,185,129,0.3)]' 
            : 'bg-gradient-to-r from-stone-800/60 to-stone-700/60 border-stone-500/40'}
        `}
      >
        <span className="text-3xl">{characterIcon}</span>
        <div className="text-left">
          <p className={`text-lg font-bold ${isWinner ? 'text-emerald-300' : 'text-gray-300'}`}>
            {isWinner ? '🎉 Victory!' : '😔 Defeat'}
          </p>
          <p className="text-sm text-gray-400">
            You played as <span className={currentPlayer.team === 'good' ? 'text-blue-300 font-semibold' : 'text-red-300 font-semibold'}>{currentPlayer.character}</span>
          </p>
        </div>
        {isWinner && (
          <span className="text-4xl animate-bounce">🏆</span>
        )}
      </div>
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
      {/* Dramatic background gradient based on winner */}
      <div 
        className={`
          fixed inset-0 -z-20
          ${isGoodWin 
            ? 'bg-gradient-to-b from-blue-950 via-stone-900 to-stone-950' 
            : 'bg-gradient-to-b from-red-950 via-stone-900 to-stone-950'}
        `}
      />
      
      {/* Radial glow behind main content */}
      <div 
        className={`
          fixed top-1/4 left-1/2 -translate-x-1/2 -z-10 w-[800px] h-[600px] rounded-full blur-3xl opacity-20
          ${isGoodWin ? 'bg-blue-500' : 'bg-red-500'}
        `}
      />
      
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
          <RolesReveal 
            players={players} 
            revealed={rolesRevealed} 
            currentPlayerId={currentPlayer?.id}
          />
          
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
              mt-16 pt-8 border-t border-stone-700/50
              transform transition-all duration-700
              ${buttonsRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            `}
          >
            <div className="inline-flex items-center gap-6 px-8 py-4 rounded-2xl bg-stone-800/40 border border-stone-700/40">
              {/* Rounds played */}
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{game.current_round}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Round{game.current_round !== 1 ? 's' : ''}</p>
              </div>
              
              <div className="w-px h-10 bg-stone-600/50" />
              
              {/* Good victories */}
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-400">{game.good_victories}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Good Wins</p>
              </div>
              
              <div className="text-gray-500 font-bold">vs</div>
              
              {/* Evil victories */}
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{game.evil_victories}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Evil Wins</p>
              </div>
              
              <div className="w-px h-10 bg-stone-600/50" />
              
              {/* Players */}
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{players.length}</p>
                <p className="text-xs text-gray-400 uppercase tracking-wider">Players</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GameOver;
