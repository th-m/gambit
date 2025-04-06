import { Outlet, redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { createClient } from "~/lib/supabase/server";

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
    // Create a new game
    const { data: game, error } = await supabase
      .from('gambit_games')
      .insert([
        { 
          name: `${session.user.email}'s game`,
          host_id: session.user.id,
          status: 'lobby',
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
