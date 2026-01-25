import type { Route } from "./+types/__index";
import { WavyBackground } from "~/components/waves";
import { TextHoverEffect } from "~/components/texthover";
import { Link, useNavigate } from "react-router";
import { useState } from "react";
import { createClient } from "~/lib/supabase/server";
import { useGameApi } from "~/hooks/useGameApi";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Gambit - A Social Deduction Game" },
    { name: "description", content: "A strategic social deduction game of trust and deception" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createClient(request);
  const { data: { user } } = await supabase.auth.getUser();
  
  return { 
    isAuthenticated: !!user,
    userEmail: user?.email ?? null,
  };
}

/**
 * Validate game code format: 6-8 alphanumeric characters.
 */
function isValidGameCode(code: string): boolean {
  return /^[A-Za-z0-9]{6,8}$/.test(code);
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { isAuthenticated, userEmail } = loaderData;
  const navigate = useNavigate();
  const { createGame, isLoading, error, clearError } = useGameApi();
  
  const [gameCode, setGameCode] = useState('');
  const [displayName, setDisplayName] = useState(userEmail?.split('@')[0] ?? '');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  
  /**
   * Handle creating a new game.
   */
  const handleCreateGame = async () => {
    if (!displayName.trim()) {
      return;
    }
    
    clearError();
    const result = await createGame(displayName.trim());
    if (result) {
      navigate(`/games/${result.game.id}`);
    }
  };
  
  /**
   * Handle joining an existing game by code.
   */
  const handleJoinGame = async () => {
    const code = gameCode.trim().toUpperCase();
    
    // Validate format
    if (!isValidGameCode(code)) {
      setCodeError('Game code must be 6-8 alphanumeric characters');
      return;
    }
    
    setCodeError(null);
    setIsJoining(true);
    
    try {
      // Look up game by code
      const response = await fetch(`/api/games/lookup?key=${encodeURIComponent(code)}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        const data = await response.json();
        setCodeError(data.error || 'Game not found');
        return;
      }
      
      const data = await response.json();
      navigate(`/games/${data.game.id}`);
    } catch {
      setCodeError('Failed to look up game');
    } finally {
      setIsJoining(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-stone-900 text-white">
      {/* Hero Section with Wavy Background */}
      <WavyBackground 
        colors={["#38bdf8", "#818cf8", "#c084fc", "#e879f9", "#22d3ee"]}
        waveWidth={50}
        backgroundFill="#0c0a09"
        blur={10}
        speed="slow"
        waveOpacity={0.5}
        className="w-full"
        containerClassName="h-screen flex flex-col items-center justify-center"
      >
        <div className="text-center px-6 z-10">
          <div className="mb-6">
            <TextHoverEffect text="Gambit" />
          </div>
          <p className="text-2xl text-blue-100 max-w-2xl mx-auto font-light mb-12">
            A Social Deduction Game of Trust and Deception
          </p>
          
          {!isAuthenticated ? (
            /* Unauthenticated: Show sign-in button */
            <div className="flex flex-col sm:flex-row justify-center gap-6 mt-8">
              <Link 
                to="/login"
                className="group bg-blue-600/80 hover:bg-blue-500/90 transition-all duration-300 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-xl shadow-lg text-center text-lg flex items-center justify-center gap-2"
              >
                <span>Sign In to Play</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link 
                to="/sign-up"
                className="group bg-indigo-600/80 hover:bg-indigo-500/90 transition-all duration-300 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-xl shadow-lg text-center text-lg flex items-center justify-center gap-2"
              >
                <span>Create Account</span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Link>
            </div>
          ) : (
            /* Authenticated: Show game creation and join options */
            <div className="flex flex-col items-center gap-8 mt-8">
              {/* Display Name Input */}
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <label htmlFor="displayName" className="text-sm text-blue-200 text-left">
                  Your Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="bg-gray-800/80 backdrop-blur-sm border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={20}
                />
              </div>
              
              {/* Create Game Button */}
              <button
                onClick={handleCreateGame}
                disabled={isLoading || !displayName.trim()}
                className="group bg-blue-600/80 hover:bg-blue-500/90 disabled:bg-gray-600/50 disabled:cursor-not-allowed transition-all duration-300 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-xl shadow-lg text-center text-lg flex items-center justify-center gap-2 w-full max-w-xs"
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <span>Start New Game</span>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </>
                )}
              </button>
              
              {/* Error Display */}
              {error && (
                <p className="text-red-400 text-sm bg-red-900/30 px-4 py-2 rounded-lg">{error}</p>
              )}
              
              {/* Divider */}
              <div className="flex items-center gap-4 w-full max-w-xs">
                <div className="flex-1 h-px bg-gray-600"></div>
                <span className="text-gray-400 text-sm">or</span>
                <div className="flex-1 h-px bg-gray-600"></div>
              </div>
              
              {/* Join Game Section */}
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <label htmlFor="gameCode" className="text-sm text-blue-200 text-left">
                  Join with Game Code
                </label>
                <div className="flex gap-2">
                  <input
                    id="gameCode"
                    type="text"
                    value={gameCode}
                    onChange={(e) => {
                      setGameCode(e.target.value.toUpperCase());
                      setCodeError(null);
                    }}
                    placeholder="ABCD123"
                    className="flex-1 bg-gray-800/80 backdrop-blur-sm border border-gray-600 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent uppercase"
                    maxLength={8}
                  />
                  <button
                    onClick={handleJoinGame}
                    disabled={isJoining || !gameCode.trim()}
                    className="bg-indigo-600/80 hover:bg-indigo-500/90 disabled:bg-gray-600/50 disabled:cursor-not-allowed transition-all duration-300 backdrop-blur-sm text-white font-semibold px-6 rounded-xl shadow-lg flex items-center justify-center"
                  >
                    {isJoining ? (
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    ) : (
                      <span>Join</span>
                    )}
                  </button>
                </div>
                {codeError && (
                  <p className="text-red-400 text-sm">{codeError}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </WavyBackground>
      
      {/* Content Section */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        {/* Main content */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 shadow-xl transform transition-all hover:scale-[1.01] hover:border-indigo-500/50">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">What is Gambit?</h2>
            <p className="mb-4 text-gray-300 leading-relaxed">
              Gambit is a strategic social deduction game where players work together to complete quests while trying to identify who is secretly working against them.
            </p>
            <p className="mb-4 text-gray-300 leading-relaxed">
              Good players must collaborate to complete quests, while Evil players sabotage from within. Each player has a unique role with special abilities that can turn the tide of the game.
            </p>
            <p className="text-gray-300 leading-relaxed">
              Will you use your abilities to help your team, or will you deceive everyone around you? The fate of the game rests in your hands!
            </p>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl p-8 border border-gray-700 shadow-xl transform transition-all hover:scale-[1.01] hover:border-indigo-500/50">
            <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">How to Play</h2>
            <ol className="list-decimal pl-5 space-y-4 text-gray-300">
              <li className="leading-relaxed">Each player is secretly assigned a team (Good or Evil) and a character role.</li>
              <li className="leading-relaxed">Players take turns proposing teams for quests.</li>
              <li className="leading-relaxed">Team members secretly vote to succeed or sabotage the quest.</li>
              <li className="leading-relaxed">Good players need a majority of quests to succeed.</li>
              <li className="leading-relaxed">Evil players win by sabotaging enough quests or identifying key players.</li>
              <li className="leading-relaxed">Use your character's special abilities to gain an advantage!</li>
            </ol>
          </div>
        </div>

        {/* Featured Characters */}
        <div className="mb-20">
          <h2 className="text-3xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">Featured Characters</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-900/40 to-blue-700/20 backdrop-blur-sm rounded-2xl p-6 border border-blue-800/50 shadow-xl transform transition-all hover:scale-[1.03] hover:border-blue-500">
              <div className="h-16 w-16 rounded-full bg-blue-600/30 flex items-center justify-center mb-4 mx-auto border border-blue-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="font-bold text-xl text-center text-blue-300 mb-2">Seer</h3>
              <p className="text-sm text-center text-blue-200 mb-2">Team: Good</p>
              <p className="text-sm text-gray-300 text-center">Knows most evil players but must hide their identity.</p>
            </div>
            
            <div className="bg-gradient-to-br from-red-900/40 to-red-700/20 backdrop-blur-sm rounded-2xl p-6 border border-red-800/50 shadow-xl transform transition-all hover:scale-[1.03] hover:border-red-500">
              <div className="h-16 w-16 rounded-full bg-red-600/30 flex items-center justify-center mb-4 mx-auto border border-red-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="font-bold text-xl text-center text-red-300 mb-2">Executioner</h3>
              <p className="text-sm text-center text-red-200 mb-2">Team: Evil</p>
              <p className="text-sm text-gray-300 text-center">Wins by correctly identifying the Seer after quests.</p>
            </div>
            
            <div className="bg-gradient-to-br from-purple-900/40 to-purple-700/20 backdrop-blur-sm rounded-2xl p-6 border border-purple-800/50 shadow-xl transform transition-all hover:scale-[1.03] hover:border-purple-500">
              <div className="h-16 w-16 rounded-full bg-purple-600/30 flex items-center justify-center mb-4 mx-auto border border-purple-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
              </div>
              <h3 className="font-bold text-xl text-center text-purple-300 mb-2">Trickster</h3>
              <p className="text-sm text-center text-purple-200 mb-2">Team: Neutral</p>
              <p className="text-sm text-gray-300 text-center">Wins if they're on exactly 3 quests, regardless of outcome.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-gray-400 text-sm border-t border-gray-800 pt-6">
          <p>Gambit - A Valadez Creation &copy; {new Date().getFullYear()}</p>
        </footer>
      </div>
    </div>
  );
}
