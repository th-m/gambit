import React from "react";
import { Outlet, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { createClient } from "~/lib/supabase/server";

/**
 * Generate a unique game key (6-8 alphanumeric characters).
 */
function generateGameKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous: I, O, 0, 1
  const length = 6 + Math.floor(Math.random() * 3); // 6, 7, or 8 chars
  let key = '';
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { supabase, headers } = createClient(request);
  const { data: { session } } = await supabase.auth.getSession();

  // If the user is not logged in, redirect to login
  if (!session) {
    // Get the current URL path to redirect back after login
    const url = new URL(request.url);
    const redirectTo = url.pathname + url.search;
    
    // Use URLSearchParams to properly encode the redirect path
    const searchParams = new URLSearchParams();
    searchParams.set("redirectTo", redirectTo);
    
    return redirect(`/login?${searchParams.toString()}`);
  }

  // Check if we're in the root games route without a specific game ID
  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  
  // If this is just /games (with no id) and not a nested route like /games/join
  if (pathSegments.length === 1 && pathSegments[0] === 'games') {
    // Generate a unique game key with retry logic
    let gameKey = generateGameKey();
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      const { data: existingGame } = await supabase
        .from('gambit_games')
        .select('id')
        .eq('game_key', gameKey)
        .single();

      if (!existingGame) {
        break; // Key is unique
      }

      gameKey = generateGameKey();
      attempts++;
    }

    // Create a new game
    const { data: game, error } = await supabase
      .from('gambit_games')
      .insert([
        { 
          game_key: gameKey,
          name: `${session.user.email}'s game`,
          host_id: session.user.id,
          status: 'lobby',
          current_round: 1,
          crown_index: 0,
          rejection_count: 0,
          good_victories: 0,
          evil_victories: 0,
          settings: {
            created_by: session.user.email,
            max_players: 10
          }
        }
      ])
      .select()
      .single();

    if (error) {
      // Handle error case
      console.error("Error creating game:", error);
      return { error: error.message, user: session.user };
    }

    // Add creator as first player
    const displayName = session.user.email?.split('@')[0] || 'Host';
    const { error: playerError } = await supabase
      .from('gambit_game_players')
      .insert({
        game_id: game.id,
        user_id: session.user.id,
        display_name: displayName,
        is_alive: true,
      });

    if (playerError) {
      console.error("Error adding host as player:", playerError);
      // Clean up the game if player creation failed
      await supabase.from('gambit_games').delete().eq('id', game.id);
      return { error: 'Failed to create game', user: session.user };
    }

    // Redirect to the new game's page
    return redirect(`/games/${game.id}`, { headers });
  }

  // User is authenticated, allow access to game routes
  return { user: session.user };
};

export default function GamesLayout() {
  return (
    <div className="min-h-screen bg-stone-900 text-white">
      <Outlet />
    </div>
  );
}
