import type { Route } from "./+types/__index";
import { WavyBackground } from "~/components/waves";
import { TextHoverEffect } from "~/components/texthover";
import { Link } from "react-router";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Gambit - A Social Deduction Game" },
    { name: "description", content: "A strategic social deduction game of trust and deception" },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return { message: context.VALUE_FROM_NETLIFY };
}

export default function Home({ loaderData }: Route.ComponentProps) {
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
          
          <div className="flex flex-col sm:flex-row justify-center gap-6 mt-8">
            <Link 
              to="/games"
              className="group bg-blue-600/80 hover:bg-blue-500/90 transition-all duration-300 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-xl shadow-lg text-center text-lg flex items-center justify-center gap-2"
            >
              <span>Create Game</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Link>
            <Link 
              to="/games/join"
              className="group bg-indigo-600/80 hover:bg-indigo-500/90 transition-all duration-300 backdrop-blur-sm text-white font-semibold py-4 px-8 rounded-xl shadow-lg text-center text-lg flex items-center justify-center gap-2"
            >
              <span>Join Game</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
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
