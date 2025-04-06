import { useParams, Outlet, useLoaderData } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { createClient } from "~/lib/supabase/server";
import { createClient as createBrowserClient } from "~/lib/supabase/client";
import { useEffect, useState } from "react";
import { Link } from "react-router";

type Player = {
  id: string;
  nickname: string;
  game_id: string;
  user_id: string;
  is_host: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Game = {
  id: string;
  name: string;
  host_id: string;
  status: string;
  current_quest: number;
  max_quests: number;
  successful_quests: number;
  failed_quests: number;
  join_code: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  players: Player[];
};

type LoaderData = {
  game: Game;
  error?: string;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const gameId = params.game;
  const { supabase } = createClient(request);
  if (!gameId) {
    return { error: "Game ID is required", status: 400 };
  }
  // Fetch game data
  const { data: game, error } = await supabase
    .from('gambit_games')
    .select('*, gambit_game_players(*)')
    .eq('id', gameId)
    .single();
    
  if (error) {
    return { error: error.message, status: 404 };
  }
  
  return { game };
};

export function meta({ params }: { params: { id: string } }) {
  return [
    { title: `Game #${params.id}` },
    { name: "description", content: `Game details for game #${params.id}` },
  ];
}

export default function GameDetails() {
  const { game } = useLoaderData() as LoaderData;
  const { game: gameId } = useParams();
  const [liveGame, setLiveGame] = useState<Game>(game);
  const [players, setPlayers] = useState<Player[]>(game?.players || []);
  
  useEffect(() => {
    // Initialize browser client for real-time subscriptions
    const supabase = createBrowserClient();
    
    // Subscribe to changes on this specific game
    const gameSubscription = supabase
      .channel(`game-${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games',
        filter: `id=eq.${gameId}`
      }, (payload) => {
        console.log('Game updated:', payload);
        setLiveGame(payload.new as Game);
      })
      .subscribe();
      
    // Subscribe to player changes for this game
    const playersSubscription = supabase
      .channel(`game-${gameId}-players`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `game_id=eq.${gameId}`
      }, (payload) => {
        console.log('Players updated:', payload);
        // Fetch all players again to ensure we have the latest list
        supabase.from('players')
          .select('*')
          .eq('game_id', gameId)
          .then(({ data }) => {
            if (data) setPlayers(data as Player[]);
          });
      })
      .subscribe();
    
    // Cleanup function to unsubscribe when component unmounts
    return () => {
      supabase.removeChannel(gameSubscription);
      supabase.removeChannel(playersSubscription);
    };
  }, [gameId]);
  
  if (!liveGame) {
    return <div className="p-6 text-center">Game not found or loading...</div>;
  }
  
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Game: {liveGame.name}</h1>
      
      <div className="bg-stone-800 rounded-lg shadow p-6 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Game Info</h2>
          <span className="px-3 py-1 bg-blue-600 text-white text-sm rounded-full">
            {liveGame.status}
          </span>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-gray-400">Game ID</p>
            <p className="font-medium">{gameId}</p>
          </div>
          <div>
            <p className="text-gray-400">Join Code</p>
            <p className="font-medium">{liveGame.join_code}</p>
          </div>
        </div>
      </div>
      
      <div className="bg-stone-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Players ({players.length})</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {players.length === 0 && (
            <p className="col-span-3 text-gray-400 text-center py-4">No players have joined yet.</p>
          )}
          
          {players.map((player: Player) => (
            <div key={player.id} className="border border-stone-700 rounded p-4">
              <h3 className="font-medium">{player.nickname}</h3>
              <p className="text-sm text-gray-400">Role: Hidden</p>
              <Link
                to={`/games/${gameId}/players/${player.id}`}
                className="text-blue-400 text-sm mt-2 inline-block hover:underline"
              >
                View Details
              </Link>
            </div>
          ))}
          
          {/* Add player button */}
          <div className="border border-stone-700 border-dashed rounded p-4 flex items-center justify-center">
            <button className="text-gray-400 hover:text-white">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Player
            </button>
          </div>
        </div>
      </div>
      
      <div className="mt-6 bg-stone-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Game Status</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-medium">Current Round</h3>
            <p>{liveGame.current_quest || 0}/{liveGame.max_quests || 5}</p>
          </div>
          <div>
            <h3 className="font-medium">Quests</h3>
            <div className="flex space-x-2 mt-2">
              {Array.from({ length: liveGame.max_quests || 5 }).map((_, i) => {
                let bgColor = "bg-stone-600";
                
                if (i < (liveGame.successful_quests || 0)) {
                  bgColor = "bg-green-600";
                } else if (i < (liveGame.successful_quests || 0) + (liveGame.failed_quests || 0)) {
                  bgColor = "bg-red-600";
                }
                
                return (
                  <span key={i} className={`h-8 w-8 rounded-full ${bgColor} flex items-center justify-center text-white`}>
                    {i + 1}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <Outlet />
      <div className="mt-6">
        <Link to="/" className="text-blue-400 hover:underline">
          ← Back to Home
        </Link>
      </div>
    </div>
  );
} 