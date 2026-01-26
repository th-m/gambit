/**
 * POST /api/games/:gameId/leave - Leave a game lobby
 * 
 * Removes the authenticated user from a game lobby.
 * Only works when the game is in lobby status.
 */

import { createClient } from '~/lib/supabase/server';
import type { ActionFunctionArgs } from 'react-router';

interface LeaveGameResponse {
  success: boolean;
}

interface ErrorResponse {
  error: string;
}

export async function action({ request, params }: ActionFunctionArgs) {
  // Verify authentication
  const { supabase, headers } = createClient(request);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' } satisfies ErrorResponse),
      {
        status: 401,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      }
    );
  }

  const gameId = params.gameId;
  if (!gameId) {
    return new Response(
      JSON.stringify({ error: 'Game ID is required' } satisfies ErrorResponse),
      {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      }
    );
  }

  // Check game exists in Supabase
  const { data: game, error: gameError } = await supabase
    .from('gambit_games')
    .select('*')
    .eq('id', gameId)
    .single();

  if (gameError || !game) {
    return new Response(
      JSON.stringify({ error: 'Game not found' } satisfies ErrorResponse),
      {
        status: 404,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      }
    );
  }

  // Can only leave games in lobby status
  if (game.status !== 'lobby') {
    return new Response(
      JSON.stringify({ error: 'Cannot leave a game that has already started' } satisfies ErrorResponse),
      {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      }
    );
  }

  // Check if user is in the game
  const { data: player } = await supabase
    .from('gambit_game_players')
    .select('*')
    .eq('game_id', gameId)
    .eq('user_id', user.id)
    .single();

  if (!player) {
    return new Response(
      JSON.stringify({ error: 'You are not in this game' } satisfies ErrorResponse),
      {
        status: 403,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      }
    );
  }

  // Check if user is the host
  if (game.host_id === user.id) {
    return new Response(
      JSON.stringify({ error: 'The host cannot leave the game. Transfer host or delete the game instead.' } satisfies ErrorResponse),
      {
        status: 400,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      }
    );
  }

  // Remove the player from Supabase
  const { error: deleteError } = await supabase
    .from('gambit_game_players')
    .delete()
    .eq('game_id', gameId)
    .eq('user_id', user.id);

  if (deleteError) {
    console.error('Error removing player:', deleteError);
    return new Response(
      JSON.stringify({ error: 'Failed to leave game' } satisfies ErrorResponse),
      {
        status: 500,
        headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
      }
    );
  }

  const response: LeaveGameResponse = {
    success: true,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
  });
}
