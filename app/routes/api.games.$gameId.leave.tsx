/**
 * POST /api/games/:gameId/leave - Leave a game lobby
 * 
 * Removes the authenticated user from a game lobby.
 * Only works when the game is in lobby status.
 */

import { createClient } from '~/lib/supabase/server';
import { gameService } from '~/services/GameService';
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

  // Check game exists
  const game = gameService.getGameById(gameId);
  if (!game) {
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
  const player = gameService.getPlayer(gameId, user.id);
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

  // Remove the player
  gameService.removePlayer(gameId, user.id);

  const response: LeaveGameResponse = {
    success: true,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...Object.fromEntries(headers.entries()), 'Content-Type': 'application/json' },
  });
}
